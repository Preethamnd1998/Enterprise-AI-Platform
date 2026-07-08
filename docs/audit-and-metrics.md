# Audit & Metrics

**See also:** [`README.md`](../README.md) · [`example-executions.md`](example-executions.md) · [`repo-onboarding.md`](repo-onboarding.md) · [`CONTRIBUTING.md`](../CONTRIBUTING.md)

---

No external infra. Audit is one JSONL file per repo; metrics are computed from it.

## 1. Audit log structure — `.claude/audit/log.jsonl`

One JSON object per task (append-only):

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
  "discovery": { "changed_files": 7, "hunks": 14, "scanned_repo": false, "searches": 8 },
  "expansion": { "depth": 1, "rounds": 2, "capability_files": 11 },
  "validation": { "completeness": "PASS", "regression": "PASS", "gaps": [] },
  "risk_class": "Medium",
  "prompt_quality": { "score": 90, "band": "Excellent", "missing": [] },
  "tokens": { "input": 38000, "output": 4200, "cache_read": 31000 },
  "latency_ms": { "discovery": 2100, "total": 9400 },
  "outcome": "PASS",
  "followup": false
}
```

## 2. Metrics schema (derived fields)

| Field | Source | Type |
| ----- | ------ | ---- |
| command, mode, agent | record | dimension |
| tokens.total | input+output | number |
| cache_hit_ratio | cache_read ÷ input | ratio |
| mcp_calls | mcp.calls | number |
| files_touched | modified+created | number |
| discovery.searches | searches used | number |
| completeness_pass | validation.completeness == PASS | bool |
| regression_pass | validation.regression == PASS | bool |
| repo_scanned | discovery.scanned_repo | bool (must be false) |
| prompt_quality.score | 0–100 | number |

## 3. Token tracking

Per task: `tokens.total` and `cache_read`. Target `cache_hit_ratio > 0.80` (stable contract+standards prefix).
Roll up weekly: median tokens/command vs the budgets below. Alert if median > budget for 3 consecutive tasks.

## 4. Latency tracking

`latency_ms.discovery` (input → change set) and `latency_ms.total`.
Targets: discovery < 3s; planning total < 5s.

## 5. Success metrics

| Metric | Definition | Target |
| ------ | ---------- | ------ |
| Both-gates pass rate | completeness AND regression PASS ÷ tasks | > 90% |
| Regression failure rate | regression FAIL ÷ tasks | < 2% |
| Repo-scan rate | scanned_repo true ÷ tasks | 0% |
| Search budget compliance | searches ≤ max ÷ tasks | 100% |
| Cache hit ratio | mean | > 80% |
| First-pass success | tasks done with no rework | > 90% |
| Avg prompt quality | mean score | > 70 |

## 6. Prompt quality metrics

| Metric | Definition | Target |
| ------ | ---------- | ------ |
| Avg prompt quality score | mean across tasks | > 70/100 |
| Low-quality rate | score < 50 ÷ tasks | < 20% |
| Most common missing | top missing fields from `prompt_quality.missing` | track weekly |
| Quality–token correlation | plot score vs tokens.total | informational |

Track `quality–token correlation` weekly — shows engineers which prompt improvements reduce cost most.

## 7. Migration completeness metrics

| Metric | Definition | Target |
| ------ | ---------- | ------ |
| Completeness pass rate | completeness PASS ÷ migrations | 100% |
| Missing-dependency rate | migrations with a gap ÷ migrations | < 2% |
| Mode mix | exact vs functionality counts | informational |
| Delta efficiency (functionality) | files_modified+created ÷ capability_files | lower is better |
| Migration-caused prod incidents | — | 0 |

## 8. Command performance budgets

| Command | Max files | Max searches | Token budget | MCP calls | Target latency |
| ------- | --------- | ------------ | ------------ | --------- | -------------- |
| bug-fix | 10 | 5 | ≤ 6k working | ≤ 5 | < 5s |
| new-development | 5 (structure) | 5 | ≤ 10k | ≤ 4 | < 5s |
| ui-design-update | 5 | 5 | ≤ 8k + image | ≤ 2 | < 5s |
| migration exact | 15 | 15 | ≤ 12k | ≤ 5 | < 6s |
| migration functionality | 40 | 30 | ≤ 40k | ≤ 10 | < 12s |

Review weekly; tune from observed p50/p90.

## 9. Optional audit hook

```json
{
  "hooks": {
    "Stop": [
      { "matcher": "", "hooks": [
        { "type": "command",
          "command": "node .claude/hooks/audit.js" }
      ]}
    ]
  }
}
```

Keep `audit.js` trivial — reads the session summary the agent prints and appends one JSONL line.
If you prefer zero hooks, the contract already instructs the agent to append the line itself.
