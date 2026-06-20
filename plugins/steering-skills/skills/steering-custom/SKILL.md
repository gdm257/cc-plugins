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

- `--local` — Keep steering out of version control. Creates `.claude/rules/steering/.gitignore` that ignores the entire steering directory. Use when steering should stay local to the developer's machine.

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
- Check embedded templates below for available templates
- Steering principles are embedded in the "Steering Principles" section below

## Workflow

1. **Ask user** for custom steering needs:
   - Domain/topic (e.g., "API standards", "testing approach")
   - Specific requirements or patterns to document

2. **Check if template exists**:
   - Load from embedded `<template>` sections below if matching name found
   - Use as starting point, customize based on project

3. **Analyze codebase** (JIT) for relevant patterns:

#### Parallel Research

The following research areas are independent and can be executed in parallel:
1. **Template & principles**: Load matching template and embedded steering principles
2. **Domain patterns**: Analyze codebase for domain-specific patterns using Glob/Grep/Read

After all parallel research completes, synthesize findings for steering document.

4. **Generate custom steering**:
   - Follow template structure if available
   - Apply principles from the "Steering Principles" section below
   - Focus on patterns, not exhaustive lists
   - Keep to 100-200 lines (2-3 minute read)

5. **Create file** in `.claude/rules/steering/{name}.md`
6. If `--local` flag is set, create `.claude/rules/steering/.gitignore` with `*` to ignore the entire directory

## Available Templates

Templates are embedded below. Load when needed, customize for project.

1. **api-standards** - REST/GraphQL conventions, error handling
2. **testing** - Test organization, mocking, coverage
3. **security** - Auth patterns, input validation, secrets
4. **database** - Schema design, migrations, query patterns
5. **error-handling** - Error types, logging, retry strategies
6. **authentication** - Auth flows, permissions, session management
7. **deployment** - CI/CD, environments, rollback procedures

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
- .claude/rules/steering/api-standards.md
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

- Templates and principles are embedded in this file (no external dependencies)
- Follow same granularity principles as core steering
- All steering files loaded as project memory
- Custom files equally important as core files
- Avoid documenting agent-specific tooling directories (e.g. `.cursor/`, `.gemini/`, `.claude/`)

---

## Templates

<template name="api-standards">
# API Standards

[Purpose: consistent API patterns for naming, structure, auth, versioning, and errors]

## Philosophy
- Prefer predictable, resource-oriented design
- Be explicit in contracts; minimize breaking changes
- Secure by default (auth first, least privilege)

## Endpoint Pattern
```
/{version}/{resource}[/{id}][/{sub-resource}]
```
Examples:
- `/api/v1/users`
- `/api/v1/users/:id`
- `/api/v1/users/:id/posts`

HTTP verbs:
- GET (read, safe, idempotent)
- POST (create)
- PUT/PATCH (update)
- DELETE (remove, idempotent)

## Request/Response

Request (typical):
```json
{ "data": { ... }, "metadata": { "requestId": "..." } }
```

Success:
```json
{ "data": { ... }, "meta": { "timestamp": "...", "version": "..." } }
```

Error:
```json
{ "error": { "code": "ERROR_CODE", "message": "...", "field": "optional" } }
```
(See error-handling for rules.)

## Status Codes (pattern)
- 2xx: Success (200 read, 201 create, 204 delete)
- 4xx: Client issues (400 validation, 401/403 auth, 404 missing)
- 5xx: Server issues (500 generic, 503 unavailable)
Choose the status that best reflects the outcome.

## Authentication
- Credentials in standard location
```
Authorization: Bearer {token}
```
- Reject unauthenticated before business logic

## Versioning
- Version via URL/header/media-type
- Breaking change → new version
- Non-breaking → same version
- Provide deprecation window and comms

## Pagination/Filtering (if applicable)
- Pagination: `page`, `pageSize` or cursor-based
- Filtering: explicit query params
- Sorting: `sort=field:asc|desc`
Return pagination metadata in `meta`.

---
_Focus on patterns and decisions, not endpoint catalogs._
</template>

<template name="authentication">
# Authentication & Authorization Standards

[Purpose: unify auth model, token/session lifecycle, permission checks, and security]

## Philosophy
- Clear separation: authentication (who) vs authorization (what)
- Secure by default: least privilege, fail closed, short-lived tokens
- UX-aware: friction where risk is high, smooth otherwise

## Authentication

### Method (choose + rationale)
- Options: JWT, Session, OAuth2, hybrid
- Choice: [our method] because [reason]

### Flow (high-level)
```
1) User proves identity (credentials or provider)
2) Server verifies and issues token/session
3) Client sends token per request
4) Server verifies token and proceeds
```

### Token/Session Lifecycle
- Storage: httpOnly cookie or Authorization header
- Expiration: short-lived access, longer refresh (if used)
- Refresh: rotate tokens; respect revocation
- Revocation: blacklist/rotate on logout/compromise

### Security Pattern
- Enforce TLS; never expose tokens to JS when avoidable
- Bind token to audience/issuer; include minimal claims
- Consider device binding and IP/risk checks for sensitive actions

## Authorization

### Permission Model
- Choose one: RBAC / ABAC / ownership-based / hybrid
- Define roles/attributes centrally; avoid hardcoding across codebase

### Checks (where to enforce)
- Route/middleware: coarse-grained gate
- Domain/service: fine-grained decisions
- UI: conditional rendering (no security reliance)

Example pattern:
```typescript
requirePermission('resource:action'); // route
if (!user.can('resource:action')) throw ForbiddenError(); // domain
```

### Ownership
- Pattern: owner OR privileged role can act
- Verify on entity boundary before mutation

## Passwords & MFA
- Passwords: strong policy, hashed (bcrypt/argon2), never plaintext
- Reset: time-limited token, single-use, notify user
- MFA: step-up for risky operations (policy-driven)

## API-to-API Auth
- Use API keys or OAuth client credentials
- Scope keys minimally; rotate and audit usage
- Rate limit by identity (user/key)

---
_Focus on patterns and decisions. No library-specific code._
</template>

<template name="database">
# Database Standards

[Purpose: guide schema design, queries, migrations, and integrity]

## Philosophy
- Model the domain first; optimize after correctness
- Prefer explicit constraints; let database enforce invariants
- Query only what you need; measure before optimizing

## Naming & Types
- Tables: `snake_case`, plural (`users`, `order_items`)
- Columns: `snake_case` (`created_at`, `user_id`)
- FKs: `{table}_id` referencing `{table}.id`
- Types: timezone-aware timestamps; strong IDs; precise money types

## Relationships
- 1:N: FK in child
- N:N: join table with compound key
- 1:1: FK + UNIQUE

## Migrations
- Immutable migrations; always add rollback
- Small, focused steps; test on non-prod first
- Naming: `{seq}_{action}_{object}` (e.g., `002_add_email_index`)

## Query Patterns
- ORM for simple CRUD and safety; raw SQL for complex/perf-critical
- Avoid N+1 (eager load/batching); paginate large sets
- Index FKs and frequently filtered/sorted columns

## Connection & Transactions
- Use pooling (size/timeouts based on workload)
- One connection per unit of work; close/return promptly
- Wrap multi-step changes in transactions

## Data Integrity
- Use NOT NULL/UNIQUE/CHECK/FK constraints
- Validate at DB when appropriate (defense in depth)
- Prefer generated columns for consistent derivations

## Backup & Recovery
- Regular backups with retention; test restores
- Document RPO/RTO targets; monitor backup jobs

---
_Focus on patterns and decisions. No environment-specific settings._
</template>

<template name="deployment">
# Deployment Standards

[Purpose: safe, repeatable releases with clear environment and pipeline patterns]

## Philosophy
- Automate; test before deploy; verify after deploy
- Prefer incremental rollout with fast rollback
- Production changes must be observable and reversible

## Environments
- Dev: fast iteration; debugging enabled
- Staging: mirrors prod; release validation
- Prod: hardened; monitored; least privilege

## CI/CD Flow
```
Code → Test → Build → Scan → Deploy (staged) → Verify
```
Principles:
- Fail fast on tests/scans; block deploy
- Artifact builds are reproducible (lockfiles, pinned versions)
- Manual approval for prod; auditable trail

## Deployment Strategies
- Rolling: gradual instance replacement
- Blue-Green: switch traffic between two pools
- Canary: small % users first, expand on health
Choose per risk profile; document default.

## Zero-Downtime & Migrations
- Health checks gate traffic; graceful shutdown
- Backwards-compatible DB changes during rollout
- Separate migration step; test rollback paths

## Rollback
- Keep previous version ready; automate revert
- Rollback faster than fix-forward; document triggers

## Configuration & Secrets
- 12-factor config via env; never commit secrets
- Secret manager; rotate; least privilege; audit access
- Validate required env vars at startup

## Health & Monitoring
- Endpoints: `/health`, `/health/live`, `/health/ready`
- Monitor latency, error rate, throughput, saturation
- Alerts on SLO breaches/spikes; tune to avoid fatigue

## Incident Response & DR
- Standard playbook: detect → assess → mitigate → communicate → resolve → post-mortem
- Backups with retention; test restore; defined RPO/RTO

---
_Focus on rollout patterns and safeguards. No provider-specific steps._
</template>

<template name="error-handling">
# Error Handling Standards

[Purpose: unify how errors are classified, shaped, propagated, logged, and monitored]

## Philosophy
- Fail fast where possible; degrade gracefully at system boundaries
- Consistent error shape across the stack (human + machine readable)
- Handle known errors close to source; surface unknowns to a global handler

## Classification (decide handling by source)
- Client: Input/validation/user action issues → 4xx
- Server: System failures/unexpected exceptions → 5xx
- Business: Rule/state violations → 4xx (e.g., 409)
- External: 3rd-party/network failures → map to 5xx or 4xx with context

## Error Shape (single canonical format)
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "requestId": "trace-id",
    "timestamp": "ISO-8601"
  }
}
```
Principles: stable code enums, no secrets, include trace info.

## Propagation (where to convert)
- API layer: Convert domain errors → HTTP status + canonical body
- Service layer: Throw typed business errors, avoid stringly-typed errors
- Data/external layer: Wrap provider errors with safe, actionable codes
- Unknown errors: Bubble to global handler → 500 + generic message

Example pattern:
```typescript
try { return await useCase(); }
catch (e) {
  if (e instanceof BusinessError) return respondMapped(e);
  logError(e); return respondInternal();
}
```

## Logging (context over noise)
Log: operation, userId (if available), code, message, stack, requestId, minimal context.
Do not log: passwords, tokens, secrets, full PII, full bodies with sensitive data.
Levels: ERROR (failures), WARN (recoverable/edge), INFO (key events), DEBUG (diagnostics).

## Retry (only when safe)
Retry when: network/timeouts/transient 5xx AND operation is idempotent.
Do not retry: 4xx, business errors, non-idempotent flows.
Strategy: exponential backoff + jitter, capped attempts; require idempotency keys.

## Monitoring & Health
Track: error rates by code/category, latency, saturation; alert on spikes/SLI breaches.
Expose health: `/health` (live), `/health/ready` (ready). Link errors to traces.

---
_Focus on patterns and decisions. No implementation details or exhaustive lists._
</template>

<template name="security">
# Security Standards

[Purpose: define security posture with patterns for validation, authz, secrets, and data]

## Philosophy
- Defense in depth; least privilege; secure by default; fail closed
- Validate at boundaries; sanitize for context; never trust input
- Separate authentication (who) and authorization (what)

## Input & Output
- Validate at API boundaries and UI forms; enforce types and constraints
- Sanitize/escape based on destination (HTML, SQL, shell, logs)
- Prefer allow-lists over block-lists; reject early with minimal detail

## Authentication & Authorization
- Authentication: verify identity; issue short-lived tokens/sessions
- Authorization: check permissions before actions; deny by default
- Centralize policies; avoid duplicating checks across code

Pattern:
```typescript
if (!user.hasPermission('resource:action')) throw ForbiddenError();
```

## Secrets & Configuration
- Never commit secrets; store in secret manager or env
- Rotate regularly; audit access; scope minimal
- Validate required env vars at startup; fail fast on missing

## Sensitive Data
- Minimize collection; mask/redact in logs; encrypt at rest and in transit
- Restrict access by role/need-to-know; track access to sensitive records

## Session/Token Security
- httpOnly + secure cookies where possible; TLS everywhere
- Short expiration; rotate on refresh; revoke on logout/compromise
- Bind tokens to audience/issuer; include minimal claims

## Logging (security-aware)
- Log auth attempts, permission denials, and sensitive operations
- Never log passwords, tokens, secrets, full PII; avoid full bodies
- Include requestId and context to correlate events

## Headers & Transport
- Enforce TLS; HSTS
- Set security headers (CSP, X-Frame-Options, X-Content-Type-Options)
- Prefer modern crypto; disable weak protocols/ciphers

## Vulnerability Posture
- Prefer secure libraries; keep dependencies updated
- Static/dynamic scans in CI; track and remediate
- Educate team on common classes; encode as patterns above

---
_Focus on patterns and principles. Link concrete configs to ops docs._
</template>

<template name="testing">
# Testing Standards

[Purpose: guide what to test, where tests live, and how to structure them]

## Philosophy
- Test behavior, not implementation
- Prefer fast, reliable tests; minimize brittle mocks
- Cover critical paths deeply; breadth over 100% pursuit

## Organization
Options:
- Co-located: `component.tsx` + `component.test.tsx`
- Separate: `/src/...` and `/tests/...`
Pick one as default; allow exceptions with rationale.

Naming:
- Files: `*.test.*` or `*.spec.*`
- Suites: what is under test; Cases: expected behavior

## Test Types
- Unit: single unit, mocked dependencies, very fast
- Integration: multiple units together, mock externals only
- E2E: full flows, minimal mocks, only for critical journeys

## Structure (AAA)
```typescript
it('does X when Y', () => {
  // Arrange
  const input = setup();
  // Act
  const result = act(input);
  // Assert
  expect(result).toEqual(expected);
});
```

## Mocking & Data
- Mock externals (API/DB); never mock the system under test
- Use factories/fixtures; reset state between tests
- Keep test data minimal and intention-revealing

## Coverage
- Target: [% overall]; higher for critical domains
- Enforce thresholds in CI; exceptions require review rationale

---
_Focus on patterns and decisions. Tool-specific config lives elsewhere._
</template>
