# Routing + shell wiring (once per module; per screen add one route)

## 1. Auxiliary route (module `*-routing.module.ts`) — one per filter screen
```ts
{ path: "searchbar-__feature__", component: Searchbar__Feature__Component, outlet: "searchbar" },
```
(FDM has dozens of these: `searchbar-all-appointment`, `searchbar-adhoc-schedule`, `searchbar-bed-booking`, …). The route name is the string the host
puts in `shellService.searchRoute`.

## 2. Shell template (already exists in FDM; replicate for a new module)
```html
<p-overlayPanel #searchOP class="fadeoutdown animation-duration-1000 p-0"
  [style]="{ width: '480px', marginLeft: '60px' }" (onShow)="onOverlayShow($event)" (onHide)="onOverlayHide($event)" appendTo="body">
  <router-outlet name="searchbar"></router-outlet>
</p-overlayPanel>
<router-outlet></router-outlet>
```

## 3. Shell component (module main component) — the contract
```ts
ngOnInit() {
  this.subscriptionToggle = this.searchMenuService.searchBarToggleEvent$.subscribe((el) => this.searchOP.toggle(event, el));  // top-bar arrow
  this.subscriptionHandleSearch = this.searchMenuService.searchBarViewEvent$.subscribe(() => this.searchOP?.hide());          // close after Search
}
onOverlayShow() {   // mount the screen's panel
  const target = this.shellService.searchRoute /* || other per-URL overrides */;
  if (target) this.router.navigate([{ outlets: { searchbar: [target, { open: true }] } }],
    { relativeTo: this.activatedRoute, queryParamsHandling: "preserve", skipLocationChange: true, replaceUrl: false });
}
onOverlayHide() {   // unmount (panel is destroyed every close)
  this.router.navigate([{ outlets: { searchbar: null } }],
    { relativeTo: this.activatedRoute, queryParamsHandling: "preserve", skipLocationChange: true, replaceUrl: true });
}
ngOnDestroy() { unsubscribe toggle, data, handleSearch subscriptions }
```
`FdmMainService.searchRoute` (string, default `""`) is the hand-off from host page to shell. In a module without a shell service, add one tiny root service
with `searchRoute = ""` rather than reusing another module's.

## 4. Per-module `SearchMenuService`
Other libraries (e.g. `daycare-clinical`) keep a **local** `search-menu.service.ts` with the same members instead of importing the app-root one. Check which one the module
already uses and keep the panel, host and shell on the **same** instance.

## 5. Enum members (both sides; append only)
- UI: `patient-lib/src/lib/data/model/filter-component-type.ts` → add `__FILTER_KEY__ = "__FILTER_KEY__"` (140+ members exist; never reuse one).
- BE: `…core.search.enums.FilterComponentType` → add `__FILTER_KEY__`. Check `component_filter.component_type` for a DB constraint/lookup on the live DB first; a constraint needs a migration (High-risk gate).

## 6. Top-bar flags
Host sets `appData.isSearchVisible = true` (and `isDateVisible` for screens with a date range). Leaving to a screen without filter must set `isSearchVisible = false`.
