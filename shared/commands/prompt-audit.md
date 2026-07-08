# /prompt-audit — Prompt Quality Audit & CRISP Rewrite

**Command:** `/prompt-audit`  
**Phase:** D (v4.1+)  
**Source:** `shared/commands/prompt-audit.md`

---

## Purpose

Evaluate a prompt (or the current session's prompts) for quality, then deliver:
1. A quality score (0–100) against the CRISP framework
2. Specific improvement suggestions for each missing signal
3. An optimized CRISP rewrite of the prompt
4. An estimated token-impact comparison (before vs after rewrite)

This command is informational only. It never modifies source files or executes tasks.

---

## Invocation

```text
/prompt-audit
/prompt-audit prompt="<paste prompt here>"
/prompt-audit session=true
```

- No arguments: audit the last prompt from the current session.
- `prompt="..."`: audit a specific prompt string.
- `session=true`: audit all prompts from the current session and produce a rollup.

---

## Algorithm (6 phases)

### Phase 1 — Identify target prompt(s)
- If `prompt=` argument provided: use it directly.
- If `session=true`: extract all user prompts from the current session transcript.
- If no arguments: use the immediately preceding user message.
- Confirm the prompt(s) identified before proceeding.

### Phase 2 — CRISP signal extraction
For each prompt, extract the 5 CRISP signals (see `shared/prompts/crisp.md`):
- **C (Context):** system/module name, exact identifier (Redmine ID, MR, branch, file, class)
- **R (Role):** explicit command verb (fix, implement, review, analyze, test, migrate)
- **I (Intent):** business outcome statement
- **S (Scope):** defined in-scope and out-of-scope items
- **P (Precision):** concrete evidence (stack trace, error message, expected vs actual)

Score each signal: Present (full points), Partial (half points), Missing (0 points).

### Phase 3 — Quality scoring
```text
Signal           | Full | Partial | Missing
Context ID       |  20  |   10    |    0
Context location |  15  |    8    |    0
Role             |  15  |    8    |    0
Intent           |  20  |   10    |    0
Scope definition |  15  |    8    |    0
Precision        |  15  |    8    |    0
Total            | 100
```

Apply score band (from contract §16b): 90–100 Excellent · 70–89 Good · 50–69 Moderate ·
30–49 Poor · 0–29 Very Poor.

### Phase 4 — Improvement analysis
For each missing or partial signal, generate a specific, actionable suggestion.
Do not generate generic advice. The suggestion must be tailored to the actual prompt content.

Example: not "add more context" but "add the Redmine ticket ID or MR number that describes
this bug — without it, discovery requires scanning the entire module (~5k tokens extra)."

### Phase 5 — CRISP rewrite
Produce a complete, improved version of the prompt using the CRISP template format.
Preserve the engineer's intent and scope exactly. Do not add assumptions not present
in the original prompt. If a CRISP field cannot be filled without information only the
engineer has, leave it as `<REQUIRED: describe here>` rather than inventing a value.

### Phase 6 — Token impact estimate
Compare the estimated token cost of the original prompt vs the CRISP rewrite.
```text
Original prompt  : ~Xk tokens (Quality: N/100 — <band>)
Rewritten prompt : ~Yk tokens (Quality: N/100 — <band>)
Estimated saving : ~Zk tokens (~N% reduction)
Main driver      : <the single biggest missing signal>
```

---

## Output Format

```text
## Prompt Audit

### Original Prompt
<the prompt being audited>

### CRISP Analysis
| Signal    | Status  | Score | Issue |
|-----------|---------|-------|-------|
| Context   | ...     | N/20  | ...   |
| Role      | ...     | N/15  | ...   |
| Intent    | ...     | N/20  | ...   |
| Scope     | ...     | N/15  | ...   |
| Precision | ...     | N/15  | ...   |
| **Total** |         | **N/100** | **<band>** |

### Improvement Suggestions
1. <signal>: <specific, actionable suggestion>
2. <signal>: <specific, actionable suggestion>
...

### CRISP Rewrite
```text
Context : <filled in>
Role    : <filled in>
Intent  : <filled in>
Scope   : <filled in>
Precision: <filled in>
```

### Token Impact
Original  : ~Xk tokens (N/100 — <band>)
Rewritten : ~Yk tokens (N/100 — <band>)
Saving    : ~Zk tokens (~N%)
Main driver: <missing signal>
```

---

## Session Rollup (session=true)

```text
## Session Prompt Audit

Prompts audited: N
Avg quality    : N/100 (<band>)
Highest        : N/100 — <command that used it>
Lowest         : N/100 — <command that used it>
Most missing   : <top 1-2 signals absent across all prompts>
Est. total saving (if rewrites used): ~Nk tokens
```

---

## Rules

- This command is read-only and informational. It never modifies files.
- Never invent details not present in the original prompt.
- Never shame or criticize. Score measures discovery cost, not engineer skill.
- `<REQUIRED: ...>` placeholders are acceptable in the rewrite — never invent values.
- Token estimates are approximations ± 30%; they are trend indicators, not invoices.
- This command does not require the approval gate (§14) — it is analysis-only.
