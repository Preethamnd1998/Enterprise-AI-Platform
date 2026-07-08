# Security Rules
<!-- shared/rules/security.md — v4.1 -->
<!-- Lazy-loaded by the contract when a change touches auth, permissions, secrets, or PII. -->
<!-- Linked from contract §5 (lazy rules loading). Never inlined. -->

## SR-01 — No hardcoded secrets
Never suggest or generate code that contains passwords, API keys, tokens, connection strings,
or any credential as a literal value. Always use `${env:VAR}` (Claude/MCP config),
`${VAR:}` (Spring), or environment-variable injection patterns.

## SR-02 — Read-only MCP by default
All MCP tools must be on the platform allowlist (`shared/mcp/tool-allowlists.md`).
Write-capable MCP operations are blocked. Do not suggest workarounds to this rule.

## SR-03 — No permission bypass
Never suggest code that bypasses `@PreAuthorize`, skips `TokenPayload` claims,
disables CSRF protection, widens CORS beyond its current scope, or removes auth guards.
If a change requires widening permissions, STOP and require explicit human approval.

## SR-04 — Input validation at boundaries
All external input (HTTP request bodies, query parameters, path variables, file uploads,
Kafka messages) must be validated before use. Use the project's established validation
pattern (see `AI_PATTERNS.md`). Never trust unsanitized input inside service or repository layers.

## SR-05 — PII and sensitive data handling
Data classified in `AI_SECURITY.md` as PII or High sensitivity must not be:
- logged in plaintext
- returned in error responses
- stored outside the authorized data store
- transmitted without encryption (no plain HTTP)

## SR-06 — Flyway / schema migrations near PII
Any migration touching a table containing PII (listed in `AI_SECURITY.md`) requires:
- explicit human approval before implementation
- a rollback script paired with the migration
- no destructive drops without a deprecation window

## SR-07 — Injection prevention
SQL: use parameterized queries / JPA named parameters. Never string-concatenate SQL.
NoSQL: use the driver's typed query API. Never interpolate user input into query documents.
LDAP / XML / OS command: treat as injection vectors; sanitize or refuse if avoidable.

## SR-08 — Dependency security
Do not suggest adding a dependency with a known CVE, deprecated status, or no active
maintenance. If a fix requires upgrading a dependency, flag the upgrade for review.
