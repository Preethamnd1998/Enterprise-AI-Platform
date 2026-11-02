# Annotation Reference

## 1. `@Audited` (Postgres; method-level, runtime)

| Attribute | Default | Meaning | core | ipd |
|---|---|---|---|---|
| `moduleName` | `""` | module label in the row (falls back to `extractModuleName`) | ✔ | ✔ |
| `entityType` | `""` | UPPER_SNAKE entity key (UI queries by this) | ✔ (wins first) | ✔ (request identifier wins first, then this) |
| `entityName` | `""` | human label, e.g. "Clinical Ownership Rule" | ✔ | ✔ |
| `description` | `""` | stored in `comments` | ✔ | ✔ |
| `captureOldValue` | `false` | fetch the "before" state | DELETE only (effective) | PUT/PATCH/POST-named-update (effective) |
| `captureNewValue` | `true` | store serialized result as `newValue` | ✔ | (always stored; or enricher) |
| `oldValueFetcher` | `""` | Spring bean name that returns the entity | required for old value | required |
| `oldValueFetchMethod` | `"findById"` | method on that bean, signature `(Long id)` | ✔ | ✔ |
| `entityIdFromPathVariable` / `…FromRequestBody` / `…FromRequestParam` | `""` | where the id comes from (also used to fetch old value) | ✔ | ✔ |
| `entityIdFromResponse` | `""` | field on response data (create flows) | ✔ | ✔ |
| `patientNameFromRequestBody`, `patientMpiFromRequestBody` | `""` | getter names on request body | ✔ | ✔ |
| `lookupPatientByEntityId` | `false` | resolve patient name/MPI from patient table by entity id (DELETE w/o body) | ✔ | ✔ |
| `entityTypeFromRequestBody` | `""` | take entityType from a body field (e.g. `identifier`) | ✔ | – |
| `captureRequestTimestamp` | `false` | stamp the time on the request thread instead of async writer's `now()` | ✔ | – |
| `enricherBean` | `""` | bean implementing `AuditValueEnricher.buildAuditValue(requestBody, controllerResult)` → curated `newValue` | – | ✔ |

Activity type (core): `POST` → `CREATE`, **unless** request body has non-null `getPatientId()` or `getId()` → `UPDATE`; `PUT/PATCH` → `UPDATE`; `DELETE` → `DELETE`; `GET/other` → `READ`.
ipd: `POST`→CREATE, `PUT/PATCH`→UPDATE, `DELETE`→DELETE, default UPDATE.
⇒ For a "save" endpoint that is a `POST` used for both create and update, make sure the DTO has a non-null `id` on update (core) or the activity type will say CREATE (ipd always says CREATE for POST).

Failure detection: exception, or result is an `ApplicationResponse`-style object whose status is `ERROR`. Return `ERROR` for handled failures.

Typical usages
```java
// create/update (POST) — no old value; new value = response; previous state returned inside response
@Audited(moduleName = "SETTINGS", entityName = "Clinical Ownership Rule", entityType = "CLINICAL_OWNERSHIP_RULE",
         description = "Save clinical ownership rule", entityIdFromRequestBody = "id", entityIdFromResponse = "id")
// delete — old value fetched BEFORE the call by a tenant-checked bean
@Audited(moduleName = "SETTINGS", entityName = "Clinical Ownership Rule", entityType = "CLINICAL_OWNERSHIP_RULE",
         description = "Delete clinical ownership rule", captureOldValue = true,
         oldValueFetcher = "clinicalOwnershipRuleAuditFetcher", oldValueFetchMethod = "findRuleById",
         entityIdFromPathVariable = "id")
```

## 2. `@Auditable` (Mongo; method-level, runtime)

| Attribute | Default | Meaning |
|---|---|---|
| `action` | `""` | label, e.g. `ADD_ALLERGY`, `UPDATE_ALLERGY`, `DELETE_ALLERGY`, `CREATE_SETTINGS` — **UI/BE history code switches on these strings** |
| `module` | `"GENERAL"` | grouping/filter: `ALLERGY`, `SETTINGS`, `EHR`, `PATIENT`… |
| `actionFromField` | `""` | read the action from a `@RequestBody` field (e.g. `eventIdentifier`); `action` is the fallback |

Everything else (endpoint, params, bodies, user, tenant, patient, encounter, duration, success) is derived automatically.
`patientId`/`encounterId`/`patientName`/`mpi` are read from the request body (and looked up for deletes: `AdmissionClinicalStore`, `AdmissionClinicalOrder`, `PatientClinicalStore` repos) — keep those field names stable in DTOs.

## 3. Gotchas (all verified)

1. **core `UPDATE` old value is never captured**: `extractOldValue()` returns `null`; only DELETE with a fetcher captures. Use the `previousValue` pattern (old-new-data.md §2).
2. core `changedFields` is always `null` (column exists, aspect never fills it). Don't rely on it.
3. core `newValue` = response body if the result class name contains `Response` **and** has `getBody()` (ResponseEntity); for `ApplicationResponse` it serialises the whole object (`{status, code, message, data}`) — UI must read `.data`.
4. Annotation on a method whose `@RequestBody` is a `List` or a wrapper: entity-id extraction uses reflection `getId()`; verify `entityId` is not null in the first test row.
5. Aspect uses `RequestContextHolder` — no request ⇒ no audit (`No HTTP request context` warning). Don't annotate internal/scheduled calls.
6. Async writer + UI refresh: row may land after the save response returns. The settings UI refetches after **1000 ms** (`AUDIT_REFRESH_DELAY_MS`). Keep that delay (or poll once) when showing audit directly after a save.
7. Mongo audit write is **synchronous** (in `finally`) — a slow Mongo adds to request latency; keep audited payloads small.
8. Mongo `UPDATE_*` rows hold the *request* only; details of the previous state are not stored.
9. Two different `PageDTO`/page shapes exist (`AuditLogCursorPage` for encounter logs; `Page`/`PageDTO` elsewhere). Follow the endpoint you call.
