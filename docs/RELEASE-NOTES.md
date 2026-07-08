# Release Notes — Enterprise AI Platform

Highlights by version. For the full change log, see [CHANGELOG.md](CHANGELOG.md).
For upgrade instructions, see [UPGRADE-GUIDE.md](UPGRADE-GUIDE.md).

---

## v4.3.0 — Rollout & Polish (2026-07-07)

**Theme:** Making the platform deployable at fleet scale and extensible to future tools.

**What's new:**
- **Company profile seam (F10)** — `shared/company-profile.md` separates Lifetrenz-specific configuration from the generic platform core. Installers copy on first install; never overwritten on upgrade.
- **Fleet rollout script** — `tools/rollout-fleet.ps1` with `-DryRun` switch, idempotency check, and dynamic version reading. Supports deploying to all repos in `tools/repos.txt` in one operation.
- **6 future adapter stubs** — Skeleton directories for Cursor, Windsurf, Continue, Cline, Roo Code, and VS Code Agent. Each has a capability map, file map, and evidence gate before promotion.
- **Lazy §15/§16** — Migration Intelligence (§15) and Prompt Quality (§16) moved out of the contract kernel to `shared/commands/migration-intelligence.md` and `shared/prompts/prompt-quality.md`. Loaded lazily; contract body stays lean.
- **Complete documentation** — README, QUICK-START, 3 platform installation guides, COMMANDS, USAGE, MCP, PROMPT-GUIDELINES, RULES, ROADMAP, TROUBLESHOOTING, FAQ, UPGRADE-GUIDE, CONTRIBUTING, SECURITY.

**Breaking changes:** None. All installers are backward compatible.

---

## v4.2.0 — OpenCode Adapter + Pause-Turn Cap

**Theme:** Third active platform adapter; scope control guardrail.

**What's new:**
- **OpenCode adapter** — `adapters/opencode/` with `AGENTS.md` injection, command shells for all 7 commands, and capability map.
- **Pause-turn cap (G16, §17)** — AI must pause at ≥10 file changes or layer expansion within a single turn. Prevents runaway scope.
- **Lazy §15/§16 preparation** — Contract sections refactored in preparation for v4.3 externalization.

---

## v4.1.0 — Command Registry

**Theme:** Single source of truth for all commands; ghost commands eliminated.

**What's new:**
- **`shared/commands/registry.yml`** — all commands registered here; CI `validate-registry` job enforces consistency.
- **Phantom command removal** — `/planning` and `/ui-redesign` removed (they were Copilot chatmodes with no shared implementation — D1/D2 defect fix).
- **`/test` command** — test generation and audit command; available on all three platforms.
- **`/prompt-audit` command** — CRISP-based prompt scoring.
- **CI `no-phantom-commands` job** — prevents new phantom commands.

---

## v4.0.0 — Governance + HITL Matrix

**Theme:** Human-in-the-loop controls and formal governance structure.

**What's new:**
- **HITL matrix** (`docs/hitl-matrix.md`) — 13-row decision table: auto-proceed vs require-approval.
- **`GOVERNANCE.md`** — formal governance document covering: command lifecycle, read-only rule, approval gate, security escalation.
- **Pre-flight block** — 6-signal summary (token estimate, risk, confidence, missing context, plan, expected output) before every command.
- **CRISP framework** — `shared/prompts/crisp.md` — prompt quality template and scoring rubric.

---

## v3.2.0 — Copilot Adapter

**Theme:** Second active platform adapter; Copilot support.

**What's new:**
- **`adapters/copilot/`** — chatmodes, prompt files, and `copilot-instructions.md` for VS Code Copilot Chat.
- **`tools/generate-copilot.ps1`** — generates Copilot shells from `shared/commands/`.
- **CI `no-dup-shared` job** — prevents shared assets from being duplicated into adapters.
- **`docs/copilot-measurement.md`** — measurement plan for Copilot adoption (review scheduled 2026-08-07).

---

## v3.1.0 — Security Hardening

**Theme:** MCP allowlist, contract hash verification, audit logging.

**What's new:**
- **MCP allowlist** — `deny: ["mcp__*"]` + explicit 28-tool `allow[]`. Fails closed. (F4 defect fix from v3.0.)
- **Contract hash-check** — `adapters/claude/hooks/pre-tool-use/hash-check.js` verifies kernel SHA-256 before every tool call.
- **Audit logging** — `adapters/claude/hooks/post-tool-use/audit.js` and `adapters/claude/hooks/stop/audit.js`; schema v1.1 with 21 fields.
- **`${env:}` injection** — all MCP credentials via environment variable references; `.mcp.json` gitignored.
- **CI `contract-hash-verify` job** — drift detection in MRs.

**Security fix:** v3.0 used a denylist (fails open). Any new MCP server tool was automatically allowed until manually denied. v3.1 inverts this to an allowlist (fails closed).

---

## v3.0.0 — Foundation

**Theme:** Initial platform architecture.

**What was delivered:**
- Contract kernel (`shared/contract.md`) with 17 sections
- Claude Code adapter (`adapters/claude/`) with config, hooks, install scripts
- 5 initial commands: `/bug-fix`, `/migration`, `/new-development`, `/data-correction`, `/ui-design-update`
- `shared/` directory structure: commands, standards, templates, rules, prompts, mcp
- Initial coding standards (backend layers + frontend topics)

**Known issues fixed in v3.1:**
- F4: MCP denylist (fails open) → fixed with allowlist in v3.1
- D1/D2: Phantom commands `/planning` and `/ui-redesign` → removed in v4.1

---

## References

- [CHANGELOG.md](CHANGELOG.md) — full change log with all tasks and stories
- [UPGRADE-GUIDE.md](UPGRADE-GUIDE.md) — step-by-step upgrade instructions
- [ROADMAP.md](ROADMAP.md) — what's next
