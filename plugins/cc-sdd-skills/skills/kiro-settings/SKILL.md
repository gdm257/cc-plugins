---
name: kiro-settings
description: Bundled `.kiro/settings` template tree so cc-sdd skills work without a project-local copy. Use as a fallback when a skill needs a `.kiro/settings/templates/...` file missing from the project.
---

# Kiro Settings Resource

This skill bundles a read-only `.kiro/settings/` template tree under `resources/.kiro/settings/`. The other cc-sdd skills read their templates from `.kiro/settings/templates/...`, which a project may not have on a global install — this skill is the fallback source.

## Resolution

When a skill needs `.kiro/settings/templates/<path>`:

1. **Project-local first** — `<project>/.kiro/settings/templates/<path>`. The user's editable copy always wins.
2. **Bundled fallback** — this skill's `resources/.kiro/settings/templates/<path>`, read in place, only if the project copy is missing.

Read the resolved file as-is; the calling skill does its own placeholder substitution (`{{FEATURE_NAME}}`, `{{TIMESTAMP}}`, etc.). Never invent a template that exists in neither place — report the missing path and stop.

**Do not copy the bundled templates into the project.** If `.kiro/settings/` is absent, read from `resources/` directly; never create `.kiro/settings/` or write template files into the project. The project-local tree is opt-in and owned by the user.

## Bundled templates

```
resources/.kiro/settings/templates/
  specs/            init.json, requirements.md, requirements-init.md, research.md, design.md, tasks.md
  steering/         product.md, structure.md, tech.md
  steering-custom/  api-standards.md, authentication.md, database.md, deployment.md, error-handling.md, security.md, testing.md
```

The bundled tree is read-only; customization happens only in a project-local `.kiro/settings/` that the user has already created.
