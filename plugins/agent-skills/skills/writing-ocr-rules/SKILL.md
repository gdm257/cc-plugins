---
name: writing-ocr-rules
description: Writing ocr (open-code-review) review rules — the rule.json files that tell `ocr review` what to check per file. Use when adding or editing `.opencodereview/rule.json`, writing a `--rule` override file, or debugging why a rule does or doesn't fire.
---

# Writing ocr rules

An ocr rule file routes per-path review instructions to the review LLM: each `{path, rule}` entry in `rules[]` pairs a glob with a rule text; when a file matches that glob, the rule text becomes part of the review prompt. Four steps, each done when its `ocr rules check` output says so.

## Step 1: Pick the layer

Choose by scope — the path is the answer:

| Scenario | Layer | File |
|---|---|---|
| Team convention, committed with the repo | project | `<repo>/.opencodereview/rule.json` |
| Personal preference, machine-wide | global | `~/.opencodereview/rule.json` |
| Checklist for a single review | custom | any path, via `ocr review --rule <file>` |

Priority is custom > project > global > built-in system rules; each layer takes the first matching entry. Edit the existing file rather than creating one: when a higher layer exists, the lower one goes entirely unused — stray files are a bug source.

**Done when**: the target file is chosen, and no higher-layer rule file in the repo accidentally shadows it.

## Step 2: Write entries

- **Specific before general**: `rules` takes the first match in **declaration order**. `**/*.go` listed before `src/api/**/*.go` permanently shadows the latter. Insert each new entry where it can match, not appended at the end.
- **The rule text is a prompt**: it is injected verbatim into the review LLM. Write imperative, decidable instructions ("Every public handler must validate request bodies before use"), naming real identifiers, file paths, test names; group by topic with subheadings. Every instruction must be judgeable against a diff by the reviewer — drop what can't be judged ("code should be elegant").
- **State the positive**: write the target behavior ("use parameterized queries"), not bare prohibitions ("don't use string concat") — keep a ban only as a hard guardrail, and pair it with the positive target.
- **Replace by default**: a matching user rule **replaces** the built-in language rule (once your rule matches a Go file, the built-in `go.md` no longer applies). To add team conventions on top of the language default, set `"merge_system_rule": true`.

**Done when**: every entry's glob matches exactly the files it intends to cover, and every sentence of the rule text is decidable.

## Step 3: Set include / exclude (optional)

- `exclude`: matching files are never reviewed; highest precedence.
- `include`: matching files **skip** the built-in extension check and test-file exclusion — it is a bypass, not a whitelist: files outside `include` still go through the normal gates and may well be reviewed.
- The built-in secret-path protection (`.env.*` etc.) runs before `include` and **cannot** be overridden by it.

## Step 4: Verify

Run against every real file you intend to cover:

```bash
ocr rules check path/to/real/file.go
```

The output shows the winning Source (layer), Pattern, and the full merged rule text. Then run it on a nearby file that should **not** match, to confirm no over-reach.

**Done when**: every intended file resolves to the expected layer + pattern, and neighboring files don't match.

## Reference

### File format

```json
{
  "include": ["src/**/*.{ts,tsx}"],
  "exclude": ["**/generated/**"],
  "rules": [
    {
      "path": "src/api/**/*.go",
      "rule": "Every public handler must validate request bodies before use.",
      "merge_system_rule": true
    }
  ]
}
```

All three fields optional; `rules` matches in declaration order, first hit wins.

### Glob semantics

doublestar style: `*` stays within one directory, `**` crosses directories, `{a,b}` expands, `?` and `[abc]` behave as in shell. Matching is **case-insensitive** (paths are lowercased first). Verify with `ocr rules check` rather than guessing.

### merge_system_rule

- Omitted / `false`: replaces the built-in rule — your rule text is the file's only rule.
- `true`: built-in rule and your rule both apply.
- `"rule": ""` with `merge_system_rule: true`: keeps only the built-in rule (use to shield a lower layer from higher-layer customization and restore default behavior).

### The review gate

Independent of path rules, a filter decides whether a file is reviewed at all: binary → secret paths → user `exclude` → user `include` (match keeps the file) → extension allowlist → built-in test-file exclusion. When a rule doesn't fire, run `ocr review --preview` first to tell "file was filtered out" from "rule didn't match".

### Full docs

Complete pattern table, system rule list, gate details: https://open-codereview.ai/docs/review-rules (the environment is the source of truth; this skill caches only the decision rules not stated there).
