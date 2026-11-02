# UI — App Shell: Access-Driven Menu, Theming, Cache Management

> Also read: `component.md`, `others.md`.

**Related, parallel subsystem (added 2026-10-13 reorg audit):** this file covers
access-rights/menu/button-access caching specifically. For the newer, generic clinical-*settings*
cache (mandatory fields, component/speciality/role/user access) — a different data domain with
its own IndexedDB store (`SettingsCacheDB`) and Redis dirty-check (`ScopeCacheService`) — see
`shared/skills/settings-redic-index-db-cache-skill/SKILL.md`. The two are intentionally separate
systems for separate data, not duplicates of each other. One factual note verified against
source while auditing both: `AccessRightsCacheService` (line 2 below) uses the `idb` wrapper
library, unlike `SettingsCacheDB`/`ConfigMenuService`, which use raw `window.indexedDB` — this is
the one real exception to the "no wrapper library" convention described in the settings skill;
that skill has been corrected to no longer cite `AccessRightsCacheService` as supporting
evidence for it.

---

## 1. Access-driven menu (`app-menu`)

`src/app/layout/app.menu.component.ts` (selector `app-menu`) is a thin
renderer — it has no static menu data itself. It renders `AppData.menuComponents`:

```html
<ng-container *ngFor="let item of this.appData.menuComponents; let i = index">
  <li app-menuitem *ngIf="!item.separator" [item]="item" [index]="i" [root]="true"></li>
</ng-container>
```

### Where the data comes from

On profile load (`app.service.ts`, `onResult` for `UM_USER_PROFILE_`):

1. `umsBaseService.getAllApplications(...)` → `ums/application/components`
   (`UMS_APPLICATION_COMPONENTS`) — the full component tree with `asAccess`
   flags, owned by `user-management-service` (MongoDB `LTHS-USER-MGMT`,
   `application_component` collection). Populates
   `AppData.applicationComponents`, split into `userData.userAccess`/`noAccess`.
2. `umsBaseService.getUserApplicationsAccessRights(...)` →
   `UMS_USER_APPLICATION_ACCESS_RIGHTS` — handed to
   `AccessRightsService.getApplicationAccess()`
   (`src/app/base/service/access-rights.service.ts`), which recursively walks
   `.children` and builds `AppData.menuComponents` (`label`, `icon`, `items`,
   `routerLink`, `img`, `identifierCode`, `sequenceNo`, sorted by
   `sequenceNo`) — this is the literal structure `app-menu` renders.
3. `umsBaseService.getButtonAccessRights(...)` →
   `UMS_BUTTON_ACCESS_SETTINGS` (`ums/button/access/settings`) →
   `userData.buttonAccessList`. Checked per-button via
   `AccessRightsService.checkButtonAccess(identifier)` — **fails open**: if the
   list isn't loaded yet or the identifier isn't found, it returns allowed.

### Caching — two tiers

**Frontend**: `AccessRightsCacheService`
(`src/app/base/service/access-rights-cache.service.ts`) — IndexedDB (`idb`
library), database `access-rights-cache-db`, keyed by
`cacheType:customerBusinessId:identifier:roles:userId`, with hash-integrity
validation and a 7-day default max-age. `CacheType` = `APPLICATION_COMPONENTS`
| `USER_ACCESS_RIGHTS` | `BUTTON_ACCESS_SETTINGS`. Each of the three
`ums-base.service.ts` fetch methods above checks this cache first and only
hits the REST endpoint on a miss, writing the result back afterward.

**Backend**: Redis, checked/cleared via `UMS_ACCESS_CACHE_STATUS` /
`UMS_ACCESS_CACHE_CLEAR` (`umsBaseService.getCacheStatus` /
`clearCacheBackend`). `app.service.ts`'s
`autoCheckAndClearAccessRightsCache()` runs on **every** profile load, before
any access-rights cache read — if the backend reports a change, it clears the
backend cache first, then the local IndexedDB cache. The code carries an
explicit comment warning that skipping this order serves stale access data for
one cycle — preserve the order if you touch this flow.

### Note for embedded React apps

`app.service.ts` has a real comment "Standalone React apps — skip UMS
access-rights calls entirely" and branches on
`reactAppIdentifiers.includes(currentIdentifier)` to skip menu population for
those apps — relevant if wiring a React app (e.g.
`ui/license-management-system`) into the same shell.

---

## 2. `app-config` — styling, NOT language

`src/app/layout/config/app.config.component.ts` (selector `app-config`) uses
`<p-sidebar>` for a runtime settings panel. Backed by `LayoutService`'s
signal-based `config()`: `colorScheme` (light/dark), `componentTheme` (17
named colors), `menuTheme` (12 options), `topbarTheme` (19 options),
`tableHeaderTheme`, `scale` (12–16px), `inputStyle`, `ripple`, `menuMode`,
`menuProfilePosition`. Persisted per-user via `ConfigMenuService`.

### How a theme change actually applies

`app.layout.service.ts`, `changeTheme()`:

```ts
changeTheme() {
  const themeLink = <HTMLLinkElement>document.getElementById('theme-link');
  const themeLinkHref = themeLink.getAttribute('href')!;
  const newHref = /* swap the componentTheme/colorScheme segment of the path */;
  this.replaceThemeLink(newHref);
}
```

It swaps the `href` of a `<link id="theme-link">` tag — i.e. it loads an
**entirely different PrimeNG theme CSS file** at runtime. It is not a
CSS-variable toggle or a class swap on `<body>`.

**Implication for new components**: a hardcoded color in a new component will
not repaint when the user changes `componentTheme`/`colorScheme` — only
PrimeNG theme-driven styling (or the CSS custom properties a PrimeNG theme
defines) responds to this mechanism. Design new UI to use theme-aware
PrimeNG classes/variables, not hardcoded hex colors, so it keeps working across
theme changes.

### Language switching lives elsewhere, not in `app-config`

`app.topbar.component.ts`, `onSelectLanguage(event)`:

```ts
this.masterService.selectedSystemLang = event.value;
this.umsBaseService.updateUserAppLanguage(...);   // persisted server-side
```

The actual `translateService.use(...)` call happens in `app.service.ts`'s
profile-load handler, reading `userData.userProfile.user.appLanguage.name`.
Language is a topbar dropdown + a profile field — don't document it as part of
the `app-config` styling sidebar.

---

## 3. Cache Management dialog

Lives inside `app.topbar.component.ts`/`.html` — not a separate component.
`header="Cache Management"`, opened by `clearAccessRightsCache()` (misleadingly
named — it opens the dialog, it doesn't clear anything by itself), toggled by
`displayCacheDialog`. Lists three IndexedDB databases, each with its own
change-detection and clear button:

| Database | Clear action |
|---|---|
| `access-rights-cache-db` | `umsBaseService.clearCacheBackend(...)` (Redis) → then clears the local IndexedDB db. This is what forces the menu (§1) to re-fetch `application_component`/access-rights data. |
| `translation-cache-db` | `umsBaseService.clearTranslationCache(...)` |
| `master-data-cache-db` | `masterService.clearMasterDataCacheAll(...)` |
| any other db name | generic `this.deleteDatabase(dbInfo.name)` — local IndexedDB delete only, no backend call |

## Rules

- If a menu/access-rights change isn't showing up for a user, the fix is
  clearing `access-rights-cache-db` via the Cache Management dialog (or its
  underlying service calls) — not just a browser hard-refresh, since the data
  is cached in IndexedDB.
- Preserve the "clear backend cache, then clear local cache" order in
  `autoCheckAndClearAccessRightsCache()` if you touch it.
- New components must not hardcode colors that would break under a
  `componentTheme`/`colorScheme` change — use PrimeNG theme-aware styling.
- Don't add a language-switching UI inside `app-config` — it belongs in the
  topbar, wired through `masterService`/`umsBaseService`/`TranslateService`.
