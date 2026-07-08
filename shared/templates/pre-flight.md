# Pre-Flight Block Template
<!-- shared/templates/pre-flight.md — v4.1 (FT-052 / V-B8) -->
<!--
  The pre-flight block MUST appear at the start of every command's Phase 1 output,
  before the ROOT CAUSE / REQUIREMENT section.
  It surfaces 6 signals that allow the engineer to calibrate trust and catch issues early.
  Do NOT skip the pre-flight block for any command execution.
-->

## Pre-Flight Block (output format)

```text
## Pre-Flight Check
Token estimate : <LOW (≤3k) | MEDIUM (3–10k) | HIGH (10–20k) | VERY HIGH (>20k)>
Risk level     : <LOW | MEDIUM | HIGH | CRITICAL>
Confidence     : <N>% — <one-line reason for confidence level>
Missing context: <"none" | list of items that would improve confidence>
Plan           : <one-sentence summary of what will be done>
Expected output: <one-sentence description of what the output will contain>
```

## Signal Definitions

### 1. Token estimate
Estimated token cost for the full task including discovery, analysis, and (if approved)
execution. Based on change-set size and complexity. Rounded to nearest tier.
- LOW: simple single-file fix, well-scoped
- MEDIUM: multi-file change, standard complexity
- HIGH: cross-module change, migration, or /test with subagents
- VERY HIGH: full migration, large feature, or audit task

### 2. Risk level
Risk to the running system if the change is applied incorrectly.
- LOW: UI-only, docs, comment changes
- MEDIUM: logic changes with good test coverage
- HIGH: API changes, data model changes, permission changes
- CRITICAL: auth/security, Flyway migrations on PII tables, billing/financial data
CRITICAL items trigger the risk gate (contract §9) — stop and request human approval.

### 3. Confidence
Percentage (0–100%) representing how complete the available evidence is.
Formula: (known inputs / required inputs) × 100.
Below 70%: list what is missing in `Missing context`.
Below 50%: recommend the engineer provide additional context before proceeding.

### 4. Missing context
List any inputs that would materially improve the analysis:
- Exact error message / stack trace
- Expected vs actual behavior description
- Exact file path or class name
- Redmine ID or MR number
If nothing is missing, output "none".

### 5. Plan
One sentence describing the intended implementation approach.
No implementation details yet — just what layer(s) will be touched and what the change does.

### 6. Expected output
One sentence describing what the Phase 1 analysis block will contain.
Examples: "A ROOT CAUSE section + 3-part IMPLEMENTATION BREAKDOWN + gate estimates."
"A gap report covering 4 changed files across service and repository layers."
