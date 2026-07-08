# HITL Matrix — Human In The Loop
**Version:** 4.2 | **Status:** ACTIVE | **Requirement:** G9/G17  
**No build required** — this is a documentation artifact only.

---

## What Is the HITL Matrix

The HITL (Human In The Loop) matrix defines exactly when the platform AI must stop and
wait for human approval vs when it may proceed autonomously.

This matrix supplements contract §14 (Global Approval Gate) and §9 (Risk Gate) with
explicit, decision-ready criteria for common scenarios. When in doubt: **stop and ask.**

---

## HITL Decision Matrix

| Action type | Risk level | HITL required? | Notes |
|---|---|---|---|
| Read a file / MCP read | LOW | ❌ Auto-proceed | Discovery phase — always permitted |
| Write a test file | LOW | ❌ Auto-proceed after gate approval | Gate approval covers test writes |
| Write a feature file (business logic) | MEDIUM | ✅ After Phase 1 approval | Default approval gate applies |
| Write a controller / API endpoint | MEDIUM | ✅ After Phase 1 approval | API contract must be confirmed |
| Flyway migration — no PII tables | HIGH | ✅ Explicit approval per migration | Each migration file = one approval |
| Flyway migration — PII tables | CRITICAL | ✅ Stop → escalate → approve | Security escalation required (GOVERNANCE §4) |
| Auth / permissions change | CRITICAL | ✅ Stop → escalate → approve | Cannot use auto=true to bypass |
| Billing / financial data change | CRITICAL | ✅ Stop → escalate → approve | Cannot use auto=true to bypass |
| Patient data / PII structure change | CRITICAL | ✅ Stop → escalate → approve | Cannot use auto=true to bypass |
| Delete or rename a file | HIGH | ✅ Explicit approval | Must call out the deletion explicitly |
| MCP write tool (if allowlisted) | HIGH | ✅ Explicit approval per call | Read-only by default; write must be justified |
| Run a script (`auto=true` scope) | MEDIUM | ✅ After Phase 1 approval | Script must be shown before execution |
| Scope expansion beyond original layer | MEDIUM | ✅ Stop → describe drift → approve | Contract §3d scope drift rule |
| Pause-turn threshold exceeded (≥10 changes) | MEDIUM | ✅ Pause and check in | Contract §17 pause_turn cap |
| End of command (done) | LOW | ❌ Final report only | Summary emitted; no approval needed |

**Legend:** ✅ = human must approve · ❌ = may proceed · CRITICAL = security escalation also required

---

## Approval Phrases

The AI accepts these exact phrases as approval to proceed:
`approve` · `yes` · `proceed` · `implement`

Any other response is treated as NOT an approval. If ambiguous, the AI must ask for
clarification before proceeding.

---

## Scope Drift Detection (G9)

The AI must detect when a task expands beyond its declared scope and STOP:

- **bug-fix → investigation:** the fix requires reading more files than the original scope
- **migration → discovery:** the migration reveals unknown dependencies
- **UI change → architecture:** the UI change requires a backend API change

**When drift is detected:**
```text
SCOPE DRIFT DETECTED
Original scope:  <what was declared>
Expanded scope:  <what was discovered>
Additional work: <what would be needed>
Proceed with expanded scope? (approve / no)
```

The AI must NOT silently absorb scope drift. It must surface it and wait for approval.

---

## Usage Hierarchy (G17)

When multiple platforms are available, use this priority order:

| Priority | Platform | When to use |
|---|---|---|
| 1st choice | **Claude Code** | Default for all engineering tasks. Full capability: hooks, audit, hash-check, subagents, memory. |
| 2nd choice | **GitHub Copilot** | When Claude Code is unavailable or engineer is already in VS Code. Degraded: no hooks, no audit. |
| 3rd choice | **OpenCode** | When Claude Code and Copilot are both unavailable, or for terminal-only environments. Degraded: no hooks, no audit, no per-tool MCP control. |

**Do NOT use Copilot or OpenCode for:**
- Security-critical tasks (auth, permissions, PII) — Claude Code only (audit trail required)
- Large migrations (>10 files) — Claude Code only (subagent support needed)
- Tasks requiring the approval gate audit trail — Claude Code only

**Why this hierarchy:**  
Claude Code provides the full security posture (MCP allowlist, contract hash-check,
PostToolUse audit). Copilot and OpenCode have degraded capabilities per their
capability-maps. Sensitive tasks require the full posture.

---

## No-Build Rule

This document is a governance artifact. It does NOT:
- Generate any build output
- Create or modify any CI job
- Require any code change to take effect

Engineers apply this matrix by judgment, supported by the contract's automated gates.
The matrix is authoritative documentation — the contract is the enforcement mechanism.

---

## References

- `GOVERNANCE.md` §3 — Approval gate procedure
- `GOVERNANCE.md` §4 — Security escalation contact
- `shared/contract.md` §9 — Risk gate
- `shared/contract.md` §14 — Global approval gate
- `shared/contract.md` §17 — Pause turn cap (Phase E)
- `adapters/claude/capability-map.yml` — Full Claude capability matrix
- `adapters/copilot/capability-map.yml` — Copilot degraded capabilities
- `adapters/opencode/capability-map.yml` — OpenCode degraded capabilities
