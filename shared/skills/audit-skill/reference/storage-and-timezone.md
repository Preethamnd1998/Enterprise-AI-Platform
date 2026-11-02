# Storage and Time Zones (India / Dubai / DB in another region)

## 1. How each store records "when"

| Store | Field / type | Value written | Zone semantics |
|---|---|---|---|
| core `activity_audit.activity_timestamp` | `LocalDateTime` (zoneless) | `LocalDateTime.now()` on the audit thread (or request thread if `captureRequestTimestamp`) | **JVM default zone wall-clock.** Treated as **UTC by convention** (UI comment + ipd comment). core-service does not pin the JVM zone in its app class; only `AppUtil` line ~288 does `TimeZone.setDefault("GMT")` *inside a util method* (side-effect when first called). ⇒ UTC only if the container runs UTC. **UNVERIFIED for production — confirm container `TZ`.** |
| ipd `activity_audit` | same entity shape | `LocalDateTime.now()` | JVM pinned to GMT (`IpdServiceApplication`, `TimezoneConfig`, `hibernate.jdbc.time_zone=GMT`, `JpaConfig`) ⇒ real UTC |
| Mongo `api_audit_log.timestamp` | `java.util.Date` | `new Date()` | BSON Date = UTC instant, zone-free by design |
| Kafka event audit | per `CustomerTransactionAttribute` created/updated | server clock | as service |
| Keycloak archive | `OffsetDateTime`; schedulers `zone = "UTC"` | | explicit |

Because storage is a UTC instant (or UTC-convention wall clock), **the database's physical region is irrelevant**; only the JVM zone of the *writing service* matters. A DB in Frankfurt and users in India/Dubai produce identical stored values.

Site zone data: `customer_business_site.time_zone` → `site.timeZone` → UI `userProfile.user.sites[].timeZone`. Site-level zones are e.g. `Asia/Kolkata` (+05:30), `Asia/Dubai` (+04:00).

## 2. How each API serialises it

| API | Output | Parse safely as |
|---|---|---|
| core `ActivityAuditResponse.activityTimestamp` | `"2026-09-25T06:03:00"` (no zone, no ms) | **UTC** → append `Z` |
| ipd `ActivityAuditResponse.activityTimestamp` | `"2026-09-25T06:03:00.123Z"` | already UTC (`new Date(str)`) |
| Mongo `AllergyAuditDTO.timestamp` / `GenericClinicalAuditDTO.timestamp` (`java.util.Date`) | per Jackson config (ISO with `Z`, or epoch ms) | `new Date(value)` |
| Mongo `AuditLogResponse.activityTimestamp` (`Instant`) | ISO `Z` | `new Date(str)` |
| Filters (Mongo) | `fromDate/toDate` **epoch millis** | send `date.getTime()` of local-day bounds converted to instants |
| Filters (core) | `String fromDate/toDate` | send UTC bounds (`UtcService.toUtcStartOfDay/EndOfDay`) |

## 3. UI time-zone stack (use it)

- `TimezoneService` (`src/app/base/service/timezone.service.ts`): `effectiveTimeZone = userTimeZone ?? siteTimeZone ?? browserTimeZone`;
  `getEffectiveTimeZoneSync()`, `effectiveTimeZone$`; user preference stored via UMS (`mode` `site|system|custom`; Profile → Time Zone page).
- `AppDatePipe` (`appDate`, standalone, impure, `base/pipe/app-date.pipe.ts`): formats with `Intl.DateTimeFormat(timeZone = effective tz)`;
  formats `date | time | short | medium | long`; optional tz override arg. **It calls `new Date(value)`**, so zoneless strings are read as *browser-local* — fix by normalising first.
- `UtcService` (`base/service/utc-service.ts`): `getUtcDateTimeRange`, `toUtc`, `toUtcStartOfDay`, `toUtcEndOfDay`, `utcToLocal`, `startOfDayUtc(date, zone)`.
- `ArtifactUtils.formatActivityTimestamp(input)`: arrays treated as UTC; strings with `Z`/offset trusted; **zoneless strings treated as local** (wrong for core audit rows); relative labels (Today/Yesterday/…) are computed in the **browser's** zone.

### Correct display recipe (all audit UIs)

```ts
// 1. normalise to a real instant
export function auditInstant(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") return new Date(raw);
  if (Array.isArray(raw)) return new Date(Date.UTC(raw[0], raw[1] - 1, raw[2], raw[3] ?? 0, raw[4] ?? 0, raw[5] ?? 0));
  const s = String(raw);
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(hasZone ? s : s.replace(" ", "T") + "Z");   // zoneless audit string == UTC
  return isNaN(d.getTime()) ? null : d;
}
// 2. render in the user's effective zone
{{ auditInstant(log.activityTimestamp) | appDate: 'medium' }}
```
Or in TS: `new Intl.DateTimeFormat("en-GB", { timeZone: tz.getEffectiveTimeZoneSync(), dateStyle: "medium", timeStyle: "short" }).format(d)`.

## 4. Known issues (do not copy; raise to the team)

1. **Hard-coded IST shift**: `settings/.../common/audit-timestamp.ts::toIstDisplayTimestamp` adds `+5.5h` to zoneless audit strings. Correct for Indian users only; **a Dubai user (+04:00) sees +1:30 wrong**, and a user with a custom zone is wrong too. Replace with `auditInstant` + `appDate` (above). It exists because `ArtifactUtils.formatActivityTimestamp` treats zoneless as local; the shared util was deliberately left unchanged.
2. core audit API emits zoneless strings while ipd emits `Z`. Making core emit `…'Z'` (like ipd) is the clean fix but changes a contract used by every audit screen (High-risk gate: all consumers must be updated together).
3. core JVM zone is not pinned (see §1). If a core pod ever runs non-UTC, stored times shift silently.
4. `@Async` writer uses `LocalDateTime.now()` *later* on a pool thread unless `captureRequestTimestamp=true`; under load the audit time can lag the action. Use `captureRequestTimestamp = true` for endpoints where ordering/timing matters.
5. Relative labels from `formatActivityTimestamp` are computed in the browser zone, not the user's chosen app zone; for audit prefer absolute `appDate` output.
6. Date-range filters must be built from **day bounds in the user's effective zone**, converted to UTC (not the browser's midnight). Use `UtcService.startOfDayUtc(date, effectiveTz)`.

## 5. Rules for new code

- Write: `Instant`/`Date`/UTC `LocalDateTime` only; never `LocalDateTime.now(ZoneId.of("Asia/…"))` for audit.
- New audit endpoints: serialise **with `Z`** (`Instant` or format with `'Z'`), document it in the DTO javadoc.
- UI: one helper (`auditInstant`) + `appDate`/`TimezoneService`; no numeric offsets; test with `Asia/Kolkata`, `Asia/Dubai` and a custom zone.
- Never rely on browser zone for what the *site* considers "today".
