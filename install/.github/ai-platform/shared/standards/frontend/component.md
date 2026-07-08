# UI — Component Instructions

> Also read: `coding-standards/STANDARDS.md` before writing any component.

---

## File Structure (4-file quartet, always)

```
my-feature/
├── my-feature.component.ts       ← class, lifecycle, ApiCallBack
├── my-feature.component.html     ← PrimeNG template
├── my-feature.component.scss     ← scoped styles (use global theme where possible)
└── my-feature.component.spec.ts  ← Karma/Jasmine unit tests
```

Shell/routed components also include `my-feature-routing.module.ts`.

---

## Component Class Template

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { MessageService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';
import { ApiCallBack } from 'src/app/base/api/api-callback';
import { AppUtils } from '@clinical-casesheet/data/common/app-utils';
import { AppGlobalConstant } from '@clinical-casesheet/data/common/global-contant';
import { MyFeatureService } from './my-feature.service';

@Component({
  selector: 'app-my-feature',
  templateUrl: './my-feature.component.html',
  providers: [MessageService]          // Always local — never providedIn: 'root'
})
export class MyFeatureComponent implements OnInit, OnDestroy, ApiCallBack {

  dataList: any[] = [];
  loading = false;

  constructor(
    private myFeatureService: MyFeatureService,
    private messageService: MessageService,
    public translateService: TranslateService,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.myFeatureService.getItems(this);     // Pass `this` as ApiCallBack
  }

  // ApiCallBack -------------------------------------------------------

  onResult(result: any, type: any, other?: any): void {
    switch (type) {
      case AppGlobalConstant.MY_FEATURE_GET:
        this.dataList = result.data;
        this.loading = false;
        break;

      case AppGlobalConstant.MY_FEATURE_SAVE:
        AppUtils.showSuccessViaToast(
          this.messageService,
          this.translateService.instant('Saved successfully')
        );
        this.loadData();
        break;

      default:
        break;
    }
  }

  onError(err: any, type: any, other?: any): void {
    this.loading = false;
    AppUtils.showErrorViaToast(
      this.messageService,
      this.translateService.instant('An error occurred')
    );
  }

  ngOnDestroy(): void { /* unsubscribe Subjects here if needed */ }
}
```

---

## Template Essentials

```html
<!-- Toast — required in every component using MessageService -->
<p-toast key="tst"></p-toast>

<!-- Loading-aware table -->
<p-table [value]="dataList" [loading]="loading" responsiveLayout="scroll">
  <ng-template pTemplate="header">
    <tr>
      <th>{{ 'Name' | translate }}</th>
      <th>{{ 'Status' | translate }}</th>
    </tr>
  </ng-template>
  <ng-template pTemplate="body" let-row>
    <tr>
      <td>{{ row.name }}</td>
      <td>
        <p-tag [value]="row.status"
          [style]="{'background-color': row.status === 'ACTIVE' ? '#4CAF50' : '#e53935', 'color': '#fff'}">
        </p-tag>
      </td>
    </tr>
  </ng-template>
</p-table>
```

---

## Reactive Forms Pattern

Always use Reactive Forms — never Template-driven forms.

```typescript
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

form: FormGroup;

constructor(private fb: FormBuilder) {}

ngOnInit(): void {
  this.form = this.fb.group({
    name:   ['', Validators.required],
    notes:  ['']
  });
}

save(): void {
  if (this.form.invalid) {
    AppUtils.showWarnViaToast(
      this.messageService,
      this.translateService.instant('Please fill all required fields')
    );
    return;
  }
  this.myFeatureService.save(this, this.form.value);
}
```

---

## Toast Helpers (always use AppUtils — never raw messageService.add)

```typescript
AppUtils.showSuccessViaToast(this.messageService, this.translateService.instant('Saved'));
AppUtils.showErrorViaToast(this.messageService, this.translateService.instant('Error'));
AppUtils.showWarnViaToast(this.messageService, this.translateService.instant('Warning'));
```

---

## Status Tags

```html
<!-- Two-state -->
<p-tag [value]="row.status"
  [style]="{'background-color': row.status === 'ACTIVE' ? '#4CAF50' : '#e53935', 'color': '#fff'}">
</p-tag>

<!-- Multi-state — bind to a method -->
<p-tag [value]="row.status" [style]="getStatusStyle(row.status)"></p-tag>
```

```typescript
getStatusStyle(status: string): object {
  const colorMap: Record<string, string> = {
    ACTIVE: '#4CAF50',
    INACTIVE: '#e53935',
    PENDING: '#d35400'
  };
  return { 'background-color': colorMap[status] ?? '#999', 'color': '#fff' };
}
```

---

## Cross-Component Communication

- Use `@Output()` only for direct parent-child interactions.
- Use `Subject`/`BehaviorSubject` in a shared service for sibling or distant components.
- Use `GeneralEventService` for global clinical events.

```typescript
// Event service
readonly onItemSaved$ = new Subject<void>();
notifySaved(): void { this.onItemSaved$.next(); }

// Subscriber — unsubscribe in ngOnDestroy
private sub = this.eventService.onItemSaved$.subscribe(() => this.reload());
ngOnDestroy() { this.sub.unsubscribe(); }
```

---

## Rules

- Every component `implements ApiCallBack` (unless it has no API calls).
- `MessageService` always in component-level `providers: []` — never `providedIn: 'root'`.
- All user-facing text via `| translate` pipe or `translateService.instant()`.
- Date format convention: `dd-MM-yyyy hh:mm a`.
- Layout: PrimeFlex grid/flex — `<div class="grid">`, `<div class="col-12 md:col-6">`, etc.