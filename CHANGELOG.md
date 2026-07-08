# Changelog

All notable changes to the Enterprise AI Platform. Versioning: SemVer (see docs).

## [4.3.0] - 2026-07-07 — Phase F: Rollout & Polish

### Added
- `shared/commands/migration-intelligence.md` — full §15 Migration Intelligence extracted from contract (F11 lazy refactor, US-052 / TK-113). Loaded lazily by /migration only.
- `shared/prompts/prompt-quality.md` — full §16 Prompt Quality Assessment extracted from contract (F11 lazy refactor, US-052 / TK-113). Loaded once per session by any scoring command.
- `shared/company-profile.md` — company-specific override seam (F10 partial, US-053 / TK-114). Defines company identity, platform defaults, module boundaries, banned patterns, and security contact. Generic core never references company internals; all company-specific context lives in this file. Installers copy on first install; never overwrite on update.
- `tools/repos.txt` — fleet rollout target list (US-054 / TK-115). One GitLab clone URL per line. Placeholder format with documented usage instructions. Structured per-team sections with onboarding instructions (US-056 / TK-117).
- `adapters/cursor/`, `adapters/windsurf/`, `adapters/continue/`, `adapters/cline/`, `adapters/roo-code/`, `adapters/vscode-agent/` — 6 future adapter skeleton directories (US-057 / TK-118). Each contains `STUB.md` (evidence gate + planned scope) + `capability-map.yml` (capability assessment vs CC) + `file-map.yml` (install target mapping).
- `docs/fleet-rollout.md` — fleet rollout guide (US-055 / TK-116). Prerequisites table, 4-step process (dry-run → canary → fleet → verify), rollback reference, notes on idempotency and glab fallback. Fleet MR lifecycle table + reviewer checklist added (US-056 / TK-117).

### Changed
- `VERSION` — updated from `3.0.0` to `4.3.0` to match CHANGELOG and all documentation (documentation consistency fix).
- `GOVERNANCE.md` — version header updated from 4.2 to 4.3.
- `docs/security.md` — version header updated from v3.1 to v4.3; status updated.
- `docs/installation.md` — replaced outdated plugin-marketplace instructions with redirect to current installer guides.
- `shared/contract.md` — §15 and §16 bodies replaced with 4-line lazy-load stubs referencing the new externalized files. §5 extended with 2-line company-profile seam reference (F10 partial). Kernel unchanged; SHA-256 = `528cdbb2d505296fd54b189bb7eb0bccbaef8c6886099aa3a853081c10cf463c`.
- `tools/rollout-fleet.ps1` — updated to read version dynamically from VERSION file; branch and MR title use actual version; `-DryRun` switch added for canary validation; idempotency check skips repos with no changes after install (US-054 / TK-115).
- `docs/rollback.md` — Scenario 12 added (Phase F rollback: lazy refactor, company-profile, fleet tooling, adapter stubs).

---

## [4.2.0] - 2026-07-07 — Phase E: Governance-lite & Telemetry

### Added
- `GOVERNANCE.md` — 1-page governance document (FT-064 / EP-19). Covers 4 required topics: (1) how to add/change a command (7-step procedure), (2) the read-only rule with enforcement mechanisms, (3) approval gate with phrases and high-risk bypass restrictions, (4) security escalation contact + incident procedure.
- `docs/hitl-matrix.md` — HITL (Human In The Loop) decision matrix (G9/G17 FT-067). 13-row matrix defining auto-proceed vs human-required for every action type. Scope drift detection (G9). Usage hierarchy table (G17): Claude Code primary, Copilot secondary, OpenCode tertiary. No build required.
- `docs/copilot-measurement.md` — Copilot 30-day usage measurement (FT-066 / C3 decision). Start date: 2026-07-07. Review date: 2026-08-07. Documents measurement mechanisms (GitHub analytics + manual + prompt-audit), decision criteria, and evidence slot.

### Changed
- `shared/schemas/audit-schema.json` — bumped to v1.1. Five telemetry fields promoted from `_reserved` to top-level: `adapter`, `user_id`, `repo`, `branch`, `mcp_calls_count`. Schema version changed from `const: "1.0"` to `enum: ["1.0","1.1"]` for backward compatibility. `_reserved` retains 4 un-promoted fields (FT-065).
- `adapters/claude/hooks/audit.js` — SCHEMA_VERSION = "1.1". Populates 5 new telemetry fields factually: `adapter` (from `.platform-version.json`), `user_id` (OS env `$USER`/`$USERNAME`), `repo` (cwd basename), `branch` (reads `.git/HEAD`), `mcp_calls_count` (counted from PostToolUse log entries). Session summary includes all 5 fields (FT-065).
- `shared/contract.md` — §17 added: Pause-Turn Cap (G16/FT-068). Pause block format with two thresholds (≥10 file changes or layer expansion). auto=true interaction defined. Kernel updated with pause-turn cap one-liner. Header comment updated to §0–§17.
- `shared/contract.md.sha256` — recomputed for Phase E kernel update.
- `docs/rollback.md` — Scenario 11 added (Phase E rollback: audit schema, contract §17, GOVERNANCE.md, docs).

## [4.1.0] - 2026-07-07 — Phase D: Knowledge & Prompt Help

### Added
- `shared/templates/ai/` — 5 per-repo project context templates: AI_PROJECT, AI_ARCHITECTURE, AI_PATTERNS, AI_SECURITY, AI_REVIEW. Created by installer under `.ai/` in consuming repos (FT-050).
- `shared/rules/security.md` — 8 security rules (SR-01–08): no hardcoded secrets, read-only MCP, no permission bypass, input validation, PII handling, Flyway near-PII, injection prevention, dependency security (FT-051).
- `shared/rules/testing.md` — 8 testing rules (TR-01–08): never delete tests, never run tests, two-gate coverage, test isolation, stack-appropriate frameworks, coverage phase policy, no-prod-modification, generated-code exclusion (FT-051).
- `shared/rules/code-review.md` — 8 code review rules (CR-01–08): completeness, layer coverage, no silent scope creep, regression evidence, security red flags, test review, prompt quality, no invented data (FT-051).
- `shared/rules/coding-style.md` — 9 coding style rules (CS-01–09): follow established patterns, naming conventions, no magic numbers, method length, no commented-out code, minimize diff, imports, logging, comments (FT-051).
- `shared/templates/pre-flight.md` — Pre-flight block template with 6 signals: token estimate, risk level, confidence, missing context, plan, expected output. Definition of Done for V-B8 (FT-052).
- `shared/prompts/crisp.md` — CRISP prompt framework: Context · Role · Intent · Scope · Precision. Quality scoring table, excellent/poor examples, usage instructions (FT-053).
- `shared/commands/prompt-audit.md` — `/prompt-audit` command: 6-phase algorithm, CRISP scoring matrix (100-point), improvement analysis, CRISP rewrite, token impact estimate, session rollup (FT-054).
- `adapters/copilot/prompts/prompt-audit.prompt.md` + `adapters/copilot/chatmodes/prompt-audit.chatmode.md` — Copilot shells for `/prompt-audit`.
- `adapters/opencode/commands/prompt-audit.md` — OC shell for `/prompt-audit` (≤6 lines).

### Changed
- `shared/contract.md` — kernel updated with lazy rules loading paragraph (Phase D+). §5 extended with rules loading trigger conditions. §12 updated with mandatory pre-flight block format. SHA-256 recomputed.
- `shared/contract.md.sha256` — recomputed for Phase D kernel update.
- `shared/commands/registry.yml` — version 4.1; `/prompt-audit` status: `planned` → `active`, `phase_available`: D.
- `adapters/claude/config/settings.json` — PostToolUse hook added (calls `audit.js --event PostToolUse`). Stop hook updated to pass `--event Stop` flag.
- `adapters/claude/hooks/audit.js` — full PostToolUse support: records `tool_name`, `tool_input_hash` (SHA-256 first 16 hex chars), `tool_result_status`. Factual session summary written to `session-summaries.jsonl` on Stop (reads log; no invented counts). FT-049 + FT-055 CLOSED.
- `adapters/opencode/AGENTS.md` — `prompt-audit` added to available commands list.
- `adapters/copilot/copilot-instructions.md` — `/test` and `/prompt-audit` added to reusable prompts list.
- `docs/sp-03-result.md` — Phase D disposition added: FT-062 formally deferred to Phase E+ (evidence-gated by telemetry US-048).
- `docs/rollback.md` — Scenario 10 added (Phase D rollback: rules/, /ai/ templates, contract, audit.js).

## [4.0.0] - 2026-07-07 — Phase C: Testing & Subagents

### Security
- **Audit schema pinned (BUG-B4 CLOSED):** `shared/schemas/audit-schema.json` v1.0 with 16 fields, `additionalProperties: false`. `audit.js` now validates against this schema.
- **Coverage gate location defined (BUG-B7 CLOSED):** `shared/templates/coverage.yml` is the canonical config; `docs/coverage-gate.md` documents the gate. CI job `coverage-gate` added.

### Added
- `shared/standards/testing.md` — full testing standard: stack detection, subagent limits (max 3), coverage policy (Phase C = warn), two-gate validation, banned patterns, edge-case taxonomy.
- `shared/commands/test.md` — `/test` command: 6-phase algorithm, subagent dispatch (agents=N opt-in ≤3), gap report format, Java/Angular output examples.
- `shared/schemas/audit-schema.json` — JSON Schema v1.0 for audit log entries; 16 fields pinned.
- `shared/templates/coverage.yml` — per-repo coverage gate config template; Phase C safe defaults (all thresholds 0, gate_mode: warn).
- `docs/coverage-gate.md` — coverage gate design, per-repo setup, Phase C vs D+ modes, allow-list usage.
- `docs/sp-03-result.md` — SP-03 spike: OpenCode has no hook/event API; cap-15 (audit) = UNSUPPORTED.
- `docs/sp-04-result.md` — SP-04 spike: OC command format = inline markdown; AGENTS.md approach for contract injection.
- `adapters/opencode/capability-map.yml` — 17-capability OpenCode adapter capability map.
- `adapters/opencode/file-map.yml` — source → `.opencode/` target mapping for OC adapter.
- `adapters/opencode/AGENTS.md` — global OC AI instructions with `enterprise-ai-platform:contract:start/end` markers.
- `adapters/opencode/commands/` — 6 thin command shells (bug-fix, migration, new-development, data-correction, ui-design-update, test).
- `adapters/opencode/install.ps1` — idempotent OpenCode installer (copies shared/ to `.opencode/ai-platform/`, injects AGENTS.md, writes `.platform-version.json`).
- New CI jobs: `coverage-gate` (Phase C warn mode; will enforce in Phase D+).
- `shared/commands/registry.yml` — `/test` command status: `planned` → `active` (version 4.0).

### Changed
- `adapters/claude/hooks/audit.js` — updated to read schema v1.0 from `shared/schemas/audit-schema.json`; reads platform version from `.ai/.platform-version.json`; reads contract hash status from `.ai/.session-verified`.
- `.gitlab-ci.yml` — added `coverage` stage; `no-dup-shared` check updated to allow OC command shells (thin glue files ≤20 lines) while still rejecting full-copy duplicates.
- `docs/rollback.md` — added Scenario 9 (OpenCode adapter rollback).

### Closed Bugs
- BUG-B4: audit.js field list not pinned → CLOSED by audit-schema.json v1.0.
- BUG-B7: coverage gate location/config undefined → CLOSED by coverage.yml template + coverage-gate.md.

---

## [3.2.0] - 2026-07-07 — Phase B: MCP as Config

### Security
- **No literal secrets (D7 fix):** `shared/mcp/.mcp.json.template` uses `${env:VARNAME}` for all credentials. `.mcp.json` gitignored. `.env.example` added.
- **CI secret scan:** `no-literal-secrets` CI job rejects commits containing GitLab PATs, MongoDB URIs, or Postgres connection strings with real credentials.
- **Red-team tests (FT-073):** Three security tests documented: write-tool-denied, prompt-injection, hash-tamper-detected. See `docs/red-team-tests.md`.

### Added
- `shared/mcp/.mcp.json.template` — 4 MCP server entries (gitlab-reader, redmine-reader, canary_mongo_db, postgres-reader) all via `${env:}` injection.
- `shared/mcp/tool-allowlists.md` — single source of truth for all MCP allowed/blocked tools.
- `shared/mcp/db-consolidation.md` — documents ~25 → 2 DB MCP decision (BUG-C1 CLOSED).
- `docs/secrets.md` — `${env:}` injection docs, PAT requirements, `.env` usage, CI scan details.
- `docs/sp-05-result.md` — SP-05 spike: Copilot prompt files cannot auto-include external content; copy-on-install approach decided.
- `docs/sp-vc3-result.md` — V-C3 spike: custom `mcp__gitlab-reader` retained (not replaced with official GitLab MCP).
- `docs/red-team-tests.md` — 3 Phase B security tests with pass criteria and result template.
- `adapters/copilot/capability-map.yml` — 17-capability Copilot adapter capability map.
- `adapters/copilot/file-map.yml` — source → `.github/` target mapping for Copilot adapter.
- `adapters/copilot/install.ps1` — idempotent Copilot installer (calls engine.ps1).
- `adapters/copilot/prompts/` — all 5 command prompt shells generated (new-development, ui-design-update, data-correction added).
- `adapters/copilot/chatmodes/` — all 5 command chatmode shells generated.
- `adapters/claude/install.sh` — POSIX installer for Linux/macOS (FT-029 / V-J2).
- `tools/generate-copilot.ps1` — generates Copilot shells from registry.yml (FT-085).
- `tools/update-platform.ps1` — version-aware updater for Claude + Copilot adapters.
- `tools/migrate-settings.ps1` — migrate v3.0 denylist settings to v3.2 allowlist (FT-076, BUG-I1 CLOSED).
- New CI jobs: `capability-map-drift`, `no-literal-secrets`.

### Changed
- `adapters/claude/config/settings.json` — added 4 `mcp__postgres-reader__*` tools to allowlist (28 total). Version comment updated to v3.2.
- `adapters/copilot/copilot-instructions.md` — added `enterprise-ai-platform:contract:start/end` markers for installer injection. Updated installer reference.
- `docs/mcp-setup.md` — added Step 0 (install .mcp.json) and Step 1 (gitlab-reader server install).
- `docs/rollback.md` — added Scenarios 7 (.mcp.json) and 8 (Copilot adapter).
- `.gitignore` (root) — new file: ignores `.env`, `.mcp.json`, `.prev` files, `.ai/` runtime.

### Closed Bugs
- BUG-C1: DB MCP "1 server" clarified as 2 (Postgres + Mongo). CLOSED.
- BUG-C3 / V-C3: GitLab MCP official vs custom decided. CLOSED.
- BUG-I1 / V-I1: deny→allow migration script delivered. CLOSED.
- SP-05: Copilot shell reference mechanism confirmed (copy approach). CLOSED.

## [3.1.0] - 2026-07-07 — Phase A: Truth & Security
### Security
- **F4 fix (MCP allowlist):** Replaced 53-entry denylist in `settings.json` with fail-closed allowlist. `deny: ["mcp__*"]` blocks all MCP by default; only explicit read tools in `allow` array pass. New MCP tools are automatically denied (no longer silently approved).
- **Hash-check hook (SP-02):** `PreToolUse` hook (`adapters/claude/hooks/hash-check.js`) verifies contract kernel SHA-256 before first tool call of each session. Behavior: WARN + re-inject on mismatch; never blocks. Session-dedup via `.ai/.session-verified` flag.
- **Contract kernel markers:** `<!-- enterprise-ai-platform:kernel:start/end -->` markers added to `shared/contract.md`. Installer now injects kernel only (~22 lines), not full contract (ADR-16).
- **BUG-H3:** Added `adapters/claude/upgrade.ps1` to de-register legacy `PostToolUse → Skill` hook from `~/.claude/settings.json`. Run manually on upgrade.

### Added
- `shared/commands/registry.yml` — machine-readable command registry; CI validates against it.
- `shared/installer/engine.ps1` — shared installer engine: idempotent copies, .prev backups, marker injection, .platform-version updates.
- `adapters/claude/` directory: `install.ps1`, `config/settings.json`, `hooks/audit.js`, `hooks/hash-check.js`, `file-map.yml`, `upgrade.ps1`.
- `adapters/opencode/` stub (Phase C implementation pending).
- `shared/standards/testing.md` — stub for testing standards (§2 subagent limits active).
- `shared/contract.md.sha256` — SHA-256 of the contract kernel; installer writes to `.ai/.contract-hash`.
- `tools/flatten-repo.sh` — script to resolve the nested double-directory structure (execute separately).
- `ci/ai-platform-drift.gitlab-ci.yml` included in `.gitlab-ci.yml`.
- New CI jobs: `validate-registry`, `no-dup-shared`, `no-business-logic-in-adapters`, `contract-hash-verify`.
- New docs: `docs/security.md`, `docs/hash-check-behavior.md`, `docs/prerequisites.md`, `docs/rollback.md`.
- `shared/templates/pr-disclosure.md` — AI assistance disclosure template.

### Changed
- `shared/` directory restructured: `commands/`, `standards/`, `templates/` are now canonical locations (moved from top-level `commands/`, `standards/`, `templates/`).
- `install/install-claude.ps1` updated: references to `/planning` and `/ui-redesign` removed; paths updated to `shared/commands/` and `shared/standards/`.
- `adapters/copilot/copilot-instructions.md` updated: phantom commands removed.
- `.claude-plugin/plugin.json` updated: version `3.1.0`, correct commands list (D5 fix).

### Removed
- **D2 fix:** `adapters/copilot/chatmodes/planning.chatmode.md` and `ui-redesign.chatmode.md` deleted.
- **D2 fix:** `adapters/copilot/prompts/planning.prompt.md` and `ui-redesign.prompt.md` deleted.
- **D2 fix:** `install/.github/chatmodes/planning|ui-redesign` and `install/.github/prompts/planning|ui-redesign` deleted.

### Sprint 0 deliverables (pre-implementation)

## [Sprint 0 Complete] - 2026-07-07
### Sprint 0 — Pre-implementation Spikes + FMS Patches
All 5 pre-implementation blockers cleared. Sprint 1 (Phase A: Truth & Security → v3.1) green-lit.

#### Spike Results (new docs)
- **SP-01** (`docs/sp-01-result.md`): CC `permissions.deny` array supports glob wildcards (`mcp__*` confirmed). F4 denylist defect confirmed in `repo-template/.claude/settings.json`. Allowlist pattern implementable. BLK-01 closed.
- **SP-02** (`docs/sp-02-result.md`): `SessionStart` hook event type does NOT exist in Claude Code. Replacement: `PreToolUse` with session-dedup flag (`.ai/.session-verified`). `Stop` hook removes flag at session end. BLK-02 closed. ADR-16 finalized.
- **SP-07** (`docs/sp-07-result.md`): Windows symlinks require Developer Mode or admin. Decision: file copies + CI hash validation. BLK-03 (V-A2 patched via ADR-16) closed.

#### Decisions Finalized
- **ADR-16**: Phase A injects contract kernel only (~30 lines); `PreToolUse` for hash-check; task-class sections lazy-loaded by commands; file copies not symlinks; full kernel refactor deferred to Phase F.

#### Schema and Maps (new docs)
- **`.platform-version.json` schema** (`docs/platform-version-schema.md`): Feature flags, platforms, hashes, channel, version. BLK-04 closed.
- **File migration map** (`docs/file-migration-map.md`): Complete current→target per-file mapping for repo restructure. Nested double-directory flattened. BLK-05 closed.
- **Per-phase DoD** (`docs/phase-dod.md`): Acceptance criteria + validation commands for Phases A–F. BUG-F1 and BUG-F2 closed.

#### Infrastructure
- `shared/installer/STRATEGY.md`: Installer strategy document (file copies, hash validation, idempotency rules).

#### Known Issues in v3.0.0 (to be fixed in Sprint 1 / v3.1)
- D2 phantom commands `/planning` and `/ui-redesign` still present in `adapters/copilot/` — will be deleted in Phase A.
- F4 denylist defect in `repo-template/.claude/settings.json` — will be replaced with allowlist in Phase A.
- BUG-H3: Legacy `PostToolUse → Skill` hook in `~/.claude/settings.json` — to be removed in Sprint 1.

## [3.0.0] - 2026-06-03
### Added
- Claude Code plugin: `/bug-fix`, `/planning`, `/ui-redesign`, `/migration` (mode=exact|functionality).
- Shared execution contract (single source): discovery, no-scan, depth-1, lazy standards, gates §7+§8, risk, audit.
- Per-command MCP read-only allowlists + global write deny-list.
- Copilot adapters: `copilot-instructions.md` + `/planning /bug-fix /migration /ui-redesign` prompt files.
- PowerShell installers (claude/copilot/both) + updater. GitLab release/versioning workflow.
### Changed
- Collapsed v2 multi-agent chains/workflows/sub-agents into a single execution path.
### Removed
- All v2 policy/workflow/sub-agent files; vector/graph/tree-sitter/embedding plans.
