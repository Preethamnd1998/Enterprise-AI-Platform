---
name: settings-redic-index-db-cache-skill
description: Institutional pattern for the two-tier Redis (accelerator) + IndexedDB (client cache) architecture used to make Settings-driven data (mandatory fields, component/speciality/role/user access, and any future settings domain) fetch-once, cache-aware, and save-invalidated across the whole platform — settings-module admin screens AND the patient-facing clinical screens that render the same data. MUST be loaded by any agent or developer asked to onboard a new settings domain onto this cache, migrate an existing screen's settings fetch onto it, or debug why a cached settings value is stale/wrong. Built and live-verified end-to-end (backend Redis dirty-check, frontend IndexedDB store, 6 real consumer screens across 4 Angular projects) against the Customize Consult Screen / mandatory-component feature family.
metadata:
  type: skill
  scope: frontend-backend-cache-architecture
  stack: angular, indexeddb, spring-boot, redis, mongodb
  audience: frontend-agents, backend-agents, healthcare-frontend-engineer, healthcare-backend-engineer, migration-agents, debugging-agents
---

# Settings Redis + IndexedDB Cache Architecture Skill

> The institutional standard for adding a new settings domain to — or migrating an existing screen
> onto — the two-tier cache/sync architecture that backs mandatory-field and component-visibility
> settings across this platform. Read this document top to bottom before touching any file in
> Section 12; it is written so a developer or agent with **zero prior context** on this codebase
> can complete the migration correctly and verify it, without re-deriving the architecture from
> scratch.

---

## SECTION 1 — SKILL IDENTITY

This skill exists because the platform has many "settings" domains (clinical-component mandatory
fields + speciality/role/user access, and — as of this writing — nurse settings not yet onboarded,
plus whatever comes next) that are:

- Read far more often than they're written (every patient-facing clinical screen reads them on
  every load; they only change when an admin edits a settings screen).
- Expensive to re-fetch on every screen load if done naively (a full component tree, or a full
  settings document set, on every single patient-banner render).
- Needed **identically** by two very different kinds of consumers: the settings-module admin
  screens that *edit* them, and the patient-facing clinical screens (inpatient, OPD, ER, daycare,
  casesheet) that *enforce* them (mandatory fields, hide/show components).

The architecture in this document makes both kinds of consumer share **one** cache, populated
**once**, invalidated correctly on save, with a documented, minimal-diff path to migrate a screen
onto it and a documented path to onboard an entirely new settings domain (a new backend
service/collection) that has never used this pattern before.

### Origin / worked example

This pattern was designed, built, and live-verified (real login, real browser, real backend, real
Redis, real MongoDB — `http://localhost:4440/`, never canary) for the **Customize Consult
Screen / mandatory-component** feature family:
- Backend: `user-management-service`, `ClinicalComponent` MongoDB collection.
- Frontend consumers: 8 settings-module screens (4 customize + 4 mandatory, OP/IP/ER/DC) plus 4
  patient-facing screens (inpatient clinical-station, ER patient-banner, OPD consult-q,
  daycare-clinical patient-banner).

Every file path in Section 12 is real, already built, and already working — read them as the
concrete reference implementation, not a hypothetical example.

---

## SECTION 2 — CORE OBJECTIVE

Every settings domain onboarded under this skill must achieve:

1. **Fetch once per real change, not once per screen load.** A screen asks "has anything changed
   since I last synced?" — if not, zero payload comes back and the screen uses its local
   IndexedDB copy. If so, the full fresh data comes back in the same response.
2. **Save invalidates immediately, without a second round trip.** A save's own response already
   contains the fresh data — the cache is updated directly from it, so the very next fetch
   (anywhere, by anyone) is already correct. No "save, then re-fetch to confirm" pattern.
3. **Cold start never breaks.** First deploy of a new domain onto this pattern, Redis has no mark
   for it yet — this must fall through to a live database read exactly once and then work
   correctly forever after, never error, never serve empty/wrong data.
4. **One cache, shared by every consumer of that domain's data.** A settings-module admin screen's
   save and a patient-facing clinical screen's read converge on the same IndexedDB record — the
   architecture is not "one cache per screen."
5. **Generic and additive.** Onboarding domain N+1 must not require touching domain 1..N's code —
   it is a new cache key, a new registry entry, a new pair of backend/frontend files at most.
6. **Zero behavior change for callers.** Every consuming screen's existing `ApiCallBack`
   contract, result shape, and `switch (type)` handling stays identical after migration — the
   screen cannot tell whether its data came from cache or network.

> **A settings domain that isn't onboarded correctly is worse than one left un-cached.** A stale
> mandatory-field check that lets a required clinical field go unfilled, or a component-visibility
> check that hides something a role should see, is a patient-safety and compliance issue — not a
> performance nit. When in doubt about correctness, fetch live; never guess.

---

## SECTION 3 — ARCHITECTURE OVERVIEW

Two tiers, each with a specific and different job. Neither is ever the sole source of truth —
MongoDB (or whatever the domain's real database is) always is.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser (per client, per origin)                                       │
│                                                                          │
│  SettingsCacheDB (IndexedDB)                                            │
│    — one shared object store, "settingsCache", keyed by cacheKey        │
│    — holds the ACTUAL DATA + lastSyncAt per settings domain             │
│    — survives page reloads; this is what avoids re-fetching             │
│                                                                          │
│  ClinicalSettingsCacheService (or your domain's equivalent)             │
│    — the ONLY thing screens call; drop-in ApiCallBack-compatible        │
│    — reads SettingsCacheDB, sends lastSyncAt to the sync endpoint,      │
│      writes the fresh data + lastSyncAt back on a change                │
│                                                                          │
│  AppSettingsCacheBootstrap                                              │
│    — fires once at login, warms every registered domain's cache         │
│    — so the FIRST screen that needs the data already has a hit          │
└─────────────────────────────────────────────────────────────────────────┘
                              │  GET .../sync?lastSyncAt=<ISO-8601>
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Backend service owning this settings domain                            │
│                                                                          │
│  Redis (accelerator ONLY — never the correctness gate)                  │
│    — one well-known key per domain, holds ONLY a last-changed Instant   │
│    — TTL'd; a cache miss (empty) is treated as "definitely changed"     │
│    — fails open: any Redis error/timeout → treat as changed, hit Mongo  │
│                                                                          │
│  Sync endpoint (GET .../sync?lastSyncAt=)                               │
│    — compares Redis's last-changed Instant to the caller's lastSyncAt   │
│    — unchanged → {changed:false} — NO payload, NO Mongo read            │
│    — changed / cold  → live Mongo read, mark Redis if it was empty,     │
│      return {changed:true, data, lastSyncAt}                            │
│                                                                          │
│  Every save endpoint for this domain funnels through one or two         │
│  low-level write primitives — THAT is where Redis gets marked, once,    │
│  so every save invalidates the cache without editing N save endpoints   │
│                                                                          │
│  MongoDB (or the domain's real datastore) — always the source of truth  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why Redis holds only a timestamp, never the data

Redis here is a **dirty-check accelerator**, not a data cache. It answers exactly one question:
"has anything changed since time T?" — a single `Instant` per domain key. This means:
- Redis being wiped, restarted, or down never causes wrong data — worst case, everyone falls
  through to Mongo until it's warm again (fail-open).
- The actual payload only ever needs to be fully correct in one place: the live database read.
- IndexedDB (not Redis) is what actually avoids the network round trip on the client.

### Why IndexedDB, not `localStorage` or an in-memory service singleton

- Survives full page reloads (a settings screen navigated away and back should not re-fetch).
- Large enough for a full settings tree without `localStorage`'s ~5MB practical ceiling.
- Already the established pattern in this codebase for *this* lineage of caches
  (`ConfigMenuService`/`UIThemesDB`, `SettingsCacheDB` itself) — raw `window.indexedDB.open(...)`,
  no wrapper library, by convention. **Correction (verified 2026-10-13 against source):**
  `AccessRightsCacheService` is NOT an example of this — it imports `openDB`/`IDBPDatabase` from
  the `idb` wrapper library (`access-rights-cache.service.ts:2`), the one exception to the
  raw-`indexedDB` convention in this codebase. Do not cite it as supporting evidence for "no
  wrapper library"; it is a separate, older caching subsystem (menu/button access rights) that
  predates this convention — see `shared/standards/frontend/app-shell-menu-config-cache.md`.

---

## SECTION 4 — BACKEND PATTERN (Spring Boot / Java)

### 4.1 The Redis wrapper (reuse, don't reinvent)

If the owning service already has a `ScopeCacheService`-shaped bean (a thin Redis wrapper exposing
`getLastChangedAt(...)` / `markChanged(...)` / `markChangedAt(...)`), **reuse it** — do not build a
second Redis abstraction per domain. Real example
(`user-management-service/src/main/java/.../service/ScopeCacheService.java`, referenced from
`ClinicalComponentServiceImpl`):

```java
Optional<Instant> getLastChangedAt(String... keyParts);   // empty = cold start / cache miss
void markChanged(String... keyParts);                      // marks "now", with TTL
void markChangedAt(String... keyParts, Instant at);        // marks a specific instant (used to
                                                            // seed the mark on cold start with the
                                                            // exact instant just returned to the
                                                            // caller, so the two are consistent)
```

- `@Autowired(required = false)` so the whole feature degrades gracefully when Redis is disabled
  (`redis.enabled=false`) — every call site must tolerate this bean being `null`.
- Every Redis operation is wrapped to fail open (swallow the exception, log, proceed as if the key
  were absent) — a Redis outage must never turn into a 500 for a settings read.
- **If your service doesn't have this bean yet** (e.g. it's a service never onboarded to any
  cache/sync pattern before — check first, don't assume), build one this shape before anything
  else. Confirm Redis is actually wired for that service (connection config, health check) before
  writing code against it.

### 4.2 The well-known cache key

Pick ONE key (a tuple of short strings, matching whatever `getLastChangedAt`/`markChanged` already
takes) that represents "this whole settings domain changed." Real example:
`("GLOBAL", "ALL", "TREE")` for the clinical-component tree. Keep it distinct from any per-scope
keys the service might already have (e.g. `cc:{documentId}:{axis}:{admitType}` in this same
service) — this key means "the WHOLE domain," not one slice of it.

### 4.3 Mark the key at the write choke point(s), not at every save endpoint

Find where every save for this domain actually persists (there are usually 1–2 low-level
primitives every save endpoint funnels through — e.g. `casWrite()` / `casWriteMulti()` in this
codebase's `ClinicalComponentServiceImpl`). Add the mark call **there**, once or twice, right after
the successful write:

```java
// Mark this domain's global sync key dirty. Every save endpoint for this domain funnels through
// this one primitive, so this single line is the one choke point that invalidates the cache for
// every caller, without a mark call needing to be added to each save endpoint individually.
scopeCacheService.markChanged("GLOBAL", "ALL", "TREE");
```

If a domain's saves do NOT funnel through a shared low-level primitive (each save endpoint writes
directly), you must add this mark call to **every** save endpoint for that domain — audit for this
before assuming a single choke point exists. Missing even one save endpoint means saves through
that one path silently never invalidate the cache.

### 4.4 The sync response DTO

One field-for-field-identical shape per domain (or reuse one generic one if the domain's payload
type allows). Real example (`FullTreeSyncResponse.java`):

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FullTreeSyncResponse {
    private boolean changed;
    private List<ClinicalComponent> data;   // your domain's actual payload type here
    private String lastSyncAt;

    public static FullTreeSyncResponse unchanged() {
        return new FullTreeSyncResponse(false, null, null);
    }
}
```

### 4.5 The service method

```java
public FullTreeSyncResponse getFullTreeSync(String lastSyncAt) throws Exception {
    Instant clientLastSync;
    try {
        clientLastSync = lastSyncAt != null ? Instant.parse(lastSyncAt) : Instant.EPOCH;
    } catch (Exception ex) {
        clientLastSync = Instant.EPOCH;   // malformed/missing param — treat as "never synced"
    }

    Optional<Instant> cachedChangedAt = scopeCacheService.getLastChangedAt("GLOBAL", "ALL", "TREE");
    if (cachedChangedAt.isPresent() && !cachedChangedAt.get().isAfter(clientLastSync)) {
        return FullTreeSyncResponse.unchanged();
    }

    List<ClinicalComponent> data = getYourDomainsFullData();  // the existing, already-correct
                                                               // "get everything" method for this
                                                               // domain — reuse it, don't rewrite it

    Instant effectiveChangedAt = cachedChangedAt.orElseGet(Instant::now);
    if (!cachedChangedAt.isPresent()) {
        // Cold start: Redis has never seen a mark for this key (first deploy of this pattern for
        // this domain, or Redis was flushed). Seed it now with the SAME instant returned to the
        // caller, so the client's very next sync call with this lastSyncAt compares correctly.
        scopeCacheService.markChangedAt("GLOBAL", "ALL", "TREE", effectiveChangedAt);
    }

    return new FullTreeSyncResponse(true, data, effectiveChangedAt.toString());
}
```

**This is the single most important cold-start rule in this whole document**: an empty
`getLastChangedAt` result is NEVER treated as "unchanged." It always falls through to a live read.
Only a *present* timestamp that is not-after the client's is treated as unchanged. Getting this
backwards means a fresh deployment serves nobody any data until some unrelated save happens to
mark the key.

### 4.6 The controller endpoint

```java
@GetMapping("/your-domain/sync")
public ApplicationResponse<FullTreeSyncResponse> getFullTreeSync(
        @RequestParam(value = "lastSyncAt", required = false) String lastSyncAt) throws ApplicationException {
    try {
        return new ApplicationResponse<>(SUCCESS, "200", null,
                this.yourDomainService.getFullTreeSync(lastSyncAt));
    } catch (Exception e) {
        return new ApplicationResponse<>(ERROR, "500", e.getLocalizedMessage(), null);
    }
}
```

Add this as a **new** endpoint alongside the domain's existing plain "get everything" endpoint —
never replace or remove the old one; other, not-yet-migrated consumers may still call it directly,
and the sync endpoint's `onError` fallback path (Section 5) depends on it still existing.

---

## SECTION 5 — FRONTEND PATTERN (Angular)

### 5.1 `SettingsCacheDB` — the one shared IndexedDB store

Already built, in core (`src/app/base/service/settings-cache-db.ts`) — **do not create a second
IndexedDB store for a new domain.** Add a new record under a new `cacheKey` in this same store.

```typescript
export interface SettingsCacheRecord {
    cacheKey: string;     // unique per settings domain, e.g. "CLINICAL_COMPONENT_TREE"
    settingType: string;  // human-readable type tag, usually same as cacheKey
    service: string;      // which backend service/owner this came from — see SettingsCacheServiceType
    dbInfo: string;       // "<DATABASE>.<collection/table>" — for humans debugging the cache, not code logic
    data: unknown;        // the domain's actual payload, opaque to this store
    lastSyncAt: string;   // ISO-8601, exactly what the backend returned
}
```

`get(cacheKey)` / `set(record)` are the only two operations; both fail open (any IndexedDB error
→ treat as a miss / swallow the write) — never let a cache-layer problem surface as a screen
error. If you need to inspect what's cached, this store is also what backs the app's own
"Cache Management" debug panel (`app.topbar.component.ts`) — see Section 9.4.

### 5.2 `SettingsCacheServiceType` / `SettingsCacheType` — the extensible registry constants

`src/app/base/api/settings-cache-type-constant.ts`. Add one entry per new backend service you
onboard, and one entry per new settings payload type:

```typescript
export class SettingsCacheServiceType {
    public static USER_MGMT = "USER-MGMT";
    // Add yours, e.g.:
    // public static IPD_CLINICAL = "IPD-CLINICAL";
}

export class SettingsCacheType {
    public static CLINICAL_COMPONENT_TREE = "CLINICAL_COMPONENT_TREE";
    // Add yours, e.g.:
    // public static NURSE_SETTINGS = "NURSE_SETTINGS";
}
```

These are metadata (recorded on the `SettingsCacheRecord`, shown in the debug panel) — they are
NOT the IndexedDB key by themselves unless you choose to make them one; a `cacheKey` can equal a
`SettingsCacheType` value directly when there's exactly one instance of that type globally (as
with the clinical-component tree), or be composed (`${type}:${scopeId}`) if the domain is
naturally scoped (per-site, per-customer, etc. — see Section 7 before assuming global is correct).

### 5.3 The consuming service (one per domain, drop-in `ApiCallBack`-compatible)

This is the ONLY thing a screen calls. Real, complete example
(`src/app/base/service/clinical-settings-cache.service.ts`), adapt names for your domain:

```typescript
@Injectable({ providedIn: 'root' })
export class ClinicalSettingsCacheService {
    private readonly cacheKey = SettingsCacheType.CLINICAL_COMPONENT_TREE;

    constructor(private apiService: ApiService, private settingsCache: SettingsCacheDB) {}

    getClinicalComponents(callback: ApiCallBack): void {
        this.settingsCache.get(this.cacheKey).subscribe((cached) => {
            const apiObject: ApiCallHelper = {} as ApiCallHelper;
            apiObject.service = CommonApiConstant.CLINICAL_COMPONENT_TREE_SYNC_GET;
            apiObject.method = 'GET';
            if (cached?.lastSyncAt) {
                apiObject.params = new HttpParams().set('lastSyncAt', cached.lastSyncAt);
            }

            const syncCallback: ApiCallBack = {
                onResult: (result: any, _type: any, other?: any) => {
                    const body = result?.data;
                    if (body && body.changed === false && cached) {
                        // Cache hit — serve the locally-stored copy, zero extra network cost.
                        callback.onResult({ data: cached.data }, CommonApiConstant.CLINICAL_COMPONENT_GET, other);
                        return;
                    }
                    const freshData = body?.data ?? [];
                    if (body?.lastSyncAt) {
                        this.settingsCache.set({
                            cacheKey: this.cacheKey,
                            settingType: SettingsCacheType.CLINICAL_COMPONENT_TREE,
                            service: SettingsCacheServiceType.USER_MGMT,
                            dbInfo: 'LTHS-USER-MGMT.clinical_component',
                            data: freshData,
                            lastSyncAt: body.lastSyncAt,
                        }).subscribe();
                    }
                    callback.onResult({ data: freshData }, CommonApiConstant.CLINICAL_COMPONENT_GET, other);
                },
                onError: () => {
                    // Sync endpoint failed for ANY reason — fall back to the plain, always-correct
                    // fetch. A cache-layer problem must never surface as a screen-level error.
                    const fallback: ApiCallHelper = {} as ApiCallHelper;
                    fallback.service = CommonApiConstant.CLINICAL_COMPONENT_GET;
                    fallback.method = 'GET';
                    this.apiService.getData(fallback, callback, CommonApiConstant.CLINICAL_COMPONENT_GET);
                },
            };

            this.apiService.getData(apiObject, syncCallback, CommonApiConstant.CLINICAL_COMPONENT_TREE_SYNC_GET);
        });
    }

    /** Called once at login by AppSettingsCacheBootstrap. Fire-and-forget; a failed warm just
     * means the first real call does the fetch itself. */
    warmCache(): void {
        this.getClinicalComponents({ onResult: () => {}, onError: () => {} });
    }
}
```

**Non-negotiable rule**: `callback.onResult(...)` on BOTH the cache-hit and cache-miss branches
must pass the exact same `type` constant the OLD, pre-migration plain-GET call used, and the exact
same result shape (`{ data: ... }`) the screen's existing `switch (type)` handler already expects.
This is what makes the migration a zero-diff change for every consuming screen — verify this by
reading the screen's own `onResult`/`case` block before writing the new service, not after.

### 5.4 Save-response cache refresh — the other half, easy to miss

If this domain's save endpoint(s) already return the fresh full data in their response (check —
many do, since screens re-render from the save response today), feed that response into the cache
directly, so the very next fetch is already a hit with **zero** extra network round trip:

```typescript
private refreshCacheFromSaveResponse(result: any): void {
    const data = result?.data;
    if (!data || typeof data !== 'object') return;
    // Adapt this line to your domain's actual save-response shape — e.g. an object keyed by
    // section name (as in the real example) vs. already being an array.
    const tree = Object.values(data).filter((doc) => doc && typeof doc === 'object');
    if (!tree.length) return;
    this.settingsCache.set({
        cacheKey: this.cacheKey,
        settingType: SettingsCacheType.YOUR_TYPE,
        service: SettingsCacheServiceType.YOUR_SERVICE,
        dbInfo: '...',
        data: tree,
        // Safe to use the CLIENT's own clock here: the backend's Redis mark happens
        // synchronously, server-side, BEFORE this save response is even sent — so by the time
        // this callback runs, the client's clock is always at or after that mark. The next real
        // sync call only ever sees "unchanged" when nothing genuinely changed since.
        lastSyncAt: new Date().toISOString(),
    }).subscribe();
}
```

Wrap every save method for this domain with this refresh, e.g. via a small
`wrapSaveCallbackForCacheRefresh(callback)` helper that calls this then forwards to the caller's
own callback unchanged (see the real `user-management.service.ts` for the full pattern).

### 5.5 `AppSettingsCacheBootstrap` — register your domain, don't build a new bootstrapper

`src/app/base/service/app-settings-cache-bootstrap.service.ts`. Add one entry to its registry:

```typescript
private get registry(): SettingsCacheBootstrapEntry[] {
    return [
        {
            type: SettingsCacheType.CLINICAL_COMPONENT_TREE,
            service: SettingsCacheServiceType.USER_MGMT,
            warm: () => this.clinicalSettingsCache.warmCache(),
        },
        // Add yours:
        // {
        //     type: SettingsCacheType.NURSE_SETTINGS,
        //     service: SettingsCacheServiceType.IPD_CLINICAL,
        //     warm: () => this.nurseSettingsCache.warmCache(),
        // },
    ];
}
```

Each entry runs independently, in parallel, on its own try/catch — one domain's backend being
slow or down must never block another domain's cache from becoming usable. This is deliberately
**not** a single combined "one API call for everything" endpoint: different domains typically live
on different backend microservices with different databases; a genuine single endpoint would mean
one service calling another over the network just to answer a settings read, adding real coupling
and a new failure mode for no benefit. One registry, one shared frontend entry point, many
independent backend calls underneath — that is the correct shape of "single" here.

This bootstrap is already wired into `AppService.onResult()`'s `UM_USER_PROFILE_` handler, right
after `autoCheckAndClearAccessRightsCache()` — the same point `AccessRightsCacheService`'s own
post-login check already runs from. **Do not** add a second hook point; `AppComponent.ngOnInit()`
runs too early (customerBusinessId/roles aren't reliably populated there yet — confirmed by
reading the actual login flow, not assumed).

---

## SECTION 6 — STEP-BY-STEP: ONBOARDING A NEW SETTINGS DOMAIN

Concrete checklist for taking a settings domain that has never used this pattern (e.g. "nurse
settings" / `ipd-clinical/settings` on ipd-clinical-service, the next deferred item as of this
writing) through the full pipeline.

### Backend

1. **Confirm the owning service has Redis wired at all.** Check `application.yml`/config for a
   Redis connection, and whether a `ScopeCacheService`-shaped bean already exists. If not, this is
   real, separate infrastructure work before anything below — do not assume it's there.
2. **Find the domain's existing "get everything" method/endpoint.** This is what your new sync
   method will call on a cache miss — you are not rewriting it, only wrapping it.
3. **Find every save endpoint for this domain**, and the low-level write primitive(s) they funnel
   through (if any). Add the Redis mark call there (Section 4.3). If there's no shared primitive,
   add the mark call to every save endpoint individually — audit this carefully.
4. **Add the sync response DTO, service method, and controller endpoint** (Sections 4.4–4.6),
   using your domain's own well-known Redis key (not `"GLOBAL","ALL","TREE"` — that one belongs to
   the clinical-component tree).
5. **Verify with `curl` directly against the backend**, bypassing the frontend entirely, before
   touching any Angular code:
   - No `lastSyncAt` → `changed:true`, full data, a real `lastSyncAt` back.
   - Immediately repeat with that exact `lastSyncAt` → `changed:false`, `data:null`.
   - Trigger a real save, then repeat the sync call → `changed:true` again, fresh data.

### Frontend

6. **Add constants**: a `SettingsCacheServiceType` entry for the owning service, a
   `SettingsCacheType` entry for the payload, a new endpoint constant in `common-api-constant.ts`
   (or your project's own API-constant file if it lives outside core).
7. **Write the consuming service** (Section 5.3), matching the EXACT `type` constant and result
   shape the domain's existing consumers already expect — read their current `onResult`/`case`
   handling first.
8. **Wrap the domain's save method(s)** with the cache-refresh helper (Section 5.4) if their
   responses already carry fresh full data.
9. **Register the domain in `AppSettingsCacheBootstrap`'s registry** (Section 5.5).
10. **Migrate consumers one at a time** (Section 8), each live-verified, before moving to the next
    — never batch-migrate every consumer in one untested pass.

---

## SECTION 7 — KEY NAMING & SCOPING CONVENTIONS

- **Redis key**: short string tuple, distinct from any per-scope keys the service already has for
  this or other domains. `"GLOBAL"` in the first position signals "whole-domain," not "one slice."
- **`cacheKey` (IndexedDB)**: one unique string per logical settings domain from the CLIENT's
  perspective. If the same domain is genuinely global (one config for the whole system/customer),
  one flat key is correct (as with the clinical-component tree). **Before assuming a new domain is
  global**, check: does the backend's "get everything" method filter by customerBusinessId, siteId,
  or any tenant/site identifier? If yes, your `cacheKey` (and possibly your Redis key) must be
  composed to include that scope (e.g. `NURSE_SETTINGS:${customerBusinessId}`), or two different
  tenants/sites sharing one browser profile will silently see each other's cached settings.
  **This was explicitly checked for the clinical-component tree** (confirmed the active backend
  method has zero tenant filtering — a pre-existing, intentional global design, not an oversight)
  before relying on a single flat key; do not skip this check for a new domain and assume the same
  is true.
- **`service` metadata field**: always a `SettingsCacheServiceType` constant, never a raw string —
  this is what lets the Cache Management debug panel and future tooling group cached records by
  owning backend.

---

## SECTION 8 — MIGRATING AN EXISTING CONSUMER SCREEN

For each screen/component currently calling a domain's old plain "get everything" API directly:

1. **Grep for every usage of the old service/method in that exact file** before touching anything
   — e.g. `grep -n "oldService\." thefile.ts`. Count the occurrences.
2. **If the old service is used for ONLY this one call in this file**: replace the constructor
   injection outright with the new consuming service, remove the old import. Clean swap.
3. **If the old service is ALSO used for other, unrelated things in this file** (very common — the
   old service classes in this codebase tend to be large, multi-purpose grab-bags): **add** the
   new consuming service alongside the old one; do not remove the old injection. Only swap the one
   call site for this domain's data.
4. **Swap the one call site**, keeping the exact same `onResult`/`case` handling downstream
   untouched — if you find yourself needing to change that handling, you've picked the wrong
   result shape in the new service (go back to Section 5.3).
5. **Compile and live-verify this ONE screen** (Section 9) before moving to the next consumer.
   Never batch multiple untested screen migrations into one commit.
6. **Check the template (`.html`) too**, not just the `.ts` file — a component can compile clean
   while its template still references something the swap removed elsewhere.

### On shared services with unknown blast radius

Before removing or modifying an old service class's method used by a screen, check how many OTHER,
unrelated files reference that same service class for OTHER methods — a broad grep, not a guess.
If a shared service (e.g. `UmsBaseService`-shaped grab-bags in this codebase) is used across dozens
of files for many purposes, scope your change to the ONE domain-specific method; do not refactor
or "clean up" the shared service's other responsibilities as part of this migration.

---

## SECTION 9 — TESTING & VERIFICATION CHECKLIST

Every domain onboarded or every screen migrated must be verified against ALL of these, live,
against `http://localhost:4440/` — never canary, never inferred from reading code alone.

- [ ] **Cold start**: backend `curl` with no `lastSyncAt` on a key Redis has never marked →
      `changed:true`, correct fall-through to the live database, Redis seeded afterward.
- [ ] **Dirty check, unchanged**: immediate repeat call with the exact `lastSyncAt` just returned
      → `changed:false`, no payload.
- [ ] **First real page load populates IndexedDB**: open the domain's cached record directly via
      `browser_evaluate` (or the app's own Cache Management panel) and confirm the full expected
      shape — `cacheKey`, `settingType`, `service`, `dbInfo`, `lastSyncAt`, `data`.
- [ ] **Network call uses the new sync endpoint**, not the old plain endpoint, on the migrated
      screen's load.
- [ ] **Cache-hit path, live**: navigate away and back (a fresh component instance) with a valid
      cached `lastSyncAt` — confirm the sync call sends it, gets `changed:false`, and the screen
      renders correctly with **zero** extra full-fetch call.
- [ ] **Save → cache refresh, full cycle**: perform a real save, inspect the save response and the
      IndexedDB record immediately after — `lastSyncAt` must update WITHOUT any extra GET call
      (Section 5.4). Then trigger a fresh fetch (switch tabs and back) and confirm it correctly
      reports `changed:false` against that new `lastSyncAt`.
- [ ] **Every other consumer of the same domain benefits automatically**: switch to a sibling
      screen that shares the same consuming service and confirm it reuses the already-warm cache
      (no redundant fetch), still renders correctly.
- [ ] **Component/mandatory-field display correctness**: don't just check the network call — select
      real data on the screen (a specialty, a type, a patient) and confirm the rendered
      checkboxes/mandatory markers match known-good ground truth, not just "no errors."
- [ ] **Cross-role / cross-tenant check** (if the domain might be tenant-scoped — see Section 7):
      log in as a different role and, if applicable, a different tenant; confirm the served data
      is correct for THAT context, not silently reused from a prior user's session.
- [ ] **Console clean**: zero errors traceable to the migration. Pre-existing, unrelated console
      noise (there is usually some, in any large codebase) should be identified as pre-existing —
      confirm by checking whether the same warning/error exists on unrelated screens, or existed
      before your change.
- [ ] **Compile clean** for the whole affected Angular project (`ng serve` "Compiled successfully",
      zero `error TS` / `error NG` lines) — Angular compiles a whole lazy-loaded module as one
      unit, so an unrelated pre-existing broken file elsewhere in the same project can block your
      otherwise-correct change from even being testable. See Section 10 for what to do about that.

### 9.1 How to actually clear/reload IndexedDB during testing

`browser_evaluate`'s `indexedDB.deleteDatabase(...)` frequently reports `"blocked"` if any
open connection exists (including the CURRENT page's own service holding one). Reliable sequence:
close the page/tab entirely (`browser_close`), THEN navigate to a fresh URL, THEN attempt the
delete — a genuinely fresh page load has no prior connection to block it. Don't loop retrying the
delete on the same stale page; it will not resolve.

### 9.2 How to force a clean re-login for a different-role test

`localStorage.clear()` + `sessionStorage.clear()` + expiring cookies does **not** clear
IndexedDB — a subsequent different-user login on the same browser profile will still read the
PREVIOUS user's cached settings record. For a domain confirmed genuinely global (Section 7), this
is correct/harmless. For a domain that IS tenant/site-scoped, you must also clear or bypass the
relevant IndexedDB record between role/tenant switches, or your test will silently pass on stale
cross-tenant data.

### 9.3 Multi-project dev-server memory constraint

This codebase's local dev server cannot run more than one heavy clinical/settings module at a time
(`ng serve` memory limits observed locally). Toggle `src/app/app-routing.module.ts` to exactly one
module active, full `taskkill` + restart the dev server (`npm run start-hybrid`) between testing
different modules — a webpack dev-server watcher can miss a **brand-new file's** creation
entirely (confirmed this session); a full process restart is the only reliable way to pick one up.
Editing an EXISTING file is picked up by the normal watcher fine; only brand-new files need this.

### 9.4 The app's own Cache Management debug panel

`app.topbar.component.ts`/`.html` — opened via the trash-icon button near the user profile —
lists every IndexedDB database on the origin (dynamically, via `indexedDB.databases()`) and can
show a "Synced: ..." line per database. This is hardcoded per DB *name* today (`if (dbInfo.name
=== 'SettingsCacheDB') ...`), not driven by any shared interface — if you add a getter for your
domain's most-recent sync timestamp, wire it the same way `SettingsCacheDB.getMostRecentSyncTimestamp()`
already is, rather than inventing a new UI pattern.

---

## SECTION 10 — KNOWN PITFALLS & GOTCHAS (learned the hard way this session)

- **A "stale, unrelated-looking" local git branch may actually be the CORRECT one.** Before
  assuming a submodule's checked-out branch is wrong because its name collides with something
  unfamiliar, check what commit the OUTER repo's own branch actually pins for that submodule
  (`git ls-tree HEAD -- path/to/submodule` in the outer repo) and compare — it may already be
  exactly right, just checked out incorrectly at some point.
- **Fixing the branch does not guarantee a clean compile.** Two submodules can each be on their
  own individually-"correct" pinned commit and still be mutually API-incompatible if their pins
  were chosen at different points in a shared dependency's (e.g. `clinical-casesheet`) history.
  This is a real, pre-existing inconsistency to report, not something to silently work around by
  re-pinning submodules yourself without explicit instruction.
- **Neutralizing pre-existing unrelated compile errors can reveal a "next layer".** Fixing the
  first batch of `error TS` lines can surface template-level (`NG8001`/`NG8002`) or DI-level
  (`NG2003`) errors that only appear once the file compiles far enough for the Angular compiler to
  reach them. Budget for at least one more pass; re-check the log after the first batch is clean.
- **Deleting an import and typing a constructor param `any` can silently break Angular DI**, not
  just fail to compile. If the removed class was injected via the constructor, Angular's compiler
  needs an actual resolvable token; `any` may inject `undefined` at runtime, or the compiler may
  refuse with an NG2003 diagnostic. If the class is genuinely gone upstream and the property is
  only ever used for its shape (e.g. `.tableArray`), convert it to a **plain, non-DI class field**
  with that same shape instead of a bare `any` DI parameter.
- **A "no user-specific access configured" fallback path can itself be broken and never noticed**,
  because it's rarely exercised — it only runs when a user has ZERO components under normal
  filtering. Testing with only one, already-well-configured test account will never hit it; test
  with a genuinely different role, not just a different login.
- **A settings domain being "global" (not tenant-scoped) is a real property of THIS codebase's
  current data model for the clinical-component tree specifically** — verified by reading the
  active backend method and finding no `customerBusinessId` filtering (a tenant-scoped version
  exists only as dead, commented-out code). Do not generalize this to every future domain; check
  each one independently (Section 7).
- **Background dev-server process launches on Windows**: `Start-Process -FilePath "cmd.exe"
  -ArgumentList '/c', 'npm', 'run', 'start-hybrid' -WorkingDirectory <dir> -RedirectStandardOutput
  <log> -RedirectStandardError <errlog> -WindowStyle Hidden -PassThru` is the reliable pattern in
  this environment; a `System.Diagnostics.Process` + `Start-Job` combo has been observed to fail
  silently (process exits immediately, no log ever created).

---

## SECTION 11 — STRICT DO-NOT RULES

- ❌ **Do not treat an empty/absent Redis mark as "unchanged."** Absence always means "changed,
  read live" — this is the cold-start guarantee. Getting this backwards breaks every first-deploy
  and every Redis flush.
- ❌ **Do not build a second IndexedDB database or object store for a new settings domain.** Reuse
  `SettingsCacheDB`'s single `settingsCache` store with a new `cacheKey`.
- ❌ **Do not build a second Redis wrapper class per domain** if a `ScopeCacheService`-shaped bean
  already exists for the owning backend service — reuse it.
- ❌ **Do not change the result shape or `type` constant a migrated screen's `onResult` receives.**
  The whole point of the consuming-service pattern is a zero-diff swap for callers.
- ❌ **Do not remove or repurpose a domain's old plain "get everything" endpoint** when adding the
  new sync endpoint — other, not-yet-migrated consumers, and the new consuming service's own
  `onError` fallback, both depend on it still existing.
- ❌ **Do not batch-migrate multiple consumer screens in one untested pass.** One at a time, each
  live-verified (Section 8, Section 9), even when the edit itself is mechanically identical across
  screens.
- ❌ **Do not assume a new settings domain is global (unscoped) without checking** whether its
  backend "get everything" method filters by tenant/site — see Section 7.
- ❌ **Do not "fix" or refactor a shared, multi-purpose old service class's unrelated
  responsibilities** while migrating one method off it. Scope the change to exactly the one method
  this migration concerns.
- ❌ **Do not silently paper over an Angular DI failure** by typing a constructor parameter `any`
  when the underlying class still needs to be a real injectable token. Convert to a non-DI plain
  field instead, and say so explicitly in the change.
- ❌ **Do not leave temporary compile-unblocking edits (`// TEMP: ... revert`) uncommitted and
  un-reverted** past the testing session that needed them — check for and clean these up before
  considering related work done; they are easy to forget and were found still lingering from an
  earlier, unrelated session during this very work.

---

## SECTION 12 — REFERENCE FILE INDEX (real, working implementation)

Read these directly as the concrete worked example — they are the actual, live, tested code this
skill document is describing, not illustrative pseudocode.

**Backend** (`user-management-service`):
- `src/main/java/.../service/ScopeCacheService.java` — the Redis wrapper.
- `src/main/java/.../service/impl/ClinicalComponentServiceImpl.java` — `casWrite()` /
  `casWriteMulti()` (the mark choke points), `getFullTreeSync()` (the sync method).
- `src/main/java/.../dto/FullTreeSyncResponse.java` — the sync response DTO.
- `src/main/java/.../service/ClinicalComponentService.java` — interface method declaration.
- `src/main/java/.../controller/UserMgmtController.java` — `GET /clinical/components/sync`.

**Frontend** (`lifetrenz-core`, core / app-wide):
- `src/app/base/service/settings-cache-db.ts` — `SettingsCacheDB`.
- `src/app/base/api/settings-cache-type-constant.ts` — `SettingsCacheServiceType` / `SettingsCacheType`.
- `src/app/base/api/common-api-constant.ts` — `CLINICAL_COMPONENT_TREE_SYNC_GET` constant.
- `src/app/base/service/clinical-settings-cache.service.ts` — the consuming service.
- `src/app/base/service/app-settings-cache-bootstrap.service.ts` — the login-time warm registry.
- `src/app/base/service/app.service.ts` — where the bootstrap is actually invoked
  (`onResult()`'s `UM_USER_PROFILE_` case, right after `autoCheckAndClearAccessRightsCache()`).
- `src/app/layout/app.topbar.component.ts` / `.html` — the Cache Management debug panel
  (`loadIndexedDBList()`, `checkSettingsCacheSync()`).

**Frontend** (settings-module screens, `projects/settings`):
- `src/lib/data/master/service/user-management/user-management.service.ts` —
  `getClinicalComponents()` (settings-module's own copy of the read-cache pattern, shares the same
  `cacheKey` as the core `ClinicalSettingsCacheService`) and `wrapSaveCallbackForCacheRefresh()`
  (the save-response cache-refresh pattern, Section 5.4).

**Frontend** (migrated patient-facing consumers — the concrete "how to migrate a screen" examples):
- `projects/inpatient/.../clinical-station/clinical-station.component.ts`
- `projects/emergency/.../encounter-summary/patient-banner.component.ts`
- `projects/opd-clinical/.../consult/consult-q/consult-q.component.ts`
- `projects/daycare-clinical/.../in-patient/patient-banner.component.ts`

**Plan/history documents** (`MY PLANS/Customize-Consult-Screen-Speciality-Concurrent-Overwrite-Fix/`):
- `03-CACHE-SYNC-FIX-PLAN.md` §4 — original architecture spec.
- `05-REDIS-INDEXEDDB-CACHE-SYNC-RESULTS.md` — settings-module implementation + live test results.
- `06-APP-WIDE-SETTINGS-CACHE-ARCHITECTURE-PLAN.md` — app-wide rollout across
  IP/OP/ER/DC/casesheet, including the branch-mismatch incident, the nurse-role bug found and
  fixed, and the still-deferred nurse-settings backend item — read this one for the fullest
  narrative of what went wrong and how it was diagnosed, alongside this skill's distilled rules.

---

## SECTION 13 — AGENT INTEGRATION RULES

### Loading

Any agent or developer given a task matching any of the following MUST load this skill first:
- "Onboard settings domain X onto the settings cache."
- "Migrate screen/component Y off its direct API call onto the cached settings service."
- "Why is this settings/mandatory-field/component-visibility data stale (or wrong) on screen Z?"
- Any task touching `SettingsCacheDB`, `AppSettingsCacheBootstrap`,
  `ClinicalSettingsCacheService` (or a sibling consuming service built under this pattern), or the
  backend `.../sync` endpoint family.

### Precedence

1. **Correctness of mandatory-field / component-visibility data** wins over cache-hit-rate — when
   genuinely unsure whether cached data is fresh, fetch live.
2. **Zero-diff for existing callers** (Section 5.3/5.4's contract) wins over any temptation to
   "clean up" a consuming screen's existing `onResult` handling while migrating it.
3. **This skill's patterns** win over inventing a new cache mechanism for a new domain — reuse
   `SettingsCacheDB` / `ScopeCacheService` / the bootstrap registry.
4. **Explicit user instructions in the current task** win over everything when unambiguous —
   e.g. an explicit decision to scope a domain per-tenant even where this document's default
   reasoning (Section 7) would suggest checking first.

### Reporting back

When an agent completes work under this skill, report:
- Which existing files were reused vs. which new files were created, and why creation was
  justified (a genuinely new domain/service, not a copy-paste of an existing one).
- Cold-start, cache-hit, and save-invalidation behavior, each **live-verified**, not asserted from
  reading code.
- Whether the domain is tenant/site-scoped or genuinely global, and how that was confirmed (which
  backend method was read, what filtering — or lack of it — was found).
- Any pre-existing, unrelated issues surfaced during compile/test (Section 10) — named explicitly
  as pre-existing, with evidence, never silently worked around without disclosure.
