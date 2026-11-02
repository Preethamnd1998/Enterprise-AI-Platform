# UI template — audit timeline for a settings-style screen (Pattern A)

## 1. `<entity>-audit.ts` (pure, unit-testable) — `data/<entity>/<entity>-audit.ts`

```ts
import { __Entity__, __Entity__Item } from "./__entity__.model";

/** Turns __ENTITY_TYPE__ audit rows into readable messages. newValue = ApplicationResponse JSON; before = oldValue (DELETE) or newValue.data.previousValue (UPDATE). */
export function build__Entity__AuditMessages(log: any): string[] {
  const current = parse(log?.newValue, true);
  const previous = parse(log?.oldValue, false) ?? current?.previousValue ?? null;
  const row = current ?? previous;
  if (!row) return [];
  const label = labelOf(row);                                   // e.g. care setting label
  if (log?.activityType === "DELETE") return [`Deleted ${label}`];
  if (!previous) return [`Created ${label}`, ...describe(row.items)];
  const changes = diff(previous.items, current?.items ?? []);
  return changes.length ? changes.map((c) => `${label}: ${c}`) : [`Saved ${label} (no changes)`];
}

function parse(raw: string, isResponse: boolean): __Entity__ | null {
  if (!raw) return null;
  try { const p = JSON.parse(raw); return (isResponse ? p?.data : p) ?? null; } catch { return null; }
}
function describe(items: __Entity__Item[] = []): string[] { return items.map((i) => `${i.name}: ${flags(i)}`); }
function diff(before: __Entity__Item[] = [], after: __Entity__Item[] = []): string[] {
  const out: string[] = [];
  after.forEach((a) => {
    const b = before.find((x) => x.identifier === a.identifier);          // match by identifier, never by index
    if (!b || b.__flagA__ !== a.__flagA__) out.push(`${a.name} __Flag A label__ ${yesNo(a.__flagA__)}`);
    if (!b || b.__flagB__ !== a.__flagB__) out.push(`${a.name} __Flag B label__ ${yesNo(a.__flagB__)}`);
  });
  return out;
}
```

## 2. Time helper — `common/audit-timestamp.ts` (replaces any fixed-offset hack)

```ts
/** Audit timestamps are UTC. core emits zoneless strings ("2026-09-25T06:03:00") -> treat as UTC. */
export function auditInstant(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") return new Date(raw);
  if (Array.isArray(raw)) return new Date(Date.UTC(raw[0], raw[1] - 1, raw[2], raw[3] ?? 0, raw[4] ?? 0, raw[5] ?? 0));
  const s = String(raw);
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(hasZone ? s : s.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d;
}
```

## 3. Component (excerpt)

```ts
private static readonly AUDIT_REFRESH_DELAY_MS = 1000;   // async audit write lands after the save response
private static readonly AUDIT_PAGE_SIZE = 20;
auditLogs: any[] = [];

// after a successful save/delete:
setTimeout(() => this.loadAuditLogs(), __Component__.AUDIT_REFRESH_DELAY_MS);

private loadAuditLogs(): void {
  this.ipAdtServiceService.getAuditLogsCore(this, AppGlobalConstant.__ENTITY_TYPE___AUDIT_ENTITY,
    this.appData.getCustomerBusinessId(), 0, __Component__.AUDIT_PAGE_SIZE);
}
// onResult: case AppGlobalConstant.GET_ENTITY_AUDIT_LOGS_CORE:
//   this.auditLogs = (result?.data?.content ?? []).map((log) => this.toAuditEntry(log));
private toAuditEntry(log: any) {
  return {
    user: log.userFullName || log.username,
    action: log.activityType,
    status: log.operationStatus,
    timestamp: auditInstant(log.activityTimestamp),            // render with: {{ log.timestamp | appDate: 'medium' }}
    errorMessage: log.errorMessage,
    messages: build__Entity__AuditMessages(log),
  };
}
```
Add `AppDatePipe` to the standalone component `imports`.

## 4. Template (exact structure — see reference/ui-display.md §A)

```html
<div class="__prefix__-log-divider"><span class="__prefix__-log-title">{{ "Audit Log" | translate }}</span></div>
<p-card class="fadein animation-duration-1000 audit-card">
  <p-panel header="{{ 'Audit Log' | translate }}" [toggleable]="true" [collapsed]="false">
    <ng-template pTemplate="content">
      <div class="audit-scroll-container">
        <p-timeline *ngIf="auditLogs?.length; else noLogs" [value]="auditLogs" layout="vertical" align="left">
          <ng-template pTemplate="marker" let-log>
            <span class="audit-marker" [ngClass]="{'audit-marker-success': log.status==='SUCCESS','audit-marker-failed': log.status==='FAILED'}">
              <i class="pi" [ngClass]="{'pi-check': log.status==='SUCCESS','pi-times': log.status==='FAILED'}"></i></span>
          </ng-template>
          <ng-template pTemplate="content" let-log>
            <div class="audit-log-item">
              <div class="audit-message">
                <ng-container *ngIf="log.status==='SUCCESS'; else failedBlock">
                  <strong>{{ log.user }}</strong><div *ngFor="let msg of log.messages">{{ msg }}</div>
                </ng-container>
                <ng-template #failedBlock><div class="error-message"><strong>{{ log.user }}</strong>
                  {{ log.errorMessage || ("Operation Failed" | translate) }}</div></ng-template>
              </div>
              <div class="audit-meta mt-2">
                <p-tag [severity]="log.status==='FAILED'?'danger':log.action==='DELETE'?'warning':log.action==='UPDATE'?'success':'info'" [value]="log.action" class="mr-2"></p-tag>
                <span class="audit-time">{{ log.timestamp | appDate: 'medium' }}</span>
              </div>
            </div>
          </ng-template>
        </p-timeline>
        <ng-template #noLogs><div class="text-center text-muted p-3">{{ "No audit logs available" | translate }}</div></ng-template>
      </div>
    </ng-template>
  </p-panel>
</p-card>
```
SCSS classes (`audit-marker*`, `audit-card`, `audit-scroll-container`, `audit-log-item`, `error-message`, `audit-time`, `*-log-divider/title`) — copy from `clinical-ownership-rule.component.scss` unchanged.

## 5. Clinical History table (Pattern B) — essentials
Fetch on tab activation; sort rows by `timestamp` desc; backfill UPDATE rows from the matching ADD (same record id, sorted by time); status only on the latest row per record;
date column `{{ row.timestamp | appDate: 'medium' }}`; never invent a historical status.

## 6. Spec (scoped)
Test `build__Entity__AuditMessages` with: create, update one flag, update none, delete (oldValue), malformed JSON, missing `previousValue`; test `auditInstant` with zoneless, `Z`, offset, epoch, array.
