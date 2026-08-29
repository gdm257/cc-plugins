---
name: trellis-init
description: "Bundled required and optional `.trellis/` template so trellis skills work in projects that have not run `trellis init`. Use as a fallback whenever a trellis skill or script needs any `.trellis/*` initial files or the project has no `.trellis/` directory."
---


## What to copy

Required (always copy from `resources/.trellis/`):

- `spec/guides/`
- `.developer` — or better, generate with `uvx trellis-runtime init-developer -u <name>` instead of copying

Optional (skip if not needed):

- `tasks/`
- `spec/frontend/`
- `spec/backend/`
- `workflow.md` — only copy if the project will customize it; if unmodified, don't copy
- `.version`

## Developer identity

Do not copy `.trellis/.developer` from the bundled templates or another project. Create it with `uvx trellis-runtime init-developer -u <name>` so the identity file is generated properly for this machine/user.

