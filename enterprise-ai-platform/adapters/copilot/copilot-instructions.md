<!-- SOURCE for .github/copilot-instructions.md — vendored into each repo by install-copilot.ps1.
     Keep minimal and stable. The full rules live in the vendored shared contract. -->

# Enterprise AI Platform v3 — Copilot Instructions

This repo uses the Enterprise AI Platform. The single source of rules is the vendored
contract at `.github/ai-platform/shared/contract.md` — **read it and follow it** for any
non-trivial task. Standards live under `.github/ai-platform/standards/` and are read
**lazily**, scoped to the language of the change set (never all at once).

## Operating rules (summary — contract is authoritative)
- One reasoning pass. No agent chains. Deterministic discovery; never scan the repository.
- Hunks not files; signatures not bodies; depth-1 dependency expansion by default.
- Two mandatory gates before "done": completeness (contract §7) AND regression (contract §8).
- Risk gate (contract §9): DB/Flyway/permissions/security/billing/patient-data → ask before applying.
- Read-only by default. Never push, merge, or modify GitLab/Redmine/DB through tools.

## Reusable prompts (Copilot Chat)
Invoke with `/<name>` in Chat: `/planning`, `/bug-fix`, `/migration`, `/ui-redesign`.
(Copilot uses `/` for prompt files; `#` is for context like `#codebase`/`#file`.)

## Repo profile
Module boundaries and shared packages are declared in `.github/ai-platform/REPO.md`.
