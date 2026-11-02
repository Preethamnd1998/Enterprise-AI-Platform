# Review Checklist + Findings

## A. Findings in the current code (verified; fix only with approval — shared code)

| # | Finding | Impact | Where |
|---|---|---|---|
| 1 | core aspect never captures old value for UPDATE (`extractOldValue` returns null); `changedFields` always null | UPDATE rows have no "before" unless service supplies `previousValue` | `core/audit/aspect/ActivityAuditAspect` L1344 |
| 2 | core emits zoneless timestamp strings; UI helpers disagree on interpretation | wrong times for non-IST users | `ActivityAuditServiceImpl.mapToResponse` |
| 3 | `toIstDisplayTimestamp` adds fixed +5.5h | Dubai/custom-zone users wrong | settings `common/audit-timestamp.ts` |
| 4 | core JVM zone not pinned (only a side-effect in `AppUtil`) | possible silent shift | `CSApplication`, `AppUtil` L288 |
| 5 | Core `AuditServiceImpl.addtoAudit` swallows publish failures (empty catch) | silent loss of event audit | `core/audit/service/Impl/AuditServiceImpl` |
| 6 | Mongo audit write is synchronous | latency | `ipd_clinical/audit/AuditAspect` |
| 7 | UPDATE backfill picks first ADD, not nearest in time | wrong detail if multiple ADDs | `new-allergy.component.ts` `fillUpdateHistoryFromNearestAdd` |
| 8 | ipd `Audited` lacks `captureRequestTimestamp`/`entityTypeFromRequestBody`; core lacks `enricherBean` | feature drift between copies | annotations |
| 9 | Mongo `PageRequest` javadoc counts after skip/limit; `AuditLogCursorPage` vs `PageDTO` differ | confusion | `ipd_clinical/common/dto`, `audit/dto` |
| 10 | Old UI in `new-allergy` uses `date` pipe (browser zone) not `appDate` | zone mismatch vs app setting | `new-allergy.component.html` |

## B. Per-change checklist

Backend
- [ ] Mechanism chosen (Postgres `@Audited` / Mongo `@Auditable` / event)
- [ ] Annotation on the controller method; `entityType`/`module` constants defined once
- [ ] `entityId` resolves (non-null) for create (from response), update (body/path), delete (path)
- [ ] Old-value fetcher exists + tenant-checked (delete) / `previousValue` set (core update) / fetcher (ipd update)
- [ ] Handled failures return `ERROR` status (audited as FAILED)
- [ ] `captureRequestTimestamp = true` where ordering matters
- [ ] Patient context set (`patientNameFromRequestBody` / `lookupPatientByEntityId`) for clinical/patient endpoints
- [ ] No secret/PHI beyond need in request/response DTO; sensitive fields excluded/curated
- [ ] Timestamp serialised with `Z` for new endpoints
- [ ] Read endpoint paginated + indexed (`entity_type, entity_id`, `customer_business_id`, timestamp)
- [ ] Audit failure cannot fail the business call (verified by forcing an audit exception)

UI
- [ ] Message builder is a pure function with unit tests (create / update / delete / no-change / failed)
- [ ] Parse with try/catch; unknown shapes → empty messages, not exceptions
- [ ] Time via `auditInstant` + `appDate`/`TimezoneService`; no numeric offsets
- [ ] Refetch after write with the 1000 ms delay
- [ ] Empty/loading/error states; failed rows styled
- [ ] Date filters converted with effective-zone day bounds
- [ ] Only the new/changed spec is run (scoped testing)

## C. Manual test script

1. Create → row `CREATE`, SUCCESS, newValue has the record, `entityId` set.
2. Update one field → row `UPDATE`, UI shows exactly that field's change.
3. Update with no change → "Saved … (no changes)".
4. Delete → row `DELETE`, oldValue present (core) / message "Deleted …".
5. Force a handled failure (e.g. duplicate) → FAILED row with the error text.
6. Another tenant's id on delete → no old value copied, operation rejected.
7. Set profile time zone to Asia/Kolkata, then Asia/Dubai, then custom → same row shows +5:30 / +4:00 / custom correct local time.
8. Row visible after save without manual refresh (1 s delay).
9. Big payload (Mongo) near the 500 000-char cap → truncated, no exception.
