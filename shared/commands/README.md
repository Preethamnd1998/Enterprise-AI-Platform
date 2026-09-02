# Enterprise AI Platform — Skills Reference Guide

> **Claude Code custom slash commands** for the Lifetrenz development team.
> These skills encode team-specific workflows (bug fix, planning, migration, UI
> updates, plan review, Redmine triage, knowledge capture) as reusable
> `/commands` that run inside Claude Code and VS Code.

---

## Table of Contents

1. [What Are Skills?](#1-what-are-skills)
2. [Installation — Claude Code (Global)](#2-installation--claude-code-global)
3. [Installation — VS Code + GitHub Copilot](#3-installation--vs-code--github-copilot)
4. [Directory Structure](#4-directory-structure)
5. [Available Skills](#5-available-skills)
6. [Output Paths (`paths.env`)](#6-output-paths-pathsenv)
7. [Knowledge Graph MCP (optional)](#7-knowledge-graph-mcp-optional)
8. [Adding a New Skill (from Owner or Team)](#8-adding-a-new-skill-from-owner-or-team)
9. [Updating an Existing Skill](#9-updating-an-existing-skill)
10. [Project-Level vs Global Skills](#10-project-level-vs-global-skills)
11. [Skill File Format](#11-skill-file-format)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What Are Skills?

Skills are **Markdown instruction files** that turn into slash commands inside Claude Code.
When you type `/bug-fix` in the chat, Claude loads that skill's instructions once into context
and follows the defined workflow — fetching code from GitLab, reading standards, writing fixes.

**Key benefits:**

- Instructions load **once per session** — no re-sending every prompt.
- Tool access is pre-declared in the frontmatter (`allowed-tools`).
- Each skill encodes team standards, budgets, and validation gates automatically.
- **All skills default to Session Mode** when invoked without arguments — work on multiple tasks back-to-back, standards files load only once, token cost stays flat.
- End any session with `done`. Opening a new chat also closes the session automatically.

---

## 2. Installation — Claude Code (Global)

Global skills are available in **every project** on your machine.

### Step 1 — Locate your global commands folder

```
Windows:   C:\Users\<your-username>\.claude\commands\
Mac/Linux: ~/.claude/commands/
```

### Step 2 — Copy the skill file

Place any `.md` skill file into that folder — it sits alongside the other 13:

```
C:\Users\admin\.claude\commands\
├── bug-fix.md · migration.md · new-development.md · data-correction.md
├── ui-design-update.md · test.md · prompt-audit.md · dev.md
├── planning.md · planning-engine.md · plan-reviewer.md
├── redmine-bulk-report.md · usage-report.md · knowledge-capture.md
└── your-new-skill.md          ← new file goes here
```

### Step 3 — Reload skills in Claude Code

Type the following in Claude Code chat:

```
/reload-skills
```

### Step 4 — Verify the skill appears

```
/help
```

Your new skill will be listed under **User-invocable skills**.

---

## 3. Installation — VS Code + GitHub Copilot

> Skills (slash commands) are **Claude Code specific** and do not run in GitHub Copilot.
> For Copilot, the equivalent is **custom instructions** and **standards files**.

### For standards (shared with Claude Code)

Place standards files in the repository under:

```
.github/
└── ai-platform/
    └── standards/
        ├── coding-standards.md
        ├── backend/       (controller, service, repository, entity, dto-mapper-enum,
        │                    common-api, spring, custom-annotations, sql-query, db-migration)
        ├── frontend/       (component, service, custom-components, pagination, others, angular,
        │                    app-shell-menu-config-cache, global-filter-search,
        │                    modern-clinical-enterprise-design-system)
        ├── mobile/         (Flutter/Dart)
        ├── migration/      (git branch migration — distinct from backend/db-migration.md)
        └── testing/        (technique/design knowledge base — supplements, never overrides,
                              the machine-enforced /test contract in standards/testing.md)
```

These are auto-loaded by Claude Code (per `~/.claude/CLAUDE.md`) and can be referenced
in Copilot custom instructions.

### For Copilot custom instructions

Create or update `.github/copilot-instructions.md` in the repository:

```markdown
# Copilot Instructions

Follow the coding standards in .github/ai-platform/standards/coding-standards.md.
For Java/Spring: follow backend/ standards for the relevant layer.
For Angular/TypeScript: follow frontend/ standards for the relevant layer.
```

### VS Code Settings (optional)

To enable Copilot custom instructions in VS Code:

```json
// .vscode/settings.json
{
  "github.copilot.chat.codeGeneration.useInstructionFiles": true
}
```

---

## 4. Directory Structure

```
C:\Users\admin\.claude\
├── CLAUDE.md                    ← Global execution contract (loaded in every session)
├── paths.env                    ← Mirrored copy of the repo's paths.env (usage-logger.js reads this one)
├── commands\                    ← Global skills (available in ALL projects) — 13 commands
│   └── README.md                ← This file
└── standards\                   ← Shared coding standards (lazy-loaded by skills)

D:\enterprise-ai-platform\        ← platform source repo
├── paths.env                    ← Edit here after pulling: plan/knowledge/usage-log/context output paths
├── shared\
│   ├── contract.md              ← Full execution contract (kernel section injected into ~/.claude/CLAUDE.md)
│   ├── commands\                ← 13 command definitions + registry.yml (source of truth)
│   ├── standards\                ← same tree as the Copilot layout above
│   ├── knowledge\                ← Company/domain knowledge (custom-flows/, architecture/) — see company-profile.md's index
│   ├── mcp\                      ← MCP allowlist, .mcp.json template, knowledge-graph-setup.md
│   └── company-profile.md        ← Company-specific customisation seam (F10)

d:\GitLab Workspace\<repo>\
└── .claude\
    ├── CLAUDE.md                ← Project-level overrides (loaded on top of global)
    └── commands\                ← Project-specific skills (this project only)
```

---

## 5. Available Skills

| Command | Purpose | Mode |
|---|---|---|
| `/bug-fix` | Root-cause and fix a defect from a Redmine ID, MR, commit, or stack trace | Session/Direct |
| `/migration` | Port a change (MR/commit/branch/release) to a target branch — `mode=exact` or `mode=functionality` | Session/Direct |
| `/new-development` | Implement a new feature from a Redmine story or free-text requirement | Session/Direct |
| `/data-correction` | Analyse and correct bad production/support data (SELECT-only discovery, scripts shown not run) | Session/Direct |
| `/ui-design-update` | Apply a design reference to an existing Angular/Flutter component — preserves all bindings | Session/Direct |
| `/test` | Detect the test stack, report coverage gaps, scaffold new tests | Direct |
| `/prompt-audit` | Score THIS session's prompt quality against the CRISP framework | Direct |
| `/dev` | Execute a task Markdown file end to end — Single Agent default, opt-in Multi-Agent (`multi`, ≤3 sub-agents) | Direct |
| `/planning` | Turn a requirement into `PLAN.md` + `TEST-CASES.xlsx` — never implements | Session/Direct |
| `/plan-reviewer` | QA gate on an existing plan — 4 evidence-based scores (Problem/Code Understanding, Test Plan, Confidence), all ≥`threshold=` (default 95) to approve; revises + re-scores otherwise | Session/Direct |
| `/redmine-bulk-report` | Take a list of Redmine IDs, produce one dated report with an evidence-gated root cause per ticket | Direct |
| `/usage-report` | Report on, or clear (typed `CONFIRM` required), the system-wide prompt/session log | Direct |
| `/knowledge-capture` | Turn what was just implemented/verified into a new or extended `shared/knowledge/` file | Direct |

All commands accept `key=value` arguments (`redmine=<id>`, `mr=!<n>`, `commit=<sha>`, `branch=<b>`, `auto=true` to skip the approval gate). Session Mode (invoke with no arguments) keeps a skill loaded across multiple tasks in one chat — type `done` to close it.

**Not real commands (historical note):** `/planning` and `/ui-redesign` existed as *phantom* commands in early v3.0 (referenced but never actually built) and were removed in v3.1. `/planning` was properly rebuilt with a real implementation in v4.5+ (see the table above) — `/ui-redesign` was not; use `/ui-design-update` instead, which covers the same ground with a real design-reference file as input.

`planning-engine.md` and `migration-intelligence.md` are shared procedures other commands' Phase 1 reads directly by filename — they are not standalone slash commands themselves.

---

## 6. Output Paths (`paths.env`)

`paths.env` (repo root, git-tracked — plain folder paths only, no secrets) lets you redirect
where generated output lands, without editing any command file:

| Key | Used by | Default when blank |
|---|---|---|
| `PLAN_OUTPUT_PATH` | `/planning`, `/plan-reviewer` | Current working directory |
| `KNOWLEDGE_OUTPUT_PATH` | `/knowledge-capture` | `shared/knowledge/` in this repo |
| `USAGE_LOG_PATH` | the `usage-logger.js` hook (global — needs the mirrored `~/.claude/paths.env` to actually take effect) | `~/.claude/usage-logs/` |
| `CONTEXT_PATH` | the `context` argument shorthand | Falls back to `context/context.path`, then `context/` in this repo |

Leave any value blank to keep its existing default — blank is a supported choice, not an error.

---

## 7. Knowledge Graph MCP (optional)

If a `knowledge-graph` MCP server is connected, the contract kernel's **Knowledge-graph
first (F-KG)** rule directs every command to check it before scanning the repo —
`search_knowledge`, `get_context_pack`, `trace_business_flow`, `get_api_context`, and 8
more tools return exact files/classes/methods and confidence-tagged
(`VERIFIED`/`INFERRED`/`UNRESOLVED`) call chains in one or two calls. This is reinforced
explicitly in `bug-fix.md`, `new-development.md`, `migration.md`, `data-correction.md`,
`ui-design-update.md`, `dev.md`, `planning-engine.md`, `plan-reviewer.md`,
`redmine-bulk-report.md`, and `knowledge-capture.md` — not just relied on via kernel recall.

It's optional: every command falls back to its normal scan-based discovery when the server
isn't connected. Full setup, the indexer → DB → MCP pipeline, and how to keep the graph
current: see `shared/mcp/knowledge-graph-setup.md`.

---

## 8. Adding a New Skill (from Owner or Team)

When a team member or the platform owner shares a new skill `.md` file:

### Step 1 — Receive the file

You will receive a `.md` file, e.g. `expense-report.md`. It may be shared via:

- GitLab MR (merge into the standards/skills repo)
- Direct file share (email, Slack, Teams)
- A team wiki page with the raw content

### Step 2 — Validate the frontmatter

Open the file and confirm it has a valid frontmatter block at the top:

```markdown
---
description: <one-line description shown in /help>
argument-hint: "<usage hint>"
allowed-tools: Read, Grep, Edit, ...
---
```

If any of these are missing, ask the owner to provide them before installing.

### Step 3 — Copy to the commands folder

```
Windows:   Copy to  C:\Users\<your-username>\.claude\commands\
Mac/Linux: Copy to  ~/.claude/commands/
```

To install for the **whole team** (project-level), copy to:

```
<repo-root>\.claude\commands\<skill-name>.md
```

Commit and push — every team member gets the skill when they pull.

### Step 4 — Reload skills

```
/reload-skills
```

### Step 5 — Test the skill

Run the skill with its documented arguments once to confirm it works.

### Step 6 — Notify the team

If installing at project level, add a short note to the MR description or team chat, e.g.:

```
New skill added: /expense-report
Usage: /expense-report redmine=<id>
Skill file: .claude/commands/expense-report.md
```

---

## 9. Updating an Existing Skill

When a skill is updated (owner pushes a new version):

1. **Pull the latest** from the repo or receive the updated file.
2. **Replace** the existing file in `~/.claude/commands/` (or `.claude/commands/`).
3. **Run `/reload-skills`** — changes take effect immediately in the next session.
4. **Check the changelog** in the file's git history or `CHANGELOG.md`.

> **Important:** Updating a skill does NOT affect any currently open Claude Code sessions.
> Close and reopen the session (or start a new chat) to pick up the new version.

---

## 10. Project-Level vs Global Skills

| | Global (`~/.claude/commands/`) | Project-level (`.claude/commands/`) |
| --- | --- | --- |
| Available in | Every project on your machine | Only this repository |
| Who installs | You, once | Committed to git — whole team |
| Use case | General-purpose skills | Project-specific workflows |
| Version control | Manual (your local machine) | Git-tracked |
| Sharing | Share the file manually | Push to repo — everyone gets it |

**Recommendation:** put team-wide skills in **global** commands; put project-specific
skills (custom reports, module-specific generators) in **project-level** `.claude/commands/`.

---

## 11. Skill File Format

Every skill is a `.md` file with a YAML frontmatter block followed by Markdown instructions.

```markdown
---
description: One-line summary shown in /help and the skill list
argument-hint: "key=value | \"free text\"  [optional=param]"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, mcp__<server>__<tool>, ...
---

# Command: /skill-name
<!-- Context note for Claude -->

Agent profile: **Profile Name**. Input: `$ARGUMENTS`.

## Workflow
1. Step one
2. Step two

## Validation
- Gate A
- Gate B

## Output
What to return · budget line.
```

### `$ARGUMENTS`

`$ARGUMENTS` is replaced at runtime with whatever the user typed after the skill name.

```
User types:    /bug-fix redmine=42391
$ARGUMENTS →   redmine=42391
```

---

## 12. Troubleshooting

### Skill not appearing after copy

1. Check the file is in the **correct folder** (`~/.claude/commands/`, not a subfolder).
2. Check the filename ends in `.md`.
3. Run `/reload-skills`.
4. If still missing, check the frontmatter — a YAML syntax error will silently skip the file.

### "Tool not allowed" error during skill execution

The skill tried to use a tool not listed in `allowed-tools`. Edit the frontmatter and add
the missing tool name, then `/reload-skills`.

### Skill loads but produces wrong output

- The skill instructions may reference a standards file that has moved.
  Check `~/.claude/standards/` (or `shared/standards/` in the source repo) for the expected file.
- The `$ARGUMENTS` format may not match — check the `argument-hint` in the file.

### Session mode not starting (skill goes Direct instead of Session)

Make sure you invoked the command with **no arguments** — this applies to every
Session/Direct skill listed in §5.

### "Reloaded skills: N skills available (no changes)"

This is normal — it means no skill files changed since last reload. If you just added a file
and see "(no changes)", double-check the file is in the right folder.

---

*Maintained by the Enterprise AI Platform team. To add or update a skill, see [Section 8](#8-adding-a-new-skill-from-owner-or-team).*
