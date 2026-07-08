# Prompt Quality Assessment (§16 — externalized F11)
<!-- Extracted from shared/contract.md §16 during Phase F (v4.3) lazy kernel refactor.
     Loaded lazily by commands that require prompt scoring. Never bulk-loaded.
     Full CRISP framework and rewrite tool: shared/prompts/crisp.md
     Full /prompt-audit command: shared/commands/prompt-audit.md -->

## 16. Prompt Quality Assessment

Evaluate every user request and append a `Prompt Quality` line to the §13 Execution Summary.
**Purpose:** measure how much discovery work the platform had to perform — not user skill.
A low score means more tokens were consumed on investigation that better input could have avoided.

### 16a. Scoring factors

Positive signals (raise score): exact identifier (Redmine ID / MR / branch / commit / table /
collection) · error evidence (stack trace / logs / screenshot / SQL error) · business context
(expected vs actual behavior) · scope definition (module / component / service / API) ·
reproduction steps · design reference.

Negative signals (lower score): missing issue details · missing scope · missing expected behavior ·
ambiguous request · multiple unrelated objectives · repository-wide instruction
("search all", "analyze everything", "find the issue").

### 16b. Score bands

| Score | Label | Discovery impact |
| ----- | ----- | ---------------- |
| 90–100 | Excellent | Minimal discovery required |
| 70–89 | Good | Minor discovery required |
| 50–69 | Moderate | Several assumptions needed |
| 30–49 | Poor | Large discovery effort required |
| 0–29 | Very Poor | Scope unclear — significant investigation required |

### 16c. Per-task output — included in §13 Execution Summary

```text
Prompt Quality: 86/100 (Good)
Strengths:     Redmine ID · exact module · stack trace
Missing:       Expected behavior
Token impact:  Minor — one assumption needed
```

### 16d. Session rollup — included in §13 Session Summary

```text
Avg Prompt Quality: 74/100
High: 92  Low: 45
Most missing: stack trace · expected behavior
```

### 16e. Token correlation

Report `Prompt Quality` alongside `Estimated Tokens` — this shows engineers which missing inputs drove cost.
Example: Quality 92 → ~3k tokens · Quality 35 → ~18k tokens.

### 16f. Rules

- Never shame or criticize. Never block execution. Score is informational only.
- Execution always continues regardless of score.
- Goal: better prompts → lower token usage → faster execution → less discovery effort.
