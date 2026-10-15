---
name: publish-release-ci
description: Generate generic publish/release GitHub Actions CI for any repo. Use when user asks to add publish CI, release automation, or auto-publish on version change.
disable-model-invocation: true
---

# Publish Release CI

Generate a GitHub Actions workflow that auto-publishes releases when the project version changes.

## Steps

1. **Detect project type** — Read `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, or `setup.py` to determine language and version file.
2. **Extract version field** — Note the version key path (e.g., `package.json:version`, `pyproject.toml:project.version`).
3. **Determine build steps** — Generate build steps based on project type:
   - Node.js: `npm ci && npm run build`
   - Python: `pip install build && python -m build`
   - Rust: `cargo build --release`
   - Go: `go build`
   - Generic: skip build, publish source only
4. **Generate workflow** — Create `.github/workflows/publish-on-version-change.yml` with:
   - Trigger: push to default branch when version file changes
   - Version detection: compare previous vs current SHA
   - Build job: run build steps
   - Release job: create GitHub Release with artifacts
5. **Output** — Report the workflow file path and what it does.

## Workflow Template

```yaml
name: Publish on Version Change

on:
  push:
    branches: [main]
    paths:
      - "<VERSION_FILE>"

permissions:
  contents: read

jobs:
  detect-version-change:
    name: Detect version change
    runs-on: ubuntu-latest
    outputs:
      changed: `${{ steps.compare.outputs.changed }}`
      tag: `${{ steps.compare.outputs.tag }}`
    steps:
      - uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1
        with:
          fetch-depth: 0
      - name: Compare version
        id: compare
        env:
          BEFORE_SHA: `${{ github.event.before }}`
          CURRENT_SHA: `${{ github.sha }}`
        run: |
          set -euo pipefail
          version_at() {
            git show "$1:<VERSION_FILE>" 2>/dev/null \
              | grep -m1 -E '<VERSION_REGEX>' \
              | sed -E '<VERSION_EXTRACT>'
          }
          if [ -z "$BEFORE_SHA" ] || [ "$BEFORE_SHA" = "0000000000000000000000000000000000000000" ]; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          BEFORE_VERSION="$(version_at "$BEFORE_SHA" || true)"
          CURRENT_VERSION="$(version_at "$CURRENT_SHA" || true)"
          if [ -z "$CURRENT_VERSION" ]; then
            echo "::error::Could not read version at $CURRENT_SHA"
            exit 1
          fi
          if [ "$BEFORE_VERSION" = "$CURRENT_VERSION" ]; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          TAG="v$CURRENT_VERSION"
          echo "changed=true" >> "$GITHUB_OUTPUT"
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"

  publish:
    name: Publish release
    needs: detect-version-change
    if: needs.detect-version-change.outputs.changed == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1
      - name: Build
        run: |
          <BUILD_STEPS>
      - name: Create release
        uses: softprops/action-gh-release@efb35369e0ad2afab669f228072c1b0d510eae64 # v3.0.3
        with:
          tag_name: `${{ needs.detect-version-change.outputs.tag }}`
          draft: false
          generate_release_notes: true
```

## Version File Patterns

| File | Regex | Extract |
|---|---|---|
| `package.json` | `"version"[[:space:]]*:` | `s/.*:[[:space:]]*"([^"]+)".*/\1/` |
| `pyproject.toml` | `^version[[:space:]]*=` | `s/.*=[[:space:]]*"([^"]+)".*/\1/` |
| `Cargo.toml` | `^version[[:space:]]*=` | `s/.*=[[:space:]]*"([^"]+)".*/\1/` |
| `go.mod` | `^module[[:space:]]+` | N/A (no version in go.mod) |

## Completion Criteria

- Workflow file exists at `.github/workflows/publish-on-version-change.yml`
- Version detection uses `git show` + `grep`/`sed` (no external deps)
- All actions pinned to full 40-char SHA with version comment
- `draft: false` for direct publish
- No existing files modified