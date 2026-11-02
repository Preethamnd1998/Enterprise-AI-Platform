# Old vs New Data — Capture, Storage, Parsing

## 1. What is stored, per mechanism

| | Postgres core | Postgres ipd | Mongo clinical |
|---|---|---|---|
| `oldValue` | JSON of entity **before DELETE** (via fetcher bean); else null | JSON of entity before PUT/PATCH/"update" POST (via fetcher); else null | – (no field) |
| `newValue` | JSON string of the controller result (`ApplicationResponse{status,code,message,data}`), or null if `captureNewValue=false` | `enricherBean` curated object, else raw result JSON | `responseBody` string (the returned event DTO) |
| request | `requestParams` (string) | `requestParams` + `requestBody` | `requestParams` map JSON + `requestBody` JSON |
| diff stored? | `changedFields` column exists, always null | `changedFields` passthrough (null by aspect) | – |
| "before" for UPDATE | **not captured by aspect** → `data.previousValue` pattern | `oldValue` | previous event rows of the same record |

All values are **strings of JSON**; the UI parses them. Parse defensively (`try/catch`, `null` on failure).

## 2. The `previousValue` pattern (core-service UPDATE) — verified in ownership rule

Service loads the entity **before** applying the change, maps it to the same GET DTO, applies, persists, then puts the old DTO inside the result:
```java
OwnershipRuleGetDTO previous = request.getId() == null ? null : OwnershipRuleMapper.toGetDTO(settings); // BEFORE applyRequest
applyRequest(settings, request, cta);
OwnershipRuleGetDTO result = OwnershipRuleMapper.toGetDTO(persist(settings, ...));
result.setPreviousValue(previous);          // DTO has: private OwnershipRuleGetDTO previousValue;
return result;
```
The aspect serialises the response ⇒ `newValue = {"data": {…current…, "previousValue": {…before…}}, …}` and the UI diffs `data.previousValue` vs `data`.
Rules: set `previousValue` **only when updating** (null on create); keep it out of the normal GET payloads (use a DTO field the UI ignores or `@JsonInclude(NON_NULL)`);
do not copy PHI into it beyond what the same GET already returns; `previousValue` must not itself contain `previousValue`.

## 3. UI parsing — settings pattern (`buildOwnershipAuditMessages(log)`)

```
current   = parse(log.newValue).data            // ApplicationResponse → .data
previous  = parse(log.oldValue)                 // DELETE
            ?? current.previousValue            // UPDATE
rule      = current ?? previous
DELETE            → "Deleted <setting> …"
no previous       → "Created <setting> …" + describe(current)
else              → diff(previous, current) → one message per changed field; none → "Saved … (no changes)"
```
Diff rules used: match list items by **identifier**, compare only the business flags, emit human text (`"<Component> Edit owner only"`), never raw JSON.
Skip noise keys when diffing generic objects: `id, siteId, customerId, customerBusinessId, userId, userName, updatedBy, updatedById, updatedOn, createdBy, createdById, createdOn, filePath, iconPath, colorCode, sequence, typeId, parentId, batchNo, itemBatchId, uomId, uomType, uomName, templateId` (the BE excel export uses this exact list: `AUDIT_SKIP_KEYS`).
Row view-model: `{ user: userFullName||username, action: activityType, status: operationStatus, timestamp, errorMessage, messages[] }`.
Failed rows show `user + errorMessage` (or "Operation Failed"), not diff messages.

## 4. UI parsing — clinical pattern (Mongo events; `new-allergy`)

Rows are **events**, not before/after pairs: `{id, action, eventAction ADD|UPDATE|DELETE, performedBy, timestamp, allergyId, allergyName, reactions[], severity, comments, deleteReason, deleteRemarks, …}` built by BE from `requestBody`/`responseBody`:

- `eventAction` ← `responseBody.eventAction`.
- `allergyId` ← `requestParams.id` (UPDATE/DELETE) or `responseBody.id` (HIST/ADD).
- Data ← `requestBody` if present else `responseBody` (DELETE has an empty request body).
- `UPDATE` rows carry no detail ⇒ UI **backfills** from the ADD row with the same `allergyId` (`fillUpdateHistoryFromNearestAdd`). Caveat: it takes the **first** ADD in array order, not the nearest in time — if multiple ADDs/updates exist, sort by `timestamp` first.
- Per-row "status" is not stored; UI shows current status only on the latest row per record (`getHistoryRowStatus`), blank otherwise. Never guess historical status.
- Generic modules use `/audit/logs/clinical-history`: DTO is **flat** (`@JsonAnyGetter` flattens `data` to root: `birthHistory`, `familyHistory`, …) plus `eventAction`, `eventIdentifier`, `performedBy`, `timestamp`, `deleteReason`, `deleteRemarks`.
- Batch calls (e.g. `ADD_MULTIPLE_LAB_ORDERS`): BE splits the response array into one DTO per item (`createAuditLogForBatchItem`).

To show real before/after for a Mongo event, the UI/BE must compare the event with the **previous event of the same record id** (same `allergyId`, ordered by timestamp). Do this in BE when the diff is business-critical; do it in a pure UI function otherwise.

## 5. BE parsing helpers (Mongo `AuditServiceImpl`)

`objectMapper.readTree(body)`; `textOrNull(node)`; `convertJsonNodeToObject`; `removeNullValues(map)`; `extractClinicalData(root)`; identifier fallbacks (`extractEventIdentifierFromBody/Json/ToString`) because some responses were stored via `toString()` — expect non-JSON legacy rows and guard every parse with try/catch (log at WARN with the row id).

## 6. Writing new capture correctly

1. Need old value for **delete**: fetcher bean `@Component("<x>AuditFetcher")` with `findXById(Long)`; must tenant-check against token `customerBusinessId`; return `null` when not owned.
2. Need before/after for **update** in core: `previousValue` pattern. In ipd: `captureOldValue=true` + fetcher, or an `AuditValueEnricher` + `AuditPreviousStateHolder` for curated summaries (see `BedCategoryChangeAuditEnricher`, `PayerTypeChangeAuditEnricher`).
3. Mongo: nothing to capture; make sure request/response DTOs include the record id and the fields the history needs, and return `eventAction`.
4. Never store secrets; strip/mask sensitive fields in the DTO or via enricher before they reach the aspect.
