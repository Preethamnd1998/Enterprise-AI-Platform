# Pagination — Exact UI Spec

## 1. Visual

```
 ┌───────────────────────── table footer cell (colspan = column count, text-center) ─────────────────────────┐
 │  « ‹ [1] 2 3 4 5 › »    117 records,  8 pages in total      [ 15 ▾ ]                                       │
 └─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- Container: `div.flex.col-12.p-0.justify-content-center` (centred row, no padding).
- Paginator: PrimeNG `p-paginator` default theme (page links, first/prev/next/last), `showCurrentPageReport`, report template
  `'{totalRecords} ' + ('records'|translate) + ',  {totalPages} ' + ('pages in total'|translate)` (two spaces after the comma).
- Page-size: `p-dropdown` with class `p-3` (padding), `appendTo="body"`, `optionLabel="value"`, options `[15,25,50,75,100]`, default 15.
- No custom CSS (the component's `.css` file is empty); never override paginator styling per screen.

## 2. Host markup

```html
<p-table [value]="rows" ...>
  ...
  <ng-template pTemplate="footer">
    <tr>
      <td colspan="__N__" class="text-center">
        <lifetrenz-lt-pagination
          #paginator
          id="paginator"
          [selectedPage]="paginatorService.selectedPage"
          (pageChange)="paginate($event)"
          (noOfRecordChange)="noOfRecordChange($event)"
        ></lifetrenz-lt-pagination>
      </td>
    </tr>
  </ng-template>
  <ng-template pTemplate="emptymessage"><tr><td colspan="__N__">{{ "No records found." | translate }}</td></tr></ng-template>
</p-table>
```
`[selectedPage]` binding is optional in the reference hosts (`AllAppointments` omits it) but **always bind it in new code** — it makes the data source explicit and is mandatory for multi-list pages.
Reference variant (ADT admitted patients) uses `<td colspan="11" class="text-center">`; FDM uses `<tr><td colspan="11">`. Use `text-center`.

## 3. Host TypeScript contract (single list)

```ts
providers: [LtPaginatorService]                       // component scope
paginate(event: any): void {                          // page click
  this.paginatorService.noOfRecord = event.rows;
  this.fetch();                                       // pageNo read live from the paginator (or event.page)
}
noOfRecordChange(eve: any): void {                    // size change (paginator already moved to page 1)
  this.paginatorService.noOfRecord = eve.value;
  this.fetch();
}
fetch(): void {
  const pageNo = this.paginatorService.paginator?.getPage() ?? 0;          // 0-based, never +1
  const pageSize = this.paginatorService.noOfRecord;                       // default 15
  // service call sets HttpParams pageNo, pageSize
}
onResult(result) { this.rows = result.data; this.paginatorService.selectedPage = result.page; this.loading = false; }
```
Filter change: `this.paginatorService.paginator.first = 0;` (no emit) → `fetch()`. Using `changePageToFirst()` on filter change re-emits `onPageChange` → a second request; the reference host (`onSearch`) calls it only when the current page `> 0` and guards the double fetch with the `isPaginator` flag — prefer `first = 0`.

## 4. Backend contract recap

Request: `?pageNo=<0-based>&pageSize=<15|25|50|75|100>&…filters`.
Response: `{ "data": [...], "page": { "totalPages": 8, "currentPageNo": 0, "currentPageSize": 15, "total": 117 } }`.
Everything else: parent skill `reference/end-to-end-contract.md`, `reference/be-sql-format.md`.

## 5. State diagram

```
init ── fetch(pageNo 0, size 15) ──▶ idle(page 0)
idle ──click page k──▶ pageChange{page:k, rows} ─▶ fetch(k, rows)
idle ──size change──▶ [component: first=0, selectedNoOfRecord=v] ─▶ noOfRecordChange{value:v} ─▶ fetch(0, v)
idle ──filter/search/clear/saved──▶ [host: paginator.first=0] ─▶ fetch(0, current size)
fetch ──ok──▶ rows=data; selectedPage=page ─▶ idle        fetch ──err──▶ loading=false; keep last state
```
`PageDTO.total` drives "N records"; the number of page links is computed by PrimeNG from `total / rows`.

## 6. i18n

Translate keys used by the component: `records`, `pages in total`. Table empty text per screen.
