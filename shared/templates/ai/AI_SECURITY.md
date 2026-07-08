# AI_SECURITY — Security Constraints
<!-- Template version: 4.1 | Created by Enterprise AI Platform installer -->
<!-- AI must read this file before any change touching auth, permissions, or data access. -->

## Data Classification
<!-- What data this service handles and its sensitivity level. -->
- TODO: list data types (e.g. Patient PII — Critical, Financial records — High, Audit logs — Medium)

## Access Control Model
<!-- How permissions are enforced. AI must never bypass or weaken these. -->
- TODO: describe model (e.g. RBAC via role claims in TokenPayload, @PreAuthorize("hasRole('ADMIN')"))

## High-Risk Areas (Approval Required Before Change)
<!-- Areas where AI must always STOP and request human approval before implementing. -->
- Authentication flows
- Password / token handling
- Role / permission assignments
- Flyway migrations on tables containing PII
- TODO: add service-specific high-risk areas

## Secrets Policy
<!-- How secrets are handled. AI must never suggest hardcoded secrets. -->
- All secrets via environment variables (${env:VARNAME} or application.properties ${VAR:})
- No secrets in code, comments, or test fixtures
- Rotate immediately if a secret appears in a commit

## Compliance Notes
<!-- Any regulatory constraints (HIPAA, GDPR, etc.) the AI must respect. -->
- TODO: describe compliance requirements if applicable

## Known Security Decisions
<!-- Explicit decisions to preserve (e.g. "no CORS relaxation on /api/admin"). -->
- TODO: none documented
