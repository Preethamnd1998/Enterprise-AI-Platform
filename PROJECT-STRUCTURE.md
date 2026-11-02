# Project Structure

**Version:** v4.4.0

Every file and directory in the Enterprise AI Platform repository, with its purpose.

---

## Top-Level Layout

Flattened repo root (no nested `enterprise-ai-platform/` subdirectory — see `docs/file-migration-map.md` §1 and `MASTER-PROJECT-BOARD.md` RC1 Hardening Findings for the flatten history):

```
D:\enterprise-ai-platform\
├── shared/                 # Single source of truth — all shared assets
├── adapters/               # Platform-specific glue (thin — no business logic)
├── install/                # Installer scripts
├── tools/                  # Fleet operations and maintenance tooling
├── repo-template/          # Templates copied into consuming repos
├── autonomous-runner/      # Standalone Node/TS CLI: unattended execution mode of the /dev
│                           #   workflow (see § below) — reuses shared/ content, does not
│                           #   duplicate it; not a slash command, has its own CI job
├── docs/                   # All reference guides (GOVERNANCE.md, QUICK-START.md, INSTALL-*.md, etc.)
├── ci/                     # CI/CD scripts
├── context/                # Local context-folder config (not part of the platform source)
├── templates/              # ⚠ Legacy duplicate of shared/templates/ (migration-checklist.md,
│                           #   redesign-checklist.md only) — not yet deleted, see MASTER-PROJECT-BOARD.md
├── README.md               # Project entry point
├── CONTRIBUTING.md         # How to contribute
├── PROJECT-STRUCTURE.md    # This file
├── CHANGELOG.md            # Version history
├── SECURITY.md             # Vulnerability reporting policy
├── VERSION                 # Current platform version (SemVer)
└── .gitlab-ci.yml          # CI pipeline definition
```

`commands/` and `standards/` (formerly listed here as legacy duplicates) were deleted during the RC1 hardening pass — `shared/commands/` and `shared/standards/` are now the only copies.

> **CI enforcement:** The `no-dup-shared` CI job ensures that no shared content is duplicated into adapters. Adapters may only contain thin glue files.

---

## `shared/` — Shared Layer

The single canonical location for every platform asset. Nothing in this directory is platform-specific.

```
shared/
├── contract.md             # Execution contract (kernel + full §0–§17)
├── contract.md.sha256      # Expected SHA-256 of the contract kernel section
├── company-profile.md      # Company-specific customisation seam (F10 partial)
│
├── commands/               # Command definitions (8 active commands)
│   ├── registry.yml        # Single source of truth for all command registrations
│   ├── bug-fix.md          # /bug-fix command specification
│   ├── migration.md        # /migration command specification
│   ├── migration-intelligence.md  # §15 Migration Intelligence (lazy-loaded by /migration)
│   ├── new-development.md  # /new-development command specification
│   ├── data-correction.md  # /data-correction command specification
│   ├── ui-design-update.md # /ui-design-update command specification
│   ├── test.md             # /test command specification
│   ├── prompt-audit.md     # /prompt-audit command specification
│   └── dev.md              # /dev command specification (AI Developer Agent)
│
├── knowledge/              # Company/domain knowledge (descriptive facts, not rules or
│   │                       #   procedures — see shared/skills/ for how-to content and
│   │                       #   shared/standards/ for mandatory rules). Indexed by
│   │                       #   company-profile.md's topic table. Installed globally by
│   │                       #   adapters/claude/install.sh|ps1 -> ~/.claude/knowledge/
│   │                       #   (fixed 2026-10-13 — previously not installed anywhere).
│   ├── architecture/       # System shape, service map, dependencies, environments,
│   │                       #   Redmine conventions, saga-tracing MCP usage (kept here,
│   │                       #   not shared/skills/, because its exact path is referenced
│   │                       #   inside shared/contract.md's hash-pinned kernel section)
│   └── custom-flows/       # Reverse-engineered feature knowledge: abdm/ moved out to
│       │                   #   shared/skills/ 2026-10-13 (it was skill-shaped, not
│       │                   #   knowledge-shaped); bom/, pagination-global-filter/,
│       │                   #   upload/ remain — each flags any embedded skill/standard
│       │                   #   sections with a classification note rather than
│       │                   #   physically splitting a large, actively-used document
│       │                   #   (see shared/reports/ for the full audit)
│
├── standards/              # Coding standards (lazy-loaded per language/layer)
│   ├── coding-standards.md # General coding standards (any language)
│   ├── testing.md          # Testing standards (coverage policy, subagent limits)
│   ├── backend/            # Java/Spring layer-specific standards
│   │   ├── controller.md
│   │   ├── service.md
│   │   ├── repository.md
│   │   ├── entity.md
│   │   ├── dto-mapper-enum.md
│   │   ├── common-api.md
│   │   └── spring.md
│   ├── frontend/           # Angular/TypeScript standards
│   │   ├── component.md
│   │   ├── service.md
│   │   ├── custom-components.md
│   │   ├── pagination.md
│   │   ├── angular.md
│   │   └── others.md
│   ├── mobile/              # Flutter/Dart standards
│   │   ├── flutter.md
│   │   ├── widget.md
│   │   ├── service.md
│   │   ├── state-management.md
│   │   ├── routing.md
│   │   └── models.md
│   └── migration/          # Git/cherry-pick migration standards
│       ├── semantic-git.md
│       ├── cherry-pick-rules.md
│       └── branch-migration.md
│
├── skills/                 # Skills (SKILL.md packages; discovered + lazy-loaded natively by
│   │                       #   Claude Code and OpenCode -- no registry, just drop in a folder)
│   ├── README.md           # Convention, discovery paths, how to manually add a skill
│   ├── find-skills/        # Vendored verbatim from ~/.agents/skills/find-skills/
│   ├── modern-web-guidance/ # Vendored verbatim from ~/.agents/skills/modern-web-guidance/
│   ├── settings-redic-index-db-cache-skill/ # Custom: Redis+IndexedDB settings cache pattern
│   ├── print-header-footer-browserprint-skill/ # Custom: shared browser-print technique
│   ├── abdm-integration-backend/   # Moved from shared/knowledge/custom-flows/abdm/ 2026-10-13
│   ├── abdm-integration-frontend/  # Moved from shared/knowledge/custom-flows/abdm/ 2026-10-13
│   └── running-locally-skill/      # Moved from shared/knowledge/architecture/ 2026-10-13
│
├── rules/                  # Governance rules (lazy-loaded per task type)
│   ├── coding-style.md     # CS-01–10 coding style rules
│   ├── testing.md          # TR-01–08 testing rules
│   ├── security.md         # SR-01–08 security rules
│   └── code-review.md      # CR-01–08 code review rules
│
├── prompts/                # Prompt framework and quality scoring
│   ├── crisp.md            # CRISP prompt framework (Context·Role·Intent·Scope·Precision)
│   └── prompt-quality.md   # §16 Prompt Quality Assessment (lazy-loaded)
│
├── templates/              # Per-repo templates (installed to .ai/ in consuming repos)
│   ├── pre-flight.md       # Pre-flight check block format (6 signals)
│   ├── coverage.yml        # Coverage gate configuration template
│   ├── migration-checklist.md
│   ├── redesign-checklist.md
│   ├── pr-disclosure.md    # PR disclosure template
│   └── ai/                 # Per-repo AI context templates
│       ├── AI_PROJECT.md   # Project context (tech stack, scope, MRs)
│       ├── AI_ARCHITECTURE.md  # Architecture context
│       ├── AI_PATTERNS.md  # Coding patterns and conventions
│       ├── AI_SECURITY.md  # Security-sensitive areas
│       └── AI_REVIEW.md    # Code review checklists
│
├── mcp/                    # MCP configuration
│   ├── .mcp.json.template  # Template for consuming repos (copy to .mcp.json)
│   ├── tool-allowlists.md  # 28 allowed tools — authoritative allowlist source
│   └── db-consolidation.md # DB MCP architecture decisions
│
├── schemas/
│   └── audit-schema.json   # JSON Schema for audit.js log entries (v1.1)
│
└── installer/
    ├── engine.ps1           # Shared installer engine functions
    └── STRATEGY.md          # Installer architecture decision record
```

**Key principle:** When you change a command, change `shared/commands/<slug>.md` only. When you change a standard, change `shared/standards/...` only. When you add a skill, add `shared/skills/<name>/SKILL.md` only — see `shared/skills/README.md`. Never put canonical content in adapters.

---

## `adapters/` — Platform Adapters

Thin glue files that translate shared content into platform-specific formats. No business logic, no command bodies, no standards — only references and thin wrappers.

### `adapters/claude/`

```
adapters/claude/
├── config/
│   └── settings.json       # MCP allowlist template (28 tools + deny list + hooks)
├── hooks/
│   ├── audit.js             # PostToolUse + Stop hook: writes JSONL audit log
│   └── hash-check.js        # PreToolUse hook: verifies contract kernel hash
├── install.ps1              # Claude adapter installer -- canonical implementation
│                            #   (uses shared installer engine; install/install-claude.ps1 delegates here)
├── install.sh               # Bash equivalent for Linux/macOS CI
├── upgrade.ps1              # Upgrade helper (removes legacy hooks on update)
└── file-map.yml             # Source → destination mapping for installer
```

### `adapters/copilot/`

```
adapters/copilot/
├── copilot-instructions.md  # Contract kernel + command reference for Copilot
├── prompts/                 # 7 .prompt.md files (@ prefix in Copilot Chat)
│   └── <slug>.prompt.md
├── chatmodes/               # 6 .chatmode.md files (dropdown in Copilot Chat)
│   └── <slug>.chatmode.md
├── install.ps1              # Copilot adapter installer -- canonical implementation
│                            #   (uses shared installer engine; install/install-copilot.ps1 delegates here)
├── capability-map.yml       # Capability assessment vs Claude Code
└── file-map.yml             # Source → destination mapping
```

> **Note:** `/test` command has a chatmode but not a separate prompt file (test is invoked differently).

### `adapters/opencode/`

```
adapters/opencode/
├── AGENTS.md                # Contract kernel section injected into consuming repos
├── commands/                # 7 thin command shells (≤20 lines each)
│   └── <slug>.md
├── install.ps1              # OpenCode adapter installer -- canonical implementation
│                            #   (uses shared installer engine; install/install-opencode.ps1 delegates here)
├── capability-map.yml       # Capability assessment
└── file-map.yml             # Source → destination mapping
```

### `adapters/antigravity/`

```
adapters/antigravity/
├── AGENTS.md                # Contract kernel section injected into consuming repos (own outer
│                            #   marker: contract:antigravity:start/end -- coexists with OpenCode's
│                            #   plain contract:start/end block in the same root AGENTS.md file)
├── commands/                # 7 thin workflow shells (description: frontmatter, ≤20 lines each)
│   └── <slug>.md
├── install.ps1              # Antigravity adapter installer -- canonical implementation
│                            #   (uses shared installer engine; install/install-antigravity.ps1 delegates here)
├── capability-map.yml       # Capability assessment (lower confidence -- vendor docs are new/thin)
└── file-map.yml             # Source → destination mapping
```

Installs to `.agents/ai-platform/` (contract, commands, standards, prompts) and
`.agents/workflows/` (the 7 slash-command shells, filename -> `/name`). No hook API, no MCP
path fully confirmed yet -- see `capability-map.yml` gaps.

> **Single front door:** all four canonical `adapters/*/install.ps1` scripts are idempotent and
> hash-checked (`shared/installer/engine.ps1`). Engineers should invoke them via the thin wrappers
> in `install/` rather than calling `adapters/*/install.ps1` directly -- see below.

### `adapters/{cursor,windsurf,continue,cline,roo-code,vscode-agent}/` (Stubs)

```
adapters/<platform>/
├── STUB.md                  # Status, evidence gate, planned scope
├── capability-map.yml       # Current known capabilities
└── file-map.yml             # Planned install target mapping
```

These stubs are activated when their evidence gate is satisfied. See `adapters/<platform>/STUB.md`.

---

## `install/` — Installer Scripts (single front door)

The one place engineers run installers from, for all supported platforms. Every script
here is a thin wrapper that forwards `-RepoPath -Force -DryRun` to the corresponding
`adapters/<platform>/install.ps1` (the canonical, idempotent, hash-checked implementation).
Nothing here re-implements install logic — that lives only in `adapters/*/install.ps1` and
`shared/installer/engine.ps1`.

```
install/
├── install-claude.ps1       # -> adapters/claude/install.ps1   (global + per-repo)
├── install-copilot.ps1      # -> adapters/copilot/install.ps1  (per-repo, vendoring)
├── install-opencode.ps1     # -> adapters/opencode/install.ps1 (per-repo, vendoring)
├── install-antigravity.ps1  # -> adapters/antigravity/install.ps1 (per-repo, vendoring)
├── install-both.ps1         # Claude + Copilot in one step
├── update-platform.ps1      # Pulls platform source, then delegates to tools/update-platform.ps1
└── .github/                 # Snapshot of what install-copilot.ps1 writes to repos
    ├── ai-platform/         # (Reference copy — not the canonical source)
    ├── chatmodes/
    └── prompts/
```

> The `install/.github/` directory is a **reference snapshot** of what Copilot install produces. The canonical sources remain in `shared/` and `adapters/copilot/`.

---

## `tools/` — Platform Operations

```
tools/
├── rollout-fleet.ps1        # Fleet installer: reads repos.txt, runs installers, opens MRs
├── repos.txt                # Fleet target list (one GitLab clone URL per line)
├── generate-copilot.ps1     # Generate Copilot prompt/chatmode shells from command stubs
├── check-drift.ps1          # Detect drift between installed files and platform source
├── migrate-settings.ps1     # Migrate settings.json from denylist (v3.0) to allowlist (v3.1)
├── update-platform.ps1      # Update one repo's installed adapter(s) (claude/copilot/opencode/antigravity/both)
│                            #   to the platform source version -- install/update-platform.ps1 delegates here
└── flatten-repo.sh          # Bash utility (historical — not actively used)
```

---

## `autonomous-runner/` — Unattended `/dev` Execution Mode

A standalone Node.js/TypeScript CLI (`ai-runner dev --repo <path> --task <path.md>`) that runs
the same Analyze → Plan → Execute → Validate → Fix workflow as the interactive `/dev` command
(`shared/commands/dev.md`), unattended, as its own OS process — bounded by explicit
iteration/attempt/timeout/agentLimit limits instead of relying on a human watching the session.
It is a **second front door onto the same workflow**, not a second platform: it reuses
`shared/contract.md`'s kernel, `shared/commands/dev.md`'s spec, `shared/standards/`,
`shared/rules/`, `shared/company-profile.md` and `shared/knowledge/`, and
`adapters/claude/config/settings.json`'s MCP allowlist directly from this repo at runtime —
nothing under `shared/` is copied or re-described inside it.

```
autonomous-runner/
├── src/                     # loopController.ts (the bounded state machine), worker.ts (SDK
│                            #   query() wrapper), validator.ts, contextLoader.ts (reads
│                            #   shared/* per contract.md §5/F10), safety.ts (canUseTool gate,
│                            #   reconciled with settings.json), contractIntegrity.ts (hash
│                            #   check equivalent to hash-check.js), resume.ts, cli.ts
├── schemas/audit-schema.json # Own, deliberately separate schema from
│                            #   shared/schemas/audit-schema.json (that one describes Claude
│                            #   Code hook events; this describes the unattended loop's own
│                            #   lifecycle — neither is a subset of the other)
├── test/                    # vitest suite — runs with no network/API key required
└── README.md                # Install, flags (including --agent-limit), safety model
```

Not listed in `shared/commands/registry.yml` — that registry is specifically the interactive
slash-command list installers generate adapter shells from, and this has no adapter shell (it's
a CLI, invoked directly). `shared/commands/dev.md` carries a short pointer to it instead. CI
builds/typechecks/tests it via the `autonomous-runner-build-test` job in `.gitlab-ci.yml`.

---

## `repo-template/` — Per-Repo Templates

Canonical templates copied into consuming repos during per-repo install.

```
repo-template/
├── .claude/
│   ├── CLAUDE.md            # Module boundaries template (edit per repo)
│   ├── settings.json        # Per-repo settings (same as adapters/claude/config/settings.json)
│   └── hooks/
│       └── audit.js         # Audit hook (copy of adapters/claude/hooks/audit.js)
├── .github/
│   └── ai-platform/
│       └── REPO.md          # Copilot repo boundaries template
└── ci/
    └── ai-platform-drift.gitlab-ci.yml  # CI job: detect platform drift
```

---

## `docs/` — Documentation

```
docs/
├── QUICK-START.md · INSTALL-CLAUDE.md · INSTALL-COPILOT.md · INSTALL-OPENCODE.md
├── UPGRADE-GUIDE.md · TROUBLESHOOTING.md · FAQ.md · GOVERNANCE.md
├── COMMANDS.md · MCP.md · USAGE.md · RULES.md · ROADMAP.md · RELEASE-NOTES.md
├── PLATFORM-CAPABILITY-MATRIX.md · PROMPT-GUIDELINES.md
├── IMPLEMENTATION-LOG.md · MASTER-PROJECT-BOARD.md
│                           # ↑ moved here from repo root during the RC1 flatten (see
│                           #   MASTER-PROJECT-BOARD.md); everything above is a
│                           #   root-scoped reference doc, not docs/-specific content
├── installation.md          # [OUTDATED] Legacy plugin approach — see INSTALL-CLAUDE.md
├── prerequisites.md         # Required tools and versions
├── mcp-setup.md             # MCP server credential setup
├── secrets.md               # Secret management (.env, env vars, .gitignore)
├── security.md              # Security model and threat mitigations
├── hitl-matrix.md           # HITL decision matrix (when human approval required)
├── rollback.md              # Rollback procedures (12 scenarios)
├── fleet-rollout.md         # Fleet rollout guide (4-step: dry-run → canary → fleet → verify)
├── copilot-measurement.md   # 30-day Copilot adoption measurement (starts 2026-07-07)
├── audit-and-metrics.md     # Audit log structure and session metrics
├── boundary-examples.md     # Module boundary examples for common service types
├── example-executions.md    # Worked examples of each command
├── coverage-gate.md         # Coverage gate design (warn mode in v4.x)
├── hash-check-behavior.md   # Contract hash-check behavior spec (V-B3)
├── platform-version-schema.md  # .platform-version.json schema
├── phase-dod.md             # Per-phase Definition of Done
├── red-team-tests.md        # Red-team test cases for security validation
├── repo-onboarding.md       # Onboarding guide for repo engineers
├── file-migration-map.md    # File disposition map (repo restructure history)
│
└── sp-XX-result.md (6 files) # Spike results (SP-01, SP-02, SP-03, SP-04, SP-05, SP-07, VC3)
```

---

## `ci/` — CI/CD

```
ci/
├── validate.sh              # Main CI validation script
├── release-check.sh         # Release gate checks
└── ai-platform-drift.gitlab-ci.yml  # Per-repo drift detection job (deployed to consuming repos)
```

The `.gitlab-ci.yml` at the platform repo root contains CI for the platform itself:
- `validate-registry` — verifies `registry.yml` is consistent
- `contract-hash-verify` — verifies `contract.md.sha256` matches the kernel
- `no-dup-shared` — ensures no shared content is duplicated in adapters
- `coverage` — coverage gate (warn mode in v4.x)

---

## `shared/mcp/.mcp.json.template`

The template for MCP server configuration in consuming repos. Copy to `.mcp.json` (gitignored):

```json
{
  "mcpServers": {
    "gitlab-reader": {
      "command": "node",
      "args": ["${env:GITLAB_MCP_PATH}/index.js"],
      "env": {
        "GITLAB_TOKEN": "${env:GITLAB_PAT}",
        "GITLAB_URL": "${env:GITLAB_BASE_URL}"
      }
    },
    "redmine-reader": { ... },
    "canary_mongo_db": { ... },
    "postgres-reader": { ... }
  }
}
```

All `${env:}` references are substituted by Claude Code at runtime. Never put literal secrets in `.mcp.json`.

---

## Legacy Directories

These directories exist from the pre-restructure era (pre-v3.1) and are kept for history. Do not add new files here.

| Directory | Status | Replacement |
|---|---|---|
| `commands/` | Legacy | `shared/commands/` |
| `standards/` | Legacy | `shared/standards/` |
| `templates/` | Legacy | `shared/templates/` |

---

## Extension Points

The architecture has two designed extension points:

1. **New adapter:** Create `adapters/<platform>/` with `STUB.md`, `capability-map.yml`, `file-map.yml`. Follow the evidence gate process in `adapters/<platform>/STUB.md`.

2. **Company profile customisation:** Edit `shared/company-profile.md` for company-wide defaults. Edit per-repo `.ai/AI_PROJECT.md` for repo-specific overrides. The generic platform core never references company internals (F10 seam).

3. **New skill:** Drop a `shared/skills/<name>/SKILL.md` folder in (see `shared/skills/README.md`). No registry to edit — `ci/validate.sh` checks frontmatter validity and that `name` matches the directory. Re-run `adapters/claude/install.sh` (global, no `-RepoPath`/`--repo`) to make it live; Claude Code and OpenCode both discover it from `~/.claude/skills/` on their next session start.

---

## File Naming Conventions

| Pattern | Meaning |
|---|---|
| `shared/commands/<slug>.md` | Full command specification |
| `adapters/<platform>/commands/<slug>.md` | Thin command shell (OC only) |
| `adapters/copilot/prompts/<slug>.prompt.md` | Copilot prompt file |
| `adapters/copilot/chatmodes/<slug>.chatmode.md` | Copilot chatmode |
| `docs/sp-XX-result.md` | Spike investigation result |
| `.platform-version` or `.platform-version.json` | Install timestamp and version |
| `*.prev` | Pre-upgrade backup created by installer |

## Shared core & MCP tools (Unreleased)
- `shared/core/` — `path-resolver/` (all OS paths), `security/` (path guard, redaction, safe spawn), `mcp-registry/` (`registry.json`), `runtime-manager/`, `plugin-manager/` (build + install), `launcher.js`, `cli.js`, `tests/`.
- `shared/mcp-tools/` — `unified-trace-mcp/`, `opencode-mcp-bridge/`, `kafka-mcp/`, `MIGRATION.md`. The Knowledge Graph Generator is a separate repo (sibling clone or `KNOWLEDGE_GRAPH_PATH`); a local copy under `shared/mcp-tools/knowledge-graph-generator/` is gitignored.
- `integrations/opencode/agents/` — OpenCode agents shipped by the plugin. `install/{macos,linux,windows}/` — thin installers. `dist/` — generated plugin packages (gitignored, per machine).
- `paths.env` (tracked defaults), `paths.local.env` (gitignored, machine-specific).
