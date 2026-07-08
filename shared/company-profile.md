# Company Profile — Platform Customisation Seam
<!-- shared/company-profile.md — F10 partial (Phase F v4.3)
     This file is the designated seam between the generic platform core and
     company-specific customisations. The platform core (contract, standards, rules,
     commands) never references company internals. All company-specific context
     lives HERE and is loaded lazily by the AI when needed.
     Installers copy this file to consuming repos on first install; they do NOT
     overwrite it on subsequent updates (company content is preserved). -->

## Company Identity

| Field | Value |
|---|---|
| Company name | Lifetrenz |
| Industry | Healthcare technology |
| Primary language | Java (Spring Boot) + Angular |
| Compliance | HIPAA-adjacent (patient data handled — see AI_SECURITY.md per repo) |

## Platform Defaults (override per-repo in AI_PROJECT.md)

| Setting | Default |
|---|---|
| Approval gate | Required (auto=true opt-in) |
| MCP servers | gitlab-reader, redmine-reader, canary_mongo_db, postgres-reader |
| Issue tracker | Redmine (redmine= argument key) |
| Source control | GitLab (mr= argument key) |
| Merge request tool | glab CLI |

## Common Module Boundaries

These module boundaries apply across ALL Lifetrenz repos unless overridden in per-repo
`AI_PROJECT.md`. The AI must not cross these without explicit human approval.

- `com.lifetrenz.<service>.controller` — HTTP layer only
- `com.lifetrenz.<service>.service` — business logic only
- `com.lifetrenz.<service>.repository` — data access only
- `com.lifetrenz.<service>.dto` — data transfer objects (no logic)
- `com.lifetrenz.<service>.entity` — JPA entities (no business logic)

## Company-Wide Banned Patterns

Patterns that must never be introduced in any Lifetrenz repo:
- Raw SQL strings in service or controller layers
- `System.out.println` or `System.err.println` (use SLF4J logger)
- `@SuppressWarnings("unchecked")` without explanation comment
- Hardcoded environment-specific URLs or credentials

## Security Contact

Platform security issues: preetham.nd@lifetrenz.com
See GOVERNANCE.md §4 for the full escalation procedure.

---
<!-- SEAM NOTE (F10):
     Generic platform core lives in: shared/contract.md, shared/standards/, shared/rules/,
     shared/commands/, shared/prompts/, shared/templates/
     Company profile lives in: THIS FILE (shared/company-profile.md)
     Per-repo profile lives in: .ai/AI_PROJECT.md, .ai/AI_ARCHITECTURE.md, etc.
     The AI loads THIS file once per session when a Lifetrenz repo context is active.
     Installers for other companies would replace this file with their own profile.
     This is the F10 extensibility seam — the platform is portable. -->
