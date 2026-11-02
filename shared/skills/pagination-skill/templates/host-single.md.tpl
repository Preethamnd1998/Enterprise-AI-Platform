# Single-list host (reference style) — TS + HTML

## TypeScript
```ts
import { LtPaginatorService } from "src/app/data/service/lt-paginator.service";
import { LtPaginationComponent } from "src/app/lt-components/lt-pagination/lt-pagination.component";

@Component({
  selector: "app-__feature__-list",
  standalone: true,
  templateUrl: "./__feature__-list.component.html",
  providers: [MessageService, LtPaginatorService],      // component scope — NEVER rely on the root singleton
  imports: [/* ..., */ LtPaginationComponent],
})
export class __Feature__ListComponent implements OnInit, ApiCallBack {
  rows: __Row__[] = [];
  loading = false;

  constructor(
    private api: __Feature__Service,
    private messageService: MessageService,
    public paginatorService: LtPaginatorService,
    public translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.fetch();                                       // page 0, default size (15)
  }

  /** (pageChange): PrimeNG event { page (0-based), first, rows, pageCount } */
  paginate(event: any): void {
    this.paginatorService.noOfRecord = event.rows;
    this.fetch();
  }

  /** (noOfRecordChange): { value }. The component already moved to page 1. */
  noOfRecordChange(eve: any): void {
    this.paginatorService.noOfRecord = eve.value;
    this.fetch();
  }

  /** Call for any filter/search/clear/apply-saved change: back to page 1, ONE request. */
  onFilterChanged(): void {
    if (this.paginatorService.paginator?.first) {
      this.paginatorService.paginator.first = 0;        // no emit => no duplicate fetch
    }
    this.fetch();
  }

  fetch(): void {
    this.loading = true;
    const pageNo = this.paginatorService.paginator?.getPage() ?? 0;   // 0-based, never +1
    const pageSize = this.paginatorService.noOfRecord;                 // 15 by default
    this.api.getList(this, /* filters..., */ pageNo, pageSize);        // HttpParams: pageNo, pageSize
  }

  onResult(result: any, type: any, other?: any): void {
    switch (type) {
      case __API_CONSTANT__:
        this.rows = result?.data ?? [];
        this.paginatorService.selectedPage = result?.page;             // PageDTO
        this.loading = false;
        break;
    }
  }

  onError(err: any, type: any): void {
    this.loading = false;
    AppUtils.showErrorViaToast(this.messageService, this.translateService.instant("Failed to load data"));
  }
}
```

## Service call (HttpParams)
```ts
getList(cb: ApiCallBack, /* filters */, pageNo: number, pageSize: number): void {
  let params = new HttpParams()
    .set("pageNo", pageNo)          // 0-based
    .set("pageSize", pageSize);
  // .set("<filter>", value ?? "")   — UI sends "" for empty; controller normalises blank -> null
  const apiObject = {} as ApiCallHelper;
  apiObject.service = __API_CONSTANT__; apiObject.method = "GET"; apiObject.params = params;
  this.lzApiService.getData(apiObject, cb, __API_CONSTANT__);
}
```

## HTML
```html
<p-table [value]="rows" [loading]="loading" ...>
  <!-- header / body -->
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
  <ng-template pTemplate="emptymessage">
    <tr><td colspan="__N__">{{ "No records found." | translate }}</td></tr>
  </ng-template>
</p-table>
```
With the global filter: call `onFilterChanged()` from the host's `handleSearch` (filter skill `host-integration.ts.tpl` already resets `paginator.first = 0` and fetches — don't fetch twice).
