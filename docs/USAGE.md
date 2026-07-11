# Usage Guide — Enterprise AI Platform

**Version:** v4.3.0

This guide covers day-to-day usage of the platform: how to start a session, pick a command, write an effective prompt, respond to the approval gate, and know when to stop.

---

## Starting a Session

### Claude Code (primary)

Open your repo in Claude Code. The contract is loaded automatically from `~/.claude/CLAUDE.md`. No per-session setup required.

Verify the contract is active:
```
/bug-fix
```
The pre-flight block should appear. If you see `contract_hash_status: ok`, the contract is loaded and verified.

### Copilot

In VS Code, open the Copilot Chat panel. Use the chat mode switcher to select a platform chatmode:
- **Bug Fix** (`bug-fix.chatmode.md`)
- **Migration** (`migration.chatmode.md`)

Or use prompt files via `@workspace /bug-fix`.

### OpenCode

Run OpenCode in your repo root. The `AGENTS.md` file is injected automatically as system context. Use command files: `/opencode bug-fix`, `/opencode migration`.

---

## Choosing a Command

| Task | Command |
|---|---|
| Defect reported in Redmine | `/bug-fix redmine=<id>` |
| Error in production logs | `/bug-fix` (paste stack trace) |
| MR contains a bug | `/bug-fix mr=!<n>` |
| Implement a new story | `/new-development redmine=<id>` |
| Port changes to another branch | `/migration branch=<b> target=<t> mode=exact` |
| Reimplement a feature on another branch | `/migration branch=<b> target=<t> mode=functionality` |
| DB data needs correcting | `/data-correction redmine=<id>` |
| Angular or Flutter UI changes from spec | `/ui-design-update redmine=<id>` |
| Generate tests for a change | `/test mr=!<n>` |
| Score and improve a prompt | `/prompt-audit` |

---

## Writing an Effective Prompt

Use the CRISP framework — five fields that eliminate discovery waste:

```
Context : <system> | <Redmine ID or MR !number> | <file or class if known>
Role    : <fix | implement | migrate | review | test>
Intent  : <what must be true when done>
Scope   : IN: <layers affected> | OUT: <explicit exclusions>
Precision: <stack trace | error | failing test | expected vs actual>
```

Then run the command:

```
Context : PatientService | Redmine #4821 | PatientServiceImpl.java:findByNhsNumber
Role    : fix
Intent  : findByNhsNumber must return Optional.empty() when patient is inactive
Scope   : IN: PatientServiceImpl, PatientRepository | OUT: controllers, DTOs
Precision: NPE at PatientServiceImpl.java:142; patient.getStatus() is null for legacy records

/bug-fix redmine=4821
```

See [PROMPT-GUIDELINES.md](PROMPT-GUIDELINES.md) for the full guide and examples.

---

## The Pre-Flight Block

Before making any changes, the AI displays a pre-flight block:

```
Token estimate : ~2,800 tokens
Risk           : Medium (service layer change)
Confidence     : 87%
Missing context: None
Plan           : [1] Read PatientServiceImpl [2] Read repository [3] Apply fix [4] Gate A+B
Expected output: Patch to PatientServiceImpl.java:142 + test update
```

**What to check:**
- If confidence is below 70%, improve the prompt with more Precision before approving
- If missing context is listed, provide it (attach a screenshot, paste an error log)
- If the plan includes layers you didn't intend to touch, narrow the Scope

---

## The Approval Gate

After Discovery & Analysis, the AI presents its plan and waits:

```
Phase 1 complete. Proposed changes:
  • MODIFY  PatientServiceImpl.java:142 — null check before getStatus()
  • MODIFY  PatientServiceImplTest.java — add inactive patient test case

Risk     : Medium
Gate A   : All layers present (Service + Test)
Gate B   : No existing tests broken

Approve? [approve / yes / proceed | reject | narrow scope]
```

**Respond with:**
- `approve` / `yes` / `proceed` — execute the plan
- `reject` — cancel; provide a revised prompt
- `narrow scope` or any clarification — AI will adjust and re-present

**Skip the gate** by adding `auto=true` to the command. Use only for well-understood, low-risk tasks.

---

## High-Risk Tasks

Certain changes cannot be auto-approved. The AI stops and requests explicit approval for:

- DB schema changes (Flyway migrations)
- Permission or role changes
- Authentication or session flow changes
- Billing, financial, or patient data changes

If the AI surfaces a high-risk item mid-task, do not override. Review carefully before proceeding.

---

## The Pause Turn Cap (G16)

The AI must pause and check with you if, during a single command:
- Cumulative changes exceed **10 files**, OR
- The task has expanded into a **different layer** than originally scoped

This is a safeguard against runaway scope. When you see the pause, review what's been done and whether to continue.

---

## Reading the Execution Summary

After every command, the AI outputs an execution summary:

```
Execution Summary
─────────────────
Changed  : PatientServiceImpl.java (1 hunk), PatientServiceImplTest.java (1 method)
Risk     : Medium
Gate A   : PASS — Service + Test layers present
Gate B   : PASS — existing tests unaffected; no API signature change
Audit    : session=20260707-084512 | command=bug-fix | files=2 | mcp_calls=3
```

**Gate A PASS** means all required layers are present (no missing controller, service, test, etc.).
**Gate B PASS** means no existing behavior was broken.

If either gate shows FAIL, the AI will list what is missing or broken before stopping.

---

## Audit Log

Every session is logged to `.claude/audit/log.jsonl`. Each entry is a JSON object with 21 fields including:

| Field | Value |
|---|---|
| `session_id` | Unique session identifier |
| `command` | Command that ran |
| `contract_hash_status` | `ok` or `mismatch` |
| `gate_a` | `pass` or `fail` |
| `gate_b` | `pass` or `fail` |
| `mcp_calls_count` | Number of MCP tool calls |
| `files_changed` | Number of files modified |

If `contract_hash_status: mismatch` appears in the log, stop immediately and report to the security escalation contact. See [SECURITY.md](SECURITY.md).

---

## Token Budgets

Each command class has a hard token budget. The AI stops and reports when the budget is reached:

| Command | Max files | Token budget |
|---|---|---|
| `/bug-fix` | 10 | ≤6k working |
| `/new-development` | varies | ≤10k (planning), ≤6k (execution) |
| `/ui-design-update` | 5 | ≤8k + image |
| `/migration` (exact) | 15 | ≤12k |
| `/migration` (functionality) | 40 | ≤40k |

If the AI hits a budget limit, it reports what was covered and what remains. This is normal for large tasks — split the work into smaller scoped prompts.

---

## Session Mode (Bug Fix)

`/bug-fix` with no arguments opens a bug-fix session. You can submit multiple bugs and the AI handles them sequentially:

```
Bug Fix Session started. Skill loaded once.

Describe your bug using any of:
  • redmine=<id>           — Redmine issue
  • mr=!<n> or commit=<sha>
  • Paste a stack trace
  • file=<path>
  • Attach a screenshot
  • auto=true              — skip approval gate

Type 'done' to end the session.
```

Standards loaded in the first bug are reused for subsequent bugs in the same session — no re-reads.

---

## What the AI Will Not Do

The platform AI is read-only on external systems by design:

| Blocked action | Why |
|---|---|
| `git push` | Blocked by Bash deny rules in `settings.json` |
| `git commit` | Blocked by Bash deny rules |
| `rm -rf` | Blocked by Bash deny rules |
| Write to database | MCP servers are read-only |
| Merge an MR | No write tools in MCP allowlist |
| Create a Redmine ticket | No write tools in MCP allowlist |

The AI proposes changes; engineers execute them. See [GOVERNANCE.md](GOVERNANCE.md) §2.

---

## References

- [COMMANDS.md](COMMANDS.md) — command reference
- [PROMPT-GUIDELINES.md](PROMPT-GUIDELINES.md) — CRISP framework
- [MCP.md](MCP.md) — MCP servers and tools
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — common problems and fixes
- [SECURITY.md](SECURITY.md) — security policy
- [GOVERNANCE.md](GOVERNANCE.md) — approval gate and escalation
