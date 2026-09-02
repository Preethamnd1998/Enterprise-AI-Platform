# UI â€” Folder Structure, API Constants & Routing

> Also read: `coding-standards/STANDARDS.md`.

---

## 1. Monorepo Structure

```
src/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ app-routing.module.ts        â† lazy loads all feature libraries
â”‚   â”œâ”€â”€ base/api/                    â† ApiService, ApiCallBack, ApiCallHelper
â”‚   â”œâ”€â”€ lt-components/               â† shared LT custom components
â”‚   â””â”€â”€ data/service/                â† LtPaginatorService and other shared services
â”œâ”€â”€ common/
â”‚   â””â”€â”€ souce-constant.ts            â† global constants (source/notification types)
â””â”€â”€ environments/<app>/              â† per-app environment configs

projects/
â””â”€â”€ <lib-name>/src/lib/              â† feature library code
    â”œâ”€â”€ <lib>-routing.module.ts
    â”œâ”€â”€ <lib>.module.ts
    â”œâ”€â”€ components/                  â† feature components
    â”œâ”€â”€ services/                    â† feature services
    â”œâ”€â”€ models/                      â† interfaces / DTOs
    â””â”€â”€ constants/                   â† module API constant class
```

---

## 2. Feature Library Internal Structure

Each feature library follows this layout:

```
projects/my-feature/src/lib/
â”œâ”€â”€ my-feature-routing.module.ts
â”œâ”€â”€ my-feature.module.ts
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ my-list/
â”‚   â”‚   â”œâ”€â”€ my-list.component.ts
â”‚   â”‚   â”œâ”€â”€ my-list.component.html
â”‚   â”‚   â”œâ”€â”€ my-list.component.scss
â”‚   â”‚   â””â”€â”€ my-list.component.spec.ts
â”‚   â””â”€â”€ my-form/
â”‚       â””â”€â”€ ...
â”œâ”€â”€ services/
â”‚   â””â”€â”€ my-feature.service.ts
â”œâ”€â”€ models/
â”‚   â””â”€â”€ my-feature.model.ts
â””â”€â”€ constants/
    â””â”€â”€ my-feature-api-constant.ts
```

---

## 3. API Constants

Every feature library has its own `*-api-constant.ts` with `public static readonly` strings.
Constants are also registered in `AppGlobalConstant` for use in `onResult` switch-case routing.

### Module-level constant class:
```typescript
// projects/my-feature/src/lib/constants/my-feature-api-constant.ts

export class MyFeatureApiConstant {
  // Format: /<be-service-name>/api/path
  // The FIRST segment (e.g. "inventory", "bom", "pharmacy") is the
  // BE microservice name.  The API Gateway uses this segment for routing â€”
  // requests are forwarded to the matching microservice based on it.
  // Example: "/inventory/api/items/list" â†’ routed to the inventory service.
  public static readonly MY_FEATURE_GET = '/my-service/api/feature/list';
  public static readonly MY_FEATURE_GET_BY_ID = '/my-service/api/feature';
  public static readonly MY_FEATURE_SAVE = '/my-service/api/feature/save';
  public static readonly MY_FEATURE_DELETE = '/my-service/api/feature/delete';
}
```

### AppGlobalConstant registration (src/app/...):
```typescript
export class AppGlobalConstant {
  // ... existing constants ...
  public static readonly MY_FEATURE_GET = MyFeatureApiConstant.MY_FEATURE_GET;
  public static readonly MY_FEATURE_SAVE = MyFeatureApiConstant.MY_FEATURE_SAVE;
}
```

### Rules for API constants:
- Never hardcode API path strings in service methods â€” always reference the constant class.
- The **first path segment must be the BE microservice name** (e.g. `/inventory/...`, `/bom/...`, `/pharmacy/...`). The API Gateway reads this segment to route the request to the correct service.
- Use `UPPER_SNAKE_CASE` constant names that match the operation (noun + verb pattern).
- The constant value used in `apiObject.service` **must be the same** constant passed as `requestServiceType` to `lzApiService.getData()`.

---

## 4. Path Aliases

Always import using TypeScript path aliases â€” never relative cross-library imports.

```typescript
// CORRECT
import { AppGlobalConstant } from '@clinical-casesheet/data/common/global-contant';
import { AppUtils } from '@clinical-casesheet/data/common/app-utils';
import { ApiCallHelper } from 'src/app/base/api/api-call-helper';
import { ApiCallBack } from 'src/app/base/api/api-callback';
import { ApiService } from 'src/app/base/api/api.service';

// WRONG â€” never cross-library relative imports
import { AppGlobalConstant } from '../../clinical-casesheet/...';
```

---

## 5. App Routing â€” Lazy Loading

Main `app-routing.module.ts` uses dynamic imports with path aliases:

```typescript
{
  path: 'my-feature',
  canActivate: [AuthGuardService, MenuGuardService],
  loadChildren: () =>
    import('@my-feature/lib/my-feature.module').then(m => m.MyFeatureModule)
}
```

Feature library routing (`RouterModule.forChild()`):

```typescript
const routes: Routes = [
  {
    path: '',
    component: MyFeatureShellComponent,
    children: [
      { path: 'list', component: MyListComponent },
      { path: 'form/:id', component: MyFormComponent }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MyFeatureRoutingModule {}
```

---

## 6. Environment Config

Per-app environment files live in `environments/<app>/`. Do NOT hardcode environment-specific values (base URLs, feature flags) in component or service code â€” always reference `environment.<property>`.

---

## Anti-patterns Checklist

| âŒ Avoid | âœ… Prefer |
|---|---|
| Hardcoded API strings in services | Named constants in `*ApiConstant` class |
| Relative cross-library imports | TypeScript path aliases |
| `providedIn: 'root'` for `MessageService` | `providers: [MessageService]` in component |
| Raw `<p-paginator>` | `<lifetrenz-lt-pagination>` |
| `messageService.add({...})` directly | `AppUtils.showSuccessViaToast(...)` |
| Plain text labels | `{{ 'Key' \| translate }}` or `translateService.instant('Key')` |
| `Observable` returned from service (in modules using ApiCallBack) | Match the module's existing callback pattern |
