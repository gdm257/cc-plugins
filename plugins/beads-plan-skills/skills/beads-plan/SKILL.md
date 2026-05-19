# beads-plan Agent Skill

## Activation
Use this skill when:
- Working on tasks tracked in beads with tier/parallelism metadata
- Dispatching subtasks to appropriate model tiers
- Generating or refreshing tasks.md from beads

## Commands

### beads-plan plan <change-dir>
Create a beads epic from an OpenSpec change directory.
- Parses tasks.md, proposal.md, design.md, specs/
- Creates nested bead hierarchy: epic → sub-epics → tasks
- Assesses complexity and assigns tier (fast/standard/advanced)
- Analyzes parallelism and creates dependency edges
- Enriches tasks with context, acceptance criteria, output schema

Flags:
- `--dry-run`: Preview planned structure without creating beads
- `--profile <name>`: Select provider profile for tier→model resolution
- `--json`: Output structured JSON

### beads-plan view <epic-id>
Generate tasks.md from a beads epic hierarchy.
- Reads epic recursively via bd show
- Renders checkboxes with bead IDs and tier tags
- Includes progress footer

Flags:
- `--output <file>`: Write to file (default: stdout)

### beads-plan prime
Output this skill definition.

## Metadata Schema

Each task bead includes structured metadata:

| Field | Values | Description |
|-------|--------|-------------|
| tier | fast, standard, advanced | Capability tier for execution |
| complexity | low, medium, high | Assessed task complexity |
| model | (provider-specific) | Concrete model when profile active |
| parallelism | parallel, sequential, mixed | Execution mode for child tasks |
| parallel_groups | [[id,...], ...] | Groups of concurrent children |
| change | (change name) | OpenSpec change provenance |

## Tier Dispatch

When executing tasks, use the tier to select the appropriate agent:
- **fast**: Simple config, boilerplate, scaffolding tasks
- **standard**: Multi-file changes, integration, testing
- **advanced**: Architecture, refactoring, cross-cutting concerns

## Task Output Protocol

After completing a task, record in metadata:
- **files_changed**: List of file paths created or modified
- **decisions**: Architectural or implementation decisions made
- **discoveries**: Unexpected findings or issues encountered

## Parallelism

Check parent bead metadata for parallelism hints:
- **parallel**: All children can run concurrently
- **sequential**: Execute children in order
- **mixed**: Consult parallel_groups for wave scheduling

## Workflow Integration

beads-plan bridges OpenSpec and beads. It plugs into the existing OpenSpec workflow without replacing any steps:

```
OpenSpec artifacts          beads-plan              beads execution
─────────────────          ──────────              ───────────────
/opsx:new
/opsx:continue (repeat)
  → tasks.md ready
                     ──→  beads-plan plan
                           (compiles tasks.md
                            into bead molecule)
                                              ──→  bd ready → claim → implement → bd close
                                                   (repeat for each unblocked task)
                     ←──  beads-plan view
                           (syncs bead status
                            back to tasks.md)
/opsx:verify
/opsx:archive
```

### Step by step

1. **Design** (OpenSpec, unchanged): `/opsx:new` → `/opsx:continue` until tasks.md exists
2. **Compile** (beads-plan): `beads-plan plan <change-dir>` creates the bead molecule
3. **Execute** (beads): `bd ready` → claim → implement → `bd close` for each task
4. **Sync status** (beads-plan): `beads-plan view <epic-id> -o <change-dir>/tasks.md` updates tasks.md with execution progress
5. **Verify & archive** (OpenSpec, unchanged): `/opsx:verify` → `/opsx:archive`

Steps 3-4 repeat as tasks are completed. Step 4 is optional but recommended before verify/archive to keep OpenSpec in sync with actual execution state.

