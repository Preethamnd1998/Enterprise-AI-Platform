# CRISP Prompt Template
<!-- shared/prompts/crisp.md — v4.1 (FT-053) -->
<!--
  CRISP = Context · Role · Intent · Scope · Precision
  Use this template to write high-quality platform prompts.
  The /prompt-audit command evaluates prompts against this framework.
-->

## The CRISP Framework

| Signal | What to include |
|---|---|
| **C — Context** | What is the system, module, or component? Provide identifiers: Redmine ID, MR number, branch name, file path, class name. |
| **R — Role** | What should the AI do? (fix · implement · review · analyze · test · migrate) |
| **I — Intent** | What is the business objective? What should be true after the task is done? |
| **S — Scope** | What is in scope? What is explicitly out of scope? Which layers are affected? |
| **P — Precision** | What evidence exists? (error message, stack trace, failing test, screenshot, expected vs actual behavior) |

## Template (fill in all 5 fields)

```text
Context : <system/module name> | <Redmine ID or MR number or branch name> | <exact file or class if known>
Role    : <fix | implement | review | analyze | test | migrate>
Intent  : <what must be true when done — business outcome, not technical steps>
Scope   : IN: <list of layers / files / components> | OUT: <explicit exclusions>
Precision: <error message | stack trace | failing test | expected vs actual | screenshot path>
```

## Quality Scoring (used by /prompt-audit)

| CRISP field | Missing → impact |
|---|---|
| Context (identifier) | +5k tokens discovery |
| Context (module/file) | +2k tokens search |
| Role | ambiguity → wrong command |
| Intent | wrong success criteria |
| Scope definition | scope creep risk → +3k tokens |
| Precision (evidence) | root cause guessing → +5k tokens |

A prompt with all 5 fields provided scores 90–100 (Excellent). Missing Precision or Context
identifier typically drops a prompt to 50–69 (Moderate) or below.

## Examples

### Excellent (95/100)
```text
Context : PatientService | Redmine #4821 | PatientServiceImpl.java:findByNhsNumber
Role    : fix
Intent  : findByNhsNumber must return Optional.empty() when the patient is inactive, not throw
Scope   : IN: PatientServiceImpl, PatientRepository | OUT: controllers, DTOs, tests (read only)
Precision: NPE in prod logs — PatientServiceImpl.java:142; patient.getStatus() is null for legacy records
```

### Poor (35/100)
```text
Context : backend service
Role    : fix bug
Intent  : it should work
Scope   : not sure
Precision: something crashes
```

## How to Use CRISP

1. Before invoking any platform command, fill in the 5 CRISP fields.
2. Paste the filled template as the first line(s) of your prompt.
3. Follow it with the command: `/bug-fix`, `/new-development`, etc.
4. The `/prompt-audit` command will score your prompt and suggest improvements.
