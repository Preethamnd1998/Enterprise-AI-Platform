# Project Structure

> What every folder and file in the Enterprise AI Platform does.

**Related docs:**
- [`README.md`](README.md) — platform overview and command reference
- [`usage-instructions.md`](usage-instructions.md) — install · update · uninstall
- [`contributing.md`](contributing.md) — how to add commands, standards, and docs

---

## Root Level

```text
D:\enterprise-ai-platform\
├── README.md                  ← Overview + all 5 commands reference
├── usage-instructions.md      ← Install · update · uninstall guide
├── contributing.md            ← How to add commands, standards, docs, release
├── project-structure.md       ← This file
├── .github\
│   └── copilot-instructions.md ← Copilot instructions for the platform repo itself
└── enterprise-ai-platform\    ← The platform source (all install scripts copy from here)
```

| File | Purpose |
| --- | --- |
| [`README.md`](README.md) | Quick-reference: what the platform is, all 5 commands, global rules |
| [`usage-instructions.md`](usage-instructions.md) | Full install/update/uninstall walkthrough, command quick-ref |
| [`contributing.md`](contributing.md) | Developer guide: adding commands, standards, docs, release process |
| [`project-structure.md`](project-structure.md) | This file |

---

## `enterprise-ai-platform/` — Platform Source

Everything inside this folder is the installable platform. Install scripts read from here and copy to engineers' machines and repositories.

```text
enterprise-ai-platform/
├── VERSION                    ← Current version (SemVer, e.g. 3.0.0)
├── CHANGELOG.md               ← Release history
├── .gitlab-ci.yml             ← CI pipeline (runs validate.sh on every push)
├── .claude-plugin/            ← Claude plugin manifest
├── shared/                    ← Execution contract
├── commands/                  ← Skill/command files
├── standards/                 ← Coding standards
├── adapters/                  ← Copilot integration files
├── templates/                 ← Checklist templates
├── docs/                      ← Detailed reference guides
├── repo-template/             ← Per-repo config templates
├── install/                   ← PowerShell install scripts
├── tools/                     ← Fleet management scripts
└── ci/                        ← CI validation scripts
```

---

## `shared/` — Execution Contract

```text
shared/
└── contract.md
```

The **single source of truth** for how every command behaves. Installed to `~/.claude/CLAUDE.md` by `install-claude.ps1` and vendored to `.github/ai-platform/shared/contract.md` by `install-copilot.ps1`.

Contains 14 sections (§0–§14):
- §0–§4: Discovery, no-scan, depth-1 expansion rules
- §5–§6: Lazy standards loading + context discipline
- §7–§9: Validation gates (completeness, regression, risk)
- §10–§11: Budgets and stop conditions
- §12: Output shape (analysis block format)
- §13: Execution Summary format
- §14: Global Approval Gate + `auto=true`

Every command file says `<!-- contract is loaded via ~/.claude/CLAUDE.md -->` — it does not embed the contract, it inherits it.

See [`contributing.md §7`](contributing.md#7-updating-the-shared-contract) before editing.

---

## `commands/` — Skill / Command Files

```text
commands/
├── bug-fix.md           ← /bug-fix
├── new-development.md   ← /new-development
├── migration.md         ← /migration
├── ui-design-update.md  ← /ui-design-update
└── data-correction.md   ← /data-correction
```

Installed to `~/.claude/commands/` by `install-claude.ps1`.

Each file is a Markdown document with:
- YAML frontmatter (`description`, `argument-hint`, `allowed-tools`)
- Mode Detection (Session vs Direct, `auto=true` flag)
- Session Mode banner (lists all accepted input types)
- Input Resolution table (maps each input type to an action)
- Phase 1 — Discovery & Analysis (read-only, outputs §12 blocks)
- Approval Gate (contract §14 — stop unless `auto=true`)
- Execution Phase (runs after approval)
- Output line (budget + §13 reference)

For the command file format and how to add a new one, see [`contributing.md §2`](contributing.md#2-adding-a-new-command).

| Command | Purpose |
| --- | --- |
| `bug-fix.md` | Root-cause and fix defects. Trace-driven. |
| `new-development.md` | Plan and implement new features. PARTS/PHASES/TASKS breakdown. |
| `migration.md` | Port code between branches. `mode=exact` or `mode=functionality`. |
| `ui-design-update.md` | UI agent: BUG FIX · NEW DEV · DESIGN UPDATE. Never touches `.component.ts`. |
| `data-correction.md` | Analyse data issues. Generates PRE/CORRECTION/POST/ROLLBACK scripts. Never executes. |

---

## `standards/` — Coding Standards

```text
standards/
├── coding-standards.md          ← General — loaded for any code task
├── backend/
│   ├── controller.md            ← Spring MVC controller layer
│   ├── service.md               ← Business logic / service layer
│   ├── repository.md            ← JPA repository + SQL
│   ├── entity.md                ← JPA entity design
│   ├── dto-mapper-enum.md       ← DTOs, mappers, enums
│   ├── common-api.md            ← Shared API patterns
│   └── spring.md                ← Spring Boot configuration
├── frontend/
│   ├── component.md             ← Angular component design
│   ├── service.md               ← Angular service design
│   ├── custom-components.md     ← LT shared component library
│   ├── pagination.md            ← Table pagination patterns
│   ├── others.md                ← Miscellaneous Angular patterns
│   └── angular.md               ← Angular module / routing
└── migration/
    ├── semantic-git.md          ← Semantic commit and branch rules
    ├── cherry-pick-rules.md     ← What to carry vs skip when cherry-picking
    └── branch-migration.md      ← Branch migration workflow
```

Installed to `~/.claude/standards/` by `install-claude.ps1` and vendored to `.github/ai-platform/standards/` by `install-copilot.ps1`.

**Lazy-loaded** — commands only read the files relevant to the layers they touch (a Java-only bug-fix never reads `frontend/`). The loading rules are defined in `shared/contract.md §5`.

See [`contributing.md §4`](contributing.md#4-updating-coding-standards) for editing guidelines.

---

## `adapters/` — Copilot Integration

```text
adapters/
└── copilot/
    ├── copilot-instructions.md   ← Copilot entrypoint (→ .github/copilot-instructions.md)
    ├── prompts/
    │   ├── bug-fix.prompt.md
    │   ├── new-development.prompt.md
    │   ├── migration.prompt.md
    │   ├── ui-design-update.prompt.md
    │   └── data-correction.prompt.md
    └── chatmodes/
        ├── bug-fix.chatmode.md
        ├── migration.chatmode.md
        ├── new-development.chatmode.md
        ├── ui-design-update.chatmode.md
        └── data-correction.chatmode.md
```

Installed to `.github/` by `install-copilot.ps1`. GitHub Copilot has no plugin system so files are **vendored** (copied) into each repository.

| Subfolder | Installed to | Purpose |
| --- | --- | --- |
| `copilot-instructions.md` | `.github/copilot-instructions.md` | Copilot entrypoint — auto-loaded by VS Code when `useInstructionFiles` is enabled |
| `prompts/` | `.github/prompts/` | One prompt file per command — Copilot equivalent of a Claude Code skill |
| `chatmodes/` | `.github/chatmodes/` | Dropdown mode selectors in the VS Code Copilot chat panel |

See [`contributing.md §6`](contributing.md#6-adding-copilot-prompts-and-chat-modes) for how to add a new prompt/chatmode.

---

## `templates/` — Checklist Templates

```text
templates/
├── migration-checklist.md    ← Completeness checklist for /migration
└── redesign-checklist.md     ← Completeness checklist for /ui-design-update
```

Referenced by commands during validation. Installed to `~/.claude/templates/` (Claude Code) and vendored to `.github/ai-platform/templates/` (Copilot).

---

## `docs/` — Reference Guides

```text
docs/
├── installation.md          ← Plugin/marketplace install (alternative to PowerShell scripts)
├── repo-onboarding.md       ← Per-repo onboarding checklist (10-minute setup)
├── mcp-setup.md             ← MCP server read-only credential setup (GitLab, Redmine, DB)
├── audit-and-metrics.md     ← Audit log schema (JSONL) + sample metrics queries
├── example-executions.md    ← Worked examples for each command
└── boundary-examples.md     ← Module boundary definition examples for .claude/CLAUDE.md
```

These are reference guides for engineers using the platform. They are **not** installed — engineers access them from the platform repo or a team wiki.

| Doc | When to read |
| --- | --- |
| `installation.md` | Alternative install via Claude plugin marketplace |
| `repo-onboarding.md` | First time setting up a new repository |
| `mcp-setup.md` | Configuring MCP server tokens (read-only GitLab PAT, Redmine key, DB credentials) |
| `audit-and-metrics.md` | Understanding the audit log or running metrics queries |
| `example-executions.md` | Learning how a command works end-to-end |
| `boundary-examples.md` | Writing the module boundaries section in `.claude/CLAUDE.md` |

See [`contributing.md §5`](contributing.md#5-adding-documentation) for how to add a new doc.

---

## `repo-template/` — Per-Repo Config Templates

```text
repo-template/
├── .claude/
│   ├── CLAUDE.md          ← Module boundaries template (fill in per repo)
│   ├── settings.json      ← Stop hook + MCP write deny-list
│   └── hooks/
│       └── audit.js       ← Deterministic audit hook (runs after every Claude task)
└── .github/
    └── ai-platform/
        └── REPO.md        ← Copilot repo profile template (fill in per repo)
```

Copied to repositories by `install-claude.ps1 -RepoPath` and `install-copilot.ps1 -RepoPath`.

| File | What to fill in |
| --- | --- |
| `.claude/CLAUDE.md` | Stack, GitLab project URL, default branch, Flyway path, module boundaries, forbidden packages |
| `.claude/settings.json` | Pre-filled — add repo-specific DB MCP tool to `allow` if needed |
| `.claude/hooks/audit.js` | Do not edit — deterministic audit hook |
| `.github/ai-platform/REPO.md` | Same module boundary info as `.claude/CLAUDE.md` (Copilot version) |

The `.claude/audit/` directory is created automatically on first run and added to `.gitignore`. Do not commit audit logs.

---

## `install/` — PowerShell Installers

```text
install/
├── install-claude.ps1      ← Claude Code install (global + optional per-repo)
├── install-copilot.ps1     ← Copilot install (per-repo)
├── install-both.ps1        ← Both in one step
├── update-platform.ps1     ← Update global Claude install to latest version
└── _common.ps1             ← Shared helpers (Copy-Tree, Write-Ok, version stamping)
```

| Script | What it does |
| --- | --- |
| `install-claude.ps1` | Writes `~/.claude/CLAUDE.md`, copies `commands/`, `standards/`, `settings.json`. Add `-RepoPath` to also configure a repo. |
| `install-copilot.ps1` | Vendors `shared/`, `standards/`, `templates/`, `adapters/copilot/` into `.github/ai-platform/` + `.github/prompts/` + `.github/chatmodes/`. |
| `install-both.ps1` | Runs `install-claude.ps1` (global) then `install-copilot.ps1 -RepoPath`. |
| `update-platform.ps1` | Re-runs the global Claude install with the latest source. Preserves per-repo boundary files. |
| `_common.ps1` | Helper functions used by all installers: `Copy-Tree`, `Write-Ok`, `Write-Warn2`, `Write-Step`, `Get-PlatformRoot`, `Get-PlatformVersion`, `Write-VersionStamp`. |

See [`usage-instructions.md`](usage-instructions.md) for step-by-step install and uninstall commands.

---

## `tools/` — Fleet Management

```text
tools/
├── check-drift.ps1      ← Report repos with a stale platform version
└── rollout-fleet.ps1    ← Bulk update all repos to the latest version
```

Used after a release to push the update across the entire engineering fleet.

```powershell
# Check before rolling out
.\tools\check-drift.ps1

# Roll out to all repos
.\tools\rollout-fleet.ps1
```

See [`contributing.md §10`](contributing.md#10-fleet-rollout) for the full rollout process.

---

## `ci/` — CI Validation

```text
ci/
├── validate.sh         ← Runs on every push — checks contract syntax, required files, VERSION consistency
└── release-check.sh    ← Pre-release gate — verifies CHANGELOG entry matches VERSION
```

Triggered by `.gitlab-ci.yml`. Prevents merging a broken contract or a release without a changelog entry.

---

## `.claude-plugin/` — Plugin Manifest

```text
.claude-plugin/
├── plugin.json          ← Claude plugin definition (name, version, commands list)
└── marketplace.json     ← Private marketplace manifest for plugin distribution
```

Used when distributing the platform as a Claude Code plugin via a private GitLab marketplace. See `docs/installation.md` for the plugin-based install path.

---

*Enterprise AI Platform v3 · Lifetrenz Engineering*
*Repository: `https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform.git`*
