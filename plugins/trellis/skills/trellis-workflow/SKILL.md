---
name: trellis-workflow
description: "Bundled `.trellis/workflow.md` template so trellis skills work in projects that have not run `trellis init`. Use as a fallback whenever a trellis skill references `.trellis/workflow.md` (phase index, step detail, task lifecycle, guardrails) or asks how the Trellis workflow works, and the project has no `.trellis/` directory."
---

# Trellis Workflow Resource

This skill bundles a read-only copy of the canonical Trellis workflow document at `resources/.trellis/workflow.md`. The trellis skills (`trellis-start`, `trellis-continue`, `trellis-brainstorm`, `trellis-check`, …) read `.trellis/workflow.md` from the project on demand; a project that never ran `trellis init` has none — this skill is the fallback source.

## Resolution

When the Trellis workflow is needed:

1. **Project-local first** — `<project>/.trellis/workflow.md`. The user's editable copy always wins; it may derive from a different template (`native`, `tdd`, `channel-driven-subagent-dispatch`) or carry local customization.
2. **Bundled fallback** — this skill's `resources/.trellis/workflow.md`, read in place, only when the project copy is missing.

Read the resolved file as-is and treat it as the workflow source of truth: request triage, phase order, planning-artifact contract, task lifecycle, skill routing, and guardrails.

**Do not copy the bundled workflow into the project.** Never create `.trellis/` or write workflow files from this skill; initializing a project is the user's decision (`trellis init`).

## Uninitialized projects

The bundled document describes the full Trellis system, including commands such as `python ./.trellis/scripts/task.py` that only exist after `trellis init`. When `.trellis/` is absent:

- **Workflow guidance applies as-is** — triage rules, phase order, artifact contracts, and skill routing are pure guidance and can be followed from the bundled copy.
- **Scripts have no local copy.** The same commands are available globally with identical flags:

  | Project-local command | Global equivalent |
  |---|---|
  | `python ./.trellis/scripts/task.py …` | `uvx trellis-runtime task …` |
  | `python ./.trellis/scripts/get_context.py …` | `uvx trellis-runtime get-context …` |
  | `python ./.trellis/scripts/add_session.py …` | `uvx trellis-runtime add-session …` |
  | `python ./.trellis/scripts/init_developer.py …` | `uvx trellis-runtime init-developer …` |
  | `python ./.trellis/scripts/get_developer.py …` | `uvx trellis-runtime get-developer …` |

  Caveat: `uvx trellis-runtime get-context --mode phase` / `--step` parses a **project-local** `.trellis/workflow.md`; without one it cannot render the phase index — read the bundled copy instead.
- **Specs, tasks, and workspace do not exist yet.** `.trellis/spec/`, `.trellis/tasks/`, and `.trellis/workspace/` are project-owned state created by `trellis init` (specs then grown via the `trellis-spec-bootstrap` skill). Do not fabricate their contents from this skill.
- **Full initialization** — `npm install -g @mindfoldhq/trellis@latest`, then `trellis init -u <name>` (Node >= 18, Python >= 3.9). This generates `.trellis/` plus the platform files; afterwards the project-local `workflow.md` takes over and this fallback is no longer consulted.

## Bundled file

```
resources/.trellis/workflow.md
```

Synced verbatim from the Trellis CLI template `packages/cli/src/templates/trellis/workflow.md` at the version recorded in this plugin's `plugin.json` — re-sync both together on version bumps. The bundled copy is read-only; customization happens only in a project-local `.trellis/workflow.md` that the user owns.
