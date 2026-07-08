# Master Project Board — Enterprise AI Platform

**Type:** Operational authority document
**Authority:** This is the ONLY authority for sprint/phase operational status (per `GOVERNANCE.md`).
For engineering rationale see `IMPLEMENTATION-LOG.md`; for execution rules see `shared/contract.md`.

**As of:** 2026-07-08 · **Platform version:** 4.3.0 · **Current phase:** F (complete) · **Current status:** RC1 hardening

---

## Sprint / Phase Board

| Sprint | Phase | Version | Theme | Status |
|---|---|---|---|---|
| 0 | — | — | Discovery spikes, blocker closure, migration map | ✅ COMPLETE |
| 1 | A | v3.0 → v3.1 | Foundation — commands, contract, Claude adapter, security (allowlist, hash-check) | ✅ COMPLETE |
| 2 | B | v3.2 | MCP safety — read-only enforcement, red-team tests | ✅ COMPLETE |
| 3–4 | C | v4.0 | Portable plugin — registry.yml, OpenCode adapter, `/test` | ✅ COMPLETE |
| 5 | D | v4.1 | Automation — rules/prompts/reports/knowledge layers, `/prompt-audit` | ✅ COMPLETE |
| 6 | E | v4.2 | CI & marketplace — governance-lite, telemetry, HITL matrix | ✅ COMPLETE |
| 6 (late) | F | v4.3 | Rollout & polish — company seam, fleet rollout, future adapter stubs | ✅ COMPLETE |
| — | RC1 | v4.3.0 | Repository hardening pass — audit + remediation before release candidate | 🔶 IN PROGRESS |

Full phase-by-phase acceptance criteria and validation commands: [`docs/phase-dod.md`](docs/phase-dod.md).
Forward-looking items beyond v4.3.0: [`ROADMAP.md`](ROADMAP.md).

---

## Blockers / Defects — Status

Consolidated from `CHANGELOG.md`, `docs/phase-dod.md`, and `docs/file-migration-map.md`.

| ID | Description | Status |
|---|---|---|
| BLK-05 | Current→target file migration map undefined | ✅ CLOSED — `docs/file-migration-map.md` |
| BUG-A2 (V-E1) | Repo structure decision blocked planning | ✅ CLOSED |
| BUG-F1 (V-F1) | Per-phase Definition of Done missing | ✅ CLOSED — `docs/phase-dod.md` |
| BUG-F2 (V-F2) | Phase A DoD missing validation commands | ✅ CLOSED — `docs/phase-dod.md` |
| BUG-B4 | `audit.js` field list not pinned | ✅ CLOSED — `shared/schemas/audit-schema.json` v1.0 |
| BUG-B7 | Coverage gate location/config undefined | ✅ CLOSED — `shared/templates/coverage.yml` + `docs/coverage-gate.md` |
| BUG-C1 | ~25 DB MCP servers, no consolidation decision | ✅ CLOSED — `shared/mcp/db-consolidation.md` |
| BUG-H3 | Legacy static-summary `PostToolUse` hook not removed on upgrade | ✅ CLOSED — `adapters/claude/upgrade.ps1` |
| BUG-I1 | v3.0 denylist settings not migrated to v3.2 allowlist | ✅ CLOSED — `tools/migrate-settings.ps1` |
| BUG-D2 | Secrets not auto-provisioned for new repos | 🔶 OPEN — owner not yet assigned (see Open Items below) |
| D1 | Phantom `/planning`, `/ui-redesign` chatmode/prompt duplicates | ✅ CLOSED — deleted from `adapters/copilot/` (this pass also removed the last stray copies under `install/.github/`, see RC1 Hardening Findings) |
| D2 | `/planning`, `/ui-redesign` phantom commands (not real platform commands) | ✅ CLOSED — removed from `shared/commands/registry.yml` |
| D5 | `.claude-plugin/plugin.json` / `marketplace.json` incorrect metadata | ✅ CLOSED (this pass) — version synced to 4.3.0, command list corrected to all 7 commands |

---

## Open Operational Items

Mirrors `ROADMAP.md` § Open Operational Items — update both when status changes.

| Item | Owner | Priority | Notes |
|---|---|---|---|
| Populate `tools/repos.txt` with real GitLab URLs | Team lead | High | Required before fleet rollout |
| Run fleet rollout canary (1 repo) | Platform Architect | High | Use `rollout-fleet.ps1 -DryRun` first |
| Run fleet rollout — full fleet | Platform Architect | High | After canary verification |
| Run red-team tests A, B, C on each engineer machine | Security Lead | High | `docs/red-team-tests.md` |
| Assign BUG-D2 owner (secrets provisioning gap) | Platform Architect | Medium | Secrets not auto-provisioned for new repos |
| Copilot 30-day measurement review (C3 decision) | Platform Architect | Medium | Due 2026-08-07; `docs/copilot-measurement.md` |
| Tag releases v3.1.0 through v4.3.0 in GitLab | Platform Architect | Low | Retrospective tagging for history |
| Complete `install/.github/` duplicate cleanup (chatmodes, prompts, templates, contract.md, REPO.md) | Platform team | Low | Standards duplicate closed in RC1 hardening; remaining items documented in `docs/file-migration-map.md` §8 |
| Reconcile `usage-instructions.md` against `INSTALL-CLAUDE.md`/`INSTALL-COPILOT.md`/`INSTALL-OPENCODE.md` | Platform team | Medium | Redirect banner added in RC1 hardening; full content merge not yet done |
| Resolve `shared/commands/migration-intelligence.md` phantom-command risk on Claude/OpenCode | Platform Architect | Medium | Recursive `shared/commands/` copy installs it into `.claude/commands/` and `.opencode/ai-platform/shared/commands/`, where it could register as an unintended slash command — flagged during RC1 hardening, not fixed (needs a design decision, e.g. relocate to `shared/knowledge/`) |

---

## RC1 Hardening Pass — 2026-07-08

Repository Hardening Audit findings resolved (see audit report for full detail):

- **Critical:** Version drift (`plugin.json` 3.1.0, `marketplace.json` 3.0.0, `registry.yml` 4.1) synced to 4.3.0.
- **Critical:** Copilot `/test`/`/prompt-audit` status mismatch resolved — `/test` explicitly deferred (`registry.yml`, `capability-map.yml`); `/prompt-audit` wiring completed (`file-map.yml` now copies `shared/commands/` and `shared/prompts/` — the same gap existed and was fixed for OpenCode).
- **Critical:** `docs/copilot-measurement.md` TODOs given ticket references and marked explicitly non-blocking for RC1 (measurement window closes 2026-08-07).
- **Major:** Duplicate `commands/`, `standards/`, and `install/.github/ai-platform/standards/` deleted (git-tracked, reversible) — `shared/` is now the sole source for these three.
- **Major:** This file created to resolve dangling `MASTER-PROJECT-BOARD.md` references in `GOVERNANCE.md`, `IMPLEMENTATION-LOG.md`, `ROADMAP.md`.
- **Medium:** Top-level `README.md`, `project-structure.md`, `contributing.md`, `usage-instructions.md`, `prompt-guide.md` updated — were still describing v3.1/Phase A architecture (5 commands, no `shared/` layer, no registry.yml).

## Repo Flatten — 2026-07-08

Executed the nested double-directory flatten described in `docs/file-migration-map.md` §1 (previously drafted but never run — `tools/flatten-repo.sh` existed but was not executed; superseded by this manual pass, which used the new v4.3.0 docs rather than the old ones per updated instructions):

- `D:\enterprise-ai-platform\enterprise-ai-platform\` (inner platform source) promoted to the git repo root. No nested subdirectory remains.
- Old outer v3.1-era `README.md`, `contributing.md`, `project-structure.md` deleted; new v4.3.0 `README.md`, `CONTRIBUTING.md`, `PROJECT-STRUCTURE.md` promoted to root in their place.
- `CHANGELOG.md`, `SECURITY.md`, `VERSION`, `.gitlab-ci.yml`, `.claude-plugin/` also promoted to root.
- 18 other new reference docs (`COMMANDS.md`, `FAQ.md`, `GOVERNANCE.md`, `IMPLEMENTATION-LOG.md`, `INSTALL-CLAUDE.md`, `INSTALL-COPILOT.md`, `INSTALL-OPENCODE.md`, `MASTER-PROJECT-BOARD.md`, `MCP.md`, `PLATFORM-CAPABILITY-MATRIX.md`, `PROMPT-GUIDELINES.md`, `QUICK-START.md`, `RELEASE-NOTES.md`, `ROADMAP.md`, `RULES.md`, `TROUBLESHOOTING.md`, `UPGRADE-GUIDE.md`, `USAGE.md`) moved into `docs/` alongside the existing reference docs there.
- `shared/`, `adapters/`, `ci/`, `install/`, `repo-template/`, `templates/`, `tools/`, `docs/` all promoted to root as direct children.
- All internal cross-references repo-wide updated to match (relative-link depth recalculated, `enterprise-ai-platform/` path prefixes stripped, `cd D:\enterprise-ai-platform\enterprise-ai-platform` → `cd D:\enterprise-ai-platform`).
- `context/`, `.env.example`, `.gitignore`, `Enterprise_AI_Platform_User_Guide.docx`, `usage-instructions.md`, `prompt-guide.md` were already at the true root and are untouched.
- **Newly found during this pass, not fixed:** top-level `templates/` (2 files) is a leftover subset-duplicate of `shared/templates/` (5 files) — `PROJECT-STRUCTURE.md` already called it out as "legacy, do not use" before this pass; it was not deleted here since it wasn't explicitly named for deletion. `.github/copilot-instructions.md` (outer) is a stale, orphaned v3-era file referencing nonexistent paths (`01-Agent-OS/agent-os.md` etc.) — `docs/file-migration-map.md` §1 calls for its deletion but it was likewise left in place, not named explicitly.
- Nothing was committed — this entire flatten is staged/on-disk only (`git add -A` was run to let git detect renames; no `git commit`).
- **Medium:** `shared/schemas/audit-schema.json` phase comment corrected.

**Not fixed — see Open Operational Items above:** full `install/.github/` cleanup beyond `standards/`, `usage-instructions.md` reconciliation with the newer `INSTALL-*.md` guides, `migration-intelligence.md` phantom-command risk.

---

## References

- `CHANGELOG.md` — complete version history
- `ROADMAP.md` — what is next
- `docs/phase-dod.md` — per-phase acceptance criteria and validation commands
- `docs/file-migration-map.md` — the Sprint 1 restructuring plan (partially executed — see Open Items)
- `IMPLEMENTATION-LOG.md` — engineering decisions and rationale
- `GOVERNANCE.md` — command lifecycle, approval gate, security escalation
