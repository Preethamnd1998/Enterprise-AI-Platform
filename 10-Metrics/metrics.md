# Platform Metrics (v3)

Measures the effectiveness of the v3 architecture (lazy loading, tool allowlists,
prompt caching, deterministic discovery, dual-mode migration). Replaces the v2 metric
files, which tracked deleted policies, workflows, and the retired agent-chain model.

## Efficiency

| Metric | Definition | Target |
|---|---|---|
| Token usage / task | Total tokens per completed task | Bug ≤ 6k · Plan ≤ 10k · UI ≤ 8k · Migration ≤ 12k (exact) / ≤ 40k (functionality) |
| Cache hit ratio | Cached prefix tokens ÷ total prompt tokens | > 80% |
| MCP tool exposure | Tools visible per agent | ≤ 12 (per `tool-allowlists.md`) |
| MCP calls / task | — | ≤ 10 |
| Planning latency | Input → first plan | < 5s |
| Files opened / task | — | Bug ≤ 10 · Plan ≤ 5 · UI ≤ 5 · Migration ≤ 15 (exact) / ≤ 40 (functionality) |
| Repository-wide scans | Scans ÷ tasks | 0% |

## Quality

| Metric | Definition | Target |
|---|---|---|
| Migration completeness pass rate | Completeness (§7) PASS ÷ migrations | 100% |
| Regression failure rate | Regression (§8) FAIL ÷ tasks | < 2% |
| Missing-dependency rate | Migrations with a missing artifact | < 2% |
| First-pass success | Tasks passing both gates without rework | > 90% |
| Rollback rate | Rollbacks ÷ migrations | < 2% |
| Migration-caused prod incidents | — | 0 |

## How to record

Append one row per task to `11-Audit/` (execution log). Both gates — completeness and
regression — must be logged per task.
