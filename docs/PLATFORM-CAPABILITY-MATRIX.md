# Platform Capability Matrix

**Version:** v4.4.0 | **Updated:** 2026-07-13

This document defines what the Enterprise AI Platform can do on each supported platform. Use this matrix to choose the right platform for a given task.

---

## Summary — Active Platforms

| Capability | Claude Code | GitHub Copilot | OpenCode |
|---|---|---|---|
| **Status** | ✅ Full | ✅ Partial | ✅ Partial |
| **Contract kernel** | ✅ `~/.claude/CLAUDE.md` | ✅ `copilot-instructions.md` | ✅ `AGENTS.md` |
| **All 8 commands** | ✅ | ✅ | ✅ |
| **Coding standards** | ✅ Lazy-loaded | ✅ Vendored | ✅ Copied |
| **Rules (4 files)** | ✅ Lazy-loaded | ✅ Vendored | ✅ Copied |
| **MCP read-only tools** | ✅ 28 tools (allowlist) | ⚠️ Credential-only | ⚠️ Credential-only |
| **MCP allowlist enforcement** | ✅ `deny: ["mcp__*"]` | ❌ Not available | ❌ Not available |
| **Hooks (PreToolUse)** | ✅ hash-check.js | ❌ | ❌ |
| **Hooks (PostToolUse)** | ✅ audit.js | ❌ | ❌ |
| **Session audit log** | ✅ `.claude/audit/log.jsonl` | ❌ | ❌ |
| **Contract hash-check** | ✅ | ❌ | ❌ |
| **Subagents (max 3)** | ✅ opt-in `agents=N` | ❌ | ❌ |
| **Approval gate** | ✅ Contract §14 | ✅ Contract §14 | ✅ Contract §14 |
| **auto=true override** | ✅ | ✅ | ✅ |
| **CRISP prompt scoring** | ✅ | ✅ | ✅ |
| **Pre-flight check** | ✅ | ✅ | ✅ |
| **Pause-turn cap (G16)** | ✅ | ✅ | ✅ |
| **Installer** | `install/install-claude.ps1` | `install/install-copilot.ps1` | `adapters/opencode/install.ps1` |
| **Install type** | Global + per-repo | Per-repo (vendored) | Per-repo |
| **Upgrade method** | Re-run installer | Re-run + commit | Re-run + commit |

---

## Command Support by Platform

| Command | Claude Code | GitHub Copilot | OpenCode |
|---|---|---|---|
| `/bug-fix` | ✅ | ✅ chatmode + prompt | ✅ command shell |
| `/migration` | ✅ | ✅ chatmode + prompt | ✅ command shell |
| `/new-development` | ✅ | ✅ chatmode + prompt | ✅ command shell |
| `/data-correction` | ✅ | ✅ chatmode + prompt | ✅ command shell |
| `/ui-design-update` | ✅ | ✅ chatmode + prompt | ✅ command shell |
| `/test` | ✅ | ✅ | ✅ command shell |
| `/prompt-audit` | ✅ | ✅ chatmode + prompt | ✅ command shell |
| `/dev` | ✅ | ✅ chatmode + prompt | ✅ command shell |

---

## Security Posture Comparison

| Security control | Claude Code | GitHub Copilot | OpenCode |
|---|---|---|---|
| **MCP write-tool block** | ✅ Enforced (allowlist) | ⚠️ Credential-level only | ⚠️ Credential-level only |
| **Contract tamper detection** | ✅ hash-check.js hook | ❌ | ❌ |
| **Session audit trail** | ✅ JSONL log, schema v1.1 | ❌ | ❌ |
| **Git push/commit block** | ✅ `Bash(git push*)` deny | ❌ No enforcement | ❌ No enforcement |
| **Flyway migration ask** | ✅ `ask: Edit(db/migration/*)` | ❌ | ❌ |
| **Telemetry fields** | ✅ adapter, user_id, repo, branch, mcp_calls | ❌ | ❌ |

**Risk consequence:** Tasks run on Copilot or OpenCode have no automatic audit trail. For compliance-sensitive changes, use Claude Code and retain the `.claude/audit/log.jsonl`.

---

## Task Routing Recommendations

Use this table to choose the right platform for each task type.

| Task type | Recommended platform | Reason |
|---|---|---|
| Bug fix (non-security) | Claude Code or Copilot | Either works; CC preferred for audit |
| New feature (non-security) | Claude Code or Copilot | Either works |
| Flyway migration (no PII) | **Claude Code only** | audit trail + ask gate required |
| Flyway migration (PII tables) | **Claude Code only** | CRITICAL — security escalation may be required |
| Auth / permissions change | **Claude Code only** | CRITICAL — audit trail mandatory |
| Patient data / PII change | **Claude Code only** | CRITICAL — compliance requires audit |
| UI design update | Claude Code or Copilot | Either works |
| Data correction | Claude Code or Copilot | Either works |
| Test generation | Any platform | All 3 support `/test` |
| Prompt audit | Any platform | All 3 support `/prompt-audit` |
| Large migration (>10 files) | **Claude Code only** | Subagents (agents=N) required |
| Terminal-only environment | OpenCode | When CC/Copilot unavailable |

---

## Future Adapters (Stubs — v4.3)

These platforms have skeleton directories in `adapters/` but are not yet implemented.

| Platform | Directory | Evidence gate | Earliest priority |
|---|---|---|---|
| Cursor | `adapters/cursor/` | `.cursorrules` API confirmed stable | T-B |
| Windsurf | `adapters/windsurf/` | `.windsurfrules` API confirmed stable | T-B |
| Continue | `adapters/continue/` | `customCommands` injection confirmed | T-A |
| Cline | `adapters/cline/` | `.clinerules` API confirmed stable | T-B |
| Roo Code | `adapters/roo-code/` | `.roo/rules/` API confirmed stable | T-A |
| VS Code Agent | `adapters/vscode-agent/` | Evaluate overlap with Copilot first | T-C |

Each stub contains `STUB.md` (evidence gate + planned scope), `capability-map.yml`, and `file-map.yml`. See `adapters/<platform>/STUB.md` for activation criteria.

---

## Capability Detail — Claude Code

**Installation:** Global (`~/.claude/`) + per-repo (`.claude/`)

**How the contract works:**
- Claude Code auto-loads `~/.claude/CLAUDE.md` at the start of every session
- The contract kernel is between `<!-- enterprise-ai-platform:kernel:start/end -->` markers
- The `hash-check.js` PreToolUse hook verifies the kernel hash before the first tool call

**MCP:**
- 28 read-only tools allowlisted across 4 servers
- All unlisted tools denied by `deny: ["mcp__*"]`
- `enableAllProjectMcpServers: false`

**Audit:**
- Every tool use logged to `.claude/audit/log.jsonl` (schema v1.1)
- Session summaries to `.claude/audit/session-summaries.jsonl`
- Telemetry fields: adapter, user_id, repo, branch, mcp_calls_count

---

## Capability Detail — GitHub Copilot

**Installation:** Per-repo vendoring (content copied into `.github/`)

**How the contract works:**
- Copilot reads `.github/copilot-instructions.md` and applies it to every chat session
- The contract kernel is embedded in `copilot-instructions.md`
- No hook API → no hash-check, no audit log

**Commands:**
- 7 chatmode files in `.github/chatmodes/` (dropdown selection)
- 7 prompt files in `.github/prompts/` (@ prefix)
- Both reference the full command specs vendored in `.github/ai-platform/shared/commands/`

**MCP:**
- Read-only enforced at credential level (PAT scopes)
- No allowlist enforcement at the tool-call level
- MCP configured in `.vscode/mcp.json`

---

## Capability Detail — OpenCode

**Installation:** Per-repo (`AGENTS.md` injection + `.opencode/` directory)

**How the contract works:**
- OpenCode reads `AGENTS.md` from repo root as system context
- Contract kernel injected between markers (same pattern as Claude Code)
- Command shells in `.opencode/command/` reference full specs in `.opencode/ai-platform/`
- No hook API → no hash-check, no audit log

**Commands:**
- 7 thin shell files (≤20 lines) in `.opencode/command/`
- Each shell delegates to the full command spec in `.opencode/ai-platform/shared/commands/`

**MCP:**
- Configured in `.opencode/config.json`
- No allowlist enforcement; credential-level read-only required

---

## References

- [docs/hitl-matrix.md](docs/hitl-matrix.md) — When human approval is required per platform
- [GOVERNANCE.md](GOVERNANCE.md) §2 — The read-only rule enforcement details
- `adapters/claude/capability-map.yml` — Claude Code capability detail
- `adapters/copilot/capability-map.yml` — Copilot capability detail
- `adapters/opencode/capability-map.yml` — OpenCode capability detail
- [docs/security.md](docs/security.md) — Security model and threat mitigations
