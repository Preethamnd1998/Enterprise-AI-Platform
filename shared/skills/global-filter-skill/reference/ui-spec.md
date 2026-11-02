# Global Filter — Exact UI Spec (from `searchbar-all-appointment`)

## 1. Where it lives

| Element | Spec |
|---|---|
| Trigger | App top bar (`app.topbar.component.html`): pill `span.custom-button` = white `pi pi-search` icon · date label (only if `appData.isDateVisible`) · text input (placeholder = `searchMenuService.searchPlaceHolder`) · `pi pi-times` clear (visible when `searchString !== ''` or `searchDateString !== 'Today'`) · white `pi pi-sort-down-fill` arrow (tooltip Collapse/Expand, toggles `pi-caret-down`). Shown only when `appData.isSearchVisible`. |
| Overlay | Module shell `<p-overlayPanel #searchOP class="fadeoutdown animation-duration-1000 p-0" [style]="{ width: '480px', marginLeft: '60px' }" appendTo="body">` containing `<router-outlet name="searchbar">`; list outlet follows. Opens on `searchBarToggleEvent$`; auto-hides on every `searchBarViewEvent$` emission. |
| Panel root | `<div #searchComponent class="grid">` |

## 2. Panel layout

```
<p-splitter [panelSizes]="[30, 70]" [style]="{height:'auto'}">         ::ng-deep .p-splitter { border:none }
  LEFT  (30%)  div.mt-2.pr-2.bg-bluegray-50.border-round-lg
                 .time-container   h6.text-primary "Appointment Date"   ← title per screen ("<Entity> Date")
                                   one .list-item.block per chip (click → handleItemClick(i))
                                   selected chip: class `selected` + "✓" span.tick-mark
                 .date-range-container   (column, gap 16px, padding 12px 0)
                                   From Date p-calendar  /  To Date p-calendar
  RIGHT (70%)  <form [formGroup]="service.form"> div.col-12.grid
                 fields: div.form-group.col-12.xl:col-6.lg:col-6.md:col-12.sm:col-12 (2-up on lg+)
                 action row: div.col-12.flex.flex-wrap.justify-content-start.align-items-center.-mb-3  style gap .5rem 0
```
Below the splitter: saved-filter list (only when `showFilter` checked).
Footer of the file: `<p-toast key="tst" [preventOpenDuplicates]="true">` and `<p-confirmDialog [style]="{width:'450px'}">`
(both repeated inside and outside the root div in the reference — keep one pair outside; the in-panel pair is redundant).

## 3. Time chips

Labels in order (`service.time`): `Today`, `Last 24 hours`, `Last 7 days`, `Last 15 days`, `Last 30 days`, `Next 7 days`,
`Next 15 days`, `Next 30 days`. A screen may use a subset **of these exact labels** (ArtifactUtils.getDateTimeFromRange
also knows Last 5/15/30 minutes, 1/3/6/12 hours, 2 days, 90 days — currently commented out; adding them is a UX change, ask).
Semantics (`ArtifactUtils.getDateTimeFromRange`): Today = now..now (UTC range helper expands to day bounds on send);
Last 24 hours = today−1 day; Last N days = today−N; Last 30 days = −1 month; Next N days = tomorrow 00:00 .. today+N.

Styles (SCSS): `.list-item {margin-bottom:1rem; cursor:pointer; transition:color .3s; font-weight:400; color:#796E81}`,
hover `#22c55e`; `.selected {font-weight:600; color:#188a42; padding:4px; border-radius:10px; background:#caf1d8; margin-right:5px}`;
`.tick-mark {margin-left:5px}`.

## 4. Calendars

Both: `selectionMode="single" appendTo="body" dateFormat="dd-mm-yy" showButtonBar="true" [showIcon]="true"`,
`[minDate]` = today minus 3 months (`new Date(y, m-3, d)`), placeholder `Select From Date` / `Select To Date`
(translate), `[style]="{minWidth:'100%', border:'1px solid rgb(0 0 0 / 23%)'}"`, `(onClose)` handlers.
Labels: `class="font-medium text-800"` "From Date"/"To Date". Wrapper `.date-field-wrapper` (column, gap 6px; label 14px/500/#333;
input padding `8px 12px`, border `1px solid #ccc`, radius 4px).
Rules: choosing a date patches `rangeDate=[from, to||from]`, sets `selectedIndex=-1`, `selectedTime=""`, hides overlay after
100 ms. `To < From` → toast error `To Date cannot be before From Date`, no patch.

## 5. Buttons (action row), in order

| Button | Props | Look |
|---|---|---|
| Clear | `pButton pRipple label="Clear" type="button" class="p-button-danger mr-2" pTooltip="Clear"` | `minWidth:55px; background:#E54646` |
| Search | `label="Search" class="p-button-sucess mr-2"` (typo in source; omit the class) | `minWidth:55px; background:#0BC9B8` |
| Card Search (optional, FDM only) | `*ngIf="cardReaderService.enableReadFromCard"` `p-button-info` | skip unless the screen reads Emirates ID cards |
| Save Filter | `label="Save Filter" class="p-button-warning mr-2" (click)="onFilter(); top.toggle($event)"` | `minWidth:55px; background:#F8C649; color:#333333` |
| Show filter | `<p-checkbox class="ml-1" label="Show filter" formControlName="showFilter" [binary]="true">` | reveals saved list |

Component SCSS button theme (scoped to the panel): `.p-button {color:#fff; background:#009688; border:0; padding:5px; font-size:1rem; padding-bottom:7px; border-radius:20px; transition:…}`
and `.p-button.p-button-danger {color:#fff; background:#F95656; border:0; border-radius:20px; padding-bottom:7px}`.
(Inline `[style]` backgrounds above override these.) Full SCSS in `templates/searchbar.component.scss.tpl`.

## 6. Field recipes (pick per filter; wrapper is always `.form-group.col-12.xl:col-6.lg:col-6.md:col-12.sm:col-12` + `<label class="font-medium text-800">`)

| Kind | Markup essentials |
|---|---|
| Text | `<input class="w-full" type="text" pInputText formControlName=… (keydown.enter)="search()" placeholder="{{'Label'|translate}}" [style]="{minWidth:'100%', border:'1px solid rgb(0 0 0 / 23%)'}">` |
| Numeric-only text (mobile) | + `(keypress)="numberOnly($event)" (paste)="preventPaste($event)" maxlength="10"` |
| Single select | `<p-dropdown … appendTo="body" placeholder="All" [showClear]="true" (keydown.enter)="search()" (onChange)="onChangeStopPropgation($event)" [style]=…>` ; add `[filter]="true" filterBy="nameEn"` when > ~8 options |
| Multi select (status) | `<p-multiSelect … display="chip" placeholder="All" [filter]="true" filterBy="nameEn,identifierCode" [showClear]="true">` with templates: `selectedItem`/`item` = `<i class="pi pi-circle-fill" [ngStyle]="{color: x.colorCode}"></i><div>{{name}}</div>` in `flex align-items-center gap-2`; `selectedItems` = `"N selected"` or `"All"` |
| Masked id | `p-inputMask` with mask + placeholder (Emirates ID `784-9999-9999999-9`) |
| Boolean | `<p-checkbox class="ml-1" label="…" [binary]="true" formControlName=…>` |
| Dependent dropdown | parent `(onChange)` rebuilds child options; `All`/clear restores full list (specialization → physician) |

Placeholder for "no selection" is **"All"** (not an "All" option object). Empty control values: `""` (text) / `null` (select).

## 7. Save-filter overlay

`<p-overlayPanel #top [showCloseIcon]="true" [style]="{width:'19rem'}" appendTo="body">`: label `FilterName`; input
`[style]="{width:'15rem'}"`, `formControlName="filterName"`, `oninput` strips chars not in `[A-Za-z0-9-,.;'&/.() ]` and a leading space;
right-aligned `Save` button (`p-button-warning`, `[loading]="saveFilterLoading"`, id `SaveFilter`).
Opening it runs `onFilter()` which pre-fills `"Filter " + (max existing "Filter N" + 1)`.
`saveFilter`: empty name → warn toast `Please Enter Filter name`; else POST, hide overlay, toast `Filter saved successfully`.

## 8. Saved filter list (below splitter, when `showFilter`)

- Empty: centered text `No Filters Saved- Filters Once saved will display here` (translate).
- Row: `div.col-12 > div.grid.flex (click → onSelectFilter(filter))` with columns
  `col-1`: round icon button `pi pi-stop-circle` — default = teal themed (tooltip `Default`, click unsets), non-default `background-color: gray` (tooltip `Set as default`);
  `col-10`: borderless text input with the name (Enter → rename) + line with creator (`color: rgb(62,110,110)`) and `(x min ago)` (`color: gray`, via `ArtifactUtils.getRecordedDetails`);
  `col-1`: `p-button-rounded p-button-danger` `pi pi-trash` (tooltip `Delete`);
  `col-12`: `<p-divider class="col-12 p-0 m-0">`.
- Clicking a row applies the filter and searches; the icon buttons must not trigger the row click (stopPropagation in your handlers — the reference relies on button order; add `$event.stopPropagation()`).

## 9. Chips in the top bar

After every search, `searchMenuService.searchStringEmit(service.updateChipValues())` writes a comma list of non-empty
filter labels (name fields raw, select fields `.name`, multi-select names joined). `rangeDate` contributes no chip;
the date label shows `searchDateString` (`Today`/chip label/`Custom`).
