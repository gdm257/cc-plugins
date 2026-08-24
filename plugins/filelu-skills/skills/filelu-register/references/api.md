# FileLu HTTP API reference

Once a FileLu account has `status: api_ready` (API key captured into the account
YAML), every file/folder operation runs over plain HTTP — no browser. Base URL:
`https://filelu.com/api`. Auth: pass the key as `?key=YOUR_API_KEY` (GET) or
`-d key=YOUR_API_KEY` (POST). Every response is JSON with a `status` field;
`200` means success, anything else is an error with a `msg`.

Source: <https://filelu.com/pages/api>. Capture the key by enabling the
"API Key" toggle on <https://filelu.com/account/> (Phase 3 of the skill).

## Account

```bash
# Account info — also the canonical "does this key work?" check
curl "https://filelu.com/api/account/info?key=KEY"
```

## Upload

```bash
# Get an upload server URL, then POST the file multipart to it
curl "https://filelu.com/api/upload/server?key=KEY"

# Remote upload (FileLu fetches the URL itself)
curl "https://filelu.com/api/upload/url?key=KEY&url=https://example.com/file.mp4&fld_id=0"
```

## Files

```bash
curl "https://filelu.com/api/file/info?file_code=b578rni0e1ka&key=KEY"
curl "https://filelu.com/api/file/list?page=1&per_page=25&fld_id=0&key=KEY"
curl "https://filelu.com/api/file/status?key=KEY"                     # recent uploads
curl "https://filelu.com/api/file/rename?file_code=b578rni0e1ka&name=newname.bin&key=KEY"
curl "https://filelu.com/api/file/clone?file_code=b578rni0e1ka&key=KEY"
curl "https://filelu.com/api/file/set_folder?file_code=b578rni0e1ka&fld_id=15&key=KEY"
curl "https://filelu.com/api/file/only_me?file_code=dsedrni0e1ka&only_me=0&key=KEY"
curl "https://filelu.com/api/file/set_password?file_code=dsedrni0e1ka&key=KEY&file_password=123456"
curl "https://filelu.com/api/file/direct_link" -d 'file_code=b578rni0e1ka&key=KEY'
curl "https://filelu.com/api/file/remove?file_code=b578rni0e1ka&remove=1&key=KEY"
curl "https://filelu.com/api/file/restore?file_code=b578rni0e1ka&restore=1&key=KEY"
curl "https://filelu.com/api/files/deleted?key=KEY"                   # trash listing
```

## Folders

```bash
curl "https://filelu.com/api/folder/list?page=1&per_page=25&fld_id=0&key=KEY"
curl "https://filelu.com/api/folder/create?parent_id=0&name=newfolder&key=KEY"
curl "https://filelu.com/api/folder/move?fld_id=12345&dest_fld_id=376421&key=KEY"
curl "https://filelu.com/api/folder/copy?fld_id=12345&key=KEY"
curl "https://filelu.com/api/folder/delete?fld_id=12345&key=KEY"
curl "https://filelu.com/api/folder/restore?fld_id=12345&key=KEY"
curl "https://filelu.com/api/folder/rename?fld_id=15&name=newname&key=KEY"
curl "https://filelu.com/api/folder/set_password?fld_token=TOKEN&key=KEY&fld_password=123456"
curl "https://filelu.com/api/folder/setting?fld_id=15&filedrop=0&fld_public=0&key=KEY"
```

## Notes

- `fld_id=0` is the root folder.
- File codes are the short tokens in a file's share URL, e.g. `b578rni0e1ka`
  from `https://filelu.com/b578rni0e1ka`.
- For multipart upload, hit `upload/server` first, then POST the file to the URL
  it returns with the field name `file`.
