# Claude Code Plugin Marketplace

Collection of Claude Code plugins (LSP, MCP, hooks, skills, subagents).

## Installation

1. Install marketplace: `claude plugin marketplace add gdm257/cc-plugins`
2. Install plugin on-demand: `claude plugin install <plugin>@cc-257`

## Available Plugins

### Code Intelligence

| Plugin | Description | Dependencies |
| ------ | ----------- | ------------ |
| **code-review-graph** | Persistent knowledge graph for token-efficient code reviews — builds a structural graph via tree-sitter, auto-updates on file changes, and provides skills for exploration, risk-scored review, refactoring, and debugging | `uvx`, `code-review-graph` |
| **codegraph** | Installs CodeGraph MCP server and rules that guide the agent to use structural queries (symbol search, callers, impact analysis) over grep/read | `npx`, `codegraph` |
| **semble** | Installs Semble semantic code search MCP server with rules prioritizing natural-language code search over grep/glob/read | `uvx`, `semble` |
| **codebase-memory** | Installs codebase-memory-mcp knowledge-graph MCP server with rules steering the agent to graph queries (symbol search, call traces, snippets, Cypher) over grep/glob | `codebase-memory-mcp` |

### Workflows

| Plugin | Description | Dependencies |
| ------ | ----------- | ------------ |
| **agent-skills** | General-purpose skills: Crawlee web-scraping reference, OpenCode plugin development guide, and skill-discovery meta-skill | `npx`, `bun` |
| **archon-skills** | Archon CLI integration — run AI workflows in isolated git worktrees for parallel development, with DAG-based YAML workflow authoring docs | `archon` CLI |
| **steering-skills** | Maintains `.claude/rules/steering/` as persistent project memory — bootstraps core steering documents and creates custom domain-specific files | None |
| **openspec-claude-skills** | OpenSpec artifact-driven workflow for Claude Code — structured change lifecycle from proposal through design/specs/tasks to implementation, verification, and archival | `openspec` CLI |
| **openspec-opencode-skills** | Same OpenSpec workflow adapted for the OpenCode agent platform | `openspec` CLI |
| **cc-sdd-skills** | Kiro-style spec-driven development skills — spec authoring (requirements/design/tasks), validation, steering, and completion verification with a spec-reviewer subagent | None |
| **trellis** | Trellis-managed workflow — task lifecycle from brainstorm through implementation, quality checks, and session journaling via `.trellis/` | None |
| **claude-code-hooks** | Runs Claude Code hooks from Claude settings files inside omp | None |
| **filelu-skills** | FileLu.com account automation — browser-driven signup from an email address, credential generation, and optional API-key capture | None |

### Language Servers

| Plugin | Language | Dependencies |
| ------ | -------- | ------------ |
| **php-lsp** | PHP | `npm install -g intelephense` |
| **powershell-lsp** | PowerShell | `scoop install powershelleditorservices` |
| **pyright-lsp** | Python | `npm install -g pyright` or `pipx install pyright` |
| **ruby-lsp** | Ruby | `gem install ruby-lsp` (Ruby 3.0+) |
| **ty-lsp** | Python | `uv tool install ty` or `pipx install ty` |
| **typescript-lsp** | TypeScript / JavaScript | `npm install -g typescript-language-server typescript` |
