# Several Paginated Lists on One Page — Independent Instances

## 1. The problem (verified in source)

- `LtPaginatorService` holds **one** `paginator` (the PrimeNG ViewChild), **one** `selectedPage`, **one** `noOfRecord`.
- Every `LtPaginationComponent` does `paginatorService.paginator = this.paginator` in `ngOnInit`; with N paginators inside one provider scope **the last created wins**.
  Any host code that does `paginatorService.paginator.getPage()` / `.first = 0` then talks to the *wrong* paginator.
- `selectedPage` and `noOfRecord` on the service are single values: list A's size/total would show on list B.
- The component already isolates two things per instance: `[selectedPage]` input (display metadata) and local `selectedNoOfRecord` (the dropdown). It does **not** isolate the page number, the paginator reference, or the host's `noOfRecord`.
- Root-singleton leakage: a host that does not list `LtPaginatorService` in `providers` shares it with the whole app (page A's state appears on page B).

Source note: the knowledge file lists 15+ templates with two or more paginators; in the current tree the sampled templates (`all-admitted-patients`, `ip-dnfb`) contain one active instance (the second is commented out). Treat multi-instance pages as **legitimate but must be built deliberately** — do not assume an existing screen already does it correctly.

## 2. Design: one pagination state per list

Each list owns a `ListPaginationState`:

| Field | Meaning |
|---|---|
| `pageNo` | 0-based current page (set from `event.page`) |
| `pageSize` | rows per page (default 15; set from `event.rows` / `noOfRecordChange.value`) |
| `pageData: PageDTO \| null` | this list's response metadata → `[selectedPage]` |
| `loading` | per-list spinner |
| `pager?: LtPaginationComponent` | reference to **this list's** `<lifetrenz-lt-pagination #pagerX>` |

Methods: `onPage(event)`, `onSize(value)`, `reset()` (page 0 **and** `pager.paginator.first = 0` without emitting), `apply(result)` (rows + `pageData`).

Per-list **service** option (when the list lives in its own child component or needs DI): `@Injectable()` (no `providedIn`) subclass per list, provided in that child component's `providers`:
```ts
@Injectable() export class AdmittedPaginationState extends ListPaginationState {}
@Injectable() export class PendingPaginationState  extends ListPaginationState {}
```
Two lists in the **same** component cannot get two instances of one class from DI → use two subclasses **or** two plain instances (`new ListPaginationState()`); prefer plain instances in the host for same-component lists, subclasses/providers for separate child components.

## 3. Wiring rules

1. Host (or each child component) lists `LtPaginatorService` in `providers` (keeps `noOfRecordOptions` and protects against root leakage) — but **never reads page/size/paginator from it** in multi-list mode.
2. Each `<lifetrenz-lt-pagination>` gets a template ref and its own handlers:
   `#pagerA [selectedPage]="a.pageData" (pageChange)="a.onPage($event); fetchA()" (noOfRecordChange)="a.onSize($event.value); fetchA()"`.
3. Register the reference after view init: `@ViewChild("pagerA") set pagerA(c) { this.a.pager = c; }` (setter, so `*ngIf`/tab panels that mount later still register).
4. A filter change that affects list A calls `a.reset()` then `fetchA()` — never touches B.
5. Request params come from the list's own state: `pageNo = a.pageNo`, `pageSize = a.pageSize`.
6. Each list has its own `loading`, own `onResult` branch (distinct API constant or `other` tag) and own error handling.
7. Tabs: if tabs are lazy (`*ngIf`), a destroyed paginator resets to page 0 visually; call `state.reset()` on tab (re)activation so state matches.
8. A paginator hidden by `*ngIf` leaves `state.pager` undefined — `reset()` must null-check.

## 4. Rules for the backend side

Each list = its own endpoint (or its own `type` param) returning its own `{data, page}`. Never one endpoint returning two pages' metadata. Each query applies its own deterministic ORDER BY (parent skill).

## 5. When NOT to use this

Single list: use `host-single.md.tpl` (reference approach with `paginatorService`). Don't pay the extra state class for one list.
