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
| Primary language | Java (Spring Boot) + Angular; Flutter (Dart) for mobile |
| Compliance | HIPAA-adjacent (patient data handled — see AI_SECURITY.md per repo) |

## Platform Defaults (override per-repo in AI_PROJECT.md)

| Setting | Default |
|---|---|
| Approval gate | Required (auto=true opt-in) |
| MCP servers | gitlab-reader, redmine-reader, canary_mongo_db, postgres-reader, knowledge-graph (optional — see `shared/mcp/knowledge-graph-setup.md`) |
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
- `lib/features/<feature>/` (Flutter apps) — feature-first module; presentation/, Bloc, repository per feature

## Company-Wide Banned Patterns

Patterns that must never be introduced in any Lifetrenz repo:
- Raw SQL strings in service or controller layers
- `System.out.println` or `System.err.println` (use SLF4J logger)
- `@SuppressWarnings("unchecked")` without explanation comment
- Hardcoded environment-specific URLs or credentials

## Security Contact

Platform security issues: preetham.nd@lifetrenz.com
See GOVERNANCE.md §4 for the full escalation procedure.

## Custom Flow & Architecture Knowledge

`shared/knowledge/` holds Lifetrenz-specific reference material — company
domain knowledge, not generic platform standards. Load only the file(s)
relevant to the task at hand (same lazy-loading discipline as §5 standards);
never bulk-load this directory.

| Topic | Path | Covers |
|---|---|---|
| BOM (Bill of Materials) | `shared/knowledge/custom-flows/bom/` | Functionality KB, non-stock indent consumption, stock reduction, adding BOM to bill, casesheet/OPD clinical integration |
| Pagination & global filter | `shared/knowledge/custom-flows/pagination-global-filter/` | Global filter/search architecture, pagination architecture |
| Upload framework | `shared/knowledge/custom-flows/upload/` | Core upload framework architecture, RCM new-upload knowledge |
| Architecture reference | `shared/knowledge/architecture/` | Service map, dependencies, environments/promotion flow, project list, Redmine (projects/status-workflow/MR-tracking), saga tracing |

A task touching one of these domains (e.g. a BOM feature, a new paginated list) should read the
matching file(s) here **in addition to** the usual `shared/standards/` layer files — this is
domain knowledge, standards are code-shape knowledge; both apply together.

**Procedural resources have moved to `shared/skills/`** (how-to content, not domain facts) —
notably `abdm-integration-backend`/`abdm-integration-frontend` (ABDM work) and
`running-locally-skill` (running the app locally). These are discovered automatically by
Claude Code/OpenCode's own skill scanner; no entry in this table is needed for them.

---
<!-- SEAM NOTE (F10):
     Generic platform core lives in: shared/contract.md, shared/standards/, shared/rules/,
     shared/commands/, shared/prompts/, shared/templates/
     Company profile lives in: THIS FILE (shared/company-profile.md)
     Company domain/architecture knowledge lives in: shared/knowledge/ (see table above)
     Per-repo profile lives in: .ai/AI_PROJECT.md, .ai/AI_ARCHITECTURE.md, etc.
     The AI loads THIS file once per session when a Lifetrenz repo context is active.
     Installers for other companies would replace this file (and shared/knowledge/)
     with their own profile/domain knowledge.
     This is the F10 extensibility seam — the platform is portable. -->
