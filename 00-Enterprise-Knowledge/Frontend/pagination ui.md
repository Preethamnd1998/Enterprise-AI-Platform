# UI — Pagination Instructions

> Also read: `coding-standards/STANDARDS.md`.

---

## Rule: Always Use `<lifetrenz-lt-pagination>`

Never use raw `<p-paginator>` in feature templates. Always use the custom `<lifetrenz-lt-pagination>` component which wraps it with per-page selection and standard state management via `LtPaginatorService`.

---

## Template

```html
<lifetrenz-lt-pagination
  #paginator
  id="paginator"
  [selectedPage]="paginatorService.selectedPage"
  (pageChange)="paginate($event)"
  (noOfRecordChange)="noOfRecordChange($event)">
</lifetrenz-lt-pagination>
```

Place this below the data table.

---

## Component TypeScript

```typescript
import { LtPaginatorService } from 'src/app/data/service/lt-paginator.service';
import { LtPaginationComponent } from 'src/app/lt-components/lt-pagination/lt-pagination.component';

@Component({
  selector: 'app-my-list',
  templateUrl: './my-list.component.html',
  providers: [
    MessageService,
    LtPaginatorService    // Scope per component — avoids cross-queue state leaks
  ],
  imports: [LtPaginationComponent]
})
export class MyListComponent implements OnInit, ApiCallBack {

  dataList: any[] = [];
  loading = false;

  constructor(
    private myService: MyFeatureService,
    private messageService: MessageService,
    public paginatorService: LtPaginatorService,
    public translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.loadPage(1, this.paginatorService.noOfRecord);
  }

  // Called by paginator page change
  paginate(event: any): void {
    this.loadPage(event.page + 1, this.paginatorService.noOfRecord);
  }

  // Called by paginator records-per-page change
  noOfRecordChange(eve: any): void {
    this.paginatorService.noOfRecord = eve.value;
    this.loadPage(1, eve.value);
  }

  private loadPage(pageNo: number, pageSize: number): void {
    this.loading = true;
    this.myService.getItems(this, pageNo, pageSize);
  }

  onResult(result: any, type: any, other?: any): void {
    switch (type) {
      case AppGlobalConstant.MY_FEATURE_GET:
        this.dataList = result.data;
        this.paginatorService.selectedPage = result.pageDTO;   // store page metadata
        this.loading = false;
        break;
      default:
        break;
    }
  }

  onError(err: any, type: any): void {
    this.loading = false;
    AppUtils.showErrorViaToast(this.messageService,
      this.translateService.instant('Failed to load data'));
  }
}
```

---

## LtPaginatorService Defaults

| Property | Default |
|---|---|
| `noOfRecord` | `15` |
| `pageNo` | `1` |
| `noOfRecordOptions` | `[15, 25, 50, 75, 100]` |

---

## Backend Request Parameters

Pass pagination to the service call:

```typescript
apiObject.params = {
  pageNo: pageNo,        // 1-based
  noOfRecord: pageSize
};
```

The response from the BE must include a `pageDTO` object that is stored in `paginatorService.selectedPage` to drive the paginator UI state.

---

## Rules

- `LtPaginatorService` must always be in the component's `providers: []` — never `providedIn: 'root'`.
- Always reset to page 1 when `noOfRecord` changes.
- Always set `this.loading = false` in both `onResult` and `onError`.