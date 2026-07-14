<!-- SOURCE for AGENTS.md — vendored into each repo by adapters/antigravity/install.ps1.
     The block between the contract:start/end markers is replaced by the installer on each install.
     Content outside the markers (repo profile section) is preserved. -->

<!-- enterprise-ai-platform:contract:antigravity:start -->
<!-- enterprise-ai-platform:kernel:start -->
# Enterprise AI Platform v4 — Agent Instructions (Antigravity)

This repo uses the Enterprise AI Platform. The single source of rules is the vendored
contract at `.agents/ai-platform/shared/contract.md` — **read it and follow it** for any
non-trivial task. Standards live under `.agents/ai-platform/standards/` and are read
**lazily**, scoped to the language of the change set (never all at once).

## Operating rules (summary — contract is authoritative)
- One reasoning pass. No agent chains. Deterministic discovery; never scan the repository.
- Hunks not files; signatures not bodies; depth-1 dependency expansion by default.
- Two mandatory gates before "done": completeness (contract §7) AND regression (contract §8).
- Risk gate (contract §9): DB/Flyway/permissions/security/billing/patient-data → ask before applying.
- Read-only by default. Never push, merge, or modify GitLab/Redmine/DB through tools.

## Available commands
Invoke as a slash command: `/bug-fix`, `/migration`, `/new-development`, `/data-correction`,
`/ui-design-update`, `/test`, `/prompt-audit`, `/dev`.
Workflow shells: `.agents/workflows/<name>.md`
Full definitions: `.agents/ai-platform/shared/commands/<name>.md`
<!-- enterprise-ai-platform:kernel:end -->
<!-- enterprise-ai-platform:contract:antigravity:end -->

## Repo profile
<!-- Customize this section per repo. It is preserved across platform updates. -->
Module boundaries and shared packages are declared in `.agents/ai-platform/REPO.md`.
