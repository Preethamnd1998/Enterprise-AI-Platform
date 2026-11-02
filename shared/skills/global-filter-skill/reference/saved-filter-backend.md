# Saved / Default Filter — API, DTO, Rules

## 1. Endpoints (ipd-service OPD family — `OPComponentFilterController`)

| Op | Method + path | Body / params | UI call (`ConponentSearchService`) | Result key |
|---|---|---|---|---|
| List | `GET opd/component/filter` | `type, level, userId, siteId, customerBusinessId` (all required) | `getComponentFilter(cb, type, level, userId, siteId, cbId)` — no-op when `userId` falsy | `OPD_COMPONENT_FILTER+'GET'` |
| Save | `POST opd/component/filter` | `ComponentFilterDto` (+ token) | `saveComponentFilter` | `OPD_COMPONENT_FILTER` |
| Set/unset default | `PUT opd/component/filter/default` | `ComponentFilterDto` (`id`, `isDefault`) | `updateComponentFilter` (passes the dto as `other`) | `…_DEFAULT` |
| Rename | `PUT opd/component/filter/update` | dto | `updateFilterName` | `…_UPDATE` |
| Delete | `DELETE opd/component/filter/{id}` | — | `deleteFilter` | `…_DELETE+'DELETE'` |

Other families, same shape: CORE (`core-service`, `get/save/update/delete CoreComponentFilter`) and APPOINTMENT
(`appointment-service`, `…FdmComponentFilter`, uses `SharedFilterFdmDto`, string id). Pick the one owned by the same BE
service as your list. Also called from `patient-lib`, `indent`, `inventory`, `clinical-casesheet` UIs (verified via graph).

Responses are wrapped: `ApplicationResponse{status, code, message, data}` → UI reads `result.data`.

## 2. DTO

`SharedFilterDto` (UI, `patient-lib/.../shared-filter-dto.ts`) ⇄ `ComponentFilterDto` (BE):

| Field | Notes |
|---|---|
| `id` | server assigned |
| `customerTransactionAttribute` | `{customerId, customerBusinessId, siteId, createdBy, createdByName, createdOn}` — set on save from `AppData`/`UserData` |
| `filterName` | user text (UI strips to `[A-Za-z0-9-,.;'&/.() ]`) |
| `isDefault` | false on save; toggled by default call |
| `componentType` | `FilterComponentType` enum **per screen** |
| `level` | `FilterLevel` `USER` (personal; used) / `SITE` (shared; not used by the reference UI) |
| `formValue` | `JSON.stringify(form.value)` — opaque to the backend |
| `filterSiteId`, `filterUserId` | `appData.getSiteId()`, `userProfile.user.coreUserId` |

## 3. Rules

- **One default per user + componentType + customerBusiness**: `updateDefaultFilter` clears `isDefault` on the others when
  setting a new default (service impl). Keep it server-side.
- Delete is soft (`customerTransactionAttribute.active=false`); list SQL filters `active = true`.
- A new screen adds a `FilterComponentType` member in **both** the UI enum (`filter-component-type.ts`, 140+ members) and the BE enum
  (`…core.search.enums.FilterComponentType`). Never reuse another screen's key. Check for a DB check-constraint/lookup on
  `component_filter.component_type` (live DB via `mcp__*-db__query`); a constraint = migration = High-risk approval gate.
- Mismatch between save and load on any of `type, level, userId, siteId, customerBusinessId` returns an empty list that looks
  like "no filters saved". Debug there first.
- List SQL (`FilterSQL.getComponentFilter`): selects `id, component_type, level, filter_name, form_value, filter_site_id,
  filter_user_id, is_default, active, site_id, customer_business_id, customer_id, created_by, created_user, created_date`
  from `component_filter` where `active = true and component_type = <type> and filter_user_id = <userId> and customer_business_id = <cb>`.
  It **does not** filter by `level` or `site_id` (params accepted but unused). For new work: convert `type`/`level` to enums, concatenate
  `.name()`, and decide explicitly whether to scope by site (a default saved at Site A currently also loads at Site B for the same user).
- `formValue` size: forms only; no PHI-bearing free text beyond what filters already hold; do not save selected patient records.

## 4. Mongo-backed or new BE services

Do not create another filter store. Reuse the family above through the UI service. If a service truly cannot, ask first (new
table + migration + controller = High risk).
