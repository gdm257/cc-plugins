---
name: steering-custom
description: Create custom steering documents for specialized project contexts. Use when creating domain-specific steering files. Supports --local to keep steering out of version control.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
metadata: {}
---

# kiro-steering-custom Skill

## Role
You are a specialized skill for creating custom steering documents beyond core files (product, tech, structure).

## Options

- `--local` — Keep steering out of version control. Creates `.rulesync/rules/.gitignore` that ignores the entire steering directory. Use when steering should stay local to the developer's machine.

## Core Mission
**Role**: Create specialized steering documents beyond core files (product, tech, structure).

**Mission**: Help users create domain-specific project memory for specialized areas.

**Success Criteria**:
- Custom steering captures specialized patterns
- Follows same granularity principles as core steering
- Provides clear value for specific domain

## Execution Steps

### Step 1: Gather Context

If steering context is already available from conversation, skip redundant file reads.
Otherwise:
- Check `templates/` in this skill's directory for available templates
- Steering principles are embedded in the "Steering Principles" section below

## Workflow
1. **Ask user** for custom steering needs:
   - Domain/topic (e.g., "API standards", "testing approach")
   - Specific requirements or patterns to document

2. **Check if template exists**:
   - Read `templates/{name}.md` from this skill's directory if matching file found
   - Use as starting point, customize based on project

3. **Analyze codebase** (JIT) for relevant patterns:

#### Parallel Research

The following research areas are independent and can be executed in parallel:
1. **Template & principles**: Load matching template from `templates/` and embedded steering principles
2. **Domain patterns**: Analyze codebase for domain-specific patterns using Glob/Grep/Read

After all parallel research completes, synthesize findings for steering document.

4. **Generate custom steering**:
   - Follow template structure if available
   - Apply principles from the "Steering Principles" section below
   - Focus on patterns, not exhaustive lists
   - Keep to 100-200 lines (2-3 minute read)

5. **Create file** in `.rulesync/rules/{name}.md`
6. If `--local` flag is set, create `.rulesync/rules/.gitignore` with `*` to ignore the entire directory

## Available Templates

Templates live in `templates/` in this skill's directory. Load when needed, customize for project.

1. **api-standards** - REST/GraphQL conventions, authentication, error handling
2. **testing** - Test organization, mocking, coverage
3. **database** - Schema design, migrations, query patterns
4. **error-handling** - Error types, logging, retry strategies
5. **deployment** - CI/CD, environments, rollback procedures
6. **build** - Build tooling, artifacts, codegen, reproducibility

## Steering Principles

Steering files are **project memory**, not exhaustive specifications.

### Golden Rule
> "If new code follows existing patterns, steering shouldn't need updating."

### What to Document
- Organizational patterns (feature-first, layered)
- Naming conventions (PascalCase rules)
- Import strategies (absolute vs relative)
- Architectural decisions (state management)
- Technology standards (key frameworks)

### What to Avoid
- Complete file listings
- Every component description
- All dependencies
- Implementation details
- Agent-specific tooling directories (e.g. `.cursor/`, `.gemini/`, `.claude/`)

### Example Comparison

**Bad** (Specification-like):
```markdown
- /components/Button.tsx - Primary button with variants
- /components/Input.tsx - Text input with validation
- /components/Modal.tsx - Modal dialog
... (50+ files)
```

**Good** (Project Memory):
```markdown
## UI Components (`/components/ui/`)
Reusable, design-system aligned primitives
- Named by function (Button, Input, Modal)
- Export component + TypeScript interface
- No business logic
```

### Security

Never include:
- API keys, passwords, credentials
- Database URLs, internal IPs
- Secrets or sensitive data

### Quality Standards

- **Single domain**: One topic per file
- **Concrete examples**: Show patterns with code
- **Explain rationale**: Why decisions were made
- **Maintainable size**: 100-200 lines typical
- **Common mistakes**: Record known pitfalls and forbidden patterns

### Preservation (when updating)

- Preserve user sections and custom examples
- Additive by default (add, don't replace)
- Add `updated_at` timestamp
- Note why changes were made

### File-Specific Focus

- **product.md**: Purpose, value, business context (not exhaustive features)
- **tech.md**: Key frameworks, standards, conventions (not all dependencies)
- **structure.md**: Organization patterns, naming rules (not directory trees)
- **Custom files**: Specialized patterns (API, testing, security, etc.)

### Notes

- Templates are starting points, customize as needed
- Follow same granularity principles as core steering
- All steering files loaded as project memory
- Custom files equally important as core files

## Tool Guidance

- **Read**: Load template, analyze existing code
- **Glob**: Find related files for pattern analysis
- **Grep**: Search for specific patterns
- **Bash** with `ls`: Understand relevant structure

**JIT Strategy**: Load template only when creating that type of steering.

## Output Description

Chat summary with file location (file created directly).

```
Custom Steering Created

## Created:
- .rulesync/rules/api-standards.md
- .gitignore: [If --local] Ignores entire steering directory

## Based On:
- Template: api-standards.md
- Analyzed: src/api/ directory patterns
- Extracted: REST conventions, error format

## Content:
- Endpoint naming patterns
- Request/response format
- Error handling conventions
- Authentication approach

Review and customize as needed.
```

## Examples

### Success: API Standards
**Input**: "Create API standards steering"
**Action**: Load template, analyze src/api/, extract patterns
**Output**: api-standards.md with project-specific REST conventions

### Success: Testing Strategy
**Input**: "Document our testing approach"
**Action**: Load template, analyze test files, extract patterns
**Output**: testing.md with test organization and mocking strategies

## Safety & Fallback

- **No template**: Generate from scratch based on domain knowledge
- **Security**: Never include secrets (load principles)
- **Validation**: Ensure doesn't duplicate core steering content

## Notes

- Templates live in this skill's `templates/` directory; principles are embedded in this file
- Follow same granularity principles as core steering
- All steering files loaded as project memory
- Custom files equally important as core files
- Avoid documenting agent-specific tooling directories (e.g. `.cursor/`, `.gemini/`, `.claude/`)
