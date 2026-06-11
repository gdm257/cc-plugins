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
| **codegraph-rules** | Installs CodeGraph MCP server and rules that guide the agent to use structural queries (symbol search, callers, impact analysis) over grep/read | `npx`, `codegraph` |
| **semble-rules** | Installs Semble semantic code search MCP server with rules prioritizing natural-language code search over grep/glob/read | `uvx`, `semble` |

### Workflows

| Plugin | Description | Dependencies |
| ------ | ----------- | ------------ |
| **agent-skills** | General-purpose skills: Crawlee web-scraping reference, OpenCode plugin development guide, and skill-discovery meta-skill | `npx`, `bun` |
| **archon-skills** | Archon CLI integration — run AI workflows in isolated git worktrees for parallel development, with DAG-based YAML workflow authoring docs | `archon` CLI |
| **steering-skills** | Maintains `.claude/rules/steering/` as persistent project memory — bootstraps core steering documents and creates custom domain-specific files | None |
| **openspec-claude-skills** | OpenSpec artifact-driven workflow for Claude Code — structured change lifecycle from proposal through design/specs/tasks to implementation, verification, and archival | `openspec` CLI |
| **openspec-opencode-skills** | Same OpenSpec workflow adapted for the OpenCode agent platform | `openspec` CLI |
| **beads-plan-skills** | Bridges OpenSpec change artifacts and the `beads` task execution system — compiles tasks into a nested bead hierarchy with tier-based model dispatch | `beads` CLI, `openspec` CLI |

### Language Servers

| Plugin | Language | Dependencies |
| ------ | -------- | ------------ |
| **php-lsp** | PHP | `npm install -g intelephense` |
| **powershell-lsp** | PowerShell | `scoop install powershelleditorservices` |
| **pyright-lsp** | Python | `npm install -g pyright` or `pipx install pyright` |
| **ruby-lsp** | Ruby | `gem install ruby-lsp` (Ruby 3.0+) |
| **ty-lsp** | Python | `uv tool install ty` or `pipx install ty` |
| **typescript-lsp** | TypeScript / JavaScript | `npm install -g typescript-language-server typescript` |
