# Audit & Metrics (Week 3)

No external infra. Audit is one JSONL file per repo; metrics are computed from it.

## 1. Audit log structure — `.claude/audit/log.jsonl`
One JSON object per task (append-only). Schema:
```json
{
  "ts": "2026-06-03T10:22:11Z",
  "exec_id": "EXEC-2026-06-03-001",
  "command": "migration",
  "mode": "functionality",
  "agent": "Migration",
  "input": { "redmine": "12345", "mr": "!8456", "target": "release/2.4" },
  "mcp": { "servers": ["redmine-reader","gitlab-reader"], "calls": 9 },
  "files": { "read": 12, "modified": 3, "created": 2 },
  "discovery": { "changed_files": 7, "hunks": 14, "scanned_repo": false },
  "expansion": { "depth": 1, "rounds": 2, "capability_files": 11 },
  "validation": { "completeness": "PASS", "regression": "PASS", "gaps": [] },
  "risk_class": "Medium",
  "tokens": { "input": 38000, "output": 4200, "cache_read": 31000 },
  "latency_ms": { "discovery": 2100, "total": 9400 },
  "outcome": "PASS",
  "followup": false
}
```

## 2. Metrics schema (derived fields)
| Field | Source | Type |
|---|---|---|
| command, mode, agent | record | dimension |
| tokens.total | input+output | number |
| cache_hit_ratio | cache_read ÷ (input) | ratio |
| mcp_calls | mcp.calls | number |
| files_touched | modified+created | number |
| completeness_pass | validation.completeness == PASS | bool |
| regression_pass | validation.regression == PASS | bool |
| planning_latency_ms | latency_ms.discovery (planning) | number |
| repo_scanned | discovery.scanned_repo | bool (must be false) |

## 3. Token tracking
- Per task: `tokens.total` and `cache_read`. Target `cache_hit_ratio > 0.80` (stable contract+standards prefix).
- Roll up weekly: median tokens/command vs the budgets below. Alert if median > budget for 3 consecutive tasks.

## 4. Latency tracking
- `latency_ms.discovery` (input → change set) and `latency_ms.total`.
- Targets: discovery < 3s; planning total < 5s.

## 5. Success metrics
| Metric | Definition | Target |
|---|---|---|
| Both-gates pass rate | completeness AND regression PASS ÷ tasks | > 90% |
| Regression failure rate | regression FAIL ÷ tasks | < 2% |
| Repo-scan rate | repo_scanned true ÷ tasks | 0% |
| Cache hit ratio | mean | > 80% |
| First-pass success | tasks done with no rework | > 90% |

## 6. Migration completeness metrics
| Metric | Definition | Target |
|---|---|---|
| Completeness pass rate | completeness PASS ÷ migrations | 100% |
| Missing-dependency rate | migrations with a gap ÷ migrations | < 2% |
| Mode mix | exact vs functionality counts | informational |
| Delta efficiency (functionality) | files_modified+created ÷ capability_files | lower is better |
| Migration-caused prod incidents | — | 0 |

## 7. Command performance metrics (per command)
Track median tokens, median total latency, mean mcp_calls, both-gates pass rate.
Review weekly; tune budgets from observed p50/p90.

## 8. Recommended budgets
| Command | Max files | Token budget | MCP calls | Target latency |
|---|---|---|---|---|
| bug-fix | 10 | ≤ 6k working | ≤ 5 | < 5s |
| planning | 5 (structure) | ≤ 10k | ≤ 4 | < 5s |
| ui-redesign | 5 | ≤ 8k + image | ≤ 2 | < 5s |
| migration exact | 15 | ≤ 12k | ≤ 5 | < 6s |
| migration functionality | 40 | ≤ 40k | ≤ 10 | < 12s |

## 9. Optional audit hook (add to `.claude/settings.json` if you want auto-capture)
```json
{
  "hooks": {
    "Stop": [
      { "matcher": "", "hooks": [
        { "type": "command",
          "command": "node .claude/audit/append.js" }
      ]}
    ]
  }
}
```
Keep `append.js` trivial (reads the session summary the agent prints and appends one JSONL
line). If you prefer zero hooks, the contract already instructs the agent to append the line itself.
