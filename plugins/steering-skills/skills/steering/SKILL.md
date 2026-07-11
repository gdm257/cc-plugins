---
name: steering
description: Maintain .ruler/ as persistent project memory (bootstrap/sync). Use when initializing or updating steering documents. Supports --local to keep steering out of version control.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
metadata: {}
---

# kiro-steering Skill

## Role
You are a specialized skill for maintaining `.ruler/` as persistent project memory.

## Options

- `--local` — Keep steering out of version control. Creates `.ruler/.gitignore` that ignores the entire steering directory. Use when steering should stay local to the developer's machine.

## Core Mission
**Role**: Maintain `.ruler/` as persistent project memory.

**Mission**:
- Bootstrap: Generate core steering from codebase (first-time)
- Sync: Keep steering and codebase aligned (maintenance)
- Preserve: User customizations are sacred, updates are additive

**Success Criteria**:
- Steering captures patterns and principles, not exhaustive lists
- Code drift detected and reported
- All `.ruler/*.md` treated equally (core + custom)

## Execution Steps

### Step 1: Gather Context

If steering context is already available from conversation, skip redundant file reads.

- For Bootstrap mode: Use embedded templates below
- For Sync mode: Read all existing `.ruler/*.md` files
- Steering principles are embedded in the "Steering Principles" section below

## Scenario Detection

Check `.ruler/` status:

**Bootstrap Mode**: Empty OR missing core files (product.md, tech.md, structure.md)
**Sync Mode**: All core files exist

---

## Bootstrap Flow

1. Load templates from the `<template>` sections embedded in this skill
2. Analyze codebase (JIT):

#### Parallel Research

The following research areas are independent and can be executed in parallel:
1. **Product analysis**: README, package.json, documentation files for purpose, value, core capabilities
2. **Tech analysis**: Config files, dependencies, frameworks for technology patterns and decisions
3. **Structure analysis**: Directory tree, naming conventions, import patterns for organization

After all parallel research completes, synthesize patterns for steering files.

3. Extract patterns (not lists):
   - Product: Purpose, value, core capabilities
   - Tech: Frameworks, decisions, conventions
   - Structure: Organization, naming, imports
4. Generate steering files (follow templates and steering principles below)
5. If `--local` flag is set, create `.ruler/.gitignore` with `*` to ignore the entire directory
6. Present summary for review

**Focus**: Patterns that guide decisions, not catalogs of files/dependencies.

---

## Sync Flow

1. Load all existing steering (`.ruler/*.md`)
2. Analyze codebase for changes (JIT)
3. Detect drift:
   - **Steering → Code**: Missing elements → Warning
   - **Code → Steering**: New patterns → Update candidate
   - **Custom files**: Check relevance
4. Propose updates (additive, preserve user content)
5. Report: Updates, warnings, recommendations

**Update Philosophy**: Add, don't replace. Preserve user sections.

---

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
- Detailed documentation of metadata directories (settings, automation)

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

- Custom files equally important as core files

## Tool Guidance

- `Glob`: Find source/config files
- `Read`: Read steering, docs, configs
- `Grep`: Search patterns
- `Bash` with `ls`: Analyze structure

**JIT Strategy**: Fetch when needed, not upfront.

## Output Description

Chat summary only (files updated directly).

### Bootstrap:
```
Steering Created

## Generated:
- product.md: [Brief description]
- tech.md: [Key stack]
- structure.md: [Organization]
- .gitignore: [If --local] Ignores entire steering directory

Review and approve as Source of Truth.
```

### Sync:
```
Steering Updated

## Changes:
- tech.md: React 18 → 19
- structure.md: Added API pattern

## Code Drift:
- Components not following import conventions

## Recommendations:
- Consider api-standards.md
```

## Examples

### Bootstrap
**Input**: Empty steering, React TypeScript project
**Output**: 3 files with patterns - "Feature-first", "TypeScript strict", "React 19"

### Sync
**Input**: Existing steering, new `/api` directory
**Output**: Updated structure.md, flagged non-compliant files, suggested api-standards.md

## Safety & Fallback

- **Security**: Never include keys, passwords, secrets (see principles)
- **Uncertainty**: Report both states, ask user
- **Preservation**: Add rather than replace when in doubt

## Notes

- All `.ruler/*.md` loaded as project memory
- Templates and principles are embedded in this file (no external dependencies)
- Focus on patterns, not catalogs
- "Golden Rule": New code following patterns shouldn't require steering updates

---

## Templates

<template name="product">
# Product Overview

[Brief description of what this product does and who it serves]

## Core Capabilities

[3-5 key capabilities, not exhaustive features]

## Target Use Cases

[Primary scenarios this product addresses]

## Value Proposition

[What makes this product unique or valuable]

---
_Focus on patterns and purpose, not exhaustive feature lists_
</template>

<template name="tech">
# Technology Stack

## Architecture

[High-level system design approach]

## Core Technologies

- **Language**: [e.g., TypeScript, Python]
- **Framework**: [e.g., React, Next.js, Django]
- **Runtime**: [e.g., Node.js 20+]

## Key Libraries

[Only major libraries that influence development patterns]

## Development Standards

### Type Safety
[e.g., TypeScript strict mode, no `any`]

### Code Quality
[e.g., ESLint, Prettier rules]

### Testing
[e.g., Jest, coverage requirements]

## Development Environment

### Required Tools
[Key tools and version requirements]

### Common Commands
```bash
# Dev: [command]
# Build: [command]
# Test: [command]
```

## Key Technical Decisions

[Important architectural choices and rationale]

---
_Document standards and patterns, not every dependency_
</template>

<template name="structure">
# Project Structure

## Organization Philosophy

[Describe approach: feature-first, layered, domain-driven, etc.]

## Directory Patterns

### [Pattern Name]
**Location**: `/path/`
**Purpose**: [What belongs here]
**Example**: [Brief example]

### [Pattern Name]
**Location**: `/path/`
**Purpose**: [What belongs here]
**Example**: [Brief example]

## Naming Conventions

- **Files**: [Pattern, e.g., PascalCase, kebab-case]
- **Components**: [Pattern]
- **Functions**: [Pattern]

## Import Organization

```typescript
// Example import patterns
import { Something } from '@/path'  // Absolute
import { Local } from './local'     // Relative
```

**Path Aliases**:
- `@/`: [Maps to]

## Code Organization Principles

[Key architectural patterns and dependency rules]

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
</template>
