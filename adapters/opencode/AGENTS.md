<!-- SOURCE for AGENTS.md — vendored into each repo by adapters/opencode/install.ps1.
     The block between the contract:start/end markers is replaced by the installer on each install.
     Content outside the markers (repo profile section) is preserved. -->

<!-- enterprise-ai-platform:contract:start -->
# Enterprise AI Platform v4 — Agent Instructions (OpenCode)

This repo uses the Enterprise AI Platform. The single source of rules is the vendored
contract at `.opencode/ai-platform/shared/contract.md` — **read it and follow it** for any
non-trivial task. Standards live under `.opencode/ai-platform/standards/` and are read
**lazily**, scoped to the language of the change set (never all at once).

## Operating rules (summary — contract is authoritative)
- One reasoning pass. No agent chains. Deterministic discovery; never scan the repository.
- Hunks not files; signatures not bodies; depth-1 dependency expansion by default.
- Two mandatory gates before "done": completeness (contract §7) AND regression (contract §8).
- Risk gate (contract §9): DB/Flyway/permissions/security/billing/patient-data → ask before applying.
- Read-only by default. Never push, merge, or modify GitLab/Redmine/DB through tools.

## Available commands
Invoke with the command name as the first word of your message:
`bug-fix`, `migration`, `new-development`, `data-correction`, `ui-design-update`, `test`, `prompt-audit`

Full definitions: `.opencode/ai-platform/shared/commands/<name>.md`
<!-- enterprise-ai-platform:contract:end -->

## Repo profile
<!-- Customize this section per repo. It is preserved across platform updates. -->
Module boundaries and shared packages are declared in `.opencode/ai-platform/REPO.md`.
