# FileLu connect-methods reference (Phase 3)

After an account is activated and logged in, FileLu exposes ten upload/connect
methods on **My Account** (`https://filelu.com/?op=my_account`). Each is an
**independent, optional** toggle. None of them can be enabled or generated
through the HTTP `/api/*` — the `/api/*` only does file/folder/account-info
operations — so every item below is **browser work** (one logged-in session).
The user picks which ones they want; you enable + capture only those.

## Shared mechanics (read once, reuse per method)

1. **Be logged in** (Phase 3 starts from a logged-in tab).
2. **Open My Account and read the session token** — every enable link needs it:
   ```bash
   browser-harness <<'PY'
   goto_url("https://filelu.com/?op=my_account")
   wait_for_load()
   print(js("(function(){ var t=document.querySelector('input[name=token]'); return t?t.value:''; })()"))
   PY
   ```
   Store it as `$TOKEN` for the rest of this phase. It is per-session; re-read
   if you re-login.
3. **Enable a method** = a plain GET to `https://filelu.com/?op=my_account&<PARAM>=<VAL>&token=$TOKEN`.
   The toggle's `<span class="switch-label">` carries that exact `onclick="location='...'"`,
   so navigating there is equivalent to clicking it:
   ```bash
   browser-harness <<'PY'
   goto_url("https://filelu.com/?op=my_account&<PARAM>=<VAL>&token=" + TOKEN)
   wait_for_load()
   PY
   ```
4. **Capture the revealed value.** Generated keys (API, Rclone, Chrome, S3) are
   shown by a [ClipboardJS](https://clipboardjs.com/) copy button that only
   exists *after* enable. FileLu's copy buttons carry the secret directly on
   **`data-clipboard-text`** (verified live — they do **not** use
   `data-clipboard-target`); read that attribute first, fall back to a
   `data-clipboard-target` element, then to a pane-text scan:
   ```bash
   browser-harness <<'PY'
   print(js("""
   (function(){
     var btn = document.getElementById('COPY_BTN_ID');
     if(!btn) return '';
     var val = (btn.getAttribute('data-clipboard-text') || '').trim();
     if(!val){
       var tgt = btn.getAttribute('data-clipboard-target');
       var el  = tgt ? document.querySelector(tgt) : null;
       val = el ? (el.value || el.innerText || el.textContent || '').trim() : '';
     }
     if(!val){
       var pane = document.getElementById('PANE_ID');
       var t = pane ? pane.innerText : '';
       var m = t.match(/[A-Za-z0-9]{16,}/);
       val = m ? m[0] : '';
     }
     return val;
   })()
   """))
   PY
   ```
5. **Save** with the helper (`--set` stores any flat key; `connect_*` is the
   convention so `load` shows them grouped):
   ```bash
   python "$SKILL_DIR/scripts/filelu_account.py" update \
     --path "filelu-accounts/foo.yaml" \
     --set "connect_<method>_<field>=VALUE" \
     --set "connect_<method>_enabled_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```

## Method table

All enable URLs are relative to `https://filelu.com/?op=my_account&...&token=TOKEN`.
"Static" = comes from FileLu's docs pages / the pane itself, no generation.

| Method | Enable param | What you capture | Static connection info |
|--------|--------------|------------------|------------------------|
| **API** | `generate_api_key=1` | `connect_api_key` | `?key=` to `https://filelu.com/api/*` |
| **S3 (S5)** | `s3_enable=1` | `connect_s3_endpoint`, `connect_s3_access_key`, `connect_s3_secret_key`, `connect_s3_region`, `connect_s3_bucket` | endpoint/region/bucket shown in `#s3` pane after enable |
| **WebDAV** | `webdav_enable=1` | `connect_webdav_url`, `connect_webdav_password` | URL shown in `#webdav` pane after enable |
| **Rclone** | `turn_on_rclone=1` | `connect_rclone_key` | use key in `rclone config` (`filelu` backend) |
| **Rsync** | `rsync_enable=1` | (none — uses account creds) | host `rsync.filelu.com`, port `2222`, rsync-over-SSH, user = FileLu username, pass = account password |
| **FTP / FTPS** | `ftp_disable=0` (inverse) | (none — uses account creds) | host `ftp.filelu.com` (alt `ftp-2.filelu.com`, `ftp-eu.filelu.com`), FTP port `21`, implicit FTPS port `990`, PASV, user = FileLu username, pass = account password |
| **Chrome ext** | `turn_on_chrome=1` | `connect_chrome_key` | extension: <https://chromewebstore.google.com/details/ekenknphjlpgkeenmpdifjcppjlgjhnc> |
| **MCP** | form (`generate_mcp_token`) | `connect_mcp_server_url`, `connect_mcp_token`, `connect_mcp_name`, `connect_mcp_expires` | server URL `https://mcp.filelu.com/mcp`; free accounts get **one read-only** token |
| **Email** | (always on) | `connect_email_address` | `up_XXXX@filelu.cloud` shown in `#email` pane; regenerate via `usr_up_email_enabled` toggle |
| **FileLuSync** | `flsync_disable` (inverse) | (none — app login) | desktop/mobile app; log in with account creds |

Pane / copy-button IDs (verified against the live DOM; button elements appear
only after the method is enabled):

| Method | Pane id | Copy button id |
|--------|---------|----------------|
| API | `#api` | `copyApiKey` |
| S3 (S5) | `#s3` | `copy-s5-btn` |
| WebDAV | `#webdav` | (URL in pane text) |
| Rclone | `#rclone` | `copyRcloneKey` |
| Chrome ext | `#extension` | `copyCEKey` |
| MCP | `#mcp` | (token shown in pane after form submit) |
| Email | `#email` | `copyUploadEmail` |
| FTP | `#ftp` | (n/a — static info in pane text) |
| Rsync | `#rsync` | (n/a — static info, host in docs) |

## Per-method notes

### API key
Enable `generate_api_key=1` → capture from `#copyApiKey`'s target → store as
**both** `connect_api_key` and the top-level `api_key` (so `verify` still
works), then verify:
```bash
python "$SKILL_DIR/scripts/filelu_account.py" update --path FILE --api-key "$KEY"
python "$SKILL_DIR/scripts/filelu_account.py" verify --key "$KEY"
```

### S3 (S5)
After `s3_enable=1`, the `#s3` pane shows endpoint / region / access key /
secret / bucket name. Read them from the pane's elements (`copy-s5-btn` carries
the access key on `data-clipboard-text`). Record `connect_s3_endpoint`,
`connect_s3_region`, `connect_s3_access_key`, `connect_s3_secret_key`, and
`connect_s3_bucket`.

**Default bucket name** (verified live): FileLu auto-creates a bucket named
`mybucket<userid>` at account setup — e.g. user id `148386` → `mybucket148386`.
The user id is the numeric prefix of the API key (and of the upload-by-email
`up_...@filelu.cloud`). If you'd rather not guess, list the root folder over the
API after enabling it: `curl "https://filelu.com/api/folder/list?fld_id=0&key=KEY"`
and take the folder whose name matches `mybucket<digits>`.

### MCP token (form, not a toggle)
MCP is generated via a form, not a switch. Fill it on the `#mcp` pane and
submit:
```bash
browser-harness <<'PY'
js("""
(function(){
  function setVal(n,v){ var e=document.querySelector('[name='+n+']'); if(!e) return; e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); }
  setVal('mcp_name','skill-generated');
  setVal('mcp_allowed_fld_id','0');
  // mcp_expires_days is a <select>; pick by value
  var sel = document.querySelector('[name=mcp_expires_days]'); if(sel){ sel.value='365'; sel.dispatchEvent(new Event('change',{bubbles:true})); }
  return 'set';
})()
""")
PY
```
Then click the pane's **Generate MCP Token** submit button (the form posts
`generate_mcp_token=1`). On reload the pane shows the token + the server URL
`https://mcp.filelu.com/mcp` — capture both. Free-tier accounts are limited to
one **read-only** token; don't check write/delete/share on free.

### FTP / Rsync (account-credential methods)
These don't generate separate secrets — the login is the FileLu username +
account password (already in the YAML). You only enable the protocol and record
the static host/port. For FTP the toggle is **inverted**: `ftp_disable=0`
*enables* it (the page shows `ftp_disable=1` when FTP is already on).

### Email
The `up_XXXX@filelu.cloud` address is shown in the `#email` pane immediately
(no enable needed). Optionally restrict senders via the "Allow uploads only
from email" field. To rotate the address, use the `usr_up_email_enabled`
toggle URL.

## YAML key convention

All captured connect data is stored flat with a `connect_` prefix so `load`
groups it after the core fields. Example tail of an account YAML after setting
up API + FTP + MCP:

```yaml
connect_api_key: "abc123..."
connect_api_enabled_at: "2026-08-07T21:30:00Z"
connect_ftp_host: "ftp.filelu.com"
connect_ftp_port: "21"
connect_ftp_user: "venera_wa37"
connect_ftp_enabled_at: "2026-08-07T21:31:00Z"
connect_mcp_server_url: "https://mcp.filelu.com/mcp"
connect_mcp_token: "tok_..."
connect_mcp_name: "skill-generated"
connect_mcp_expires: "365"
connect_mcp_enabled_at: "2026-08-07T21:32:00Z"
```

For FTP/Rsync/Rclone where a config block is more useful than flat fields,
also drop a ready-to-paste snippet into `notes` or a side file — the helper's
`--set notes="..."` overwrites, so append carefully or keep snippets in a
separate `filelu-accounts/<safe-email>.connect.md`.
