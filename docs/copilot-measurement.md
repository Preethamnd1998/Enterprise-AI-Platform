# Copilot 30-Day Usage Measurement
**Status:** IN PROGRESS — measurement window open, evidence due 2026-08-07  
**Start date:** 2026-07-07 (Phase E — FT-066)  
**Decision gate:** C3 — Copilot adoption evidence required before Sprint 7+ Copilot investment  
**Review date:** 2026-08-07 (30 days from start)

**RC1 relevance:** This gate governs *future* Copilot investment (Sprint 7+ chatmode
expansion), not the v4.3.0 release. It is independent of, and does not block, RC1 — the
Phase A commands are supported on Copilot today, `/prompt-audit` was completed in the
v4.3.0 hardening pass, and `/test` is explicitly deferred on Copilot (see
`adapters/copilot/capability-map.yml` cap-06, `shared/commands/registry.yml`). The TODOs
below are placeholders for data that does not exist until the 30-day window closes — they
are expected to remain unfilled until 2026-08-07, not a defect.

---

## Purpose

The C3 decision criterion requires 30 days of Copilot usage evidence before the team commits
to further Copilot-specific investment (new command types, chatmode expansion, etc.).

This document records:
1. What is being measured
2. How it is measured (given Copilot has no hook API)
3. What thresholds trigger continued vs suspended Copilot investment

---

## What Is Measured

| Metric | Target | Measurement method |
|---|---|---|
| Copilot command invocations/week | ≥ 5 per engineer | GitHub Copilot usage analytics |
| Active platform commands used | ≥ 3 distinct commands used | Manual tracking spreadsheet |
| Engineer satisfaction | ≥ 3/5 average | Brief Slack poll at 30 days |
| Prompt quality trend | Improving (CRISP score ≥ 60 avg) | `/prompt-audit session=true` output |

---

## How to Measure (Copilot has no hook API)

SP-03 confirmed Copilot has no hook/event API equivalent to Claude Code's PostToolUse/Stop
hooks. The Claude Code adapter's `audit.js` does NOT fire for Copilot sessions.

**Measurement mechanisms available:**

### 1. GitHub Copilot Usage Analytics (primary)
If the organisation uses GitHub Enterprise (Teams or Enterprise Cloud), GitHub provides
per-seat Copilot usage data at:
`github.com/organizations/<org>/settings/copilot/usage`

This shows: active users, suggestion acceptance rate, and chat usage counts.

**Action required:** Platform Engineer must enable usage analytics for the organisation
and export the report at 30 days. Screenshot or CSV to be added to this file as evidence.

### 2. Manual tracking log (secondary)
Engineers record Copilot command usage in the table below (daily, optional):

| Date | Engineer | Command used | Notes |
|---|---|---|---|
| TODO | TODO | TODO | TODO |

### 3. Prompt audit spot-check (tertiary)
At the 30-day mark, each engineer runs `/prompt-audit session=true` in their most recent
Copilot session and pastes the session rollup output into this document.

---

## Decision Criteria at 30 Days

| Outcome | Criteria | Action |
|---|---|---|
| **Continue investment** | ≥ 3 engineers actively using ≥ 3 commands per week | Proceed with Sprint 7 Copilot chatmode expansion |
| **Maintain — no expansion** | Usage exists but below threshold | Keep current Copilot adapter; no new Sprint 7 Copilot work |
| **Suspend Copilot investment** | 0–1 engineers using Copilot commands | Redirect Sprint 7 budget to Claude Code or OC expansion |

---

## Evidence Slot

Paste evidence here at the 30-day review (2026-08-07):

```
GitHub Copilot usage export: TODO [FT-066] — due 2026-08-07
Manual tracking summary:     TODO [FT-066] — due 2026-08-07
Prompt audit rollup scores:  TODO [FT-066] — due 2026-08-07
Decision:                    TODO [FT-066] — approved by: TODO — due 2026-08-07
```

---

## Measurement ownership

**Owner:** preetham.nd@lifetrenz.com  
**Review meeting:** 2026-08-07 (or nearest working day)  
**Reference:** FT-066 (Copilot 30-day measurement hook), EP-15, C3 decision criterion
