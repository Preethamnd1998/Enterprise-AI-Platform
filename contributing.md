# Contributing to the Enterprise AI Platform

> How to add commands, update standards, write docs, and release a new version.

**Related docs:**

- [`README.md`](README.md) — platform overview and command reference
- [`usage-instructions.md`](usage-instructions.md) — install · update · uninstall
- [`prompt-guide.md`](prompt-guide.md) — how to write prompts for each command
- [`project-structure.md`](project-structure.md) — what each folder does
- [`enterprise-ai-platform/docs/example-executions.md`](enterprise-ai-platform/docs/example-executions.md) — worked examples (useful when testing new commands)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Adding a New Command](#2-adding-a-new-command)
3. [Updating an Existing Command](#3-updating-an-existing-command)
4. [Updating Coding Standards](#4-updating-coding-standards)
5. [Adding Documentation](#5-adding-documentation)
6. [Adding Copilot Prompts and Chat Modes](#6-adding-copilot-prompts-and-chat-modes)
7. [Updating the Shared Contract](#7-updating-the-shared-contract)
8. [Release Process](#8-release-process)
9. [Testing Changes Locally](#9-testing-changes-locally)
10. [Fleet Rollout](#10-fleet-rollout)

---

## 1. Prerequisites

```powershell
git clone https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform.git D:\enterprise-ai-platform
cd D:\enterprise-ai-platform\enterprise-ai-platform
```

For the folder layout, see [`project-structure.md`](project-structure.md).

---

## 2. Adding a New Command

A command is a single Markdown file that Claude Code loads as a slash command.

### Step 1 — Create the file

Create `enterprise-ai-platform/commands/<command-name>.md`.

Every command file must start with a YAML frontmatter block:

```markdown
---
description: One-line description shown in /help and the skill list.
argument-hint: "key=value | \"free text\" [auto=true]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite,
  mcp__redmine-reader__redmine_get_issue,
  mcp__gitlab-reader__get_file_contents,
  ...
---
```

**Frontmatter fields:**

| Field | Required | Notes |
| --- | --- | --- |
| `description` | Yes | Shown in `/help` — one line |
| `argument-hint` | Yes | Shown as autocomplete hint |
| `allowed-tools` | Yes | Only listed tools are available to the command |

### Step 2 — Follow the command structure

Every command must implement these sections in order:

```markdown
# Command: /<name>
<!-- Shared execution contract is loaded via ~/.claude/CLAUDE.md (installed globally). -->

Agent profile: **<Profile Name>**. Input: `$ARGUMENTS`.

## Mode Detection
(parse auto=true; Session Mode if no args; Direct Mode if args provided)

## Session Mode (no args)
(banner listing all accepted input types)
(loop: Input Resolution → Phase 1 → Approval Gate → Execution → Execution Summary → prompt next)
(when user types 'done': Session Summary → close)

## Input Resolution
(table of all input types and how each is handled)

## Phase 1 — Discovery & Analysis (read-only, no changes)
(MCP reads, standards loading, analysis output blocks per contract §12)

## Approval Gate (contract §14)
(skip if auto=true; otherwise STOP and ask)

## Execution Phase (after approval or auto=true)
(implement the change; validation §7 + §8)

## Output
(summary line + Execution Summary reference)
```

The **analysis output blocks** (contract §12) must include:

```text
## ROOT CAUSE / REQUIREMENT
## IMPACT ANALYSIS  (Affected Areas + Risk Level)
## IMPLEMENTATION BREAKDOWN  (PART → PHASE → TASK)
## CHANGE ESTIMATE  (Files Read, Modified, UI, Backend, DB, Complexity)
```

### Step 3 — Sync to installed location

After writing the source file, copy it to the installed commands folder so it takes effect locally:

```powershell
Copy-Item "enterprise-ai-platform\commands\<command-name>.md" `
          "$env:USERPROFILE\.claude\commands\<command-name>.md" -Force
```

Then reload in Claude Code:

```text
/reload-skills
```

### Step 4 — Add a Copilot prompt

See [§6 below](#6-adding-copilot-prompts-and-chat-modes).

### Step 5 — Add to README

Add the new command to [`README.md`](README.md) §2 Available Commands with:
- What it accepts
- What it does (3-point summary)
- Usage examples

### Step 6 — Bump version and release

See [§8 Release Process](#8-release-process).

---

## 3. Updating an Existing Command

1. Edit `enterprise-ai-platform/commands/<command-name>.md`.
2. Sync to local install:

```powershell
Copy-Item "enterprise-ai-platform\commands\<command-name>.md" `
          "$env:USERPROFILE\.claude\commands\<command-name>.md" -Force
```

3. Reload Claude Code: `/reload-skills`
4. If the change affects the session banner, approval gate, or input types — update [`README.md`](README.md) §2.
5. Bump `VERSION` (patch) and update `CHANGELOG.md`.

---

## 4. Updating Coding Standards

Standards live in `enterprise-ai-platform/standards/`. They are lazy-loaded by commands — only the files that match the layers touched in a task are read.

### Folder layout

```text
standards/
├── coding-standards.md      ← general — loaded for any code task
├── backend/
│   ├── controller.md
│   ├── service.md
│   ├── repository.md
│   ├── entity.md
│   ├── dto-mapper-enum.md
│   ├── common-api.md
│   └── spring.md
├── frontend/
│   ├── component.md
│   ├── service.md
│   ├── custom-components.md
│   ├── pagination.md
│   ├── others.md
│   └── angular.md
└── migration/
    ├── semantic-git.md
    ├── cherry-pick-rules.md
    └── branch-migration.md
```

### Rules for editing standards

- Keep each file focused on one layer or topic.
- Do not embed examples that reference specific Lifetrenz class names — keep them generic.
- Do not embed standards content inside command files — commands reference standards via file paths.

### After editing

Sync to the installed location:

```powershell
# Sync entire standards folder
$src = "D:\enterprise-ai-platform\enterprise-ai-platform\standards"
$dst = "$env:USERPROFILE\.claude\standards"
Copy-Item "$src\*" $dst -Recurse -Force
```

For Copilot repos, re-run `install-copilot.ps1` on each repo to refresh vendored standards.
See [`usage-instructions.md`](usage-instructions.md) §8 Update the Platform.

Update `CHANGELOG.md`. A standards-only change does not require a VERSION bump, but add a changelog entry.

---

## 5. Adding Documentation

Documentation lives in `enterprise-ai-platform/docs/`. These are reference guides — not command instructions.

### Current docs

| File | Purpose |
| --- | --- |
| `installation.md` | Plugin/marketplace install (alternative to PowerShell scripts) |
| `repo-onboarding.md` | Per-repo onboarding checklist |
| `mcp-setup.md` | MCP server read-only credential setup |
| `audit-and-metrics.md` | Audit log schema + metrics queries |
| `example-executions.md` | Worked examples for each command |
| `boundary-examples.md` | Module boundary definition examples |

### Adding a new doc

1. Create `enterprise-ai-platform/docs/<doc-name>.md`.
2. Link it from the relevant root-level file:
   - If it covers user-facing usage: add a link in [`usage-instructions.md`](usage-instructions.md).
   - If it covers the platform structure: add a link in [`project-structure.md`](project-structure.md).
   - If it is a developer/contributor guide: add a link here in [`contributing.md`](contributing.md).
3. Add it to the directory tree in [`README.md`](README.md) §5 Directory Structure.
4. Update `CHANGELOG.md`.

### Root-level docs

The root of the repo has four user-facing markdown files:

| File | Purpose |
| --- | --- |
| [`README.md`](README.md) | Overview + command reference |
| [`usage-instructions.md`](usage-instructions.md) | Install · update · uninstall + quick reference |
| [`contributing.md`](contributing.md) | This file — how to develop and release |
| [`project-structure.md`](project-structure.md) | What each folder and file does |

When adding a doc that belongs at the root level (major new topic), add it to the list above in all four files.

---

## 6. Adding Copilot Prompts and Chat Modes

Copilot has no plugin system — its integration files are vendored into each repo by `install-copilot.ps1`. The source lives in `adapters/copilot/`.

### Prompt files

Location: `adapters/copilot/prompts/<command-name>.prompt.md`

A prompt file is the Copilot equivalent of a command. It should contain:
- A short instruction preamble (what the AI should do)
- Key rules from the shared contract (discovery, approval gate, output format)
- Reference to `.github/ai-platform/shared/contract.md` for the full contract

Naming: match the command name exactly (`bug-fix.prompt.md`, not `bugfix.prompt.md`).

### Chat mode files

Location: `adapters/copilot/chatmodes/<command-name>.chatmode.md`

Chat modes appear in the VS Code Copilot chat panel as a dropdown selector. Format:

```markdown
---
description: One-line description for the dropdown
---

# <Command Name> Mode

<brief instructions referencing the prompt file>
```

### After adding

Re-run `install-copilot.ps1` on any repo that needs the new command:

```powershell
.\install-copilot.ps1 -RepoPath "C:\path\to\repo"
```

---

## 7. Updating the Shared Contract

The shared contract (`shared/contract.md`) is the execution policy installed to `~/.claude/CLAUDE.md`. Every command inherits its rules.

**Before editing:** the contract is the prompt-cache prefix for every session. Keep it stable. Changes here affect ALL commands.

### Section guide

| Section | What it controls |
| --- | --- |
| §0 Prime directives | 6 top-level rules including token efficiency |
| §1 Argument parsing | How `key=value` args are parsed; `context` shorthand |
| §2 Deterministic discovery | How change sets are resolved from input |
| §3 Search Governance | Levels L1–L4, no-scan rules, expansion rule, scope drift, cache |
| §4 Depth-1 expansion | How far dependency tracing goes |
| §5 Lazy standards loading | Which standards files map to which layers |
| §6 Context discipline | What to send vs discard |
| §7 Validation gate A | Completeness check |
| §8 Validation gate B | Regression check |
| §9 Risk gate | When to stop and ask |
| §10 Budgets | Hard token/file/search limits per task type |
| §11 Stop conditions | When a task is done; failed search policy |
| §12 Output shape | Phase 1 output blocks format |
| §13 Execution Summary | Mandatory end-of-task summary (includes Prompt Quality) |
| §14 Global Approval Gate | Default APPROVAL REQUIRED + auto=true |
| §15 Migration Intelligence | Semantic migration rules, exact/functionality modes, approval gate |
| §16 Prompt Quality Assessment | Per-task quality scoring, token correlation, session rollup |

### After editing

Sync to the installed location:

```powershell
$contract = "D:\enterprise-ai-platform\enterprise-ai-platform\shared\contract.md"
$target   = "$env:USERPROFILE\.claude\CLAUDE.md"
# The contract is wrapped in markers — use install-claude.ps1 to update safely:
.\install-claude.ps1
```

Bump `VERSION` (major for breaking changes · minor for new sections · patch for clarifications).

---

## 8. Release Process

### Step 1 — Bump the version

Edit `enterprise-ai-platform/VERSION`:

```text
3.1.0
```

Versioning rules:
- **Patch** (3.0.x): bug fixes, clarifications, standards edits
- **Minor** (3.x.0): new commands, new contract sections, new docs
- **Major** (x.0.0): breaking contract changes, command removals, major restructuring

### Step 2 — Update the changelog

Add an entry to `enterprise-ai-platform/CHANGELOG.md`:

```markdown
## [3.1.0] - YYYY-MM-DD
### Added
- /new-command — purpose
### Changed
- Updated standards/backend/service.md — what changed
### Removed
- /old-command
```

### Step 3 — Update root docs

Update the version line in [`README.md`](README.md):

```markdown
> Version **3.1.0** · Released YYYY-MM-DD
```

### Step 4 — Commit and tag

```powershell
git add .
git commit -m "release: v3.1.0 — <one-line summary>"
git tag v3.1.0
git push origin main --tags
```

### Step 5 — Notify team

Send a brief note with:
- New version number
- What changed (link to CHANGELOG)
- Command to update: `.\install\update-platform.ps1`

---

## 9. Testing Changes Locally

### Test a command change

1. Sync the changed command file to `~/.claude/commands/`.
2. Open Claude Code and run `/reload-skills`.
3. Invoke the command in Session Mode (no args) — verify the banner is correct.
4. Run a Direct Mode test with a known input.
5. Verify Phase 1 output matches the §12 format.
6. Approve and verify Phase 2 (or use `auto=true`).
7. Verify the Execution Summary matches §13 format.

### Test a standards change

1. Sync the standards file to `~/.claude/standards/`.
2. Run a command that would trigger that standard (e.g. a Java bug-fix for `backend/service.md`).
3. Verify the standard is referenced in the analysis output.

### Test the contract change

1. Run `.\install-claude.ps1` to reinstall the contract.
2. Start a new Claude Code session (contract loads at session start).
3. Run a command and verify behavior matches the updated contract.

---

## 10. Fleet Rollout

After releasing a new version, update all repos:

```powershell
cd D:\enterprise-ai-platform\enterprise-ai-platform

# Check which repos are behind
.\tools\check-drift.ps1

# Update all repos (global Claude + all Copilot repos)
.\tools\rollout-fleet.ps1
```

For a single repo update:

```powershell
cd D:\enterprise-ai-platform\enterprise-ai-platform\install

# Update global Claude install
.\update-platform.ps1

# Update Copilot vendoring for one repo
.\install-copilot.ps1 -RepoPath "C:\path\to\repo"
```

See [`usage-instructions.md`](usage-instructions.md) §8 for full update steps.

---

*Enterprise AI Platform v3 · Lifetrenz Engineering*
*Repository: `https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform.git`*
