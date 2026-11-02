# The Audit Mechanisms (verified)

## A. Postgres activity audit — `@Audited`

Two parallel copies of the same design (annotation + aspect + service), not a shared library:

| | core-service | ipd-service |
|---|---|---|
| Annotation | `com.lifetrenz.lths.core.audit.annotation.Audited` | `com.lifetrenz.lths.ipd.billing.audit.annotation.Audited` |
| Aspect | `core/audit/aspect/ActivityAuditAspect` (1399 lines) | `ipd/billing/aspect/ActivityAuditAspect` (1157 lines) |
| Writer | `core/audit/service/Impl/ActivityAuditServiceImpl.logActivity` | `ipd/billing/service/impl/ActivityAuditServiceImpl.logActivity` |
| Entity/table | `domain.entity.audit.ActivityAudit` → `activity_audit` | same shape + `request_body`, `encounter_id` |
| Read API | `GET /api/v1/audit/activities/...` (`ActivityAuditController`: `recent`, `user/{id}`, `module/{m}`, `entity/{type}/{id}`, `entity/{type}`, `entity/id/{id}`, `customer-business/{id}`, `site/{id}`, `patient/search`, `audit/by/user/{cb}`, `POST search`, statistics, `activity-audit/download/data`) | `GET /api/v1/audit/activities/...` + `getActivitiesByEncounterId` (cursor) |
| Timestamp out | `yyyy-MM-dd'T'HH:mm:ss` (zoneless) | `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` |

Flow (both):
```
Controller method @Audited ─▶ @Around aspect
  1. LocalDateTime.now() (core: kept only if captureRequestTimestamp=true)
  2. activityType from HTTP verb
  3. [old value captured BEFORE proceed — rules differ, see annotations.md]
  4. proceed()  → result or exception
  5. finally: build ActivityAuditRequest (token user, module, entityType, entityId, patient, IP, UA, session,
        requestUri/params, old/new value, status SUCCESS|FAILED, error, execMs, customerBusinessId, siteId)
  6. activityAuditService.logActivity(req)   @Async("dbExecutor") + @Transactional(REQUIRES_NEW)
  7. any audit exception is logged and swallowed
```
Status: `FAILED` when an exception is thrown **or** `isResultError(result)` (an `ApplicationResponse` whose status is `ERROR`).
User: from `TokenPayload` (`coreUserId`, `preferred_username`, `name`/given+family); `SYSTEM` when no token (ipd) / `system` (core).
Entity type resolution (core): annotation `entityType` → `entityTypeFromRequestBody` field → request identifier → `UNKNOWN`. (ipd: request identifier first, then annotation.)
Entity id resolution: `entityIdFromPathVariable` / `entityIdFromRequestBody` / `entityIdFromRequestParam` / `entityIdFromResponse` / `getId()` on result (unwraps `ApplicationResponse.getData()`).
Patient context: `patientNameFromRequestBody`, `patientMpiFromRequestBody`, or `lookupPatientByEntityId=true` (core, for DELETE without body).
Table indexes (core `activity_audit`): user_id, username, activity_timestamp, module_name, (entity_type, entity_id), activity_type, operation_status, (module_name, activity_timestamp), (customer_business_id, patient_mpi), (customer_business_id, patient_name).

## B. Mongo audit — `@Auditable` (ipd-clinical-service)

```
Controller method @Auditable(action, module[, actionFromField]) ─▶ AuditAspect @Around
  proceed() → capture result / exception
  finally { auditService.save(buildAuditLog(...)) }   (synchronous, wrapped in try/catch)
buildAuditLog: httpMethod + endpoint (from mapping annotations), requestParams (path/query map), requestBody (JSON, ≤500 000 chars),
  responseBody (JSON, ≤500 000), responseStatus, performedBy/performedById (token), customerBusinessId/customerId/siteId,
  patientId, encounterId, patientName, mpi (extracted from request body / lookups), timestamp = new Date(),
  durationMs, success, errorMessage
```
Collection `api_audit_log` (`AuditLog`): indexes on `module`, `customerBusinessId`, `patientId`, `encounterId`, `timestamp`; compound `idx_cbid_timestamp {customerBusinessId:1, timestamp:-1}`.
**No old value is stored.** History is reconstructed from the sequence of events.

Read API (`AuditController`, `/audit`): `/logs`, `/logs/by-module`, `/logs/by-action` (paged; `fromDate/toDate` **epoch millis**), `/logs/by-date-range`,
`/logs/allergy-history`, `/logs/clinical-history` (generic: `module, patientId, customerBusinessId, siteId, [encounterId, fromDate, toDate, physicianId, phySpecIdentifier]`),
`/logs/consult-audit-timeline`, encounter logs via cursor (`AuditLogCursorPage<AuditLogResponse>`, `activityTimestamp` is `Instant`).
Module-specific shaping lives in `AuditServiceImpl` (`mapToAllergyAuditDTO`, `mapToGenericClinicalAuditDTO[List]`, batch split `createAuditLogForBatchItem`).

## C. Event audit trail (Kafka)

`AuditService.addtoAudit(LtAuditEventDto, CustomerTransactionAttribute)` (core `AuditServiceImpl`, ipd `OPDAuditServiceImpl`) publishes to topic
`KafkaTopics.LT_AUDIT_TRIAL_EVENTS` (ipd falls back to saving a `MessageEvent` as `FAILED_ON_PUBLISH`; core swallows the exception — silent loss).
Consumer persists via `saveAuditDetailsInfo(CoreAuditDto, cta)` → `CoreAudit(cta, requestbody, coreEvent, EventAction, primarysearchfield, secondarysearchfield, entityId, entityType)`.
Read: `getDetails(pageSize, pageNo, sortBy, entitytype, customerBusinessId, siteId, isGetAll, fromDate, toDate)` → `CoreAuditPagedData{data, page:PageDTO}`; `getEntityDetails(entityId, cb)`.
`AuditEntityType` enum: PATIENT, SETTINGS, CUSTOMER_MASTER, EQUIPMENT, REASON, UOM, CUSTOMER_BUSINESS_SITE.

## D. Choosing between A/B/C for new work

- Default **A** (Postgres) or **B** (Mongo) — annotation on the controller, zero business-code changes.
- **C** only when the domain needs a searchable event trail independent of HTTP (batch jobs, Kafka consumers).
- Never write audit rows by hand from services except through these writers.
