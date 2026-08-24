---
name: filelu-register
description: >-
  Automate FileLu.com account registration from just an email address. Use this
  skill whenever the user wants to sign up for / create / register a FileLu
  (filelu.com) account, open a FileLu account for an email address, or automate
  FileLu onboarding — even if they don't say "register" explicitly (e.g. "set me
  up on FileLu with this email", "open a filelu account for ..."). It drives the
  browser signup (reCAPTCHA forces a real browser), generates FileLu-legal
  credentials, saves them to YAML, and hands off to the human for the email
  activation click. When the user also wants to go pure-API afterwards, it
  optionally logs in once more to capture the API key from the account page.
---

# filelu-register

Register a FileLu.com account from just an email address and save the credentials
to YAML — that's the whole job by default. The browser is only needed for the
signup form (reCAPTCHA), so the agent fills it, asks the human to solve the
captcha and click the activation email, and stops there. Optionally, if the user
wants to drive FileLu over its HTTP API afterwards, a second short browser visit
logs back in and captures the API key from the account page.

## Why this skill is shaped the way it is

FileLu's signup page is protected by **Google reCAPTCHA v2**, so a plain HTTP
`POST` to `/register` is rejected — there is no signup API. A real browser (the
user's own Chrome via `browser-harness`) is the only path that can render the
challenge. The human is already at the machine to click the activation email, so
having them solve the captcha in the same window costs nothing and avoids
depending on a paid captcha-solving service.

The signup is the only step that *must* be a browser visit. If the user later
wants the API key (optional), one more login-and-scrape visit captures it; after
that every file operation runs over the documented `https://filelu.com/api/*`
endpoints with no browser at all.

## Prerequisites

- The `browser-harness` skill / CLI must be available. If it isn't installed,
  stop and tell the user to install it first — this skill cannot work without it.
- The user's local Chrome must allow remote debugging. If `browser-harness
  --doctor` reports it can't connect, follow the browser-harness skill's
  connection instructions (enable remote debugging in `chrome://inspect`). The
  harness will launch Chrome itself if it isn't running.
- Python 3 (for the bundled helper). No third-party packages required.

## browser-harness `js()` convention

`js(expr)` evaluates JavaScript and returns its value. Two legal forms — pick
one per call, never mix:

- **Single expression** that already evaluates to the value you want:
  `js("(document.body.innerText||'').slice(0,800)")`.
- **Statements** (variables, loops, multiple steps): wrap the whole thing in an
  IIFE that returns the result, e.g. `js("(function(){ ...; return x; })()")`.

A bare `return` or `let`/`const` at the top level throws `SyntaxError: Illegal
return statement` — the harness evaluates your string as an expression, it does
not silently wrap statements in a function. Every multi-line `js(...)` in this
skill already follows the IIFE pattern; keep new ones the same.

**Never put a newline character inside a `js()` string literal.** An escaped
`\n` or `\\n` in the heredoc survives the shell and Python layers but lands as a
raw newline inside the JS source sent to V8, which rejects a literal line break
inside `'...'`/`"..."` with `SyntaxError: Invalid or unexpected token`. To join
or split lines, use `' | '` / `';'` separators or `String.fromCharCode(10)`
instead — never `'\n'`/`'\\n'` inside the JS expression.

## The flow

Phase 1 (register) and Phase 2 (the user activates) are the default — that's
the whole job. Phase 3 (connect methods: API, S3, WebDAV, Rclone, Rsync, FTP,
Chrome, MCP, email) is **optional**, and within it each item is independently
optional — only set up what the user asks for. Offer Phase 3 once the account is
activated and let the user opt in per method.

### Phase 1 — Register the account (browser)

1. **Collect the email.** The only required input is the email. Accept optional
   overrides: `username`, `password`, `region` (one of `global`, `us-east`,
   `eu-central`, `ap-southeast`, `me-central`; default `global`). Decide where to
   save the account YAML — default `<repo>/filelu-accounts/<safe-email>.yaml`
   (see *Storage* below); let the user override.

2. **Generate credentials.** Run the helper to produce a FileLu-legal username
   (derived from the email local-part + a random suffix) and a strong password,
   then write the initial YAML with `status: pending_activation`. Use the
   `SKILL_DIR` substitution below — the skill directory is the one containing
   this `SKILL.md`:
   ```bash
   SKILL_DIR="<path to this skill>"
   python "$SKILL_DIR/scripts/filelu_account.py" gen \
     --email "USER@EXAMPLE.COM" [--username "$U"] [--password "$P"] [--region global] \
     | python "$SKILL_DIR/scripts/filelu_account.py" save --path "filelu-accounts/foo.yaml"
   ```
   Read it back so you have the exact username/password for the form:
   ```bash
   python "$SKILL_DIR/scripts/filelu_account.py" load --path "filelu-accounts/foo.yaml"
   ```

3. **Open the signup page** in the user's Chrome via browser-harness. The first
   navigation is always `new_tab`, not `goto_url`:
   ```bash
   browser-harness <<'PY'
   new_tab("https://filelu.com/register.html")
   wait_for_load()
   print(page_info())
   PY
   ```

4. **Fill the form.** FileLu uses a plain Bootstrap form. Set values directly on
   the named inputs and dispatch `input` + `change` so any listener and the
   `CheckForm` validator see them. This is more reliable than synthesizing
   keystrokes and works through the AX-tree/coordinate fallback when needed:
   ```bash
   browser-harness <<'PY'
   js("""
   (function(){
     function setVal(name, val) {
       const el = document.querySelector('[name="' + name + '"]');
       if (!el) throw new Error('field not found: ' + name);
       el.value = val;
       el.dispatchEvent(new Event('input',  {bubbles: true}));
       el.dispatchEvent(new Event('change', {bubbles: true}));
       return el.value;
     }
     setVal('usr_login',    'USERNAME_FROM_YAML');
     setVal('usr_email',    'USER@EXAMPLE.COM');
     setVal('usr_password', 'PASSWORD_FROM_YAML');
     setVal('usr_region',   'global');
     return document.querySelector('[name=usr_login]').value
         + '|' + document.querySelector('[name=usr_email]').value;
   })()
   """)
   PY
   ```
   Always echo the values back out of the DOM afterward — never assume the write
   took. Validation rules from FileLu's `CheckForm`: username 4–32 chars
   `[a-zA-Z0-9_-]`, password 4–32 chars, email must be a valid address. The
   helper already enforces these.

5. **Handle reCAPTCHA — this needs the human.** Detect the captcha and whether
   it's already solved:
   ```bash
   browser-harness <<'PY'
   print(js("String(!!document.querySelector('.g-recaptcha')) "
            "+ '|' + (document.querySelector('[name=\"g-recaptcha-response\"]')||{}).value"))
   PY
   ```
   - If the response token is already non-empty (rare — happens when the session
     is trusted), skip to step 6.
   - Otherwise **stop and tell the user plainly**: *"I've filled the form. Please
     solve the reCAPTCHA in the Chrome window I opened, then tell me 'done'."*
     Wait for the user to confirm. Then re-check the response token; if still
     empty, ask again. Do **not** loop rapidly — the challenge needs a real
     human click and spamming checks won't help.

6. **Submit.** Click the real submit button — do **not** call
   `form.submit()`, which bypasses the `CheckForm` validator and loses the
   `g-recaptcha-response`. FileLu's signup button is a plain same-origin
   `<button type="submit">Create Account</button>`, so clicking it through JS
   triggers `onsubmit` (the validator) just like a real click and is far more
   robust than hunting for button text in the AX tree:
   ```bash
   browser-harness <<'PY'
   print(js("""
   (function(){
     const b = document.querySelector('button[type=submit]')
             || document.querySelector('[type=submit]');
     if (!b) throw new Error('submit button not found');
     b.click();
     return 'clicked';
   })()
   """))
   wait_for_load()
   print(page_info())
   PY
   ```
   If the JS click is swallowed (rare — shadow DOM or an overlay intercepting
   it), fall back to a coordinate click on the button's box model via
   `cdp("DOM.getBoxModel", backendNodeId=...)` → `click_at_xy(cx, cy)`, the way
   the browser-harness skill describes.

7. **Confirm success.** After submit, expect a redirect to the logged-in area or
   a "check your email" / activation notice. Grep the page for known failure
   text (`Invalid`, `already`, `captcha`, `exist`) before declaring victory:
   ```bash
   browser-harness <<'PY'
   print(js("(document.body.innerText||'').slice(0,800)"))
   PY
   ```
   On failure, surface the exact message to the user and stop — do not retry
   blindly. If the username was taken, generate a new one (`gen` again with an
   explicit `--username`) and redo steps 4–6.

8. **Persist state.** The YAML was already written in step 2; if anything
   changed (e.g. you picked a different username on a collision), re-save. Leave
   `status: pending_activation`.

9. **Hand off to the user for activation.** Tell them clearly, with the email
   address shown, then stop — Phase 1 is done:
   > Account created. Activation email sent to **USER@EXAMPLE.COM**. Open it and
   > click the verification link, then tell me "activated".

   Wait for the user to confirm activation (Phase 2). Don't poll the browser.
  Don't presume the connect-methods step — that's optional and only runs if the
  user asks for it after activation.

### Phase 2 — Activation (the user, not you)

This phase happens entirely outside the agent: the user opens their email and
clicks FileLu's verification link. Your only job is to wait for confirmation.
When the user says "activated" / "done" / "clicked", mark the account
`status: activated` (helper `update --status activated`) — **the job is done.**
Then offer the optional next step: *"Want to set up any connect methods (API,
S3, WebDAV, Rclone, Rsync, FTP, Chrome extension, MCP, email) so you can drive
FileLu without the browser? Say which ones."* Only run Phase 3 if they say yes.
If they report the activation link didn't work, have them paste any error —
FileLu activation failures are usually an expired link or an already-activated
account.

### Phase 3 — Connect methods *(optional; each item independent)*

After activation the account is already usable via the web UI. Run Phase 3 only
if the user wants to drive FileLu through one of its **connect methods** — API,
S3, WebDAV, Rclone, Rsync, FTP/FTPS, Chrome extension, MCP, or the upload-by-email
address. Every item is **independently optional**; capture only what the user asks
for. **None of this can go through the HTTP API** — FileLu's `/api/*` only does
file/folder ops, it cannot enable protocols or generate keys — so this whole phase
is browser work in the one logged-in tab. Full per-method detail (enable params,
copy-button IDs, static host/port, YAML key names) lives in
[`references/connect.md`](references/connect.md); the orchestration is here.

1. **Present the menu and let the user pick.** List what each method gives them
   and ask which to set up (multi-select). Don't assume any of them:
   > Which connect methods do you want enabled? Pick any combination:
   > - **API** — `?key=` access to `/api/*` (uploads, file/folder CRUD, account info)
   > - **S3 (S5)** — S3-compatible endpoint + access/secret + default bucket name
   > - **WebDAV** — WebDAV URL + password
   > - **Rclone** — Rclone key for the `filelu` backend
   > - **Rsync** — rsync-over-SSH (`rsync.filelu.com:2222`, uses account password)
   > - **FTP / FTPS** — `ftp.filelu.com:21` / `:990` (uses account password)
   > - **Chrome extension** — extension key for the FileLu uploader add-on
   > - **MCP** — token for ChatGPT/Claude/Cursor etc. via `https://mcp.filelu.com/mcp`
   > - **Email** — the `up_XXXX@filelu.cloud` upload-by-email address

2. **Confirm you're logged in**, then open My Account and read the session token
   (every enable link needs it):
   ```bash
   browser-harness <<'PY'
   goto_url("https://filelu.com/?op=my_account")
   wait_for_load()
   print(js("(function(){ var t=document.querySelector('input[name=token]'); return t?t.value:''; })()"))
   PY
   ```
   Keep that token as `$TOKEN` for every enable in this phase. Re-read it if you
   re-login.

3. **For each chosen method, enable + capture + save** following
   [`references/connect.md`](references/connect.md). The shared enable pattern is a
   GET — the toggle's own `onclick` is `location='?op=my_account&<PARAM>=<VAL>&token=...'`:
   ```bash
   browser-harness <<'PY'
   goto_url("https://filelu.com/?op=my_account&<PARAM>=<VAL>&token=" + TOKEN)
   wait_for_load()
   PY
   ```
   Then read the revealed value (generated keys appear in a ClipboardJS copy button
   that only exists post-enable — read its `data-clipboard-target`) and persist it:
   ```bash
   python "$SKILL_DIR/scripts/filelu_account.py" update \
     --path "filelu-accounts/foo.yaml" \
     --set "connect_<method>_<field>=VALUE" \
     --set "connect_<method>_enabled_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```
   Per-method enable params and what to capture (cheat sheet — see connect.md for
   the full table):
   - **API** — `generate_api_key=1` → capture from `#copyApiKey`; mirror to
     `--api-key` too so `verify` works, then run `verify --key`.
   - **S3** — `s3_enable=1` → read endpoint / region / **default bucket name** /
     access key / secret from the `#s3` pane.
   - **WebDAV** — `webdav_enable=1` → URL + password from the `#webdav` pane.
   - **Rclone** — `turn_on_rclone=1` → key from `#copyRcloneKey`.
   - **Rsync** — `rsync_enable=1` → no secret (account password); record static
     `rsync.filelu.com:2222`.
   - **FTP/FTPS** — enable is the **inverted** toggle `ftp_disable=0`; no secret
     (account password); record static `ftp.filelu.com` port `21` / FTPS `990`.
   - **Chrome** — `turn_on_chrome=1` → key from `#copyCEKey`.
   - **MCP** — not a toggle: fill the `#mcp` form (`mcp_name`,
     `mcp_allowed_fld_id=0`, `mcp_expires_days`, perms) and submit
     `generate_mcp_token`; capture token + server URL. Free tier = one
     **read-only** token.
   - **Email** — no enable needed; read `up_XXXX@filelu.cloud` from the `#email`
     pane.

4. **Verify the high-value captures.** For the API key, the canonical check is
   `verify --key`, which hits `/api/account/info`. For S3/WebDAV/Rclone/MCP there's
   no public verify endpoint — a non-empty value read from the right pane element
   is the best available evidence; if a value looks truncated or empty, re-read the
   pane DOM (`js("document.getElementById('<pane>').innerText")`) and re-capture.

5. **Report what was set up.** Summarize per method, give the YAML path, and for
   each enabled method give one copy-pasteable usage line (e.g. an `rclone` config
   block, a `curl` for the API, an `mcp` URL for ChatGPT). Keep the browser tab
   open only if the user wants it.

## Storage

One YAML file per account, default location `filelu-accounts/<safe-email>.yaml`
where `<safe-email>` is the email with `@` → `_at_` and non `[a-z0-9_.-]` → `_`.
The schema (flat, hand-editable, valid YAML):

```yaml
email: "user@example.com"
username: "user_abc123"
password: "..."
region: "global"
status: "activated"            # draft | pending_activation | activated | api_ready | failed
registered_at: "2026-08-07T19:06:41Z"
activated_at: "2026-08-07T19:10:00Z"
api_key: "..."               # top-level mirror of connect_api_key, used by `verify`
api_verified_at: "2026-08-07T19:11:00Z"
notes: ""
# Phase 3 captures land flat with a connect_ prefix (see references/connect.md):
connect_api_key: ""
connect_s3_bucket: ""
connect_ftp_host: ""
connect_mcp_token: ""
# ...any connect_<method>_<field> the user asked for

If the user prefers one combined file, honor it — just keep the same schema.

## Common failure modes

- **reCAPTCHA never solves / keeps challenging:** the session looks automated.
  Ask the user to solve it themselves in the opened window; if it loops, suggest
  they log into Google in that Chrome profile first (raises trust) and retry.
- **"Username already taken":** regenerate with `gen --email ... --username
  <new>` and re-fill only the username field, then re-submit. Don't change the
  email.
- **Activation email never arrives:** have the user check spam, then use the
  FileLu "resend activation" link on the login page (drive it via browser-harness
  the same way as login). Don't proceed to Phase 3 until activated — login will
  just fail.
- **`verify` says `Invalid auth` after API capture:** the key didn't copy
  cleanly or the toggle didn't actually flip on. Re-read the `#api` pane DOM
  (`js("document.getElementById('api').innerText")`), re-enable via
  `generate_api_key=1`, and re-capture from `#copyApiKey`'s target.
- **A connect value reads empty post-enable:** the ClipboardJS copy button
  wasn't in the DOM yet (it's injected after enable). Make sure the enable GET
  actually reloaded the page, then query the pane by id and read the value
  element directly. See [`references/connect.md`](references/connect.md).

## After registration: using the account

Once activated, the account works via the **web UI** with no extra setup. If
Phase 3 captured connect methods, the YAML holds everything needed to use them
without a browser:
- **HTTP API** (if `connect_api_key` / `api_key` is set): see
  [`references/api.md`](references/api.md) — uploads, file/folder CRUD, account
  info, all via `?key=`.
- **S3 / WebDAV / Rclone / Rsync / FTP / MCP / Email**: connection details and
  usage snippets are in [`references/connect.md`](references/connect.md).
