# Enterprise AI Platform — Usage Instructions

> Git repository · Install · Update · Uninstall · Command reference

> **For step-by-step install/upgrade procedures, use the current per-platform guides — they
> are more detailed and take precedence over this file where they differ (e.g. PowerShell
> version requirements):**
> [`docs/INSTALL-CLAUDE.md`](docs/INSTALL-CLAUDE.md) ·
> [`docs/INSTALL-COPILOT.md`](docs/INSTALL-COPILOT.md) ·
> [`docs/INSTALL-OPENCODE.md`](docs/INSTALL-OPENCODE.md) ·
> [`docs/QUICK-START.md`](docs/QUICK-START.md) ·
> [`docs/UPGRADE-GUIDE.md`](docs/UPGRADE-GUIDE.md)
> This file remains the command/uninstall quick-reference and is kept version-consistent, but
> has not been reconciled line-by-line against the newer guides — see `docs/MASTER-PROJECT-BOARD.md`.

**Related docs:**

- [`README.md`](README.md) — platform overview and command reference
- [`prompt-guide.md`](prompt-guide.md) — how to write prompts for each command
- [`PROJECT-STRUCTURE.md`](PROJECT-STRUCTURE.md) — what every folder and file does
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to add commands, standards, and docs
- [`docs/repo-onboarding.md`](docs/repo-onboarding.md) — per-repo setup checklist
- [`docs/example-executions.md`](docs/example-executions.md) — worked examples for each command
- [`docs/audit-and-metrics.md`](docs/audit-and-metrics.md) — audit log schema and metrics

---

## Repository

| | |
| --- | --- |
| **URL** | `https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform.git` |
| **Branch** | `main` |
| **Version file** | `VERSION` |
| **Changelog** | `CHANGELOG.md` |

---

## Table of Contents

1. [Clone the Repository](#1-clone-the-repository)
2. [Prerequisites](#2-prerequisites)
3. [Install — Claude Code (Global)](#3-install--claude-code-global)
4. [Install — Claude Code (Per-Repo)](#4-install--claude-code-per-repo)
5. [Install — GitHub Copilot (Per-Repo)](#5-install--github-copilot-per-repo)
6. [Install — OpenCode (Per-Repo)](#6-install--opencode-per-repo)
7. [Install — Both at Once (Claude + Copilot)](#7-install--both-at-once-claude--copilot)
8. [Verify Installation](#8-verify-installation)
9. [Update the Platform](#9-update-the-platform)
10. [Uninstall — Claude Code (Global)](#10-uninstall--claude-code-global)
11. [Uninstall — Claude Code (Per-Repo)](#11-uninstall--claude-code-per-repo)
12. [Uninstall — GitHub Copilot (Per-Repo)](#12-uninstall--github-copilot-per-repo)
13. [Command Quick Reference](#13-command-quick-reference)
14. [Approval Gate — How It Works](#14-approval-gate--how-it-works)

---

## 1. Clone the Repository

Clone once to a local directory. All install scripts run from this clone.

```powershell
git clone https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform.git D:\enterprise-ai-platform
cd D:\enterprise-ai-platform
```

The repo is flat — no nested subdirectory to `cd` into after cloning.

To pull the latest changes later:

```powershell
cd D:\enterprise-ai-platform
git pull origin main
```

---

## 2. Prerequisites

| Requirement | Notes |
| --- | --- |
| **Claude Code** (latest) | VS Code extension or CLI — `npm i -g @anthropic-ai/claude-code` |
| **GitHub Copilot** (latest) | VS Code extension — only needed for Copilot install |
| **PowerShell 5.1+** | Windows built-in — run `$PSVersionTable.PSVersion` to confirm |
| **Git** | For cloning and updating the repo |
| **MCP servers** | `gitlab-reader` and `redmine-reader` must be configured and connected |

MCP credential setup: [`docs/mcp-setup.md`](docs/mcp-setup.md)

---

## 3. Install — Claude Code (Global)

Run **once per engineer machine**. Installs the execution contract, all skill commands, and coding standards globally. Every repository on the machine benefits immediately — no per-repo install required for basic usage.

```powershell
cd D:\enterprise-ai-platform\install
.\install-claude.ps1
```

**What gets written:**

```text
C:\Users\<you>\.claude\
├── CLAUDE.md                  ← execution contract (auto-loaded every Claude Code session)
├── .platform-version          ← installed version stamp
├── commands\
│   ├── bug-fix.md             ← /bug-fix
│   ├── new-development.md     ← /new-development
│   ├── migration.md           ← /migration
│   ├── ui-design-update.md    ← /ui-design-update
│   ├── data-correction.md     ← /data-correction
│   ├── test.md                ← /test
│   └── prompt-audit.md        ← /prompt-audit
├── standards\
│   ├── coding-standards.md
│   ├── backend\               ← Java/Spring (lazy-loaded)
│   ├── frontend\              ← Angular/TS (lazy-loaded)
│   └── migration\             ← Git rules (lazy-loaded)
└── settings.json              ← global write deny-list
```

---

## 4. Install — Claude Code (Per-Repo)

Run **once per repository** to add module boundaries, the audit hook, and per-repo settings. Must be done after the global install.

```powershell
cd D:\enterprise-ai-platform\install
.\install-claude.ps1 -RepoPath "C:\path\to\your\repo"
```

**What gets written to the repo:**

```text
<repo>\.claude\
├── CLAUDE.md         ← module boundaries template — EDIT THIS
├── settings.json     ← Stop hook + MCP write deny-list
├── hooks\
│   └── audit.js      ← deterministic audit hook (runs after every command)
└── audit\            ← per-run audit logs (added to .gitignore automatically)
```

**After install, open `.claude\CLAUDE.md` and fill in:**

```markdown
Stack: Java 17 / Spring Boot 3 / Angular 17
GitLab project: gitlab.lifetrenz.com/lifetrenz/<service-name>
Default branch: main
Active release branches: release/v2.x

Flyway location: src/main/resources/db/migration/

Module boundaries (top-level package prefixes this repo owns):
  com.lifetrenz.lths.<module>

Shared/allowed cross-module packages:
  com.lifetrenz.lths.common

Forbidden:
  (none)
```

Commit `.claude\CLAUDE.md` and `.claude\settings.json` to the repo.
Do **not** commit `.claude\audit\` — it is in `.gitignore`.

---

## 5. Install — GitHub Copilot (Per-Repo)

Copilot has no plugin system — the platform files are vendored (copied) into each repository.
Run once per repository that needs Copilot support. Re-run after every platform update.

```powershell
cd D:\enterprise-ai-platform\install
.\install-copilot.ps1 -RepoPath "C:\path\to\your\repo"
```

**What gets written to the repo:**

```text
<repo>\.github\
├── copilot-instructions.md      ← Copilot entrypoint (auto-loaded by VS Code Copilot)
├── prompts\                     ← /bug-fix /new-development /migration /ui-design-update /data-correction /prompt-audit
├── chatmodes\                   ← dropdown chat mode selectors in Copilot panel
└── ai-platform\
    ├── .platform-version        ← vendored version stamp
    ├── shared\
    │   ├── contract.md          ← execution contract
    │   ├── commands\            ← full command source (referenced by prompt/chatmode shells)
    │   └── prompts\             ← CRISP framework (used by /prompt-audit)
    ├── standards\               ← all coding standards
    ├── templates\               ← checklist templates
    └── REPO.md                  ← module boundaries — EDIT THIS
```

> `/test` has no prompt/chatmode shell yet — not available on Copilot. See `adapters/copilot/capability-map.yml`.

**After install:**

1. Open `.github\ai-platform\REPO.md` and fill in the same module boundary info as step 4.
2. Add to `.vscode\settings.json`:

```json
{
  "github.copilot.chat.codeGeneration.useInstructionFiles": true
}
```

3. Commit all `.github\` changes to the repo.

> **Security:** Copilot cannot enforce write-safety at the prompt layer. Always configure MCP servers with **read-only tokens only** (`read_api` + `read_repository` scopes for GitLab). See `docs/mcp-setup.md`.

---

## 6. Install — OpenCode (Per-Repo)

OpenCode has no plugin system — platform files are vendored into `.opencode/` and injected
into `AGENTS.md`. Run once per repository that needs OpenCode support. Re-run after every
platform update. Full detail: [`docs/INSTALL-OPENCODE.md`](docs/INSTALL-OPENCODE.md).

```powershell
cd D:\enterprise-ai-platform\install
.\install-opencode.ps1 -RepoPath "C:\path\to\your\repo"
```

**What gets written to the repo:**

```text
<repo>\
├── AGENTS.md                       ← Contract kernel injected here (OpenCode reads this)
└── .opencode\
    ├── command\                    ← 7 command shells (/bug-fix, /migration, etc.)
    ├── ai-platform\
    │   ├── shared\                 ← contract.md + full command specs
    │   └── standards\              ← coding standards (vendored)
    └── .platform-version.json      ← vendored version stamp
```

> OpenCode has no hook API — no audit trail, no contract hash-check. Use Claude Code for
> security-critical tasks (auth, PII, Flyway on PII tables). See [docs/hitl-matrix.md](docs/hitl-matrix.md).

---

## 7. Install — Both at Once (Claude + Copilot)

Install Claude Code (global) and Copilot (per-repo) in a single step:

```powershell
cd D:\enterprise-ai-platform\install
.\install-both.ps1 -RepoPath "C:\path\to\your\repo"
```

> This covers Claude + Copilot only. Install OpenCode separately with `install-opencode.ps1` (step 6) if needed.

---

## 8. Verify Installation

### Claude Code

Open Claude Code (VS Code or CLI) and run:

```text
/help
```

Expected — all 7 skills appear:

```text
/bug-fix          Root-cause and fix a defect ...
/new-development  Design and implement new features ...
/migration        Migrate code between branches ...
/ui-design-update UI agent — fix bugs, new components, design updates ...
/data-correction  Analyse data issues and generate correction scripts ...
/test             Analyse test coverage and scaffold missing tests ...
/prompt-audit     Score a prompt against CRISP and produce a rewrite ...
```

Check installed version:

```powershell
Get-Content "$env:USERPROFILE\.claude\.platform-version"
```

### GitHub Copilot

1. Open a repo that has had Copilot installed.
2. Open the Copilot chat panel.
3. The chat mode dropdown should show: `bug-fix` · `new-development` · `migration` · `ui-design-update` · `data-correction` · `prompt-audit`. (`/test` is not yet available on Copilot — see `adapters/copilot/capability-map.yml`.)
4. Type `/bug-fix` — Copilot should pick up the prompt from `.github\prompts\`.

---

## 9. Update the Platform

When a new version is released:

### Step 1 — Pull the latest source

```powershell
cd D:\enterprise-ai-platform
git pull origin main
```

### Step 2 — Update Claude Code (global)

```powershell
cd D:\enterprise-ai-platform\install
.\update-platform.ps1
```

This refreshes `~/.claude/CLAUDE.md`, `~/.claude/commands/`, and `~/.claude/standards/` without touching your module boundary files.

### Step 3 — Update Copilot / OpenCode (per-repo, for each repo)

```powershell
.\install-copilot.ps1 -RepoPath "C:\path\to\your\repo"
.\install-opencode.ps1 -RepoPath "C:\path\to\your\repo"   # if that repo uses OpenCode
```

This refreshes all vendored files in `.github\ai-platform\` / `.opencode\ai-platform\` and the
prompt/command shells. Alternatively, `.\update-platform.ps1 -RepoPath "C:\path\to\your\repo" -Adapter both` updates Claude + Copilot for that repo in one call (`-Adapter opencode` for OpenCode).

### Step 4 — Restart Claude Code sessions

Close and reopen any active Claude Code chats/sessions to pick up the new contract.

### Bulk update all repos (fleet)

```powershell
cd D:\enterprise-ai-platform
.\tools\rollout-fleet.ps1
```

Check which repos are behind:

```powershell
.\tools\check-drift.ps1
```

---

## 10. Uninstall — Claude Code (Global)

Remove the platform files from the global Claude Code config. This does **not** affect any repositories.

```powershell
# Remove skill commands
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\commands\bug-fix.md"
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\commands\new-development.md"
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\commands\migration.md"
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\commands\ui-design-update.md"
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\commands\data-correction.md"
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\commands\test.md"
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\commands\prompt-audit.md"

# Remove standards
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\standards"

# Remove platform version stamp
Remove-Item -Force "$env:USERPROFILE\.claude\.platform-version"
```

The execution contract section in `~/.claude/CLAUDE.md` is wrapped in markers. Remove it manually:

```text
Delete everything between (and including) these two lines in ~/.claude/CLAUDE.md:
  <!-- enterprise-ai-platform:contract:start -->
  ...
  <!-- enterprise-ai-platform:contract:end -->
```

> `settings.json` is left in place as it may contain other project settings. Review and clean manually if needed.

---

## 11. Uninstall — Claude Code (Per-Repo)

Remove the platform config from a specific repository:

```powershell
$repo = "C:\path\to\your\repo"

Remove-Item -Force "$repo\.claude\CLAUDE.md"
Remove-Item -Force "$repo\.claude\settings.json"
Remove-Item -Recurse -Force "$repo\.claude\hooks"
Remove-Item -Recurse -Force "$repo\.claude\audit"
Remove-Item -Force "$repo\.claude\.platform-version" -ErrorAction SilentlyContinue

# Remove .claude\ if now empty
if ((Get-ChildItem "$repo\.claude" | Measure-Object).Count -eq 0) {
  Remove-Item -Recurse -Force "$repo\.claude"
}
```

Remove `.claude/audit/` from `.gitignore` if you added it, and commit the removals.

---

## 12. Uninstall — GitHub Copilot (Per-Repo)

Remove the platform files from a repository's `.github\` folder:

```powershell
$repo = "C:\path\to\your\repo"

Remove-Item -Force "$repo\.github\copilot-instructions.md"
Remove-Item -Recurse -Force "$repo\.github\prompts"
Remove-Item -Recurse -Force "$repo\.github\chatmodes"
Remove-Item -Recurse -Force "$repo\.github\ai-platform"
```

Remove the `.vscode\settings.json` entry:

```json
// Remove this line:
"github.copilot.chat.codeGeneration.useInstructionFiles": true
```

Commit the removals to the repository.

---

## 13. Command Quick Reference

All commands support:
- **Session Mode** (no args) — describe multiple tasks, skill loads once, type `done` to end.
- **Direct Mode** — provide args directly, executes one task.
- **`auto=true`** — skip the approval gate (except `/data-correction` script execution, which is always manual).

| Command | Purpose | Key inputs |
| --- | --- | --- |
| `/bug-fix` | Root-cause and fix a defect | `redmine=<id>` · stack trace · screenshot · `file=<path>` |
| `/new-development` | Plan and implement new features | `redmine=<id>` · user story · `file=<path>` · wireframe |
| `/migration` | Port code between branches | `mode=exact\|functionality` + source + `target=<branch>` |
| `/ui-design-update` | Fix UI bugs · new components · design updates | `component=<Name>` · screenshot · `file=<path>` · design paths |
| `/data-correction` | Analyse data issues, generate scripts | `redmine=<id>` · `table=<name>` · `collection=<name>` · free text |
| `/test` | Analyse test coverage, scaffold missing tests | Redmine ID · MR · commit · `file=<path>` (Claude Code, OpenCode only) |
| `/prompt-audit` | Score a prompt against CRISP, produce a rewrite | `prompt="<text>"` · `session=true` · no args (analysis-only, no approval gate) |

### Input types accepted by all commands

| Input | Format |
| --- | --- |
| Redmine issue | `redmine=42391` |
| GitLab MR | `mr=!247` |
| Commit SHA | `commit=abc1234` |
| Stack trace / log / spec / design | Drop in external context folder → say `context` |
| Specific file | `file=context/my-file.md` or full path |
| User story / free text (short) | Type directly in chat |
| Screenshot / image | Attach to the chat message |
| Word document (.docx) | Export to `.md` or `.txt`, drop in context folder |

> Set your context folder path once in `context/context.path`. See [`prompt-guide.md`](prompt-guide.md) for usage patterns and [`context/README.md`](context/README.md) for setup.

---

## 14. Approval Gate — How It Works

Every command runs in two phases:

```text
Phase 1 — Discovery & Analysis (read-only)
  ↓
  OUTPUT:
  ## ROOT CAUSE / REQUIREMENT
  ## IMPACT ANALYSIS  (Risk: Low/Medium/High)
  ## IMPLEMENTATION BREAKDOWN  (PARTS → PHASES → TASKS)
  ## CHANGE ESTIMATE  (Files, Complexity)
  ↓
  STOP — "Approve implementation? (approve / yes / proceed / implement)"
  ↓
Phase 2 — Execution (after approval)
  ↓
  ## EXECUTION SUMMARY
```

**To skip the gate** (trusted contexts, batch sessions):

```text
/bug-fix auto=true
/new-development auto=true
/migration mode=exact mr=!247 target=main auto=true
/ui-design-update auto=true
```

**Data correction scripts are always manual** — `auto=true` does not execute the generated scripts. The user always runs them manually after review.

---

*Enterprise AI Platform v4.3 · Lifetrenz Engineering*
*Repository: https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform.git*
