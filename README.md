# Enterprise AI Platform v3

> Shared execution contract + AI skills for **Claude Code** and **GitHub Copilot**.
> Covers the full Lifetrenz development workflow: bug fix · feature planning · code migration · UI redesign.
> Version **3.0.0** · Released 2026-06-03

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [Prerequisites](#2-prerequisites)
3. [Install — Claude Code (Global)](#3-install--claude-code-global)
4. [Install — Claude Code (Per-Repo)](#4-install--claude-code-per-repo)
5. [Install — GitHub Copilot (Per-Repo)](#5-install--github-copilot-per-repo)
6. [Install — Both at Once](#6-install--both-at-once)
7. [Available Skills / Commands](#7-available-skills--commands)
8. [Per-Repo Onboarding Checklist](#8-per-repo-onboarding-checklist)
9. [Updating the Platform](#9-updating-the-platform)
10. [Directory Structure](#10-directory-structure)
11. [For Platform Owners / Contributors](#11-for-platform-owners--contributors)

---

## 1. What This Is

The Enterprise AI Platform is a **single source of truth** for how AI assistants (Claude Code and GitHub Copilot) behave across the Lifetrenz codebase. It provides:

| Component | What it does |
| --- | --- |
| **Shared contract** | One execution policy installed to every engineer's machine. Controls discovery, token budgets, validation gates, audit, and risk rules. |
| **Skills / commands** | `/bug-fix`, `/planning`, `/migration`, `/ui-redesign` — task-specific workflows as slash commands in Claude Code. |
| **Standards** | Backend (Java/Spring) and Frontend (Angular) coding standards loaded lazily — only when the task touches that layer. |
| **Copilot adapter** | Equivalent prompt files and chat modes for GitHub Copilot in VS Code. |
| **Repo template** | Per-repo `.claude/` config (module boundaries + audit hook + settings) copied once per repository. |

**Design goals:** 70–90% fewer tokens per task · planning under 5 s · no repository-wide scanning · maintained by a 2–3 engineer team.

---

## 2. Prerequisites

| Tool | Notes |
| --- | --- |
| Claude Code (latest) | CLI or VS Code extension |
| GitHub Copilot (latest) | VS Code extension — for Copilot install only |
| PowerShell 5.1+ | Windows built-in, already available |
| MCP servers connected | `gitlab-reader`, `redmine-reader` (+ DB MCPs per repo) |

MCP credential setup: [`enterprise-ai-platform/docs/mcp-setup.md`](enterprise-ai-platform/docs/mcp-setup.md)

---

## 3. Install — Claude Code (Global)

Run **once per engineer machine**. Installs the contract, commands, and standards globally so every repo on the machine benefits immediately.

```powershell
cd "D:\enterprise-ai-platform\enterprise-ai-platform\install"
.\install-claude.ps1
```

**What gets installed:**

```text
C:\Users\<you>\.claude\
├── CLAUDE.md             ← shared execution contract (auto-loaded every session)
├── commands\
│   ├── bug-fix.md        ← /bug-fix skill
│   ├── planning.md       ← /planning skill
│   ├── migration.md      ← /migration skill
│   └── ui-redesign.md    ← /ui-redesign skill
├── standards\
│   ├── coding-standards.md
│   ├── backend\          ← Java/Spring standards (lazy-loaded)
│   ├── frontend\         ← Angular standards (lazy-loaded)
│   └── migration\        ← Git migration rules (lazy-loaded)
└── settings.json         ← global write deny-list
```

**Verify — open Claude Code and type:**

```text
/help
```

You should see `/bug-fix`, `/planning`, `/migration`, `/ui-redesign` listed under available skills.

---

## 4. Install — Claude Code (Per-Repo)

Run **once per repository** to add module boundaries, the audit hook, and per-repo settings.

```powershell
cd "D:\enterprise-ai-platform\enterprise-ai-platform\install"
.\install-claude.ps1 -RepoPath "C:\path\to\your\repo"
```

**What gets added to the repo:**

```text
<repo>\.claude\
├── CLAUDE.md        ← module boundaries (EDIT THIS after install)
├── settings.json    ← Stop hook + deny-list
├── hooks\
│   └── audit.js     ← deterministic audit hook
└── audit\           ← per-run audit logs (auto-added to .gitignore)
```

After running, **open `.claude\CLAUDE.md`** in the repo and fill in:

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

---

## 5. Install — GitHub Copilot (Per-Repo)

Copilot has no plugin system — platform files are **vendored into each repo**.
Run once per repository that needs Copilot support.

```powershell
cd "D:\enterprise-ai-platform\enterprise-ai-platform\install"
.\install-copilot.ps1 -RepoPath "C:\path\to\your\repo"
```

**What gets added to the repo:**

```text
<repo>\.github\
├── copilot-instructions.md         ← Copilot entrypoint (auto-loaded by VS Code)
├── prompts\                        ← /bug-fix /planning /migration /ui-redesign
├── chatmodes\                      ← dropdown chat modes in Copilot
└── ai-platform\
    ├── shared\contract.md          ← execution contract
    ├── standards\                  ← coding standards
    ├── templates\                  ← checklist templates
    └── REPO.md                     ← module boundaries (EDIT THIS)
```

After running, open `.github\ai-platform\REPO.md` and fill in the same module boundary info as the Claude section.

> **Important:** Copilot cannot enforce write-safety at the prompt layer.
> Always configure MCP servers with **read-only tokens**. See [`docs/mcp-setup.md`](enterprise-ai-platform/docs/mcp-setup.md).

To enable Copilot custom instructions in VS Code, add to `.vscode\settings.json`:

```json
{
  "github.copilot.chat.codeGeneration.useInstructionFiles": true
}
```

---

## 6. Install — Both at Once

Install for Claude Code (global) **and** Copilot (per-repo) in one step:

```powershell
cd "D:\enterprise-ai-platform\enterprise-ai-platform\install"
.\install-both.ps1 -RepoPath "C:\path\to\your\repo"
```

---

## 7. Available Skills / Commands

All skills default to **Session Mode** when invoked without arguments.
Describe multiple tasks back-to-back — the skill loads once, standards are read once, token cost stays flat.
Type `done` to end a session. Opening a new chat also closes it.

### `/bug-fix` — Root-cause and fix a defect

```text
/bug-fix                       Session Mode — describe multiple bugs one by one
/bug-fix redmine=42391         Direct Mode — single Redmine issue
/bug-fix                       Direct Mode — paste a stack trace after the banner
```

### `/planning` — Feature design and task breakdown

```text
/planning                      Session Mode
/planning redmine=41800        Direct Mode — Redmine story
/planning "Add bulk discharge" Direct Mode — free text
```

### `/migration` — Port a change to a target branch

| Mode | Use for | Example |
| --- | --- | --- |
| `mode=exact` | Cherry-pick, hotfix, backport | `mode=exact mr=!247 target=release/v2.5` |
| `mode=functionality` | Feature port, cross-version | `mode=functionality branch=feat/X target=main` |

```text
/migration                                                Session Mode
/migration mode=exact mr=!247 target=release/v2.5        Direct Mode
/migration mode=functionality redmine=41800 target=main   Direct Mode
```

### `/ui-redesign` — Modernize an Angular component

```text
/ui-redesign                            Session Mode
/ui-redesign component=WardManagement   Direct Mode (attach screenshot)
```

---

## 8. Per-Repo Onboarding Checklist

Full guide: [`enterprise-ai-platform/docs/repo-onboarding.md`](enterprise-ai-platform/docs/repo-onboarding.md)

```text
☐ 1. Global install done on this machine:
       .\install-claude.ps1

☐ 2. Per-repo install done:
       .\install-claude.ps1 -RepoPath <path>

☐ 3. .claude\CLAUDE.md filled in (stack, module boundaries, Flyway path)

☐ 4. MCP servers connected: gitlab-reader · redmine-reader

☐ 5. Smoke test:
       /bug-fix "NullPointerException in OrderService"    → ≤ 10 files, both gates reported
       /migration mode=exact mr=!<recent> target=main     → minimal patch + validation

☐ 6. Commit .claude\settings.json + .claude\CLAUDE.md
       (do NOT commit .claude\audit\ — it is in .gitignore)
```

---

## 9. Updating the Platform

Run the updater when a new version is released. Refreshes the contract, commands, and standards without touching your module boundary files.

```powershell
cd "D:\enterprise-ai-platform\enterprise-ai-platform\install"
.\update-platform.ps1
```

For Copilot repos, also re-run the Copilot installer to refresh vendored files:

```powershell
.\install-copilot.ps1 -RepoPath "C:\path\to\your\repo"
```

Check the installed version:

```powershell
Get-Content "$env:USERPROFILE\.claude\.platform-version"
```

> After updating, **close and reopen** any active Claude Code sessions to pick up the new contract.

---

## 10. Directory Structure

```text
D:\enterprise-ai-platform\
├── README.md                              ← this file
├── .github\copilot-instructions.md        ← Copilot instructions for this repo
└── enterprise-ai-platform\               ← the v3 platform source
    │
    ├── shared\contract.md                 ← execution contract (→ ~/.claude/CLAUDE.md)
    ├── commands\                          ← skill source   (→ ~/.claude/commands/)
    ├── standards\                         ← coding standards (→ ~/.claude/standards/)
    │
    ├── adapters\copilot\                  ← Copilot files vendored per repo
    │   ├── copilot-instructions.md
    │   ├── prompts\
    │   └── chatmodes\
    │
    ├── templates\                         ← migration-checklist, redesign-checklist
    │
    ├── docs\                              ← detailed guides
    │   ├── installation.md                ← plugin/marketplace install (alternative)
    │   ├── repo-onboarding.md             ← per-repo onboarding checklist
    │   ├── mcp-setup.md                   ← MCP read-only credential setup
    │   ├── audit-and-metrics.md           ← audit log schema + metrics
    │   ├── example-executions.md          ← worked examples for all 4 commands
    │   └── boundary-examples.md           ← module boundary examples
    │
    ├── repo-template\                     ← templates copied by install scripts
    │   ├── .claude\
    │   │   ├── CLAUDE.md                  ← module boundaries template
    │   │   ├── settings.json              ← Stop hook + deny-list
    │   │   └── hooks\audit.js             ← audit hook
    │   └── .github\ai-platform\REPO.md    ← Copilot repo profile template
    │
    ├── install\                           ← PowerShell installers
    │   ├── install-claude.ps1             ← Claude Code (global + per-repo)
    │   ├── install-copilot.ps1            ← Copilot (per-repo)
    │   ├── install-both.ps1               ← both at once
    │   ├── update-platform.ps1            ← update to latest version
    │   └── _common.ps1                    ← shared helpers
    │
    ├── tools\
    │   ├── check-drift.ps1                ← find repos with stale platform version
    │   └── rollout-fleet.ps1              ← bulk update across all repos
    │
    ├── ci\
    │   ├── validate.sh                    ← CI: contract syntax + file presence check
    │   └── release-check.sh               ← pre-release gate
    │
    ├── CHANGELOG.md
    └── VERSION                            ← 3.0.0
```

---

## 11. For Platform Owners / Contributors

### Adding a new skill

1. Add `commands/<skill-name>.md` (skill source file).
2. Update `shared/contract.md` if the skill needs new lazy-loading rules.
3. Add Copilot equivalent: `adapters/copilot/prompts/<skill-name>.prompt.md`.
4. Bump `VERSION` (patch for fixes · minor for new skills · major for contract changes).
5. Add entry to `CHANGELOG.md`.
6. Commit and tag: `git tag v<version> && git push --tags`.
7. Notify team to run `.\update-platform.ps1`.

### Updating coding standards

Edit files in `standards/`. Changes flow to engineers on their next `update-platform.ps1` and to Copilot repos on next `install-copilot.ps1`. Update `CHANGELOG.md`.

### Fleet operations

```powershell
# Check which repos have a stale platform version
.\tools\check-drift.ps1

# Bulk update all repos
.\tools\rollout-fleet.ps1
```

### CI

`.gitlab-ci.yml` runs `ci/validate.sh` on every push — checks contract syntax, required files, and VERSION consistency.

---

*Enterprise AI Platform v3 · Lifetrenz Engineering*
*To report an issue or contribute: open a GitLab MR in the platform repo.*
