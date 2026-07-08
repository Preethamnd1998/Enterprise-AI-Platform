# Roadmap — Enterprise AI Platform

**Version:** v4.3.0 | **Status:** All planned phases complete

The Enterprise AI Platform reached its planned architecture milestone (v4.3.0) with the completion of Sprint 6 (Phase F). All six development phases are complete. This document covers what is done, what is pending operationally, and what is being considered for future work.

---

## Completed Phases (v3.0 → v4.3)

| Phase | Version | Theme | Status |
|---|---|---|---|
| A | v3.0 | Foundation — commands, contract, Claude adapter | ✅ Complete |
| B | v3.1 | Security — MCP allowlist, hash-check, audit logging | ✅ Complete |
| C | v3.2 | Platform expansion — Copilot adapter, /test command | ✅ Complete |
| D | v4.0 | Governance — registry, /prompt-audit, HITL matrix | ✅ Complete |
| E | v4.2 | OpenCode adapter, lazy §15/§16, pause-turn cap | ✅ Complete |
| F | v4.3 | Rollout & Polish — company seam, fleet rollout, future stubs | ✅ Complete |

---

## Open Operational Items

These are post-v4.3 operational tasks, not architecture changes.

| Item | Owner | Priority | Notes |
|---|---|---|---|
| Populate `tools/repos.txt` with real GitLab URLs | Team lead | High | Required before running fleet rollout |
| Run fleet rollout canary (1 repo) | Platform Architect | High | Use `rollout-fleet.ps1 -DryRun` first |
| Run fleet rollout full fleet | Platform Architect | High | After canary verification |
| Run red-team tests A, B, C on each engineer machine | Security Lead | High | Documented in `docs/red-team-tests.md` |
| Assign BUG-D2 owner (secrets provisioning gap) | Platform Architect | Medium | Secrets not auto-provisioned for new repos |
| Copilot measurement review | Platform Architect | Medium | Due 2026-08-07; see `docs/copilot-measurement.md` |
| Tag releases v3.1.0 through v4.3.0 in GitLab | Platform Architect | Low | Retrospective tagging for history |
| Create `adapters/claude/capability-map.yml` | Platform team | Low | Referenced by HITL matrix but does not exist |

---

## Future Adapter Activations

Six adapter stubs exist in `adapters/`. Each requires an evidence gate before promotion from STUB to active.

| Adapter | Status | Evidence gate |
|---|---|---|
| `adapters/cursor/` | STUB | 3+ engineers using Cursor; capability gap assessment done |
| `adapters/windsurf/` | STUB | 3+ engineers using Windsurf; Windsurf supports custom agents |
| `adapters/continue/` | STUB | `config.yaml` injection confirmed; 3+ engineers using Continue |
| `adapters/cline/` | STUB | `cline_docs/` injection confirmed; 3+ engineers using Cline |
| `adapters/roo-code/` | STUB | Roo Code custom modes confirmed; 3+ engineers using Roo Code |
| `adapters/vscode-agent/` | STUB | VS Code agent mode GA; participant injection path confirmed |

To activate a stub: meet the evidence gate, implement the adapter following the active adapter pattern (see `adapters/claude/` or `adapters/opencode/`), and open an MR. See `CONTRIBUTING.md` for the full process.

---

## Potential Future Enhancements

These are considerations only. None are planned or scheduled. Architecture changes require a Redmine proposal and Platform Architect approval.

| Idea | Category | Notes |
|---|---|---|
| Additional commands (/review, /diagnose) | Command expansion | Requires 7-step governance process; see `GOVERNANCE.md` §1 |
| Automatic Redmine ticket update on task completion | Write MCP | Currently blocked — MCP is read-only by policy |
| AI-generated PR descriptions | Write MCP | Currently blocked — MCP is read-only by policy |
| Multi-repo change orchestration | Architecture | Significant scope; requires new contract sections |
| Telemetry dashboard | Observability | Build on existing `audit.js` schema v1.1 data |
| Per-module standards extension | Standards | Add `shared/standards/<module>/` alongside existing layers |

---

## Versioning Policy

Versions follow the phase + sprint structure used during development:

- **Patch versions** (x.y.Z): bug fixes, documentation corrections, standards updates
- **Minor versions** (x.Y.0): new commands, new adapter activations, new standards sections
- **Major versions** (X.0.0): architecture changes, contract changes, breaking adapter API changes

The contract kernel SHA-256 (`shared/contract.md.sha256`) must be recomputed any time the contract changes. This is enforced by CI `contract-hash-verify`.

---

## References

- `CHANGELOG.md` — complete version history
- `MASTER-PROJECT-BOARD.md` — sprint and phase DoD records
- `CONTRIBUTING.md` — how to propose and implement changes
- `GOVERNANCE.md` — how new commands are added and governed
- `adapters/*/STUB.md` — evidence gates for future adapters
