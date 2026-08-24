#!/usr/bin/env python3
"""FileLu account helper: credential generation, YAML store, API verification.

Pure stdlib. Used by the filelu-register skill so the deterministic parts
(creds, storage, API checks) are reusable and testable instead of being
reinvented every run.

Commands:
  gen   --email <e> [--username <u>] [--password <p>] [--region <r>]
  save  --path <yaml>            # reads a JSON account object on stdin
  load  --path <yaml>            # prints the account as JSON
  update --path <yaml> --status <s> [--api-key <k>] [--set <k=v> ...]
  verify --key <k>               # hits /api/account/info, prints JSON

Account YAML schema (flat, one file per account):
  email, username, password, region, status, registered_at,
  activated_at, api_key, api_verified_at, notes
"""
import argparse
import datetime
import json
import re
import secrets
import string
import sys
import urllib.parse
import urllib.request
from pathlib import Path

# Ordered so YAML reads top-to-bottom in a sensible order.
SCHEMA_KEYS = [
    "email", "username", "password", "region", "status",
    "registered_at", "activated_at", "api_key", "api_verified_at", "notes",
]
VALID_REGIONS = ("global", "us-east", "eu-central", "ap-southeast", "me-central")
STATUS_VALUES = ("draft", "pending_activation", "activated", "api_ready", "failed")

USERNAME_RE = re.compile(r"[a-z0-9_-]+")


def _utcnow() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def gen_username(email: str) -> str:
    """Derive a FileLu-legal username (4-32 chars, [a-zA-Z0-9_-]) from an email."""
    local = email.split("@", 1)[0].lower()
    parts = USERNAME_RE.findall(local)
    base = "_".join(parts) or "user"
    base = base[:20].strip("_-") or "user"
    suffix = "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(4))
    name = f"{base}_{suffix}"
    # Guarantee the 4-32 window after suffix.
    return name[:32].ljust(4, "x")


def gen_password(length: int = 16) -> str:
    """Random password: alnum + a few form-safe symbols. No quotes/colons/backslashes."""
    alphabet = string.ascii_letters + string.digits + "-_$@!"
    # Ensure at least one of each class so weak-rejecters stay happy.
    required = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
        secrets.choice("-_$@!"),
    ]
    rest = [secrets.choice(alphabet) for _ in range(length - len(required))]
    out = required + rest
    secrets.SystemRandom().shuffle(out)
    return "".join(out)


def gen_credentials(email: str, username=None, password=None, region="global") -> dict:
    if "@" not in email:
        raise ValueError(f"not an email: {email!r}")
    if region not in VALID_REGIONS:
        raise ValueError(f"region must be one of {VALID_REGIONS}, got {region!r}")
    username = username or gen_username(email)
    if not (4 <= len(username) <= 32) or not re.fullmatch(r"[a-zA-Z0-9_-]+", username):
        raise ValueError("username must be 4-32 chars of [a-zA-Z0-9_-]")
    password = password or gen_password()
    if not (4 <= len(password) <= 32):
        raise ValueError("password must be 4-32 chars (FileLu CheckForm)")
    return {
        "email": email,
        "username": username,
        "password": password,
        "region": region,
        "status": "draft",
        "registered_at": "",
        "activated_at": "",
        "api_key": "",
        "api_verified_at": "",
        "notes": "",
    }


# --- YAML emit/parse (flat key: value; values double-quoted, valid YAML) ---

def _yaml_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def emit_yaml(obj: dict) -> str:
    lines = []
    seen = set()
    for key in SCHEMA_KEYS:
        if key not in obj:
            continue
        seen.add(key)
        val = obj[key]
        if val is None or val == "":
            lines.append(f"{key}:")
        elif isinstance(val, bool):
            lines.append(f"{key}: {'true' if val else 'false'}")
        else:
            lines.append(f'{key}: "{_yaml_escape(str(val))}"')
    # Preserve extra keys (e.g. connect_* captured in Phase 3) so the flat
    # store round-trips them; without this they'd be silently dropped on save.
    for key, val in obj.items():
        if key in seen:
            continue
        if val is None or val == "":
            lines.append(f"{key}:")
        elif isinstance(val, bool):
            lines.append(f"{key}: {'true' if val else 'false'}")
        else:
            lines.append(f'{key}: "{_yaml_escape(str(val))}"')
    return "\n".join(lines) + "\n"


def parse_yaml(text: str) -> dict:
    obj = {}
    for line in text.splitlines():
        line = line.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, raw = line.partition(":")
        key = key.strip()
        raw = raw.strip()
        if raw == "":
            obj[key] = ""
        elif raw.startswith('"') and raw.endswith('"'):
            obj[key] = raw[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        elif raw in ("true", "false"):
            obj[key] = raw == "true"
        else:
            obj[key] = raw
    return obj


def save_account(path: str, obj: dict) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(emit_yaml(obj), encoding="utf-8")


def load_account(path: str) -> dict:
    return parse_yaml(Path(path).read_text(encoding="utf-8"))


def update_account(path: str, updates: dict) -> dict:
    obj = load_account(path)
    for k, v in updates.items():
        obj[k] = v
    save_account(path, obj)
    return obj


# --- API verify ---

def verify_api_key(key: str, timeout: int = 15) -> dict:
    url = "https://filelu.com/api/account/info?key=" + urllib.parse.quote(key, safe="")
    req = urllib.request.Request(url, headers={"User-Agent": "filelu-register-skill/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
            try:
                parsed = json.loads(body)
            except json.JSONDecodeError:
                return {"ok": False, "status": resp.status, "raw": body[:500]}
            ok = isinstance(parsed, dict) and parsed.get("status") == 200
            return {"ok": ok, "http": resp.status, "result": parsed}
    except Exception as exc:  # noqa: BLE001 - surface any failure to the caller
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


# --- CLI ---

def _main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("gen", help="generate credentials for an email")
    g.add_argument("--email", required=True)
    g.add_argument("--username")
    g.add_argument("--password")
    g.add_argument("--region", default="global", choices=VALID_REGIONS)

    s = sub.add_parser("save", help="write an account YAML from a JSON object on stdin")
    s.add_argument("--path", required=True)

    l = sub.add_parser("load", help="print an account YAML as JSON")
    l.add_argument("--path", required=True)

    u = sub.add_parser("update", help="merge fields into an account YAML")
    u.add_argument("--path", required=True)
    u.add_argument("--status", choices=STATUS_VALUES)
    u.add_argument("--api-key")
    u.add_argument("--set", action="append", default=[], metavar="KEY=VALUE",
                   help="extra key=value (e.g. --set notes=hello)")

    v = sub.add_parser("verify", help="verify an API key against /api/account/info")
    v.add_argument("--key", required=True)

    args = ap.parse_args()

    if args.cmd == "gen":
        obj = gen_credentials(args.email, args.username, args.password, args.region)
        obj["registered_at"] = _utcnow()
        obj["status"] = "pending_activation"
        print(json.dumps(obj, indent=2))
        return 0

    if args.cmd == "save":
        obj = json.loads(sys.stdin.read().strip() or "{}")
        save_account(args.path, obj)
        print(f"saved {args.path}")
        return 0

    if args.cmd == "load":
        print(json.dumps(load_account(args.path), indent=2))
        return 0

    if args.cmd == "update":
        updates = {}
        if args.status:
            updates["status"] = args.status
        if args.api_key is not None:
            updates["api_key"] = args.api_key
            updates["status"] = "api_ready"
            updates["api_verified_at"] = _utcnow()
        for kv in args.set:
            k, _, val = kv.partition("=")
            updates[k] = val
        if "status" in updates and updates["status"] == "activated" and not updates.get("activated_at"):
            updates["activated_at"] = _utcnow()
        obj = update_account(args.path, updates)
        print(json.dumps(obj, indent=2))
        return 0

    if args.cmd == "verify":
        print(json.dumps(verify_api_key(args.key), indent=2))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(_main())
