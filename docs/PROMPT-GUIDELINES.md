# Prompt Guidelines — Enterprise AI Platform

**Version:** v4.3.0 | **Framework:** CRISP | **Source:** `shared/prompts/crisp.md`

Good prompts produce correct, efficient, on-budget AI work. Poor prompts waste tokens on discovery, produce wrong scope, and require multiple correction turns.

---

## The CRISP Framework

Every effective platform prompt provides five signals:

| Signal | What to include | Missing → impact |
|---|---|---|
| **C — Context** | System/module name, Redmine ID, MR number, branch, file path, class name | +5k tokens discovery |
| **R — Role** | What the AI should do: fix · implement · review · analyze · test · migrate | Ambiguity → wrong command |
| **I — Intent** | Business outcome — what must be true when done | Wrong success criteria |
| **S — Scope** | What is IN scope; what is explicitly OUT of scope; which layers | Scope creep → +3k tokens |
| **P — Precision** | Evidence: error message, stack trace, failing test, expected vs actual, screenshot | Root cause guessing → +5k tokens |

---

## Template

Copy, fill in all 5 fields, then paste before your command:

```text
Context : <system/module name> | <Redmine ID or MR !number or branch> | <file or class if known>
Role    : <fix | implement | review | analyze | test | migrate>
Intent  : <what must be true when done — business outcome>
Scope   : IN: <layers / files / components> | OUT: <explicit exclusions>
Precision: <error message | stack trace | failing test | expected vs actual | screenshot>
```

---

## Quality Scores

The `/prompt-audit` command evaluates your prompt and returns a score:

| Score | Rating | What it means |
|---|---|---|
| 90–100 | Excellent | All 5 CRISP fields present; no wasted tokens |
| 70–89 | Good | Minor gaps; AI may ask one clarifying question |
| 50–69 | Moderate | Missing Precision or Context; +5k token overhead |
| 30–49 | Poor | Multiple gaps; AI likely to go in wrong direction |
| 0–29 | Unusable | No actionable signal; discovery will fail |

---

## Examples

### Excellent prompt (95/100)

```text
Context  : PatientService | Redmine #4821 | PatientServiceImpl.java:findByNhsNumber
Role     : fix
Intent   : findByNhsNumber must return Optional.empty() when patient is inactive, not throw
Scope    : IN: PatientServiceImpl, PatientRepository | OUT: controllers, DTOs, tests (read only)
Precision: NPE in prod logs — PatientServiceImpl.java:142; patient.getStatus() is null for legacy records

/bug-fix redmine=4821
```

### Good prompt (75/100)

```text
Context  : Appointment module | MR !342
Role     : review
Intent   : Verify the appointment cancellation fix is complete across all layers
Scope    : IN: all files in MR !342 | OUT: unrelated modules
Precision: MR description has the acceptance criteria

/bug-fix mr=!342
```

### Poor prompt (25/100)

```text
/bug-fix the patient service is broken
```

_Problems: No identifier, no file, no error message, no scope, vague intent. AI will spend 5k+ tokens just finding the relevant code._

---

## Command-Specific Guidance

### /bug-fix

- Always provide a Redmine ID or MR number when one exists
- Paste the stack trace or error message as Precision
- State which behavior should change (not just "it's broken")
- If attaching a screenshot, invoke `/bug-fix` immediately after — context is in the image

### /migration

- Specify `mode=exact` or `mode=functionality` — they have very different behaviors
- Always specify `target=<branch>` — never let the AI guess the target
- For `functionality` mode: explain the business reason for the migration in Intent

### /new-development

- Include the Redmine story ID for full acceptance criteria
- Scope must list which layers are expected (controller/service/repo/entity/DTO/migration)
- If there's a UI component: attach the wireframe or Figma export as a screenshot

### /data-correction

- Precision must include: table name, row count estimate, condition (WHERE clause), and what value changes to what
- Intent must include: why this is a valid correction (ticket reference)
- Scope must exclude: anything not required for this correction

### /prompt-audit

- Paste your full prompt, including CRISP fields if you have them
- The command returns: score, field-by-field breakdown, revised version

---

## Common Mistakes

| Mistake | Why it's costly | Fix |
|---|---|---|
| No Redmine ID when one exists | AI fetches generic context instead of ticket | Always include `redmine=<id>` |
| "The service is broken" as Intent | AI guesses the expected behavior | State the specific expected outcome |
| No Scope exclusions | AI expands into adjacent layers | Always include `OUT:` in Scope |
| Screenshot without Context | AI cannot identify the module | Include system name + module before screenshot |
| Too much context | AI reads irrelevant history; token waste | Be specific, not exhaustive |

---

## Pre-Flight Block

The platform displays a pre-flight block before every command execution:

```
Token estimate : ~3,200 tokens
Risk           : Medium (service layer change, no DB/auth)
Confidence     : 87% (stack trace + file identified)
Missing context: None
Plan           : [1] Read PatientServiceImpl.java [2] Read test [3] Apply fix [4] Gate A+B
Expected output: Patch to PatientServiceImpl.java:142; test update
```

If the confidence is below 70% or missing context is listed, improve the prompt before approving.

---

## References

- `shared/prompts/crisp.md` — CRISP template source
- `shared/prompts/prompt-quality.md` — scoring rubric used by `/prompt-audit`
- `COMMANDS.md` — command reference
- `shared/commands/prompt-audit.md` — `/prompt-audit` command implementation
