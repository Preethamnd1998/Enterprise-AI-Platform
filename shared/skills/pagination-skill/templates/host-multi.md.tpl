# Multi-list host — two independent paginated lists in one component

## TypeScript
```ts
@Component({
  selector: "app-__feature__-queues",
  standalone: true,
  templateUrl: "./__feature__-queues.component.html",
  providers: [MessageService, LtPaginatorService],   // keeps options + protects against root leakage; NOT used for page/size here
  imports: [/* ..., */ LtPaginationComponent],
})
export class __Feature__QueuesComponent implements OnInit, ApiCallBack {
  readonly a = new ListPaginationState();            // list A
  readonly b = new ListPaginationState();            // list B
  rowsA: __RowA__[] = [];
  rowsB: __RowB__[] = [];

  // register each list's paginator reference (setter => works with *ngIf / tab panels mounting later)
  @ViewChild("pagerA") set pagerA(c: LtPaginationComponent) { this.a.pager = c; }
  @ViewChild("pagerB") set pagerB(c: LtPaginationComponent) { this.b.pager = c; }

  constructor(private api: __Feature__Service, public paginatorService: LtPaginatorService) {}

  ngOnInit(): void { this.fetchA(); this.fetchB(); }

  // ---- list A ----
  pageChangeA(e: any): void { this.a.onPage(e); this.fetchA(); }
  sizeChangeA(e: any): void { this.a.onSize(e.value ?? e); this.fetchA(); }
  filterChangedA(): void { this.a.reset(); this.fetchA(); }          // never touches B
  fetchA(): void { this.a.loading = true; this.api.getA(this, this.a.params()); }

  // ---- list B ----
  pageChangeB(e: any): void { this.b.onPage(e); this.fetchB(); }
  sizeChangeB(e: any): void { this.b.onSize(e.value ?? e); this.fetchB(); }
  filterChangedB(): void { this.b.reset(); this.fetchB(); }
  fetchB(): void { this.b.loading = true; this.api.getB(this, this.b.params()); }

  onResult(result: any, type: any): void {
    switch (type) {
      case __API_A__: this.rowsA = this.a.apply(result); break;     // own PageDTO
      case __API_B__: this.rowsB = this.b.apply(result); break;
    }
  }
  onError(err: any, type: any): void {
    if (type === __API_A__) this.a.loading = false;
    if (type === __API_B__) this.b.loading = false;
    // toast
  }
}
```

## HTML
```html
<!-- list A -->
<p-table [value]="rowsA" [loading]="a.loading" ...>
  <ng-template pTemplate="footer"><tr><td colspan="__N__" class="text-center">
    <lifetrenz-lt-pagination #pagerA
      [selectedPage]="a.pageData"
      (pageChange)="pageChangeA($event)"
      (noOfRecordChange)="sizeChangeA($event)"></lifetrenz-lt-pagination>
  </td></tr></ng-template>
</p-table>

<!-- list B -->
<p-table [value]="rowsB" [loading]="b.loading" ...>
  <ng-template pTemplate="footer"><tr><td colspan="__M__" class="text-center">
    <lifetrenz-lt-pagination #pagerB
      [selectedPage]="b.pageData"
      (pageChange)="pageChangeB($event)"
      (noOfRecordChange)="sizeChangeB($event)"></lifetrenz-lt-pagination>
  </td></tr></ng-template>
</p-table>
```

## Notes
- Each list uses its own endpoint/param set and returns its own `{data, page}`.
- Do not read `paginatorService.paginator` / `selectedPage` / `noOfRecord` in this host.
- Tabs with lazy panels: call `a.reset()` (or recreate state) when the tab is re-activated; a re-created paginator starts at page 1 / size 15.
- Separate child components per list: use the injectable subclasses from `list-pagination-state.ts.tpl` and provide each in its component's `providers`.
- Same-size default is `15`; the paginator's own dropdown starts at `15` per instance, so a state default other than 15 will disagree — keep 15.
