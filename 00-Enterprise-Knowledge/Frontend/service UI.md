# UI — Service Instructions

> Also read: `coding-standards/STANDARDS.md`.

---

## Service Template

Services are the bridge between components and the `ApiService`. They build `ApiCallHelper` objects and call `lzApiService.getData()`.

```typescript
import { Injectable } from '@angular/core';
import { ApiCallHelper } from 'src/app/base/api/api-call-helper';
import { ApiCallBack } from 'src/app/base/api/api-callback';
import { ApiService } from 'src/app/base/api/api.service';
import { AppGlobalConstant } from '@clinical-casesheet/data/common/global-contant';
import { MyFeatureDTO } from './my-feature.model';

@Injectable({ providedIn: 'root' })
export class MyFeatureService {

  constructor(public lzApiService: ApiService) {}

  // GET — list
  getItems(callback: ApiCallBack, page: number = 1, size: number = 15): void {
    const apiObject: ApiCallHelper = {} as ApiCallHelper;
    apiObject.service = AppGlobalConstant.MY_FEATURE_GET;
    apiObject.method = 'GET';
    apiObject.params = { pageNo: page, noOfRecord: size };
    this.lzApiService.getData(apiObject, callback, AppGlobalConstant.MY_FEATURE_GET);
  }

  // GET by ID
  getItemById(callback: ApiCallBack, id: number): void {
    const apiObject: ApiCallHelper = {} as ApiCallHelper;
    apiObject.service = AppGlobalConstant.MY_FEATURE_GET_BY_ID;
    apiObject.method = 'GET';
    apiObject.id = String(id);
    this.lzApiService.getData(apiObject, callback, AppGlobalConstant.MY_FEATURE_GET_BY_ID);
  }

  // POST — create / update
  saveItem(callback: ApiCallBack, request: MyFeatureDTO): void {
    const apiObject: ApiCallHelper = {} as ApiCallHelper;
    apiObject.service = AppGlobalConstant.MY_FEATURE_SAVE;
    apiObject.method = 'POST';
    apiObject.params = request;
    this.lzApiService.getData(apiObject, callback, AppGlobalConstant.MY_FEATURE_SAVE);
  }

  // DELETE (soft)
  deleteItem(callback: ApiCallBack, id: number): void {
    const apiObject: ApiCallHelper = {} as ApiCallHelper;
    apiObject.service = AppGlobalConstant.MY_FEATURE_DELETE;
    apiObject.method = 'DELETE';
    apiObject.id = String(id);
    this.lzApiService.getData(apiObject, callback, AppGlobalConstant.MY_FEATURE_DELETE);
  }
}
```

---

## ApiCallHelper Fields Reference

| Field | Usage |
|---|---|
| `service` | API path string from a constant class (never hardcoded) |
| `method` | `'GET'` / `'POST'` / `'PUT'` / `'DELETE'` |
| `id` | Path variable (convert to `String`) |
| `params` | Query params (GET) or request body (POST/PUT) |
| `formData` | For file upload endpoints |

---

## Rules

- **Always use** `AppGlobalConstant.<TYPE>` or the module's `ApiConstant` class for `apiObject.service` — never hardcode strings.
- Services must not contain UI logic (no `MessageService`, no `TranslateService`).
- Services should be `providedIn: 'root'` unless the feature requires scoped instances.
- The same constant used in `apiObject.service` must be used as `requestServiceType` in `getData()` — this routes the result to the correct `onResult` case.
- For file upload: set `apiObject.formData` and do NOT set `apiObject.params`.

---

## ApiService.getData() Signature (reference)

```typescript
getData(
  apiObject: ApiCallHelper,
  callback: ApiCallBack,
  requestServiceType: any,   // the constant — used in component's onResult switch
  dataToReturn?: any,        // passed back as `other` in onResult/onError
  hideMessage?: boolean,
): Observable<any>
```