# Enterprise AI Platform v3

> Shared execution contract + AI skills for **Claude Code** and **GitHub Copilot**.
> Covers the full Lifetrenz development workflow: bug fix · new development · code migration · UI design · data correction.
> Version **3.0.0** · Released 2026-06-03

---

**Install / Update / Uninstall:** [`usage-instructions.md`](usage-instructions.md)
**How to write prompts:** [`prompt-guide.md`](prompt-guide.md)
**Project structure:** [`project-structure.md`](project-structure.md)
**Contributing / adding commands:** [`contributing.md`](contributing.md)
**Git repository:** `https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform.git`

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [Available Commands](#2-available-commands)
3. [Global Rules](#3-global-rules)
4. [Per-Repo Onboarding Checklist](#4-per-repo-onboarding-checklist)
5. [Directory Structure](#5-directory-structure)
6. [For Platform Owners / Contributors](#6-for-platform-owners--contributors)

---

## 1. What This Is

The Enterprise AI Platform is a **single source of truth** for how AI assistants (Claude Code and GitHub Copilot) behave across the Lifetrenz codebase. It provides:

| Component | What it does |
| --- | --- |
| **Shared contract** | One execution policy installed to every engineer's machine. Controls discovery, token budgets, validation gates, audit, and risk rules. |
| **Commands** | `/bug-fix`, `/new-development`, `/migration`, `/ui-design-update`, `/data-correction` — task-specific AI workflows as slash commands in Claude Code. |
| **Standards** | Backend (Java/Spring) and Frontend (Angular) coding standards, loaded lazily — only when the task touches that layer. |
| **Copilot adapter** | Equivalent prompt files and chat modes for GitHub Copilot in VS Code. |
| **Repo template** | Per-repo `.claude/` config (module boundaries + audit hook + settings) copied once per repository. |

**Design goals:** 70–90% fewer tokens per task · approval gate before every change · no repository-wide scanning · maintained by a 2–3 engineer team.

---

## 2. Available Commands

All commands default to **Session Mode** when invoked without arguments — describe multiple tasks back-to-back, skill loads once, standards read once. Type `done` to end a session.

Every command runs a **read-only Discovery & Analysis phase first**, then stops for approval. No code, config, database, or script changes happen until you approve.

```text
add auto=true to any command to skip the approval gate
example: /bug-fix auto=true
```

---

### `/bug-fix`

Root-cause and fix a defect. Trace-driven. No repository scan.

**Accepts:** Redmine ID · stack trace · error log · user story · `file=<path.md>` · screenshot

```text
/bug-fix                        Session Mode (multiple bugs, approval per bug)
/bug-fix redmine=42391          Direct Mode — Redmine issue
/bug-fix auto=true              Skip approval gate
```

**What it does:**

1. Reads affected files only (OWN-package frames, depth-1 symbol).
2. Outputs ROOT CAUSE + IMPACT + PARTS/PHASES/TASKS breakdown.
3. Stops for approval — then applies the smallest possible fix.

---

### `/new-development`

Plan and implement new features or large functionalities.

**Accepts:** Redmine story · user story · `file=<path.md>` · wireframe screenshot

```text
/new-development                         Session Mode
/new-development redmine=41800           Direct Mode — Redmine story
/new-development "Add bulk discharge"    Direct Mode — free text
/new-development auto=true               Skip approval gate
```

**What it does:**

1. Finds the nearest existing analog feature (insertion point).
2. Outputs REQUIREMENT + IMPACT + full PARTS/PHASES/TASKS breakdown.
3. Stops for approval — user may approve all parts or a specific subset.
4. Implements only the approved scope.

Supports partial approval: `approve part 1` · `approve phase 1.1`

---

### `/migration`

Port a change (MR / commit / branch / release) to a target branch.

**Accepts:** `mr=!N` · `commit=SHA` · `branch=B` · `release=vX..vY` · `redmine=ID` · `file=<path.md>`

| Mode | Use for |
| --- | --- |
| `mode=exact` | Cherry-pick, hotfix, backport — smallest patch |
| `mode=functionality` | Feature port, cross-version — full capability |

```text
/migration                                                   Session Mode
/migration mode=exact mr=!247 target=release/v2.5            Direct Mode
/migration mode=functionality redmine=41800 target=main       Direct Mode
/migration mode=exact mr=!247 target=release/v2.5 auto=true  Skip approval
```

**What it does:**

1. Resolves the change set from source. Filters non-functional hunks.
2. Outputs change set + drift warnings + PARTS/PHASES/TASKS breakdown.
3. Stops for approval — then applies exact patch or full capability closure.

---

### `/ui-design-update`

UI agent — handles three types of UI work in one command.

**Task types (auto-classified from input):**

| Signals | Task |
| --- | --- |
| Stack trace · console error · "bug" / "fix" / "broken" | **BUG FIX** |
| "new component" · "new screen" · user story | **NEW DEV** |
| Design HTML paths · "update to match design" | **DESIGN UPDATE** |

**Accepts:** `component=<Name>` · screenshot · `file=<path.md>` · user story · design HTML paths (Format A/B)

```text
/ui-design-update                                Session Mode
/ui-design-update component=WardManagement       Direct — load from GitLab
/ui-design-update auto=true                      Skip approval gate

Format A:
  Component needs change :- d:\...\ward-management\
  Component to refer :-    d:\...\ward-management.html

Format B:
  /ui-design-update inpatient ward-management ward-management
```

**Rules (all task types):**

- `.component.ts` is **NEVER modified**.
- All Angular bindings, directives, pipes, and template refs are preserved.
- Backend, APIs, DB, and routing are out of scope.

---

### `/data-correction`

Analyse production/support data issues and generate correction scripts.

**Accepts:** free text · `redmine=<id>` · `table=<name>` · `collection=<name>` · `id=<record>`

**Supported databases:** PostgreSQL · MongoDB · all connected DB MCPs

```text
/data-correction                                      Session Mode
/data-correction redmine=42500                        Direct Mode — Redmine ticket
/data-correction "Patient bills wrong after upgrade"  Direct Mode — free text
/data-correction table=patient_bill id=123456         Direct Mode — specific record
```

**What it does:**

1. Runs SELECT / `find` / `aggregate` queries to locate bad records.
2. Outputs ROOT CAUSE + AFFECTED TABLES/COLLECTIONS + RECORD COUNT + CORRECTION APPROACH.
3. Stops for approval — then generates the full script set.

**Generated scripts (shown for manual review — never executed):**

- PRE-VALIDATION queries
- CORRECTION scripts (UPDATE / DELETE / INSERT / Mongo update)
- POST-VALIDATION queries
- ROLLBACK scripts

> `auto=true` does **not** bypass the manual-execution safety rule. Scripts are always shown for your review.

---

### Input types accepted by all commands

| Input | Format |
| --- | --- |
| Redmine issue | `redmine=42391` |
| GitLab MR | `mr=!247` |
| Commit SHA | `commit=abc1234` |
| Stack trace / log / spec / design | Drop in external context folder → say `context` |
| Specific file (any name) | `file=context/my-file.md` or full path |
| Screenshot / image | Attach to the chat message |
| Free text (one-liner) | Type directly in chat |
| Word document (.docx) | Export to `.md` or `.txt`, drop in context folder |

> **`context` shorthand:** say `context` in any command — the agent reads `context/context.path` to find your external folder, then reads all files in it. Set the path once: [`context/README.md`](context/README.md). Full prompt patterns: [`prompt-guide.md`](prompt-guide.md).

---

## 3. Global Rules

These apply to every command:

1. **No writes before approval.** Phase 1 is always read-only. No code, config, DB, or script changes until explicit user approval (`approve` / `yes` / `proceed` / `implement`).
2. **`auto=true` skips the approval gate** for code/UI/migration changes. Data correction scripts are always manual regardless.
3. **No repository-wide scanning.** Files enter scope only via the stack trace, diff, named symbol, or naming convention.
4. **Standards are lazy-loaded.** Only the layers actually touched are read.
5. **Session memory.** Standards cached in an earlier task are not re-read for subsequent tasks in the same session.

---

## 4. Per-Repo Onboarding Checklist

Full guide: [`enterprise-ai-platform/docs/repo-onboarding.md`](enterprise-ai-platform/docs/repo-onboarding.md)

```text
☐ 1. Global install:  cd install && .\install-claude.ps1
☐ 2. Per-repo:        .\install-claude.ps1 -RepoPath <repo-path>
☐ 3. Context folder:  set external path in context\context.path (once per machine)
☐ 4. Edit <repo>\.claude\CLAUDE.md — fill in stack, module boundaries, Flyway path
☐ 5. MCP servers connected: gitlab-reader · redmine-reader (+ DB MCP if data tasks expected)
☐ 6. Smoke test:
       /bug-fix "NullPointerException in OrderService"  → analysis + Prompt Quality score shown
       /migration mode=exact mr=!<recent> target=main   → minimal patch + validation PASS
☐ 7. Commit .claude\settings.json + .claude\CLAUDE.md
       (do NOT commit .claude\audit\ — it is in .gitignore)
```

---

## 5. Directory Structure

```text
D:\enterprise-ai-platform\
├── README.md                              ← this file (overview + commands)
├── usage-instructions.md                  ← install · update · uninstall
├── prompt-guide.md                        ← how to write prompts for each command
├── context\                               ← agent input folder
│   ├── context.path                       ← set your external folder path here (once)
│   ├── .gitignore                         ← keeps content files out of git
│   └── README.md                          ← setup + usage instructions
├── .github\copilot-instructions.md
└── enterprise-ai-platform\               ← v3 platform source
    ├── shared\contract.md                 ← execution contract (→ ~/.claude/CLAUDE.md)
    ├── commands\                          ← skill source   (→ ~/.claude/commands/)
    │   ├── bug-fix.md
    │   ├── new-development.md
    │   ├── migration.md
    │   ├── ui-design-update.md
    │   └── data-correction.md
    ├── standards\                         ← coding standards (→ ~/.claude/standards/)
    │   ├── coding-standards.md
    │   ├── backend\
    │   ├── frontend\
    │   └── migration\
    ├── adapters\copilot\                  ← Copilot files vendored per repo
    ├── templates\                         ← checklist templates
    ├── docs\                              ← detailed guides
    │   ├── repo-onboarding.md             ← per-repo setup checklist
    │   ├── mcp-setup.md                   ← read-only MCP credential setup
    │   ├── audit-and-metrics.md           ← audit log schema + metrics
    │   ├── example-executions.md          ← worked examples for each command
    │   └── boundary-examples.md           ← module boundary definition examples
    ├── repo-template\                     ← templates copied by install scripts (only .claude/ contents)
    ├── install\                           ← PowerShell installers
    │   ├── install-claude.ps1
    │   ├── install-copilot.ps1
    │   ├── install-both.ps1
    │   └── update-platform.ps1
    └── tools\
        ├── check-drift.ps1
        └── rollout-fleet.ps1
```

---

## 6. For Platform Owners / Contributors

> Full contributor guide: [`contributing.md`](contributing.md)
> Full project structure reference: [`project-structure.md`](project-structure.md)

### Adding a new command

1. Add `commands/<command-name>.md` to the source (see [`contributing.md §2`](contributing.md#2-adding-a-new-command)).
2. Update `shared/contract.md` if new lazy-loading rules are needed (see [`contributing.md §7`](contributing.md#7-updating-the-shared-contract)).
3. Add Copilot equivalent: `adapters/copilot/prompts/<command-name>.prompt.md` (see [`contributing.md §6`](contributing.md#6-adding-copilot-prompts-and-chat-modes)).
4. Bump `VERSION` (patch = fixes · minor = new commands · major = contract changes).
5. Update `CHANGELOG.md`.
6. Commit and tag: `git tag v<version> && git push --tags`.
7. Notify team to run `.\install\update-platform.ps1`.

### Updating coding standards

Edit files in `standards/`. Notify team to run `update-platform.ps1`. Update `CHANGELOG.md`.

### Fleet operations

```powershell
.\tools\check-drift.ps1      # find repos with stale platform version
.\tools\rollout-fleet.ps1    # bulk update all repos
```

---

*Enterprise AI Platform v3 · Lifetrenz Engineering*
*Repository: `https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform.git`*
*Issues / contributions: open a GitLab MR in the platform repo.*
