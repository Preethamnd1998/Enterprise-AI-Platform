# Command Reference — Enterprise AI Platform

**Version:** v4.3.0 | **Registry:** `shared/commands/registry.yml`

All commands are defined in `shared/` and have exactly one implementation. Adapter-specific shells (Copilot chatmodes/prompts, OpenCode command files) are thin wrappers that reference the shared source.

---

## Command Index

| Command | Invoke | Purpose | Platforms | Phase |
|---|---|---|---|---|
| [Bug Fix](#bug-fix) | `/bug-fix` | Root-cause and fix a defect | Claude, Copilot | A+ |
| [Migration](#migration) | `/migration` | Code migration: branch, cherry-pick, or exact | Claude, Copilot | A+ |
| [New Development](#new-development) | `/new-development` | Implement a new feature or story | Claude, Copilot | A+ |
| [Data Correction](#data-correction) | `/data-correction` | Safe DB data corrections with rollback | Claude, Copilot | A+ |
| [UI Design Update](#ui-design-update) | `/ui-design-update` | Angular UI redesign from spec or screenshot | Claude, Copilot | A+ |
| [Test](#test) | `/test` | Generate or audit tests for a change set | Claude, Copilot, OpenCode | C+ |
| [Prompt Audit](#prompt-audit) | `/prompt-audit` | Score and improve a prompt using CRISP | Claude, Copilot, OpenCode | D+ |

---

## Bug Fix

**Invoke:** `/bug-fix [redmine=<id>] [mr=!<n>] [commit=<sha>] [auto=true]`

**Source:** `shared/commands/bug-fix.md`

**Purpose:** Given a bug identifier (Redmine ticket, MR, commit, stack trace, or screenshot), root-cause the defect and produce a minimal fix. All changes require approval before execution unless `auto=true`.

**Input forms:**
| Input | Example |
|---|---|
| Redmine ticket | `redmine=4821` |
| GitLab MR | `mr=!234` |
| Git commit | `commit=a1b2c3d` |
| Stack trace (paste) | `/bug-fix NullPointerException at PatientService.java:142` |
| File with bug description | `file=context/bug.md` |
| Screenshot | Attach image; invoke `/bug-fix` |
| Session mode (interactive) | `/bug-fix` (no args) |

**Phases:**
1. **Input Resolution** — parse identifiers; fetch from GitLab/Redmine via MCP
2. **Discovery & Analysis** — change set, root cause, confidence score
3. **Approval Gate** — present plan; wait for `approve` / `yes` / `proceed`
4. **Execution** — apply minimal fix; Gate A + Gate B validation
5. **Execution Summary** — diff, risk, both gates, audit line

**Session mode:** `/bug-fix` with no args opens an interactive session; handles multiple bugs sequentially; type `done` to close.

**Related:** `TROUBLESHOOTING.md`, `docs/boundary-examples.md`

---

## Migration

**Invoke:** `/migration [redmine=<id>] [mr=!<n>] [branch=<b>] [release=vX..vY] [mode=exact|functionality] [target=<branch>] [auto=true]`

**Source:** `shared/commands/migration.md`

**Purpose:** Migrate code changes across branches. Supports two modes:

| Mode | What it does | Token budget |
|---|---|---|
| `exact` | Cherry-pick specific commits to target branch | ≤12k |
| `functionality` | Port the functional intent, adapting to target branch state | ≤40k |

**Input resolution:**
- `redmine=<id>` → fetches issue → finds `!<n>` or SHA references
- `mr=!<n>` → fetches MR changed files and diffs
- `branch=<b>` → diffs branch against merge-base of `target`
- `release=vX..vY` → aggregates commits in the tag range

**Standards loaded lazily:**
- `shared/standards/migration/semantic-git.md`
- `shared/standards/migration/cherry-pick-rules.md`
- `shared/standards/migration/branch-migration.md`
- `shared/commands/migration-intelligence.md` (§15)

**Related:** `docs/boundary-examples.md`, `shared/templates/migration-checklist.md`

---

## New Development

**Invoke:** `/new-development [redmine=<id>] [mr=!<n>] [auto=true]`

**Source:** `shared/commands/new-development.md`

**Purpose:** Implement a new feature, story, or enhancement. Loads only the standards relevant to the layers touched. Full Gate A (all layers present) + Gate B (no regression) required before completion.

**Phases:**
1. **Input Resolution** — Redmine story, MR, or free-text description
2. **Discovery** — identify affected layers; load relevant standards (lazy)
3. **Design** — propose implementation plan; identify touched layers
4. **Approval Gate** — present design; wait for approval
5. **Execution** — implement across all required layers
6. **Validation** — Gate A + Gate B

**High-risk triggers (require manual approval even with `auto=true`):**
- DB schema changes (Flyway)
- Permission or role changes
- Authentication flow changes

---

## Data Correction

**Invoke:** `/data-correction [redmine=<id>] [auto=true]`

**Source:** `shared/commands/data-correction.md`

**Purpose:** Generate safe, reversible DB data correction scripts. Every correction includes a rollback script generated alongside the correction.

**Output:**
- Correction SQL with transaction wrapper
- Rollback SQL
- Row count estimate
- Affected tables
- Approval gate summary

**Security:** Data corrections always require approval (cannot be skipped by `auto=true`). Corrections touching patient data, billing data, or audit tables require explicit escalation to the Security Lead.

---

## UI Design Update

**Invoke:** `/ui-design-update [redmine=<id>] [mr=!<n>] [auto=true]`

**Source:** `shared/commands/ui-design-update.md`

**Purpose:** Implement an Angular UI redesign based on a specification, Redmine ticket, screenshot, or existing MR. Loads only the frontend standards relevant to the components touched.

**Standards loaded lazily (as needed):**
- `shared/standards/frontend/component.md`
- `shared/standards/frontend/angular.md`
- `shared/standards/frontend/custom-components.md`
- `shared/standards/frontend/pagination.md`
- `shared/standards/frontend/service.md`

**Output:** Component diffs (TypeScript + HTML + SCSS), route/permission updates if required, translation key additions.

**Related:** `shared/templates/redesign-checklist.md`

---

## Test

**Invoke:** `/test [redmine=<id>] [mr=!<n>] [commit=<sha>] [auto=true]`

**Source:** `shared/commands/test.md`

**Purpose:** Generate or audit unit/integration tests for a change set. Validates test completeness against the layers touched. Available on Claude Code, Copilot, and OpenCode.

**Output:**
- New test files / test additions
- Test coverage map (which methods are covered)
- Gate A: all changed methods have corresponding tests
- Gate B: no existing tests are broken or weakened

---

## Prompt Audit

**Invoke:** `/prompt-audit`

**Source:** `shared/commands/prompt-audit.md`

**Purpose:** Score a prompt against the CRISP framework (Context · Role · Intent · Scope · Precision) and suggest improvements. Provides a numeric score (0–100) and specific recommendations.

**CRISP scoring:**

| Score | Rating | Meaning |
|---|---|---|
| 90–100 | Excellent | All 5 CRISP fields present; AI will work efficiently |
| 70–89 | Good | Minor gaps; AI may ask one clarifying question |
| 50–69 | Moderate | Missing Precision or Context; +5k token overhead |
| 30–49 | Poor | Multiple gaps; AI will guess wrong direction |
| 0–29 | Unusable | No actionable signal; discovery will fail |

See [PROMPT-GUIDELINES.md](PROMPT-GUIDELINES.md) for the full CRISP framework.

---

## Common Options

| Option | Applies to | Effect |
|---|---|---|
| `auto=true` | All commands | Skip approval gate; proceed directly to execution |
| `redmine=<id>` | All commands | Fetch Redmine issue #id as the primary input |
| `mr=!<n>` | bug-fix, migration, new-development, test | Use GitLab MR as input |
| `commit=<sha>` | bug-fix, migration, test | Use git commit as input |
| `target=<branch>` | migration | Target branch for the migration |
| `mode=exact\|functionality` | migration | Migration strategy |

---

## Phantom Commands (Removed)

The following were phantom commands in v3.0 (existed as Copilot chatmodes but had no shared implementation). They were removed in v3.1 (defect D1/D2 fix):

| Phantom command | Status | Replacement |
|---|---|---|
| `/planning` | Removed v3.1 | Use `/new-development` |
| `/ui-redesign` | Removed v3.1 | Use `/ui-design-update` |

---

## References

- `shared/commands/registry.yml` — authoritative command registry
- `PLATFORM-CAPABILITY-MATRIX.md` — which commands work on which platform
- `PROMPT-GUIDELINES.md` — how to write effective prompts
- `GOVERNANCE.md` §1 — how to add a new command
