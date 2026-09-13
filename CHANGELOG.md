# Changelog

All notable changes to the Enterprise AI Platform. Versioning: SemVer (see docs).

## [4.11.0] - 2026-09-14 — Machine bootstrap (macOS/Linux) + Unified Trace committed

### Added
- `shared/mcp-tools/unified-trace-mcp/`, `shared/mcp-tools/opencode-mcp-bridge/`, `docs/opencode-setup.md` — committed for the first time; these existed and had been iterated on locally across several sessions but were never in git, so cloning the repo produced an environment missing Unified Trace entirely.
- `install/bootstrap.sh` — portable (macOS + Linux) machine bootstrap: prerequisite detection with version classification, sibling-repo clone-or-reuse (knowledge-graph-generator, code-cortex-mcp), Claude Code CLI install, this platform's own contract install, MCP registration for `knowledge-graph`/`code-cortex-mcp`/`unified-trace`/`opencode-bridge` with stale-registration detection and repair, OpenCode config safe-merge (refuses rather than risks corrupting a hand-edited JSONC file), `--dry-run`, `--doctor`, `--reindex`, `--skip-runner-tests`. Indexing stays explicit — a missing Knowledge Graph database is reported `NOT INDEXED / READY TO INDEX`, never built automatically.
- `install/merge-opencode-config.js` — the safe-merge helper `bootstrap.sh` shells out to.
- `install/test-bootstrap.sh` — 22-case test matrix (new/existing-machine scenarios, idempotency, config-merge preservation, broken-registration repair, optional-component absence, dry-run/doctor isolation), run against isolated fake `$HOME` directories, never the real environment.
- `paths.env` — new `TOOLS_DIR`/`PROJECTS_DIR` keys (blank = auto-detect siblings of wherever this repo was cloned); `EAP_TOOLS_DIR`/`EAP_PROJECTS_DIR` env var overrides for scripting/CI.
- `docs/TROUBLESHOOTING.md` — new entries for the `claude mcp get` project-scope-shadowing gotcha (found and fixed during this work), `CONNECTION_CLOSED` on `code-cortex-mcp`/`unified-trace`, and the OpenCode config manual-merge fallback.
- `docs/installation.md`, `docs/prerequisites.md`, `README.md` — cross-references to the new bootstrap path.

### Fixed
- The Windows master-prompt doc under `Auto setup claude prompt/` marked superseded — it predates the decision not to adopt GraphRAG (superseded by Knowledge Generator + Code Cortex + Unified Trace) and had 20+ stale references across 1,646 lines.

### Notes
- Windows is explicitly out of scope for `install/bootstrap.sh` — documented as a known gap rather than claimed working. The existing PowerShell installers (`install/*.ps1`, `adapters/*/install.ps1`) still cover the repo-contract install on Windows.

## [4.4.0] - 2026-07-13 — Phase G: AI Developer Agent

### Added
- `shared/commands/dev.md` — new `/dev` command (8th platform command). Executes a supplied task Markdown file (a plan, spec, or ticket write-up, e.g. `PLAN.md`) end to end: read it, read only the `context/` files it explicitly references, build an execution plan, implement, validate, and report. Supports two modes: Single Agent (default — strictly no sub-agents, sequential execution) and Multi-Agent (`multi` — parent agent may create up to 3 sub-agents when they provide clear value; parent always owns planning, distribution, coordination, conflict resolution, validation, and the final report). Multi-Agent Mode is a scoped invocation of the existing contract C4 opt-in subagent allowance (max 3), not a new orchestration mechanism. Git stays read-only per contract §2 / `GOVERNANCE.md` §2 unless the user explicitly instructs otherwise in-session.
- `shared/commands/registry.yml` — registered `dev` (`id: dev`, `phase_available: G`, `status: active`, `supported_platforms: [claude, copilot, opencode]`).
- Adapter shells for all `supported_platforms`: `adapters/opencode/commands/dev.md`, `adapters/copilot/prompts/dev.prompt.md`, `adapters/copilot/chatmodes/dev.chatmode.md`. Bonus shell also added for the Antigravity adapter (`adapters/antigravity/commands/dev.md`), matching that adapter's existing all-7-commands parity even though it is not tracked in `registry.yml` `supported_platforms` (pre-existing pattern for that adapter).
- `adapters/opencode/capability-map.yml` (cap-18), `adapters/antigravity/capability-map.yml` (cap-19), `adapters/copilot/capability-map.yml` (cap-18) — capability entries for `/dev`, noting each adapter's existing subagent-orchestration limitation (cap-14/cap-15) applies to Multi-Agent Mode: self-managed sequencing, not true parallel orchestration, outside Claude Code.
- `docs/COMMANDS.md` — Command Index row + full `## AI Developer Agent` reference section (invocation, modes table, input forms, phases).
- `docs/PLATFORM-CAPABILITY-MATRIX.md` — `/dev` row added to Command Support by Platform table; command count updated 7 → 8.
- `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` — `/dev` added to command lists and descriptions; version synced to 4.4.0.

### Changed
- `VERSION` — `4.3.0` → `4.4.0`.

### Notes
- Contract kernel (between the `enterprise-ai-platform:kernel:start/end` markers) is unchanged — no SHA-256 recompute needed; `/dev` reuses the existing kernel's C4 subagent opt-in and §14 approval gate rather than introducing new kernel rules.
- Followed `GOVERNANCE.md` §1 7-step new-command process; shells for all `supported_platforms` were built in the same pass, so `registry.yml` went straight to `status: active` (step 6) without an intermediate `planned` state.

## [Unreleased] — Knowledge Repo Standards Sync (Part A)

### Added
- `shared/standards/backend/sql-query.md` — split out of `repository.md`: parameter binding, pagination, N+1, indexing, and a documented real gap/fix in the `*.query.SQL` string-built native-query pattern.
- `shared/standards/backend/custom-annotations.md` — `@Audited`, `@Auditable`, `@LogApiError`, `@InjectCTA`, `@IdentifierCodeConstraint`, `@EncounterLocked`, `@InvalidateRcmSettingsCache` — per-service duplication caveat, no shared annotation library.
- `shared/standards/backend/db-migration.md` — Flyway (Postgres) naming/location rules and the silently-ignored-file gotcha; Mongock (Mongo) per-service usage table and transaction/replica-set gotcha. Distinct from `shared/standards/migration/` (git branch migration).
- `shared/standards/frontend/app-shell-menu-config-cache.md` — access-driven menu data flow, two-tier (IndexedDB + Redis) access-rights caching and clear order, runtime PrimeNG theme-swap mechanism, Cache Management dialog.
- `shared/standards/frontend/global-filter-search.md` — the FDM global filter/searchbar pattern (named `searchbar` router outlet + `SearchMenuService` pub/sub), per-module convention.
- `shared/standards/frontend/modern-clinical-enterprise-design-system.md` — visual design system and AI-agent hard rules for UI work; consume the existing theme/customization system, never build a parallel one.
- `shared/contract.md` §5 — added `custom-annotations`, `sql-query`, `db-migration` to the Java/Spring lazy-load list; added `app-shell-menu-config-cache`, `global-filter-search`, `modern-clinical-enterprise-design-system` to the Angular/TS lazy-load list. Kernel block (hash-pinned) untouched — no SHA-256 recompute needed.

### Changed
- `shared/standards/backend/repository.md` — replaced with the newer version that splits SQL-writing rules out to `sql-query.md` and documents the second (string-builder) JDBC pattern.
- `shared/standards/coding-standards.md` — added §10 Architecture & Layering, §11 Database & SQL Standards (links to `backend/sql-query.md`), §12 API Standards, §13 Security Standards. §1–9 were already in sync with `D:\GitLab-Workspace\Knowledge Repo\docs\standards\coding-standards.md`.

### Notes
- Source: reconciliation against `D:\GitLab-Workspace\Knowledge Repo` (this machine's company knowledge workspace, not part of this git repo). `common-api.md`, `dto-mapper-enum.md`, `entity.md`, `service.md`, `spring.md` (backend) and `angular.md`, `component.md`, `custom-components.md`, `others.md`, `pagination.md`, `service.md` (frontend) were already identical — no change.
- This is Part A of a larger Knowledge Repo integration (company knowledge relocation, skills reconciliation, redmine templates, and four new skills — Plan Reviewer, Testing consolidation, Bulk Redmine Reporter, weekly usage logger, Custom Knowledge Generator — tracked separately, not yet done).

## [Unreleased] — Company Knowledge Relocation (Part B)

### Added
- `shared/knowledge/custom-flows/` — relocated from Knowledge Repo's `docs/Custom Flow knowledge/`: `abdm/` (backend + frontend ABDM integration), `bom/` (5 files — functionality KB, non-stock indent consumption, stock reduction, adding BOM to bill, casesheet/OPD clinical integration), `pagination-global-filter/` (global filter search + pagination architecture), `upload/` (core upload framework, RCM new-upload knowledge). Fixed the `uplaod` → `upload` directory-name typo from the source.
- `shared/knowledge/architecture/` — relocated from Knowledge Repo's `docs/architecture/`: `architecture.md`, `dependencies.md`, `environments.md`, `projects.md`, `redmine.md` (project identifiers, `redmine-reader` MCP usage, full status-id workflow, MR-tracking-in-journals pattern), `running-locally.md`. All cross-file relative links (`./sibling.md`) preserved correctly since files moved together as a set.
- `shared/company-profile.md` — new "Custom Flow & Architecture Knowledge" section: a topic → path table pointing to `shared/knowledge/`, with the same lazy-load-only-what's-relevant discipline as `shared/standards/`. SEAM NOTE updated to mention `shared/knowledge/` as company domain knowledge, separate from the company profile file itself.

### Notes
- `shared/knowledge/` was previously an empty placeholder (`.gitkeep` only) — this is its first real content.
- Files copied as-is (pure relocation, no content merge needed — verified no other Knowledge Repo file referenced these by their old path).
- `D:\GitLab-Workspace\Knowledge Repo` remains the live upstream workspace; this is a one-time sync-in, not a symlink (required for portability/CI — see Part A discussion).

## [4.5.0] - 2026-08-29 — Drift Fix: Backport /planning

### Added
- `shared/commands/planning.md`, `shared/commands/planning-engine.md`, and their `registry.yml` entry — backported verbatim from `~/.claude/commands/` (the installed global copy), where they already existed at registry v4.5.0 but had never been committed back to this source repo (still v4.4.0, no `/planning` entry). No content changes — pure reconciliation.
- `adapters/opencode/commands/planning.md` — the opencode shell the registry entry's own note claimed existed "on every listed platform" but was actually missing from this repo; added to match the pattern of the other opencode command shells (thin pointer to `.opencode/ai-platform/shared/commands/planning.md`).

### Changed
- `VERSION` — `4.4.0` → `4.5.0` (catching up to the version the installed commands already claimed).

### Notes
- Discovered while building the Plan Reviewer skill (next entry) — Plan Reviewer needed to sit consistently next to `/planning`, which surfaced the fact that `/planning` wasn't in this repo at all despite being live and usable in this Claude Code installation.
- Root cause of the drift not established — no `.prev` backup file exists for `planning.md`/`planning-engine.md` in `~/.claude/commands/` (unlike `test.md.prev`, `migration.md.prev`, `registry.yml.prev`, which show normal installer-managed updates), meaning these two were added to the installed copy through some path other than `install-claude.ps1`/`update-platform.ps1`. Not investigated further — out of scope for this task.

## [4.6.0] - 2026-08-29 — Plan Reviewer (Part E)

### Added
- `shared/commands/plan-reviewer.md` — new `/plan-reviewer` command (10th platform command). QA/audit gate on a plan that already exists (from `/planning`, a human, or a Redmine attachment): scores Problem Understanding, Code Understanding, Test Plan, and Confidence (0–100 each) against actual evidence (code via `gitlab-reader`, DB via the environment-routed `mcp__*-db` tools, logs/traces via `*-signoz-reader`/`*-grafana-reader`, ticket/BRD via `redmine-reader`) — never scores from how plausible the plan reads. Approval requires all four scores to clear `threshold=` (default 95, configurable). Not approved → produces a revised `PLAN.md` + `TEST-CASES.xlsx` and re-scores, capped at `max-revisions=` (default 3). Never implements. Posting the result to Redmine (only if explicitly asked) uses the Part D templates.
- `shared/commands/registry.yml` — registered `plan-reviewer` (`phase_available: I`, `supported_platforms: [claude, opencode]`).
- `adapters/opencode/commands/plan-reviewer.md` — opencode shell, same pattern as the other thin pointer shells.
- `.claude-plugin/plugin.json` — `/plan-reviewer` added to command list/description; version → 4.6.0.
- Mirrored into `~/.claude/commands/` (this machine's installed copy) so the command is usable immediately in this Claude Code installation, consistent with how `/planning` was already live there ahead of the source repo.

### Changed
- `VERSION` — `4.5.0` → `4.6.0`.

## [4.7.0] - 2026-08-29 — Bulk Redmine Reporter (Part G)

### Added
- `shared/commands/redmine-bulk-report.md` — new `/redmine-bulk-report` command (11th platform command). Takes a list of Redmine IDs, and for each: applies the comment-priority rule, resolves environment via the Part C routing table, follows MR links found in journals, and only when evidence supports it (MR diff / code / DB / logs / attachments — checked in that priority order, budget-capped at 8 searches per ticket) states a root cause with a confidence rating and cited evidence. Writes one combined `Redmine-Report-<date>.md`. Never guesses a root cause to fill a row — marks `INSUFFICIENT EVIDENCE` instead. Recommends `/planning` (High confidence) or `/bug-fix` (Low/insufficient) per ticket. Read-only; posts to Redmine only if explicitly asked.
- `shared/commands/registry.yml` — registered (`phase_available: I`, `supported_platforms: [claude, opencode]`).
- `adapters/opencode/commands/redmine-bulk-report.md` — opencode shell.
- `.claude-plugin/plugin.json` — added to command list; version → 4.7.0.
- Mirrored into `~/.claude/commands/` for immediate use.

### Changed
- `VERSION` — `4.6.0` → `4.7.0`.

## [4.8.0] - 2026-08-29 — System-Wide Usage Logger (Part H)

### Added
- `adapters/claude/hooks/usage-logger.js` — new `UserPromptSubmit` hook, distinct from the existing per-repo `audit.js`. Writes one JSONL entry per submitted prompt to a **fixed global path**, `~/.claude/usage-logs/<YYYY-MM-DD>.jsonl`, independent of which repo or folder the session runs in. Factual fields only (timestamp, session_id, cwd, repo basename, user, prompt text/length, an informational-only `has_redmine_ref` flag that never affects scoring). Self-prunes files older than 10 days on every write — no separate retention job needed.
- `shared/commands/usage-report.md` — new `/usage-report` command (12th platform command, Claude-only — the hook mechanism it depends on is Claude-Code-specific). Reads the log and reports: total sessions, total prompts, prompts-per-session (min/max/avg), per-day breakdown, and prompt quality reusing `shared/prompts/prompt-quality.md` §16a's scoring factors — applied across sessions/days rather than the single-task scope of the existing per-session `Prompt Quality` line. `clear` sub-mode reports what would be deleted and requires an exact typed `CONFIRM` reply — a bare `clear` argument or any other reply deletes nothing.
- `adapters/claude/file-map.yml` — new install-target entry for `usage-logger.js`, installed to the **global** `~/.claude/hooks/` (not per-repo `.claude/hooks/`) — first `scope: global` entry in this file.
- `shared/commands/registry.yml` — registered `usage-report`.
- `.claude-plugin/plugin.json` — added; version → 4.8.0.
- Mirrored `usage-report.md` and `usage-logger.js` into the installed `~/.claude/commands/` and `~/.claude/hooks/` for immediate use; the hook's actual wiring into `~/.claude/settings.json` (the `UserPromptSubmit` event registration) was done via the `update-config` skill rather than a direct edit, since that's its designated job.

### Changed
- `VERSION` — `4.7.0` → `4.8.0`.

### Fixed
- `usage-logger.js` used `toISOString().slice(0,10)` (UTC date) for the daily log filename — on this machine (local time ahead of UTC), a prompt sent late at night would land in "tomorrow's" UTC file instead of today's local one. Switched to explicit local-time date components (`localDateStr()`), fixed the retention-pruning cutoff to match.
- `usage-logger.js` didn't strip a leading UTF-8 BOM (U+FEFF) from stdin before `JSON.parse` — PowerShell prepends one when piping a string to a native process's stdin, which made `JSON.parse` throw (silently caught by the hook's own try/catch) and every field come back `null`. Confirmed via a raw-bytes test (`ef bb bf 7b 22...`) before fixing. Verified via pipe-tests through both bash and PowerShell (the hook's actual `shell: powershell` invocation path) before and after the fix.

### Notes
- Deliberately separate from `shared/commands/prompt-audit.md` / `shared/prompts/prompt-quality.md`'s existing per-task scoring — this is the "system level" measure the user asked for, reusing the same scoring factors rather than inventing a second rubric, but aggregating across every session/repo on the machine over a rolling 10-day window.
- The `UserPromptSubmit` hook is now registered in `~/.claude/settings.json` (added via the `update-config` skill, existing `PostToolUse` hook left untouched) and pipe-tested end-to-end through PowerShell. Hooks are read at session start, so it takes effect from the next Claude Code session — it does not retroactively log prompts already submitted in a running session.

## [4.9.0] - 2026-08-29 — Custom Knowledge Generator (Part I)

### Added
- `shared/commands/knowledge-capture.md` — new `/knowledge-capture` command (13th platform command). On-demand only — never a default step of another command. Turns what was actually implemented and verified this session (or a named `redmine=`/`mr=`) into a new or extended file under `shared/knowledge/`, matching the existing evidence-based voice (verified vs. inferred, real file/class/table citations, the gotcha if there was one). Checks existing coverage first via `Glob`/`Grep` before writing — extends an existing file rather than duplicating one where the domain is already covered. New files get cross-linked from `company-profile.md`'s topic table so they're discoverable. Refuses to document unverified/in-progress work.
- `shared/commands/registry.yml` — registered.
- `adapters/opencode/commands/knowledge-capture.md` — opencode shell.
- `.claude-plugin/plugin.json` — added; version → 4.9.0.
- Mirrored into `~/.claude/commands/` for immediate use.

### Changed
- `VERSION` — `4.8.0` → `4.9.0`.

## [4.10.0] - 2026-08-29 — Contract Governance (Part J)

### Added
- `shared/contract.md` kernel — two new lines, per the user's explicit "strict things the agent should always do":
  - `coding-standards.md` marked mandatory for any code-touching task (strengthens the existing "Lazy standards" line — previously implied, now explicit and unconditional).
  - New **Company knowledge (F10)** line: load the matching `<root>/knowledge/` file(s) for a documented company/domain flow, indexed via `company-profile.md`'s topic table (Part B) — on demand, never bulk-loaded.
  - (The third "strict thing" — logging all prompts/sessions — is infrastructure, not an agent instruction: Part H's hook does this unconditionally regardless of kernel content, so no kernel line was needed for it.)
- Regenerated `shared/contract.md.sha256` using the exact extraction+hash algorithm `adapters/claude/hooks/hash-check.js` uses (substring between the kernel markers, inclusive, SHA-256 over UTF-8 bytes) — verified programmatically via a throwaway Node script, not computed by hand. Old hash `528cdbb2d5...` → new hash `70d6ae1f42...` (full value in the file).
- Applied the identical kernel text to the live `~/.claude/CLAUDE.md` and verified byte-for-byte that source kernel hash == live kernel hash == the newly-written `.sha256` file, via a second verification script — not assumed.

### Fixed (drift)
- Backported the **Knowledge-graph first (F-KG)** kernel paragraph from the live `~/.claude/CLAUDE.md` into `shared/contract.md` — it existed live (matching this machine's `D:\GitLab-Workspace\CLAUDE.md` project instructions) but had never been committed to the source repo, same class of drift as the `/planning` backport in 4.5.0. Included in the hash recomputation above.

### Changed
- `VERSION` — `4.9.0` → `4.10.0`. `shared/commands/registry.yml` version left at 4.9.0 — no command was added or removed in this part, only the kernel.

### Risk note
- This is the one part of the whole Knowledge Repo integration that touches the hash-pinned kernel (every other part touched only the full, non-kernel contract or added new files). A consuming repo installed via `install-claude.ps1` from a pre-4.10.0 checkout will show a hash mismatch on its next session until re-installed — `hash-check.js` only warns and re-injects, it never blocks, so this is not destructive, but worth knowing before rolling this version out to other repos.

## [Unreleased] — Configurable Output Paths

### Added
- `paths.env` (repo root, git-tracked — no secrets, plain folder paths only, unlike `.env`) — a new local config file the user edits after pulling the repo, following the same "edit in place, keep it committed" pattern as the existing `context/context.path`:
  - `PLAN_OUTPUT_PATH` — where `/planning` and `/plan-reviewer` write `PLAN.md`/`TEST-CASES.xlsx`. Blank = existing default (current working directory).
  - `KNOWLEDGE_OUTPUT_PATH` — where `/knowledge-capture` writes new/extended files. Blank = existing default (`shared/knowledge/` in this repo).
  - `USAGE_LOG_PATH` — where the `usage-logger.js` hook writes its daily log. Blank = existing default (`~/.claude/usage-logs/`). Documented as needing a mirrored copy at `~/.claude/paths.env` since the hook runs globally (any repo, any cwd) and can't resolve a per-repo `paths.env`.
  - `CONTEXT_PATH` — the AI context input folder, now consolidated into this file too (per follow-up instruction), pre-filled with the value already in `context/context.path` (`D:\GitLab Workspace\context for AI`). Checked first; `context/context.path` remains fully supported as the fallback for anyone already using it, and is left completely unmodified — nothing was deleted or migrated destructively.
- `shared/commands/planning.md`, `shared/commands/plan-reviewer.md`, `shared/commands/knowledge-capture.md` — output-path resolution updated to check `paths.env` before falling back to each command's existing default.
- `shared/commands/usage-report.md` — now resolves the log directory from `~/.claude/paths.env`'s `USAGE_LOG_PATH` (both Default/Dated Report Mode and Clear Mode), so it reads from wherever the hook is actually configured to write rather than assuming the hardcoded default.
- `adapters/claude/hooks/usage-logger.js` — new `resolveLogDir()`: reads `USAGE_LOG_PATH` from `~/.claude/paths.env`, falls back to the original hardcoded default on a blank value, a missing file, or a read error.
- Mirrored `paths.env` to `~/.claude/paths.env` and the updated `usage-logger.js`/`usage-report.md` to their installed locations.

### Fixed
- `resolveLogDir()`'s first implementation used `\s*` between `=` and the capture group in its `USAGE_LOG_PATH=` regex. `\s` matches newlines in JS, so on a **blank** value immediately followed by a blank line, the greedy `\s*` crossed the line boundary and the capture group grabbed the *next* line's comment text instead of an empty string — confirmed with an isolated repro (`content.match()` returned the following `# ─── AI context...` comment line as the "value") before fixing. Replaced with `[ \t]*` (does not match newlines) so matching stays on the `USAGE_LOG_PATH=` line. Verified after the fix: blank value → correct empty-string match → falls through to default; a real path value → captured correctly; a missing `paths.env` → falls through to default. All three cases re-verified end-to-end through the actual PowerShell hook-invocation path, not just in isolation.
- While retesting, confirmed the live `UserPromptSubmit` hook wiring from the earlier session (Part H) is actually firing correctly mid-session now — real prompt text from this conversation appeared in today's log during testing, confirmed genuine (not a test artifact) and left in place; only the synthetic test entries this fix required were removed afterward.

## [Unreleased] — Knowledge Graph Integration & README Refresh

### Added
- `shared/mcp/knowledge-graph-setup.md` — documents the full pipeline this machine actually runs: `Knowledge Graph Generator` (a separate repo, `indexer.py`) reads source repos read-only → writes `knowledge_graph.db` to `OUTPUT_DIR` (configured in that repo's `kg-config.env` as `Knowledge Repo\Knwoledge graphs\`, not its own `output/` folder) → the `knowledge-graph` MCP server (`mcp_server/`, same repo) serves it via `KG_DB_PATH` → this platform's contract kernel F-KG rule uses it first. Covers staleness (it's a snapshot, not live — reindex is a manual step), the 12 read-only tools, the VERIFIED/INFERRED/UNRESOLVED confidence model, and where "check it first" is wired into the platform.
- `shared/company-profile.md` — `knowledge-graph` added to the Platform Defaults MCP servers row, marked optional, cross-linked to the new setup doc.
- Explicit "Knowledge graph first (kernel F-KG)" steps added to each command's own discovery phase — not just relying on kernel recall — in `bug-fix.md`, `new-development.md`, `migration.md` (mode=functionality cross-service impact via `find_dependencies`/`trace_business_flow`), `data-correction.md` (`get_database_impact` before live schema inspection), `ui-design-update.md` (both Angular and Flutter analog-component lookup), `dev.md`, `planning-engine.md` (propagates to `/planning` and any command that reads it), `plan-reviewer.md` (verifying a plan's code claims via `get_source_evidence`), `redmine-bulk-report.md` (Step 4 code lookup), and `knowledge-capture.md` (citation verification). All fall back to the existing scan-based discovery when the server isn't connected — nothing is a hard dependency.
- `shared/commands/README.md` — full rewrite/backport. The installed `~/.claude/commands/README.md` had drifted badly: only 5 of 13 commands documented, no `paths.env`, no knowledge-graph section, and it still referenced `/ui-redesign` — a phantom command removed back in v3.1 that was never actually built. Rewrote to cover all 13 commands, added §6 (`paths.env`) and §7 (Knowledge Graph MCP), fixed the phantom-command reference with a historical note distinguishing it from `/ui-design-update`.
- `README.md` (repo root) — version → 4.10.0, command count → 13, new Commands-table rows for `/planning`/`/plan-reviewer`/`/redmine-bulk-report`/`/usage-report`/`/knowledge-capture`, new "Knowledge Graph MCP (optional)" section, `paths.env` and `shared/knowledge/` added to the Architecture tree, "Knowledge graph first" and "Company knowledge" added to the "How the Contract Works" list, Versioning table extended through Phase J (v4.10).
- Mirrored every changed command file + the new `README.md` into `~/.claude/commands/` — confirmed live via the skill listing (`README`, `plan-reviewer`, `redmine-bulk-report`, `knowledge-capture`, `planning-engine`, and the rest all show updated descriptions).

### Notes
- No new command was registered and the kernel was not touched by this entry — verified the kernel hash still matches source/live/`.sha256` after all edits, same script as the Part J verification.
- `file-map.yml`'s existing `shared/commands/ → .claude/commands/` recursive copy already covers the new `README.md` — no separate install-target entry needed.

## [Unreleased] — Testing Knowledge Base (Part F)

### Added
- `shared/standards/testing/` — new subdirectory holding 15 supplementary testing-technique files relocated from Knowledge Repo's `docs/Testing/`: `README.md` (index), `testing-principles.md`, `test-case-design.md`, `java-junit-mockito.md`, `java-api-testing.md`, `java-db-testing.md`, `java-file-upload-testing.md`, `java-large-data-import-testing.md`, `java-performance-load-testing.md`, `angular-testing.md`, `react-testing.md` (reference only — no React app in this workspace yet), `playwright-e2e.md`, `test-data-strategy.md`, `coverage-and-regression.md`, `test-lifecycle-and-build-isolation.md`, `testing-anti-patterns.md`. Fixed the two cross-links (`README.md`, `coverage-and-regression.md`) that pointed at `testing.md` — now `../testing.md` since that file stays at the parent level; all other cross-links were already sibling-relative and needed no change.
- `shared/contract.md` §5 — new "Writing/reviewing tests" lazy-load entry pointing to `testing/README.md` as the index, explicit that it supplements (never overrides) `testing.md` and `rules/testing.md`. Full contract only, kernel untouched — no hash recompute.
- `shared/rules/testing.md` — one-line cross-reference to the new knowledge base.

### Notes
- Knowledge Repo's own `docs/Testing/testing.md` (174 lines) and `README.md` explicitly describe themselves as a reference copy of / wrapper around the platform's existing `/test` automation contract ("this is guidance, not the automation contract... nothing here overrides testing.md") — confirmed near-identical to `shared/standards/testing.md` (173 lines), so that file was **not** copied in; the platform's existing `testing.md` and `shared/rules/testing.md` (TR-01–TR-08) are unchanged.
- This is purely additive technique/design guidance (JUnit/Mockito patterns, API/DB/file-upload/large-import/performance test design, Angular/React/Playwright testing, test-data strategy, coverage/regression policy, test lifecycle, anti-patterns) — no existing rule or automation behavior changed.

## [Unreleased] — Redmine Comment Templates (Part D)

### Added
- `shared/templates/redmine-execution-comment.md` — short (≤~6 line) execution/status comment template. Optimized from Knowledge Repo's `docs/agent-response-template/optional-ai-generated-info.md`: keeps the opt-in "only when explicitly asked" rule and the no-hallucination/verification rules, tightens the format, and adds an explicit "reference files, never paste their content" rule per the user's instruction that Redmine comments should point at files rather than carry the content inline.
- `shared/templates/redmine-approval-comment.md` — new template for posting a Plan Reviewer approval (Part E) to a Redmine issue: the 4 scores + file references, nothing more. Explicitly does not apply to a not-yet-approved plan (use the execution-comment template with `Status: Needs revision` instead).
- `shared/contract.md` §18 "Redmine Comment Templates" — on-demand pointer to both templates, triggered only by an explicit user request, never as a default step of any command. Placed in the full contract (not the kernel) since it's an occasional-use capability, not a per-turn rule — no SHA-256 recompute needed.

### Notes
- No command file (`bug-fix.md`, `dev.md`, etc.) needed editing — none of them currently post to Redmine as part of their flow (they only *read* from it via the `redmine=<id>` discovery key in contract §2), so a single contract-level pointer covers all of them rather than duplicating the same instruction across 5+ command files.

## [Unreleased] — Skills Reconciliation (Part C)

### Added
- `shared/knowledge/architecture/environments.md` — new "Ticket status → DB MCP routing" table mapping Redmine environment keywords/statuses to this session's actual configured `mcp__*-db`/`mcp__*-reader` server names (local, v2qa, sit, canary, medvista-qa/uat, aster-uat, ajyal-uat, smiles-stage).
- `shared/knowledge/architecture/redmine.md` — new "Reading journals: newest finding wins" section (comment-priority rule: latest QA/deployment/rejection findings outweigh the original description).
- `shared/standards/backend/db-migration.md` — new "Migration risk tagging" section (SAFE / CAUTION / HIGH RISK, with lock-behavior and NOT NULL/backfill practical notes); HIGH RISK always triggers the contract §9 approval gate regardless of `auto=true`.
- `shared/standards/backend/sql-query.md` — new "Verify schema before writing SQL" rule: confirm schema via the live `mcp__*-db` tool for the target environment before writing any query, never from memory or a possibly-stale entity class.

### Rejected (architecture-incompatible, documented for the record)
- `D:\GitLab-Workspace\Knowledge Repo\Skills\planning-workflow.md`, `spring-enterprise-backend.md`, `database-engineering.md` are built around a multi-agent orchestrator/delegation model (named persistent sub-agents `healthcare-backend-engineer`, `db-engineering-agent`, `angular-healthcare-ui`, `orchestrator-agent`, `triage-agent` that auto-load these skills and receive delegated work). This directly conflicts with the contract kernel's "single reasoning agent, no automatic agent chains, subagents opt-in and capped at 3" mandate — not ported wholesale.
- Non-duplicate, architecture-agnostic content was extracted instead (see Added, above). Remaining content (debugging root-cause workflow, 13-item API verification checklist) was left unported — it's raw material for the planned Plan Reviewer (Part E) and Bulk Redmine Reporter (Part G) skills rather than being placed in two locations.
- Files in Knowledge Repo were left untouched — that workspace isn't owned by this repo's git history; the user can prune superseded files there at their own discretion.
- `shared/rules/security.md`'s header already documented an earlier, security-scoped consolidation from these same two files (2026-08) — this entry covers the additional non-security content.

## [Unreleased] — Flutter / Dart Mobile Support

### Added
- `shared/standards/mobile/` — new standards directory for Flutter/Dart: `flutter.md` (stack + rules), `widget.md`, `service.md`, `state-management.md` (Bloc), `routing.md` (go_router), `models.md` (freezed/json_serializable). Mirrors the existing `backend/`/`frontend/` layout.
- Flutter/Dart detection (`pubspec.yaml`, `*.dart`, `lib/`) added to `shared/contract.md` §5 lazy standards loading, alongside Java/Spring and Angular/TS.
- Flutter layer coverage (Widget, State Management, Mobile Route) added to Gate A (`shared/contract.md` §7) and to `shared/rules/code-review.md` (CR-02).
- `flutter test` / `mocktail` / `bloc_test` convention added to `shared/rules/testing.md` (TR-05) and `shared/standards/testing.md` (stack detection, naming conventions, generated-code exclusions for `*.g.dart`/`*.freezed.dart`).
- `/test` command: `pubspec.yaml` stack detection and a Flutter scaffold example.
- `/ui-design-update` command: full parallel Flutter track — stack detection (Angular vs Flutter), a Flutter MUST-PRESERVE list (callbacks, keys, Bloc/Cubit wiring, routes, localization), and the same never-touch-business-logic boundary as Angular's `.component.ts` rule (Flutter: never touch Bloc/Cubit/repository files).
- `/migration` command now loads mobile standards for touched layers, same as backend/frontend.
- Flutter/mobile checklist items added to `shared/templates/migration-checklist.md` and `shared/templates/redesign-checklist.md`.
- `shared/templates/coverage.yml` — `flutter` stack thresholds, LCOV report path, and generated-Dart allow-list entries.
- `shared/company-profile.md` — Flutter (Dart) noted as a secondary stack; `lib/features/<feature>/` module boundary convention added.
- Documentation updated for consistency: `PROJECT-STRUCTURE.md`, `docs/COMMANDS.md`, `docs/RULES.md`, `docs/boundary-examples.md` (Example D — Flutter), `docs/example-executions.md`, `docs/INSTALL-CLAUDE.md`, `docs/INSTALL-COPILOT.md`, `docs/USAGE.md`, `docs/coverage-gate.md`, `docs/platform-version-schema.md`, `prompt-guide.md`, `usage-instructions.md`, `.claude-plugin/plugin.json`.

### Changed
- Vendored dogfood copy `install/.github/ai-platform/shared/` re-synced from `shared/` to match.

### Notes
- Contract kernel (between the `enterprise-ai-platform:kernel:start/end` markers) is unchanged — no SHA-256 recompute needed; all edits are in the non-kernel body of `shared/contract.md`.

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
