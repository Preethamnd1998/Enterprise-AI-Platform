---
name: audit-skill
description: |
  How auditing works across Lifetrenz and how to add it to any screen/endpoint: the Postgres
  `@Audited` aspect (core-service and ipd-service → `activity_audit` table), the Mongo `@Auditable`
  aspect (ipd-clinical-service → `api_audit_log` collection), the Kafka event audit trail, how old vs
  new data is captured and parsed on BE and UI (including the `previousValue` pattern and per-event
  history reconstruction), how timestamps are stored and displayed across India/Dubai users and
  differently-located databases (UTC storage, zoneless vs `Z` serialization, TimezoneService /
  appDate pipe), and how the UI renders audit (timeline card, history table). Includes copy-ready
  backend and UI templates and a review checklist. MUST be loaded by any agent or developer asked
  to add, change, review or debug auditing / audit log / history / activity log / "who changed
  what" on any Lifetrenz Angular + Spring screen (Postgres or Mongo).
---

# Audit Skill

Reference implementations analysed (verified in source 2026-10-27):

| Area | Reference |
|---|---|
| UI display, settings | `settings` → `lib-clinical-ownership-rule` (timeline card) + `data/clinical-ownership-rule/clinical-ownership-rule-audit.ts` + `common/audit-timestamp.ts` |
| UI display, clinical | `clinical-casesheet` → `app-new-allergy` History tab (table) |
| BE Postgres (core) | `core-service` `core/audit/**` + `ClinicalOwnershipRuleController` |
| BE Postgres (ipd) | `ipd-service` `ipd/billing/{audit,aspect,service/impl}/**` |
| BE Mongo | `ipd-clinical-service` `ipd_clinical/audit/**` + `AllergyController` |

## Pick the mechanism (decide first)

| Situation | Use | Stored in |
|---|---|---|
| Spring service on **Postgres** (core-service, ipd-service, …) – who/what/when for a REST write | `@Audited` (+ old-value fetcher / `previousValue`) | `activity_audit` row |
| Spring service on **Mongo** (ipd-clinical-service) – clinical events | `@Auditable(action, module)` | `api_audit_log` doc |
| Domain event trail (entity lifecycle, search by primary/secondary field) | `LtAuditEventDto` → Kafka `LT_AUDIT_TRIAL_EVENTS` | `core_audit` via `AuditService.saveAuditDetailsInfo` |
| Login/Keycloak events | existing archive batch (UTC scheduler) – do not extend | `keycloak_event_archive` |

A service on a different datastore than the above (new service): copy the closest mechanism; ask before inventing a fourth.

## What every audit row must answer

who (user id, name, role) · what (module, entityType, entityId/Name, action) · when (**UTC instant**) · where (site, customerBusiness, IP) · outcome (SUCCESS/FAILED + error) · before/after (see `reference/old-new-data.md`) · patient context (name, MPI, patientId, encounterId) when clinical.

## Workflow

1. **Classify** service datastore → mechanism (table above). Open `reference/mechanisms.md` for that one.
2. **Annotate the controller method** with the correct attributes (`reference/annotations.md`). Use the templates:
   `templates/postgres-audited.java.tpl` / `templates/mongo-auditable.java.tpl`.
3. **Decide before/after capture** (`reference/old-new-data.md`): DELETE → fetcher bean (core) ; UPDATE → in **core-service** the aspect does **not** capture old
   value for UPDATE → return `previousValue` in the response DTO; in **ipd-service** use `oldValueFetcher`; Mongo → none, rebuild from sequential events.
4. **Expose read API** (Postgres: `/api/v1/audit/activities/entity/{entityType}`; Mongo: `/audit/logs/...`) with pagination
   (see `global-filter-pagination-skill` for the `{data,page}` contract; Mongo audit endpoints use epoch-millis `fromDate/toDate` and a cursor for encounter logs).
5. **UI**: build the message/diff in a pure function (`templates/ui-audit.md.tpl`), render with the timeline card (settings pattern) or history table (clinical pattern)
   (`reference/ui-display.md`). Always format time with the user's effective time zone (`reference/storage-and-timezone.md`).
6. **Verify** with `reference/review-checklist.md`: create/update/delete/failed-call rows, tz in IST and Dubai, no PHI leak in stored bodies.

## Hard rules

- **Audit must never break or slow the business call.** Aspect catches its own exceptions; write is async (`@Async("dbExecutor")` + `REQUIRES_NEW` on Postgres — mandatory because read-only transactions route to the replica) or in a `finally` try/catch (Mongo).
- **Failed business calls must be audited as FAILED**: in controllers return `ApplicationResponse` with status `ERROR` (not `FAILED`) on handled failures — `isResultError()` keys on it; exceptions are caught too.
- **Timestamps are UTC instants.** Never store/emit local wall-clock. Prefer serialising with `Z`/offset. UI never hard-codes an offset (no `+5.5h`).
- **Tenant safety**: old-value fetchers must verify the record belongs to the caller's `customerBusinessId` (see `ClinicalOwnershipRuleAuditFetcher`).
- **PHI/size**: Mongo stores full request/response bodies (cap 500 000 chars) — never audit endpoints that carry secrets/passwords/tokens/documents; opt out or enrich to a curated value.
- Audit annotations go on **controller** methods (the aspect reads `HttpServletRequest`, `@RequestBody`, path vars). Self-invocation / non-proxied calls are not audited.
- Entity types are UPPER_SNAKE constants shared by BE annotation and UI query (e.g. `CLINICAL_OWNERSHIP_RULE`); define once on each side.
- Do not modify shared aspects/DTOs without the High-risk approval gate (they affect every audited endpoint — 832 `@Audited`, 436 `@Auditable` usages).

## Files

| File | What |
|---|---|
| `reference/mechanisms.md` | The three mechanisms end to end, tables, flows, endpoints |
| `reference/annotations.md` | Attribute-by-attribute reference for `@Audited` (core vs ipd) and `@Auditable`; how each is resolved; gotchas |
| `reference/old-new-data.md` | What is stored as old/new per mechanism; BE enrichment; UI parsing/diff recipes |
| `reference/storage-and-timezone.md` | Column types, JVM/Hibernate zones, serialization per service, UI time-zone stack, India/Dubai handling, known bugs |
| `reference/ui-display.md` | Timeline card (settings) and history table (clinical) specs, endpoints, refresh timing |
| `reference/review-checklist.md` | Gaps found in source + test script |
| `templates/postgres-audited.java.tpl`, `templates/mongo-auditable.java.tpl`, `templates/ui-audit.md.tpl` | copy-ready |
