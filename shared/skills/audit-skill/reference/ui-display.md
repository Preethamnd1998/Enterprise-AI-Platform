# How the UI Displays Audit (verified patterns)

Two distinct patterns exist. Pick by data shape.

| Pattern | Use when | Reference | Data source |
|---|---|---|---|
| **A. Timeline card** (who changed what, with messages) | Settings/master screens (Postgres `activity_audit`) | `clinical-ownership-rule` | `getAuditLogsCore(callback, entityType, customerBusinessId, page, size)` → `GET_ENTITY_AUDIT_LOGS_CORE` → core `GET /api/v1/audit/activities/entity/{entityType}?customerBusinessId=&page=0&size=20` (verified in `ActivityAuditController`; `entityType` may be a comma list, URL-decoded; returns `ApplicationResponse<Page<ActivityAuditResponse>>`, newest first by id) → `result.data.content[]`. The UI constant/service wiring (`ipAdtServiceService`) was not located in source; assume it targets this endpoint. |
| **B. History table** (one row per event, full columns) | Clinical modules (Mongo events) | `new-allergy` History tab | `allergyService.getAllergyAuditHistory(cb, patientId, customerBusinessId, siteId)` → `ALLERGY_AUDIT_HISTORY` → `data.data[]` |

## A. Timeline card (settings)

Structure (exact):
```
<div class="ownership-log-divider"><span class="ownership-log-title">Audit Log</span></div>
<p-card class="fadein animation-duration-1000 audit-card">
  <p-panel header="Audit Log" [toggleable]="true" [collapsed]="false">
    <div class="audit-scroll-container">
      <p-timeline [value]="auditLogs" layout="vertical" align="left"> marker + content templates
      #noLogs → <div class="text-center text-muted p-3">No audit logs available</div>
```
- Marker `span.audit-marker` + `audit-marker-success|failed`, icon `pi pi-check` (SUCCESS) / `pi pi-times` (FAILED).
- Content: SUCCESS → `<strong>{{user}}</strong>` + one `<div>` per message; FAILED → `.error-message` with `user` + `errorMessage || "Operation Failed"`.
- Meta line: `p-tag` severity (`FAILED`→danger, `DELETE`→warning, `UPDATE`→success, else info) with the action text + `audit-time` timestamp.
- Load: on init and **after every successful save/delete, after 1000 ms** (`AUDIT_REFRESH_DELAY_MS`) because the audit row is written asynchronously. Page size 20 (`AUDIT_PAGE_SIZE`), page 0.
- View-model mapping (`toAuditEntry`): `user = userFullName || username`, `action = activityType`, `status = operationStatus`, `timestamp` formatted (see time zone doc — **use `auditInstant`+effective tz**, not `toIstDisplayTimestamp`), `errorMessage`, `messages = build<Entity>AuditMessages(log)`.
- Messages come from a **pure function file** next to the data model (`<entity>-audit.ts`) — unit-testable, no Angular.

## B. History table (clinical)

- Opened lazily when the History tab becomes active (`eve === 1`) → fetch.
- `p-table` inside `.history-table-wrapper` (`p-datatable-gridlines history-table`), columns: Action (`eventAction || action`), Performed By, Date (`{{ timestamp | date: "dd MMM, y, h:mm a" }}` — **browser zone**; prefer `appDate`), Allergy (`noKnownAllergy ? "No Known Allergy" : allergyName`), Reactions (`join(", ")`), Severity, Status (`getHistoryRowStatus`), Comments, Delete Reason, Delete Remarks.
- Post-processing in the component: backfill UPDATE rows from ADD rows by `allergyId`; status only on the latest row per `allergyId`.
- Respect component access (`clinicalComponentAccess.historyComponent`) to show/hide the tab.

## C. Other places (same two patterns)

Price-book screens and User Management carry their own copies of `formatActivityTimestamp` (Pattern A with local formatters); billing/IPD encounter audit uses ipd cursor API (`getActivitiesByEncounterId`, `AuditLogCursor{epochMillis,id}` encoded; `hasMore/nextCursor`, fetch size+1). Use cursor paging for long encounter timelines; use page/size for settings.

## D. Display rules

- Never show raw JSON, ids or internal keys; messages in business language with the screen's exact labels.
- One message per changed field; created/deleted get one summary line (+ optional created values).
- Show "(no changes)" instead of an empty diff.
- Order newest first (API already `ORDER BY id DESC` / timestamp desc).
- Always show **user + action tag + time**; failed rows show error text.
- Escape/encode all message text (Angular interpolation does; no `[innerHTML]`).
- i18n: wrap static labels in `translate`; field names from the screen's own constants.
- Time: absolute, in effective zone (`appDate`), no relative "x min ago" unless computed in that zone.
