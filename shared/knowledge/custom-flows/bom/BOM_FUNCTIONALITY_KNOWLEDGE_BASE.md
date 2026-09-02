# BOM FUNCTIONALITY KNOWLEDGE BASE

> **Status: DRAFT — Phase 6 of N complete. All five Parts of the original brief have a pass, plus
> one extra phase (Part 6) opened by a real captured API call.**
> **This is a multi-file knowledge base.** This file holds Parts 1–2 plus all cross-cutting
> sections (3, 6–23). **Part 3 → `BOM_PART3_NON_STOCK_INDENT_CONSUMPTION.md`** (pending/shortage
> queue, discovery of 3 independent BOM stock-reduction backends). **Part 4 →
> `BOM_PART4_STOCK_REDUCTION.md`** (shared ledger/balance mechanics, a confirmed bug in the legacy
> path's shortage detection). **Part 5 → `BOM_PART5_ADDING_BOM_TO_BILL.md`** (all three billing
> paths traced to their consumers in `ipd-service`; a second confirmed silent-failure bug).
> **Part 6 → `BOM_PART6_CASESHEET_OPD_CLINICAL_INTEGRATION.md`** (`app-administration-casesheet` and
> `clinical-common-service`'s `PUT /schedule/status/update` — confirms, with full code, the
> CCS→inventory-service Feign hop that Part 2 had left unverified, and finds a double-confirmed dead
> code path in the casesheet component). Read §6, §7, §8, §8a below for each file's headline
> findings, or open the files directly for full detail.
> This document is being built in phases (per explicit agreement with the requester) to keep each
> part source-verified rather than rushed. Phase 1 covered **PART 1 — BOM Configuration**. Phase 2
> covers **PART 2 — Showing & Consuming BOM** (`app-bom-details`, `app-administration-nonot`,
> `BomConductController` and the whole `inventory-service` `bom.conduct` engine), fully traced with
> real file paths, class names, method names, DTOs, entities, tables and SQL taken directly from the
> source. **Important finding from Phase 2:** the single orchestration class
> `BomConductOrchestrationServiceImpl` implements conduct, draft/finalize, the non-stock pending
> queue, stock consumption triggering, and the billing Kafka events all in one place — meaning Parts
> 2, 3, 4 (partially) and 5 (the trigger only) are structurally inseparable in the backend. This
> phase documents that class in full under Part 2 and cross-references it from the Part 3/4/5 stubs
> rather than re-reading it later. Remaining parts (3's indent-specific pieces, 4's actual stock
> ledger/batch mechanics inside `PatientConsumptionServiceImpl`, and 5's IPD-side billing) are
> stubbed below. Nothing in this document is invented — anything not yet verified is marked
> `PENDING (Phase N)`, and anything genuinely absent from source will be marked
> `UNKNOWN / NOT FOUND IN SOURCE` per instructions.

## Repositories analyzed (Phase 1)

| Repo | Path | Role |
|---|---|---|
| `lifetrenz-core` | `D:\GitLab-Workspace\UI-BE\lifetrenz-core` | Angular workspace (multi-project). BOM Configuration UI lives in the `masters` library project. |
| `masters` (nested git project) | `D:\GitLab-Workspace\UI-BE\lifetrenz-core\projects\masters` | Angular library `@masters/*`. **BOM Configuration UI exists only on branch `origin/feature/bom`** — not present on the currently checked-out branch (`merge/sit/chargegroup`). Read via `git show origin/feature/bom:<path>` (non-destructive; working tree was not switched). |
| `core-service` | `D:\GitLab-Workspace\UI-BE\core-service` | Spring Boot service. Owns BOM **configuration** (source of truth / MDM). Package: `com.lifetrenz.lths.core.bom`, entities in `com.lifetrenz.lths.domain.entity.bom`. |
| `inventory-service` | `D:\GitLab-Workspace\UI-BE\inventory-service` | Spring Boot service. Owns BOM **conduction/consumption, stock reduction, indent, billing trigger**. Receives a **replicated, read-optimized copy** of BOM configuration via Kafka. Package: `com.lifetrenz.lths.inventory.*bom*`. |

**Important architectural fact discovered in Phase 1:** BOM configuration is **not** a single shared
table. `core-service` is the system of record (`bom_configuration` / `bom_configuration_item`,
created/edited only through core-service APIs). `inventory-service` keeps its own denormalized
replica (`inv_bom_configuration` / `inv_bom_configuration_item`) populated **only** via a Kafka
event (`HIS_BOM_CONFIGURATION`), never edited directly. This has to be understood before touching
either side — inventory's BOM tables are a projection, not a second source of truth.

---

## 1. Executive Summary

A **BOM (Bill of Material)** in this application is a configurable mapping from a clinical
"activity" (a `CatalogueItem` in core-service — e.g. an orderable test/procedure) to a list of
**component items** (inventory items) that should be consumed, billed, and/or deducted from stock
when that activity is performed. BOM configuration is authored in `core-service`
(`BomConfigurationController` → `BomConfigurationServiceImpl`), stored in
`bom_configuration` / `bom_configuration_item`, and replicated asynchronously to
`inventory-service` via a Kafka event (`KafkaRequestType.HIS_BOM_CONFIGURATION`) so that
inventory-service can run BOM **conduction** (Parts 2–4) and billing triggers (Part 5) against a
local, fast-access copy without cross-service calls on the hot path.

BOM configuration itself has three states — `DRAFT`, `DEPLOYED`, `PAUSED` — and only a `DEPLOYED`
BOM (with ≥1 item) is meant to be used in patient workflows (enforced at status-change time, not at
consumption time — see §14 Business Rules, Phase 1 subset, below).

Once a BOM is `DEPLOYED`, it surfaces in patient workflows through **`app-bom-details`**
(`BomDetailsComponent`), an embeddable Angular component hosted inside procedure-conduction screens
— confirmed in Phase 2 as a child of **`app-administration-nonot`** (`AdministrationNonotComponent`,
the Non-OT procedure conduction screen). The user picks a BOM config + a source stock location,
reviews/edits the auto-populated component items (quantity, batch, substitution, delete — each edit
requiring a captured reason), saves a **DRAFT** conduction, and only then can the parent screen's
"Mark Conducted" action proceed (it is hard-blocked client-side if a BOM exists but hasn't been
saved). Conducting calls `inventory-service`'s `BomConductOrchestrationServiceImpl`, which — in one
transactional method — persists a frozen **config snapshot** (so later edits to the BOM configuration
never retroactively change what a past conduction meant), then per item: consumes available stock
immediately (Part 4 trigger), routes any shortfall to a **non-stock pending queue** for a
pharmacist/store-keeper to fulfil later (Part 3), and — independently, for any item flagged
`billing=true`, even at zero stock — fires a `BOM_CONDUCTION_BILL` Kafka event for the **full
requested quantity** (Part 5 trigger). Billing is therefore never blocked by a stock shortage; only
the *inventory* side of a shortfall is deferred to the pending queue.

---

## 2. BOM Architecture (Phase 1 slice)

```text
Angular (masters lib, branch origin/feature/bom)
  lib-bom-configuration  (BomConfigurationComponent)
        |
        v
  BomConfigurationService (Angular)  ---HTTP--->  core-service
        |                                          BomConfigurationController
        |                                          -> BomConfigurationServiceImpl
        |                                          -> bom_configuration / bom_configuration_item (Postgres, core DB)
        |                                          -> publishes Kafka event on every mutation
        |                                                 topic: KafkaTopics.LT_INVENTORY_EVENT
        |                                                 requestType: HIS_BOM_CONFIGURATION
        |                                                 payload: BomConfigurationKafkaDTO
        |                                                          v
        |                                          inventory-service
        |                                          ConsumerService (case "HIS_BOM_CONFIGURATION")
        |                                          -> BomConfigurationSyncServiceImpl.processBomEvent()
        |                                          -> inv_bom_configuration / inv_bom_configuration_item (Postgres, inventory DB)
        |
        v
  (item search while building a BOM)
  BOM_ITEMS_SEARCH  ---HTTP--->  inventory-service: GET /bom/items/search
                                 BomItemController.searchBomItems -> BomItemRepository -> BomItemSQL
                                 (queries item / item_category / item_batch / item_uom_conversion — inventory DB)
```

Two services, one Kafka hop, no synchronous cross-service call in the configuration save path
(the UI calls core-service only; core-service does not call inventory-service synchronously for
configuration — it fires-and-forgets a Kafka event). The one synchronous cross-service call in
Part 1 is the **item search** autocomplete, which the Angular component calls directly against
`inventory-service` (not proxied through core-service).

---

## 3. Component & Service Inventory (Phase 1 slice — Configuration only)

### Frontend

| Component/Service | Path | Responsibility | APIs Used | Related BOM Part |
|---|---|---|---|---|
| `BomConfigurationComponent` (selector `lib-bom-configuration`) | `projects/masters/src/lib/module/bom-configuration/bom-configuration.component.ts` (branch `origin/feature/bom`) | List, create, edit, view, deploy/pause/redeploy, set-default, delete BOM configurations; item search & add/remove within the item grid; client-side validation (activity required, name required, item↔activity conflict, at least 1 item to deploy) | `BOM_CONFIGURATIONS_GET`, `BOM_CONFIGURATION_CREATE`, `BOM_CONFIGURATION_UPDATE`, `BOM_CONFIGURATION_DETAIL`, `BOM_CONFIGURATION_STATUS`, `BOM_CONFIGURATION_DEFAULT`, `BOM_CONFIGURATION_DELETE`, `BOM_ITEMS_SEARCH` | Part 1 |
| `BomConfigurationService` (Angular) | `projects/masters/src/lib/data/service/bom/bom-configuration.service.ts` | Thin HTTP wrapper around `ApiService`/`ApiCallHelper`, one method per API above | (same list) | Part 1 |
| DTO models | `projects/masters/src/lib/data/model/bom/bom-configuration-dto.ts` | `BomConfigurationGetDTO`, `BomConfigurationDetailDTO`, `BomConfigurationItemDTO`, `BomConfigurationPostDTO`, `BomConfigurationItemPostDTO`, `BomConfigurationPagedDTO`, `PageDTO`, `BomItemSearchResultDTO`, `ItemCategoryVO` — field-for-field mirrors of the core-service DTOs (see §7) | — | Part 1 |
| API path constants | `projects/masters/src/lib/data/constant/master-api-constant.ts` (lines ~2465–2473; also legacy/unused-looking `HIS_BOM_CONFIGRATION` etc. at ~1409–1411, see §22) | Declares the literal endpoint paths consumed by `BomConfigurationService` | — | Part 1 |

| `BomDetailsComponent` (selector `app-bom-details`) | `src/app/base/components/bom-details/bom-details.component.ts` (+`.html`/`.css`) — on the **default/current branch**, unlike Part 1's UI | Embeddable BOM conduction widget: load configs/locations/items, item search overlay (ad-hoc add), qty/delete/substitute with mandatory reason capture, batch grouping/selection, save draft, conduct | `BOM_CONDUCT_CONFIGS`, `BOM_CONDUCT_LOCATIONS`, `BOM_CONDUCT_CONFIG_ITEMS`, `HIS_CS_REASONS_GET`, `HIS_CS_CLINICAL_COMMON_NAME_CATEGORIES`, `HIS_CATALOGUE_CATEGORY_GET`, `BOM_INVENTORY_ITEM_SEARCH`, `GET_SUBSTITUTE_ITEMS_FOR_BOM`, `BOM_CONDUCT_DRAFT`, `BOM_CONDUCT_SUBMIT` (conduct), `BOM_CONDUCT_FIND`, `BOM_CONDUCT_SAVED_ITEMS` | Part 2 |
| `BomService` (Angular) | `src/app/base/service/bom.service.ts` | HTTP wrapper for the above, plus several legacy-looking methods (`getBomDetails`, `getBomConfigDetails`, `getChildItems`, `deleteBom`) hitting `core/boms`, `core/item-association*` — **not called by any Part 2 component read so far**, see §22 | (see above) | Part 1 legacy? / Part 2 |
| `BomConductService` (Angular) | `src/app/base/service/bom-conduct.service.ts` | A **second, largely-overlapping** HTTP wrapper (configs/items/locations/reasons/pending/fulfil) — same endpoints as parts of `BomService`; not confirmed which component(s), if any, use this one instead of `BomService` (`PENDING`, see §22) | `BOM_CONDUCT_CONFIGS`, `BOM_CONDUCT_CONFIG_ITEMS`, `BOM_CONDUCT_ITEM_ALTERNATES`, `BOM_CONDUCT_LOCATIONS`, `HIS_CS_REASONS_GET`, `BOM_PENDING_QUEUE` (+fulfil) | Part 2/3 |
| `AdministrationNonotComponent` (selector `app-administration-nonot`) | `projects/clinical-casesheet/src/module/conductq/administration-nonot/administration-nonot.component.ts` | Non-OT procedure conduction screen; hosts `<app-bom-details>` as a child via `@ViewChild`; gates its own "Mark Conducted" action on the child's `hasConfigs`/`isDraftSaved` state; attaches `bomConductionId` onto the schedule-status-update request that triggers server-side finalize | `AppGlobalConstant.CLINICAL_*` (schedule/administer APIs, not BOM-specific) | Part 2 |
| `BomGetDTO` model | `src/app/base/model/bom-details.ts` | A small typed DTO (`id`, `catalogueItemId`, `inventoryItemId`, `qty`, ...) that does **not** match any shape actually used by `BomDetailsComponent` (which works entirely in untyped `any`) — looks like a leftover from an earlier/simpler BOM design; see §22 | — | Legacy? |

### Backend — Inventory Service (BOM conduction engine)

| Controller | API | Method | Service Class | Repository | DB Table(s) | Responsibility |
|---|---|---|---|---|---|---|
| `BomConductController` | `GET bom/conduct/configs` | `getConfigs` | `BomConductServiceImpl.getConfigsForActivity` | `IBomConfigurationRepository` (inventory's replica repo) | `inv_bom_configuration` | List `DEPLOYED`-replica configs for an activity's core catalogue item id |
| — | `GET bom/conduct/config/{bomConfigurationId}/items` | `getItems` | `BomConductServiceImpl.getItemsWithPrice` → `BomItemFetchServiceImpl.fetchItemsWithPrice` | `IBomConfigurationItemRepository`; `BillingService.getItemBatchDetailsByItemIds` | `inv_bom_configuration_item`, item/batch tables via `BillingService` | Items with live stock + price (price fallback `CURRENT_BATCH → LAST_BATCH → NONE`) |
| — | `GET bom/conduct/item/{itemId}/alternates` | `getAlternates` | `BomItemFetchServiceImpl.fetchAlternates` (raw JDBC) | — | `substitutable_item`, `item_batch`, `inv_item_batch_balance`, `item_uom_conversion` | Substitute-item lookup with stock/price |
| — | `GET bom/conduct/find` | `findConduction` | `BomConductServiceImpl.findExistingConduction` | `BomConductionRepository` | `inv_bom_conduction` | Edit-mode detection: does a conduction already exist for this schedule/admission/encounter |
| — | `GET bom/conduct/{bomConductionId}/items` | `getSavedItems` | `BomConductServiceImpl.getSavedConductionItems` | `BomConductionItemRepository` | `inv_bom_conduction_item` | Reload saved DRAFT/CONDUCTED items with DB ids, for edit mode |
| — | `POST bom/conduct/draft/{siteId}` | `saveDraft` | `BomConductOrchestrationServiceImpl.saveDraft` | `BomConductionRepository`, `BomConductionItemRepository`, `BomConfigSnapshotRepository`(+Item), `BomConductionItemReasonRepository`, `BomConsumptionAlternateItemRepository` | `inv_bom_conduction`, `inv_bom_conduction_item`, `inv_bom_config_snapshot`(+`_item`), `inv_bom_conduction_item_reason`*, `inv_bom_consumption_alternate_item`* | Persist/update a DRAFT conduction + items; snapshot config on first save only |
| — | `POST bom/conduct/{bomConductionId}/finalize` | `finalizeDraft` | `BomConductOrchestrationServiceImpl.finalizeDraft` → `finalizeFromDraft` | (same as `conduct`, below) | (same) | Slim finalize called by CCS via Feign; loads all item data from the DRAFT, only overlays caller/patient context |
| — | `POST bom/conduct` | `conduct` | `BomConductOrchestrationServiceImpl.conduct` | `BomConductionRepository`, `BomConductionItemRepository`, `BomConsumptionPendingRepository`(+Item), `PatientConsumptionService`, `ProducerService` | `inv_bom_conduction`, `inv_bom_conduction_item`, `inv_bom_consumption_pending`(+`_item`), stock ledger tables (Part 4, via `PatientConsumptionService`) | Full conduct: idempotency check, snapshot, per-item consume/pending/bill, publishes `BOM_CONDUCTION_DISPENSE`/`BOM_CONDUCTION_BILL` |
| — | `GET bom/conduct/pending` | `pending` | `BomConductServiceImpl.getPendingQueue` | `BomConsumptionPendingRepository` | `inv_bom_consumption_pending` | Header-level pending queue list (Part 3) |
| — | `GET bom/conduct/pending/{pendingId}/items` | `getPendingDetail` | `BomConductServiceImpl.getPendingDetail` → `BomPendingDetailRepo` (raw JDBC) | — | `inv_bom_consumption_pending_item` + stock tables | Paginated pending item detail with live stock check (Part 3) |
| — | `POST bom/conduct/pending/{pendingId}/fulfil/{siteId}` | `fulfil` | `BomConductOrchestrationServiceImpl.fulfil` | `BomConsumptionPendingRepository`(+Item), `BomPriceVarianceService` | `inv_bom_consumption_pending_item`, `inv_bom_billing_price_variance`* | Consume-only fulfil of a pending shortage, multi-batch, no re-billing; computes price variance (Part 3/4) |
| — | `GET bom/conduct/report/variance` | `varianceReport` | `BomConductServiceImpl.getVarianceReport` | `BomConductionRepository`, `BomConductionItemRepository`, `BomBillingPriceVarianceRepository` | `inv_bom_conduction_item`, `inv_bom_billing_price_variance`* | Configured-vs-consumed variance report |

\* Table name inferred from `@Table`/repository naming convention, entity file not yet opened in
this phase — everything else in this table is from an entity file actually read.

### Backend — Core Service (system of record for configuration)

| Controller | API | Method | Service Class | Repository | DB Table(s) | Responsibility |
|---|---|---|---|---|---|---|
| `BomConfigurationController` (`core/bom/controller`) | `POST /bom/configuration` | `createBomConfiguration` | `BomConfigurationServiceImpl.createBomConfiguration` | `IBomConfigurationRepository`, `IBomConfigurationItemRepository` (JPA); `BomConfigurationRepository` (JDBC, read) | `bom_configuration`, `bom_configuration_item` | Create BOM header + items, publish Kafka `CREATE` |
| — | `PUT /bom/configuration/{id}` | `updateBomConfiguration` | same | same | same | Update header, **delete-all-and-recreate items**, publish Kafka `UPDATE`. Blocks edits when status is `DEPLOYED` (throws `FailedException`) |
| — | `GET /bom/configurations` | `getAllBomConfigurations` | same | `BomConfigurationRepository.getAllBomConfigurations` (raw JDBC) | `bom_configuration`, `catalogue_item`, `bom_configuration_item` (aggregated) | Paginated list with item count & total cost, scoped to `customerBusinessId` + `siteId` |
| — | `GET /bom/configuration/{id}` | `getBomConfigurationDetail` | same | `BomConfigurationRepository.getBomConfigurationDetail` (raw JDBC) | `bom_configuration`, `catalogue_item`, `bom_configuration_item`, `drug_uom_conversion` | Header + items detail for edit/view dialog |
| — | `PUT /bom/configuration/{id}/status` | `updateBomStatus` | `updateBomStatus` | `IBomConfigurationRepository`, `IBomConfigurationItemRepository` | `bom_configuration` | Change `DRAFT`/`DEPLOYED`/`PAUSED`; **deploy requires ≥1 item**; publishes Kafka `STATUS_CHANGE` |
| — | `PUT /bom/configuration/{id}/default` | `toggleDefault` | `toggleDefault` | same | `bom_configuration` | Sets this BOM as the default for its activity item, unsets any previous default for the same `activityItem_Id`; publishes Kafka `DEFAULT_CHANGE` **twice** (once for the demoted BOM, once for the promoted one) when a previous default existed |
| — | `DELETE /bom/configuration/{id}` | `deleteBomConfiguration` | `deleteBomConfiguration` | same | `bom_configuration`, `bom_configuration_item` | Soft-delete header + items (`@SQLDelete` sets `active=false`), publishes Kafka `DELETE` |

### Backend — Inventory Service (BOM configuration replica + item search)

| Controller | API | Method | Service Class | Repository | DB Table(s) | Responsibility |
|---|---|---|---|---|---|---|
| *(none — Kafka consumer, not a controller)* | Kafka topic `LT_INVENTORY_EVENT`, `requestType=HIS_BOM_CONFIGURATION` | `ConsumerService` (switch case, line ~1016) → `BomConfigurationSyncServiceImpl.processBomEvent` | `BomConfigurationSyncServiceImpl` | `IBomConfigurationRepository`, `IBomConfigurationItemRepository` (inventory's own, package `domain.repository.masters.bom`) | `inv_bom_configuration`, `inv_bom_configuration_item` | Reconcile the replica: create/update/delete/status-change/default-change, keyed by `mdmBomConfigurationId` (= core-service's `BomConfiguration.id`) |
| `BomItemController` | `GET /bom/items/search` | `searchBomItems` | *(no service layer — controller calls repository directly)* | `BomItemRepository` → `BomItemSQL.searchBomItems` (raw JDBC) | `item`, `item_category`, `item_batch` (latest active batch, for MRP display only), `item_uom_conversion` | Autocomplete search used by the Angular item-picker when building a BOM; scoped by `siteId` + `customerBusinessId`, optional `categoryIdentifierCode` / `typeIdentifierCode` / `searchName` filters, `LIMIT 50` |

---

## 4. PART 1 — BOM Configuration

### 4.1 What is a BOM in this application?

A `BomConfiguration` (core-service) is a named rule: "when activity item X (a `CatalogueItem`,
e.g. a lab test or procedure order) happens, these component items should be considered for
consumption/billing." It is not itself an inventory item — it is metadata that inventory-service's
**conduction** engine (Part 2–4) reads when a clinician "conducts"/administers the linked activity.

Evidence: `com.lifetrenz.lths.core.bom.controller.BomConfigurationController` (core-service),
`com.lifetrenz.lths.domain.entity.bom.BomConfiguration` (core-service entity).

### 4.2 Where is BOM configured?

Angular: `lib-bom-configuration` (`BomConfigurationComponent`), a standalone Angular component in
the `masters` library project, on branch `origin/feature/bom` of that nested repo. **This branch
is not merged into the currently checked-out branch of the `masters` submodule** — see §22 Known
Gaps for the implication (feature may be in-progress/not yet released to the branch developers are
building on day-to-day).

### 4.3–4.4 UI component hierarchy / Angular components & children

`BomConfigurationComponent` is self-contained — it does not delegate to child components. It
composes PrimeNG UI primitives directly (`p-table` via the project's `LtTableComponent` wrapper,
`p-dialog`, `p-autoComplete`, `p-dropdown`, `p-checkbox`, `p-toast`, `p-confirmDialog`,
`LtPaginationComponent` for paging). There is no separate "BOM item row" sub-component — the item
grid is rendered inline from `bomItems: BomConfigurationItemPostDTO[]` in the same component
(confirmed from the `.ts`; the `.html` template was not read in this phase — template-level detail
is `PENDING`, but all data-flow logic lives in the `.ts` file which was fully read).

### 4.5 Angular services used

- `BomConfigurationService` (own HTTP wrapper — see §3 Frontend table)
- `MasterLibraryService` (shared cache of clinical common-name categories — `cliCommonNameCategories`)
- `CatalogueService` (shared cache of catalogue categories, and catalogue-item search against
  core-service `GET /catalogue/items/get*` — used to populate the "activity" autocomplete)
- `AppData` / `UserData` (site/customer-business context — `getSiteId()`, `getCustomerBusinessId()`)
- `LtPaginatorService` (pagination helper)

### 4.6–4.7 Backend APIs / Request-Response DTOs

See §3 tables and §7 API Catalog (Phase 1 entries) below for the full list with exact DTOs.

### 4.8 Database tables/entities

**core-service** (system of record):
- `bom_configuration` — header. Entity: `com.lifetrenz.lths.domain.entity.bom.BomConfiguration`.
- `bom_configuration_item` — line items. Entity: `com.lifetrenz.lths.domain.entity.bom.BomConfigurationItem`.

**inventory-service** (replica, populated only by Kafka consumer):
- `inv_bom_configuration` — header replica. Entity: `com.lifetrenz.lths.inventory.domain.entity.masters.bom.BomConfiguration`.
- `inv_bom_configuration_item` — item replica. Entity: `...masters.bom.BomConfigurationItem`.

Full column-level detail is in §12 Database Knowledge (Phase 1 subset) below.

### 4.9–4.11 BOM header/component structure, parent-child relationship

Header (`BomConfiguration`) 1 → N Items (`BomConfigurationItem`), FK
`bom_configuration_item.bom_configuration_id → bom_configuration.id`, `@ManyToOne` with
`@JsonIgnore` back-reference (avoids serialization cycles). Each item references a `CatalogueItem`
(core) / `Item` (inventory) via `item_id`, optionally a UOM conversion row
(`drug_uom_conversion` in core / `item_uom_conversion` in inventory), and carries its own copy of
category metadata (`ItemCategoryVO`, embedded, denormalized onto the item row rather than
joined at read time — same pattern used on the header for the activity's category).

### 4.12 BOM versioning

**NOT FOUND IN SOURCE.** There is no version column, version table, or version-increment logic
anywhere in the BOM configuration code path. Edits are destructive: `updateBomConfiguration`
deletes all existing items (`iBomConfigurationItemRepository.deleteByBomConfiguration_Id(id)`) and
re-inserts the posted set — there is no history retained of prior item sets at the *configuration*
layer. (Inventory-service's *conduction* layer does snapshot the BOM at the moment it's conducted —
`BomConfigSnapshot` / `BomConfigSnapshotItem` — but that's a Part 2–4 concept, not configuration
versioning; confirmed to exist by filename in Phase 1's grep, content deferred to Phase 2.)

### 4.13 Active/inactive logic

Both entities use Hibernate `@SQLDelete` + `@Filter`/`@FilterDef` soft-delete:
`UPDATE bom_configuration SET active = false WHERE id=?` (and the item equivalent). Reads are
implicitly scoped to `active = true` via the Hibernate filter (ORM path) and explicitly via
`WHERE bc.active = true` / `WHERE bci.active = true` in the raw JDBC queries (`BomConfigurationSQL`,
`BomItemSQL`). Same pattern mirrored in inventory-service's replica entities.

### 4.14 Effective dates

**NOT FOUND IN SOURCE.** No effective-from/effective-to columns on `BomConfiguration` or
`BomConfigurationItem` in either service.

### 4.15 Stock vs non-stock BOM classification

At the **item** level, not the BOM level: each `BomConfigurationItem` carries two independent
booleans — `billing` and `inventory` — plus `isMandatory`. `inventory = true` marks an item as
stock-tracked (subject to stock deduction in Part 4); `inventory = false` marks it non-stock
(routed through the indent/pending-queue path instead — Part 3). `billing` independently controls
whether the item contributes a bill line (Part 5) regardless of its stock classification — i.e. an
item can be non-stock but still billed, or stock but not billed. There is **no BOM-level**
stock/non-stock flag — classification is per-component-item. (This directly determines Part 3's
scope: "non-stock BOM" in the requester's terminology means "BOM items where `inventory=false`",
confirmed at the DTO/entity level in Phase 1; the consumption-time branching logic itself is Part
2–3, deferred.)

### 4.16 Quantity and UOM configuration

- `qty`: `int` in core-service's `BomConfigurationItem` (validated only as `Math.max(1, round(...))`
  client-side in `saveBom()` — no server-side minimum-quantity check was found in
  `BomConfigurationServiceImpl`); `float` in inventory-service's replica (widening, not narrowing —
  no precision loss risk on sync).
- `uom`: optional `ManyToOne` to `DrugUOMConversion` (core) / `ItemUomConversion` (inventory),
  looked up by ID at save time (`iDrugUomConversion.findById(...)`) and resolved on the inventory
  side by a **different key** — `iItemUomConversionRepository.findByMdmUOMId(kafkaItem.getUomId())`
  — i.e. inventory does not reuse core's UOM row ID directly; it re-resolves by the MDM UOM
  identifier it was given, which relies on inventory already having a matching UOM row synced from
  elsewhere (item/UOM master sync is out of scope for this KB but is a hidden dependency worth
  knowing about when debugging "UOM shows blank after BOM sync").

### 4.17 Item configuration

Per item: `itemId` (activity or component `CatalogueItem`/`Item` id), `itemCategory` (embedded
`ItemCategoryVO` — category + clinical-common-name-category, both id/name/identifier-code triples),
`qty`, `uomId`, `billing`, `inventory`, `isMandatory`. `mrpAmount`/`mrpCurrency`/`mrpFractionDigits`
exist on the **DTO** (`BomConfigurationItemPostDTO`) and on the **entity** (`BomConfigurationItem.mrp`,
an embedded `Money`) but are explicitly **not propagated** into the Kafka payload or used for
calculation — both `BomConfigurationServiceImpl.publishKafkaEvent` and the Angular
`calculateTotalCost()` carry an explicit comment/no-op stating pricing was moved to be resolved at
**conduction time** from live batch/inventory prices instead of configuration-time MRP. Treat the
configuration-time MRP fields as vestigial/display-only in the list view, not as the billing price
source — confirmed by comments in both `BomConfigurationServiceImpl.java` (line ~438) and
`bom-configuration.component.ts` (`calculateTotalCost()`, line ~507).

### 4.18 Validation rules

Server-side (core-service, `BomConfigurationServiceImpl`):
- CTA (`CustomerTransactionAttribute`) must resolve for the caller/site, else `FailedException`.
- `activityItemId` must resolve to an existing `CatalogueItem`, else `FailedException`.
- Cannot edit (`updateBomConfiguration`) a BOM whose status is `DEPLOYED` — `FailedException`
  ("Cannot edit a DEPLOYED BOM Configuration").
- Cannot deploy (`updateBomStatus` → `DEPLOYED`) a BOM with zero items — `FailedException`
  ("Cannot deploy BOM with no items").
- Item lookup failures inside `saveItems` are **not guarded**: `iCatalogueItemRepository.findById(...).orElse(null)`
  followed immediately by `catalogueItem.getCategory()` — if an `itemId` doesn't resolve, this is a
  latent `NullPointerException`, not a handled validation error. Flagged in §17 Error Handling
  and §22 Known Gaps.

Client-side (Angular `saveBom()`):
- `bomName` and `selectedActivity` required before any save.
- Warns (does not always block) if a BOM item's `itemId` equals the selected activity's id — for
  *add* it's a toast warning only; for *save* (`saveBom`) it's a hard block.
- `deployBom()` blocks client-side if `bomItems.length === 0` (mirrors the server-side rule,
  belt-and-suspenders).
- Duplicate item add is blocked client-side (`exists = this.bomItems.find(i => i.itemId === item.mdmItemId)`).

### 4.19 Duplicate handling

No uniqueness constraint found on `(activityItemId, name)` or similar at the entity/DB level — the
only "duplicate" concept enforced is: (a) can't add the same item twice to one BOM (client-side
only, §4.18), (b) `toggleDefault` enforces **at most one default BOM per activity item** at the
service layer (`findByActivityItem_IdAndIsDefaultTrue`), which is the closest thing to a
uniqueness rule in this feature.

### 4.20 Save/update/delete workflows

See §2 architecture diagram and the Core Service table in §3 — each is a full HTTP round trip,
`@Transactional` on the core-service side, followed by a fire-and-forget Kafka publish
(`publishKafkaEvent`, wrapped in try/catch that only logs on failure — **the Kafka publish failure
does not roll back or fail the HTTP response**, meaning core and inventory can silently diverge if
the publish fails after the DB commit; flagged in §18 Transaction & Rollback Behavior).

### 4.21 Permission/authorization requirements

`TokenService.getTokenPayload(headers)` is called on every mutating endpoint to resolve the caller
identity (`TokenPayload`), which feeds the CTA lookup (tenant/site scoping). **No explicit
role/permission check** (e.g. an `@PreAuthorize` or manual role-code check) was found inside
`BomConfigurationController` or `BomConfigurationServiceImpl` in this phase — authorization appears
to rely entirely on gateway-level JWT validation plus CTA-based tenant scoping, not a BOM-specific
permission. This should be re-verified against the gateway/security-filter layer before relying on
it (out of scope for Phase 1 — gateway-service was not analyzed).

### 4.22 Transaction boundaries

`createBomConfiguration`, `updateBomConfiguration`, `updateBomStatus`, `toggleDefault`,
`deleteBomConfiguration` are all `@Transactional` in `BomConfigurationServiceImpl`. The Kafka
publish happens **inside** the same method but is not part of the DB transaction's atomicity
guarantee (Kafka isn't a transactional resource here — no outbox pattern was found); see §4.20 and
§18.

### 4.23 Error handling

Controller layer: every endpoint wraps the service call in try/catch and returns a uniform
`ApplicationResponse` with `CommonConstants.FAILED` + HTTP 500 + `e.getMessage()` on any exception
— i.e. **all failures surface as generic 500s with the raw exception message**, including validation
failures raised via `FailedException` (there's no distinct 4xx mapping observed in this file for
"not found" vs "bad request" vs "conflict" — everything collapses to 500). See §17 for the full
error/edge-case catalog once Parts 2–5 are added; this is the Phase 1 subset.

---

## 5. PART 2 — Showing & Consuming BOM

### 5.1 When BOM becomes visible to the user

`BomDetailsComponent` (`app-bom-details`) is a reusable Angular component, embedded as a child
inside conduction screens — confirmed usage: `AdministrationNonotComponent`
(`app-administration-nonot`, Non-OT procedure conduction, in
`projects/clinical-casesheet/src/module/conductq/administration-nonot/`). It takes
`@Input() catalogueItemId` (the activity/order's core catalogue item id) plus site/customer/patient/
encounter/admission/order/schedule context. On `ngOnChanges`, as soon as `catalogueItemId` is set it
calls `loadConfigs()` → `GET inventory/bom/conduct/configs`. **If that returns zero configs for the
activity, the BOM UI effectively has nothing to show** (`hasConfigs = false`) — there is no BOM
section forced onto every procedure, only ones with a `DEPLOYED` config for that activity item.

### 5.2 How BOMs are searched/fetched — exact API flow

```text
app-administration-nonot (AdministrationNonotComponent)
  hosts <app-bom-details [catalogueItemId]="...">
        |
        v
app-bom-details (BomDetailsComponent.ngOnChanges -> loadConfigs())
        |
        v
BomService.getBomConductConfigs()
        |  GET inventory/bom/conduct/configs?catalogueItemId&siteId&customerBusinessId
        v
inventory-service: BomConductController.getConfigs()
        -> BomConductService.getConfigsForActivity()
        -> BomConductServiceImpl.getConfigsForActivity()
        -> IBomConfigurationRepository.findByMdmActivityCatalogueItemIdAnd...SiteIdAnd...ActiveTrue
        -> inv_bom_configuration  (the Part-1 Kafka replica table)
        returns List<BomConfigOptionDTO> [{bomConfigurationId, mdmBomConfigurationId, name, isDefault, triggeredOn}]
        |
        v
Angular auto-selects the isDefault config (or configs[0]) once loaded (onResult, BOM_CONDUCT_CONFIGS case)
        |
        v
user picks/confirms a source location (BomService.getBomConductLocations, GET inventory/his/user/locations)
        |
        v
BomDetailsComponent.loadItems() -> BomService.getBomConductItems()
        |  GET inventory/bom/conduct/config/{bomConfigurationId}/items?sourceLocationId&siteId&customerBusinessId
        v
BomConductController.getItems() -> BomConductService.getItemsWithPrice()
        -> BomConductServiceImpl.getItemsWithPrice() -> BomItemFetchService.fetchItemsWithPrice()
        -> BomItemFetchServiceImpl.fetchItemsWithPrice()
             1. IBomConfigurationItemRepository.findByBomConfiguration_Id(bomConfigurationId)  [inv_bom_configuration_item]
             2. BillingService.getItemBatchDetailsByItemIds(itemIds, siteId, sourceLocationId, ...)
                (SAME repo/query/DTO the manual "add item" billing flow uses — BatchItemListDTO)
             3. per item: applyStockAndPrice() sets availableStock, batches[], salesPrice, mrp,
                priceSource ("CURRENT_BATCH" if availableStock>0, else "LAST_BATCH" if a price was
                found some other way, else "NONE" -> manualPriceRequired=true)
             4. hasAlternates(itemId, sourceLocationId, siteId) -> substitutable_item table -> alternateAvailable flag
        returns List<BomConductItemViewDTO>
```

### 5.3 How BOM details are loaded / items displayed

The Angular item grid (`BomDetailsComponent.items`) is populated straight from
`BomConductItemViewDTO` (see `onResult`, case `BOM_CONDUCT_CONFIG_ITEMS`), one row per configured
component item: `itemId/itemName/categoryName`, `configuredQty` (from the BOM config) vs `editQty`
(mutable, defaults to `configuredQty`), `uom`, `salesPrice`/`mrp`/`priceSource`, `batches[]`
(grouped/sorted by expiry in `getGroupedBatches()`), `availableStock`, `isMandatory`, `billing`,
`inventory`, and per-row edit metadata (`actionType`, `changeReasonId`, `qtyBefore/qtyAfter`,
`alternateForItemId`). **Mandatory items cannot be deleted** (`openDeleteDialog()` returns early if
`item.isMandatory`). Any qty change, delete, or substitute requires picking a reason from
`GET core-service-adjacent his/reasons` (`BomService.getBomConductReasons`,
`reasonTypeIdentifier=BOM_CONDUCTION`) before the edit is applied — confirmed both client-side
(`confirmReason()` blocks without a `selectedReason`) and structurally, since every edit is persisted
server-side as a `BomConductionItemReason` row (see §5.9).

### 5.4 How BOM consumption is initiated — draft, then conduct

Two-step, not one-shot:

1. **Save draft** (`BomDetailsComponent.saveDraft()` → `BomService.saveBomConductDraft` →
   `POST inventory/bom/conduct/draft/{siteId}` → `BomConductController.saveDraft` →
   `BomConductOrchestrationServiceImpl.saveDraft`). Persists a `BomConduction` row with
   `status=DRAFT` (or updates the existing one if `bomConductionId` was already assigned — matched by
   id, or by `scheduleId+admissionId+encounterId+status=DRAFT` for idempotent re-save), persists/
   updates/soft-deletes each `BomConductionItem` row, persists a `BomConfigSnapshot` **only on the
   first save of a new conduction** (never re-snapshotted on subsequent draft edits — see §17), and
   persists a `BomConductionItemReason` row for every edited item. Returns `bomConductionId`, which
   the Angular component stores and which the parent (`AdministrationNonotComponent`) reads via
   `@ViewChild(BomDetailsComponent) bomDetailsRef` to gate its own "Mark Conducted" button
   (`disable()`/`administermedication()`: blocked if `hasConfigs && !isDraftSaved`).
2. **Conduct** happens two different ways depending on caller:
   - **Direct** (`BomDetailsComponent.conduct()` → `POST inventory/bom/conduct/{siteId}` →
     `BomConductOrchestrationServiceImpl.conduct()`) — used when the Angular BOM component itself
     drives conduction.
   - **Draft-finalize via schedule-status update** — `AdministrationNonotComponent.administermedication()`
     attaches only `bomConductionId` onto the broader `UpdateScheduleStatusDTO` request and calls
     `ConductQService.updateScheduleStatus`; the actual BOM finalize is triggered **server-side**, by
     clinical-casesheet-service (CCS) calling `inventory-service` via Feign:
     `POST bom/conduct/{bomConductionId}/finalize` → `BomConductOrchestrationServiceImpl.finalizeDraft()`.
     This is the **"slim finalize" path** — the request body (`BomFinalizeRequestDTO`) carries only
     caller identity + patient/schedule context; all item data is loaded from the DRAFT already
     persisted in step 1, never re-sent. **CONFIRMED in Phase 6**
     (`BOM_PART6_CASESHEET_OPD_CLINICAL_INTEGRATION.md`): the CCS-side caller is
     `NonotConductingServiceImpl.conductBomViaFeign()`, which builds a `BomFinalizeRequestDTO` and
     calls `InventoryProxy.finalizeBomConduct()` — a Spring Cloud `@FeignClient(name = "inventory")`
     mapped to exactly this endpoint — fired `@Async` from CCS's `PUT /schedule/status/update`
     handler (used by both `app-administration-nonot` and `app-administration-casesheet`).)

Both `conduct()` and `finalizeFromDraft()` (the shared private method both `conduct()` and
`finalizeDraft()` funnel into) run the same per-item logic described in §5.6–§5.8.

### 5.5 Stock BOM vs non-stock BOM — how they differ operationally

Confirmed at the exact branch point in `BomConductOrchestrationServiceImpl` (`conduct`/
`finalizeFromDraft`, per item):
```text
requestedQty = itemReq.qtyConsumed
availableQty = getAvailableStock(itemReq, sourceLocationId)   // 0 if item has no batch/stock row
consumeQty   = min(requestedQty, availableQty)
shortageQty  = requestedQty - consumeQty

if item.inventory == true:
    if consumeQty > 0:  consume immediately (StockOutDTO -> PatientConsumptionService), state=CONSUMED
                          (or PENDING if shortageQty>0 too — partial consumption, see below)
    if shortageQty > 0: create/attach to BomConsumptionPending + BomConsumptionPendingItem, state=PENDING

if item.billing == true:
    ALWAYS bill the FULL requestedQty (not consumeQty), regardless of stock outcome
    state = BILLED_ONLY only if it wasn't already set to CONSUMED/PENDING above
```
So "non-stock BOM item" in the requester's terminology = `inventory=false` (§4.15) → the consume
branch never runs at all for that item, it can only ever be `BILLED_ONLY` (if `billing=true`) or
have no consumption state (if `billing=false` too, which is a legal-but-inert combination — see
§17). A **stock item with a shortage** is the case that actually populates the pending queue —
"non-stock" and "pending queue" are not the same concept: the pending queue is for **stock items
that couldn't be fully consumed at conduct time**, not for items marked `inventory=false`. (This
refines the Part 3 scope for the next phase: the pending queue is a *shortage* queue, not a
generic "non-stock BOM" queue — worth flagging since the requester's own prompt used "non-stock BOM"
to describe the pending-queue flow.)

### 5.6–5.7 Item availability checks / batch selection (display-time)

`getAvailableStock()` (conduct-time) sums `ItemBatchBalance.currentBalance` for the item at
`sourceLocationId`, filtered by `batchNo` if one was picked, else summed across all batches with
positive balance. **Special case:** if `itemReq.priceSource` is `"NONE"` or `"LAST_BATCH"`,
available stock is forced to `0` regardless of actual balance — i.e. an item whose price could only
be resolved from a stale/fallback source is treated as unavailable for consumption purposes, always
routed to the pending queue if `inventory=true`. Display-time (§5.2's `fetchItemsWithPrice`) batch
listing/price resolution is a **different, read-only path** reusing `BillingService.getItemBatchDetailsByItemIds`
— the same repo the manual billing "add item" search uses — so BOM's batch/price display is
guaranteed consistent with the rest of billing, not a bespoke query.

### 5.8 UOM conversion

`uomConversionId` flows through as an opaque ID end-to-end (config item → conduction item → Kafka
payload) — **no unit-conversion arithmetic was found in this phase**; the configured `qty` and the
consumed `qtyConsumed` are compared and summed directly as numbers assumed to already be in the same
UOM. If the BOM configuration's `uom` differs from the item's stock/dispensing UOM, nothing in
`BomConductOrchestrationServiceImpl` converts between them — flagged as `UNKNOWN / NOT FOUND IN
SOURCE` whether conversion happens upstream (e.g. baked into `configuredQty` at config time) or is
simply not handled. Worth a follow-up read of `ItemUomConversion`/`DrugUOMConversion` usage
elsewhere if this matters for the task at hand.

### 5.9 Consumption validation / partial vs full consumption / duplicate prevention

- **Partial consumption**: handled per-item as `consumeQty = min(requested, available)` — a single
  conduct call can leave some items fully `CONSUMED` and others `PENDING` simultaneously; the parent
  `BomConduction.status` becomes `PARTIALLY_CONSUMED` if **any** item went to pending
  (`if (!pending.isEmpty()) conduction.setStatus(PARTIALLY_CONSUMED)`).
- **Full consumption**: `consumeQty == requestedQty`, `shortageQty == 0`, item state `CONSUMED`.
- **Duplicate conduction prevention (idempotency)**: `conduct()` checks
  `bomConductionRepo.findByScheduleIdAndCustomerTransactionAttribute_ActiveTrue(scheduleId)` **before**
  creating a new `BomConduction` — if one already exists for that schedule, it short-circuits and
  returns the existing result (`buildResultFromExisting`) rather than double-consuming/double-billing.
  This only guards on `scheduleId`, though — a conduct request with no `scheduleId` (e.g.
  `PENDING` whether OT/ad-hoc flows ever omit it) has no idempotency guard at all.
- **Edit auditing**: every qty-change/delete/substitute/add is captured as a `BomConductionItemReason`
  row (`persistItemReason`) tied to `BomEditActionType` (`DELETE`, `QTY_CHANGE`, `ADD_ITEM`,
  `SUBSTITUTE`), with `qtyBefore`/`qtyAfter` and the picked reason's id/code/label/description —
  this is the audit trail for "why did the consumed BOM differ from the configured BOM."
- **Substitution** is modeled as: soft-delete-by-replacement at the Angular layer
  (`replaceItemWithAlternate`, a new item object replaces the old one in the array,
  `alternateForItemId` points back at the original), and server-side as a **separate**
  `BomConsumptionAlternateItem` audit row (`persistAlternate`) alongside the normal
  `BomConductionItem` row for the substituted-in item — the original item is not itself marked
  deleted-by-substitution in a special way; it's just absent from the next save's item list (handled
  by the generic "soft-delete anything not re-sent" logic in `saveDraft`).

### 5.10–5.11 Error handling / transaction handling (Phase 2 subset)

- `conduct()`, `saveDraft()`, `finalizeDraft()`, `fulfil()` are all `@Transactional` in
  `BomConductOrchestrationServiceImpl` — one DB transaction per call.
- **Inconsistent Kafka-failure handling within the same class**: a failed
  `BOM_CONDUCTION_DISPENSE` or `BOM_CONDUCTION_BILL` publish during `conduct()`/`finalizeFromDraft()`
  is logged **and then rethrown as a `RuntimeException`**, which — being inside `@Transactional` —
  rolls back the whole conduct transaction (stock consumption included, since
  `patientConsumptionService.addNewPatientConsumption` already ran in the same transaction). But the
  **fulfil-path** `DISPENSE` publish (`fulfil()`, "for logging only") is logged on failure and
  **swallowed**, not rethrown — so a Kafka outage fails differently depending on which of the two
  BOM flows is running. And the top-level `publishBomEvent()` helper itself also independently
  swallows `ApplicationException` via `e.printStackTrace()` — meaning the actual behavior on Kafka
  failure depends on exactly which exception type the producer throws, not a single consistent
  policy. Flagged for §17/§22.
- `fulfil()` throws a hard `RuntimeException` if the submitted batch quantities don't sum to exactly
  the pending item's required quantity (`Math.abs(totalBatchQty - qtyRequired) > 0.001f`) — a real
  validation guard, not swallowed.
- `saveDraft()`/`conduct()` both catch `CustomerNotFoundException` from `ctaService...` with only
  `e.printStackTrace()` and **no further handling** — `cta` is left `null` and every subsequent
  `cta.getX()` call in the same method (e.g. `tokenPayload.getCoreUserId()` two lines later in
  `conduct()`) will NPE. This mirrors the same defensive-gap pattern already flagged in Part 1
  (§4.18/§17) — looks like a project-wide habit of catching-and-printing rather than propagating.

---

## 6. PART 3 — Non-Stock BOM Consumption Through Indents

**Moved to its own file: `BOM_PART3_NON_STOCK_INDENT_CONSUMPTION.md`** (same folder), per explicit
request. Summary of its headline findings, for anyone reading only this master file:

- The pending queue (`app-bom-pending-queue`, `indent` Angular project) is a **stock-shortage
  queue**, not a non-stock-item queue — a BOM item with `inventory=false` never enters it. There is
  no formal "Indent" entity/approval workflow behind it despite the naming.
- **Major cross-cutting finding**: at least **three independent BOM stock-reduction backends** exist
  in this codebase. The `bom.conduct` engine documented in Part 2 above (OPD Non-OT, has the pending
  queue) is only one of them. `ipd-clinical-service`
  (`EncounterClinicalAdministerServiceImpl.conductBom`) and `ipd-service`
  (`OtBillingServiceImpl`) each independently publish to a separate legacy Kafka topic (`BOM_ITEM`),
  consumed by `inventory-service`'s `PatientConsumptionServiceImpl.reducedBomQuantityFromInventory`
  — a FEFO-batch-consuming method with **no pending-queue equivalent found**. This materially affects
  the scope of Part 4 (Stock Reduction) and Part 5 (Billing): there isn't one stock-reduction/billing
  mechanism to document, there are at least three, only one of which is covered so far (via Part 2).
  See the new file's §0 for full detail and file/line traceability.

## 7. PART 4 — Stock Reduction

**Moved to its own file: `BOM_PART4_STOCK_REDUCTION.md`** (same folder), per explicit request.
Headline findings for anyone reading only this master file:

- Both BOM implementations (the `bom.conduct` engine from Part 2, and the legacy `BOM_ITEM`
  Kafka path from Part 3 §0.2) converge on the same shared core:
  `PatientConsumptionServiceImpl.addNewPatientConsumption` → `ItemBatchLedgerService.multipleItemBatchLedger`
  → `ItemBatchBalanceService.updateBatchBalance`. Batch selection is FEFO (earliest expiry first);
  negative-stock is prevented by two independent, confirmed guards; balance mutation uses real JPA
  optimistic locking (`@Version`).
- **CONFIRMED BUG** (resolves Part 3's flagged open question): the legacy path's own shortage-detection
  loop (`PatientConsumptionServiceImpl.reducedBomQuantityFromInventory`, ~line 1645) uses the wrong
  comparison (`remainingQty < 0` instead of `> 0`), an expression that can never be true given the
  loop's own arithmetic — meaning BOM items conducted via IPD clinical administration or IPD OT
  billing that run short on stock are **silently under-consumed with no error surfaced anywhere**.
- The task brief's assumed formula (`BOM Quantity × Component Quantity`) does not exist in source —
  there is no conduction-repeat-count multiplier anywhere in the BOM feature.
- `addNewPatientConsumption` itself carries no `@Transactional` annotation (confirmed by a direct
  code comment in the same class) — safe when called from Part 2's already-`@Transactional`
  orchestration methods, but unconfirmed for the legacy Kafka-listener call path.

See the new file for full detail, file/line traceability, and the remaining open questions.

## 8. PART 5 — Adding BOM to Bill

**Moved to its own file: `BOM_PART5_ADDING_BOM_TO_BILL.md`** (same folder), per explicit request.
Headline findings:

- All three BOM implementations' billing paths converge on the **same class**:
  `ipd-service`'s `IPDPrescriptionOrderServiceImpl`, reusing the same `PrescriptionOrderEvent`/
  `PrescriptionOrderEventItem`/`PrescriptionOrderEventItemInventoryBatchDetails` entities already
  used for OT/indent billing generally — BOM billing is not a separate subsystem.
- BOM never bills its own header/activity — only component items, additively on top of whatever
  bills the activity itself.
- **Second confirmed silent-failure bug** (after Part 4's stock-side one): Implementation B's
  billing consumer (`IPDPrescriptionOrderServiceImpl.bomOrders`, triggered from IPD clinical
  administration via a new topic, `LT_BOM_EVENT`) wraps its entire body in an **empty catch block**
  — every exception, including its own explicit validation failures, vanishes with zero log output
  anywhere. It also only saves bill items as `PENDING` without auto-submitting to an open bill
  (unlike Implementation A), a second, structural way its BOM bill lines might never reach a patient's
  bill.
- Implementation C (IPD OT billing) does not appear to separately bill BOM child items at all, as
  far as this phase traced — only stock-deducts inventory-tracked ones.

See the new file for full detail, price/tax calculation specifics, and remaining open questions.

## 8a. PART 6 — Case Sheet / OPD Clinical Integration (`app-administration-casesheet`)

**Its own file: `BOM_PART6_CASESHEET_OPD_CLINICAL_INTEGRATION.md`** (same folder). Not part of the
original 5-part brief — opened by tracing a real, captured `PUT .../ccs/schedule/status/update` API
call. Headline findings:

- **Closes the open item from §5.4 above**: the CCS→inventory-service Feign hop is now fully
  confirmed with code (`NonotConductingServiceImpl.conductBomViaFeign()` →
  `InventoryProxy.finalizeBomConduct()`).
- `app-administration-casesheet` is a general-purpose sibling of `app-administration-nonot` (Part 2)
  — same CCS endpoint, but covers RAD/SPTPY/ATY/OTY/DENT/etc., not just Non-OT procedures. It does
  **not** host `<app-bom-details>` itself; which sibling component populates the shared
  `caseSheetData.bomConductionId` it reads was not identified.
- **Double-confirmed dead code**: the component builds a rich `bomDetails.childItems` payload from
  `ConductQService.bomDeatails`, but that field is never assigned anywhere in the frontend, and even
  if it were, the backend Feign call never reads `childItems` at all (Implementation A's finalize is
  deliberately "slim" — it reloads everything from the persisted draft).
- The whole Feign hop is fire-and-forget (`@Async`) from the schedule-status-update caller's
  perspective — a downstream BOM finalize failure is structurally invisible to the end user.
- A second, unexplained trigger condition (`UpdateScheduleStatusDTO.type == "BOM_CONDUCTION"`)
  exists in the CCS code with no caller found setting it — an open question for a future phase,
  alongside the possibility of a fourth BOM entry point via RIS/haemodialysis conduct controllers.

## 9. Complete End-to-End BOM Lifecycle
`PENDING` — will be assembled once all Parts are verified.

## 10. Frontend API Mapping
Phase 1 entries are in §3. Remaining entries `PENDING`.

## 11. Backend API Mapping
Phase 1 entries are in §3. Remaining entries `PENDING`.

## 12. Database Schema & Relationships (Phase 1 subset)

### `bom_configuration` (core-service)
| Column | Notes |
|---|---|
| `id` | PK, identity |
| `name` | not null |
| `activity_item_id` | FK → `catalogue_item.id` |
| `activity_category_id`, `activity_category_name`, `activity_category_identifier_code`, `activity_common_name_category_id`, `activity_common_name_category_name`, `activity_common_name_category_identifier` | embedded `ItemCategoryVO`, denormalized |
| `status` | enum string: `DRAFT` \| `DEPLOYED` \| `PAUSED` |
| `is_default` | boolean |
| `triggered_on` | enum string: `Conducting` \| `SampleCollection`, nullable |
| CTA columns (customer/site scoping) | embedded `CustomerTransactionAttribute` — exact column names not enumerated in Phase 1 |
| `active` | soft-delete flag, default true, set false by `@SQLDelete` |
| *(implied)* `updated_on` | referenced in `BomConfigurationSQL.getAllBomConfigurations` (`bc.updated_on`) — column exists but its population point (auditing hook) not yet traced |
| *(implied)* `customer_business_id`, `site_id` | referenced directly in raw SQL (`BomConfigurationSQL`) even though the entity only exposes them via the embedded CTA object |

### `bom_configuration_item` (core-service)
| Column | Notes |
|---|---|
| `id` | PK |
| `bom_configuration_id` | FK → `bom_configuration.id` |
| `item_id` | FK → `catalogue_item.id` |
| `item_category_*` (6 columns) | embedded `ItemCategoryVO`, denormalized |
| `qty` | int |
| `uom_conversion_id` | FK → `drug_uom_conversion.id`, nullable |
| `mrp`, `mrp_currency`, `mrp_default_fraction_digits` | embedded `Money` — **vestigial**, see §4.17 |
| `billing`, `inventory`, `is_mandatory` | booleans — classification flags, see §4.15/4.17 |
| CTA columns | embedded |
| `active` | soft-delete flag |

### `inv_bom_configuration` / `inv_bom_configuration_item` (inventory-service)
Same shape as above, plus `mdm_bom_configuration_id` / `mdm_bom_configuration_item_id` (the
core-service IDs, used as the reconciliation key by `BomConfigurationSyncServiceImpl`); item's
`mrp`/currency columns are **absent** on the inventory replica entity (pricing intentionally not
synced — consistent with §4.17). `mdm_activity_catalogue_item_id` is `nullable=false` at the JPA
level even though the sync code treats a missing value as a soft failure (`logger.error` + early
`return`, not an exception) — see §17/§22 for the mismatch.

### Relationship view (Phase 1 slice)
```text
core-service                                  inventory-service (replica)
bom_configuration (1)                         inv_bom_configuration (1)
   |                                              |
   +-- activity_item_id -> catalogue_item          +-- mdm_activity_catalogue_item_id -> item (via mdm_catalogue_item_id)
   |                                              |
   +-(1:N)-> bom_configuration_item                +-(1:N)-> inv_bom_configuration_item
                 |                                               |
                 +-- item_id -> catalogue_item                   +-- item_id -> item (inventory)
                 +-- uom_conversion_id -> drug_uom_conversion     +-- uom_conversion_id -> item_uom_conversion
                                                                       (resolved by mdm_uom_id, not by core's row id)

Sync key: inv_bom_configuration.mdm_bom_configuration_id == core bom_configuration.id
          inv_bom_configuration_item.mdm_bom_configuration_item_id == core bom_configuration_item.id
```
### Phase 2 additions — inventory-service BOM *conduction* tables

| Table | Entity | Key columns | Notes |
|---|---|---|---|
| `inv_bom_conduction` | `BomConduction` | `id`, `source`, `type` (always `OPD_NON_OT_PRDR`/`BOM_CONDUCTION` in the code seen so far), `mdm_bom_configuration_id`, `bom_configuration_id`, `activity_catalogue_item_id`, `patient_id` (NOT NULL), `encounter_id` (NOT NULL), `admission_id`, `order_id`, `schedule_id`, `source_location_id` (MDM location id, resolved to inventory PK separately), `status` (`BomConductionStatus`), `conducted_by_id/name/on` | One row per conduction event (draft or final); the header |
| `inv_bom_conduction_item` | `BomConductionItem` | `id`, `bom_conduction_id` FK, `item_id`, `item_category_id/name`, `qty_configured`, `qty_consumed`, `uom_conversion_id`, `sales_price_*`/`mrp_*`/`tax_*`/`billed_*` (all embedded `Money`), `price_source`, `is_manual_price`, `is_billed`, `total_cost_*`, `batch_no`, `expiry_date`, `sl_no`, `billing`, `inventory`, `is_mandatory`, `is_added_item`, `consumption_state` (`BomConsumptionState`), `change_reason_code/specify`, `change_remarks` | The actual as-conducted line items — this is the row that carries the real consumed qty and price, distinct from the frozen snapshot below |
| `inv_bom_config_snapshot` | `BomConfigSnapshot` | `id`, `bom_conduction_id` FK, `bom_configuration_id`, `mdm_bom_configuration_id`, `name`, `is_default`, `snapshot_on` | Frozen copy of the BOM config header **as it was at first-draft-save time** — created once per conduction, never on subsequent draft re-saves |
| `inv_bom_config_snapshot_item` | `BomConfigSnapshotItem` | `id`, `snapshot_id` FK, `item_id/name`, `item_category_id`, `qty`, `uom_conversion_id`, `mrp_*`, `billing`, `inventory`, `is_mandatory` | Frozen copy of each config item at snapshot time |
| `inv_bom_consumption_pending` | `BomConsumptionPending` | `id`, `bom_conduction_id` FK, `patient_id/name`, `mpi`, `enc_number`, `encounter_id`, `admission_id`, `patient_ward`, `admission_category`, `source_location_id`, `activity_name`, `status` (`BomPendingStatus`) | One row per conduction that has ≥1 item with a stock shortfall — the pending-queue header (Part 3) |
| `inv_bom_consumption_pending_item` | `BomConsumptionPendingItem` | `id`, `pending_id` FK, `conduction_item_id`, `item_id/name`, `qty_required`, `qty_fulfilled`, `uom_conversion_id`, `status` (`BomPendingStatus`) | The specific shortfall line to be fulfilled later |
| `inv_bom_conduction_item_reason`* | `BomConductionItemReason` | `bom_conduction_id`, `conduction_item_id`, `item_id`, `action_type` (`BomEditActionType`), `mdm_reason_id`, `reason_identifier/name/discription`, `remarks`, `qty_before/after` | Audit trail for every edit (qty change/delete/add/substitute) — entity file not opened this phase, columns inferred from setter calls in `BomConductOrchestrationServiceImpl.persistItemReason` |
| `inv_bom_consumption_alternate_item`* | `BomConsumptionAlternateItem` | `bom_conduction_id`, `conduction_item_id`, `original_item_id`, `alternate_item_id/name`, `qty`, `reason_id`, `remarks` | Substitution audit trail — inferred from `persistAlternate`, entity file not opened |
| `inv_bom_billing_price_variance`* | `BomBillingPriceVariance` | `bom_conduction_id`, `conduction_item_id`, `item_id`, `billed_sales_price`, `billed_tax`, `billed_total`, `billed_price_source`, `billed_tax_identifier_code` (+ presumably `consumed_*`/`price_difference` columns, referenced via `BomBillingPriceVarianceRepository.findByConductionItemIdAndActiveTrue` in `BomConductServiceImpl.getVarianceReport`) | Records billed-vs-actually-consumed price differences when fulfilment happens at a different price than billing time; entity file not opened this phase |

\* Entity file not directly opened in Phase 2 — columns are inferred from setter/getter calls in code
that *was* read (`BomConductOrchestrationServiceImpl`, `BomConductServiceImpl`), not from the
`@Column` annotations themselves. Treat as high-confidence but not entity-verified; a future phase
touching Part 3/4 in depth should open these three files directly.

Downstream tables owned by `PatientConsumptionService` (the actual stock ledger/batch-balance
tables touched by `addNewPatientConsumption`) and by IPD-side billing are `PENDING` — Parts 4/5.

## 13. Cross-Service Communication (Phase 1 slice)

- **core-service → inventory-service**: asynchronous, Kafka only, topic `KafkaTopics.LT_INVENTORY_EVENT`
  (constant name; literal topic string not resolved in this phase), envelope `KafkaCoreDTO`
  (`requestType = HIS_BOM_CONFIGURATION`, payload = `BomConfigurationDTO` /
  `BomConfigurationKafkaDTO`). Publish uses `ProducerService.publishToKafka(...)`, built via
  `EventsMapper.convertToMessageEvent(cta, kafkaCoreDTO, 1, KafkaTopics.LT_INVENTORY_EVENT)`.
  **No synchronous Feign call was found for BOM configuration** — this is a pure event-driven
  replication, not a request/response integration.
- **Angular → inventory-service directly (bypassing core-service)**: `GET /bom/items/search` is
  called straight from the Masters Angular app to inventory-service for the item-picker
  autocomplete — the only synchronous frontend→inventory call in Part 1.
- **Failure propagation**: if the Kafka publish throws, it's caught and logged inside
  `publishKafkaEvent` — the HTTP response to the Angular UI still reports success (the DB write
  already committed). If the **consumer** side throws (`BomConfigurationSyncServiceImpl.processBomEvent`
  re-throws on `IllegalArgumentException` etc. after logging), the exception propagates up into
  `ConsumerService` — retry/DLQ behavior of the underlying Kafka listener was **not traced in this
  phase** (`PENDING`).

### Phase 2 additions

- **clinical-casesheet-service (CCS) → inventory-service, synchronous Feign**: confirmed to exist
  from `BomConductController`'s own code comments ("4a. Slim finalize — called by CCS via Feign") on
  `POST bom/conduct/{bomConductionId}/finalize`. This is the one clearly-synchronous, clearly
  cross-service call found in the BOM flow so far — CCS calls inventory-service directly to promote
  a DRAFT conduction to CONDUCTED as part of the broader "mark schedule conducted" workflow. The CCS
  side (the Feign client, and where in CCS's schedule-status-update flow this call is made) was
  **not read in this phase** — `PENDING`.
- **inventory-service → itself, Kafka, for billing/dispense**: `BOM_CONDUCTION_DISPENSE` and
  `BOM_CONDUCTION_BILL` (`KafkaRequestType`) are published by `BomConductOrchestrationServiceImpl`
  onto the **same** `KafkaTopics.LT_INVENTORY_EVENT` topic used for the Part 1 config-sync event —
  i.e. inventory-service publishes to its own inbound event topic. Whether these are consumed by
  inventory-service itself (self-loop, e.g. for an async billing worker) or by another service
  subscribed to the same topic (most likely **IPD service**, for actual bill-item creation — Part 5)
  was **not confirmed in this phase** — the consumer side of `BOM_CONDUCTION_BILL`/`DISPENSE` is
  `PENDING`, to be traced in the Part 5 phase by grepping IPD/billing services for these enum values.
- **inventory-service → PatientConsumptionService (same service, in-process)**: stock consumption
  is **not** a cross-service call at all in the conduct path — `BomConductOrchestrationServiceImpl`
  calls `PatientConsumptionService.addNewPatientConsumption(StockOutDTO, tokenPayload, "BOM")`
  in-process, within the same transaction as the BOM row writes. This means BOM stock consumption and
  BOM row persistence are **atomic with each other** (same `@Transactional` boundary) but **not**
  atomic with the Kafka billing event (fire-after-commit-adjacent, not two-phase — see §5.10-11).

## 14. Business Rules (Phase 1 subset)

```text
Rule: A DEPLOYED BOM configuration cannot be edited.
Condition: BomConfiguration.status == DEPLOYED
Implementation: BomConfigurationServiceImpl.updateBomConfiguration, throws FailedException
Class/Method: core-service, BomConfigurationServiceImpl.updateBomConfiguration
Impact: Must PAUSE (or presumably create a new BOM) before editing a live BOM.
```
```text
Rule: A BOM cannot be deployed with zero items.
Condition: items list empty at status-change time
Implementation: BomConfigurationServiceImpl.updateBomStatus
Class/Method: core-service, BomConfigurationServiceImpl.updateBomStatus
Impact: Prevents an empty BOM from reaching patient workflows.
```
```text
Rule: At most one default BOM per activity item.
Condition: toggleDefault sets isDefault=true on target, finds and demotes any other
           BomConfiguration with the same activityItem_Id and isDefault=true
Implementation: BomConfigurationServiceImpl.toggleDefault,
                IBomConfigurationRepository.findByActivityItem_IdAndIsDefaultTrue
Class/Method: core-service
Impact: Downstream conduction logic (Part 2, not yet verified) can presumably rely on
        "the default BOM for activity X" being unambiguous.
```
```text
Rule: A BOM item's classification (billing / inventory / mandatory) is independent per item.
Condition: BomConfigurationItem.billing, .inventory, .isMandatory are three separate booleans
Implementation: entity fields, set directly from BomConfigurationItemPostDTO
Class/Method: core-service BomConfigurationItem; inventory-service replica mirrors same
Impact: One BOM can mix stock and non-stock items, billed and unbilled items — classification
        decisions in Parts 2-5 must be read per-item, never assumed from the BOM as a whole.
```
### Phase 2 additions (conduction rules)

```text
Rule: Billing always fires for the FULL requested quantity, independent of stock outcome.
Condition: item.billing == true
Implementation: BomConductOrchestrationServiceImpl.conduct/finalizeFromDraft — billedAmount computed
                 from `requestedQty`, not `consumeQty`; BOM_CONDUCTION_BILL published unconditionally
                 when billing=true, even if consumeQty=0
Class/Method: inventory-service, BomConductOrchestrationServiceImpl
Impact: A stock shortage never blocks or reduces a bill; only the inventory-side consumption is
        deferred to the pending queue. Billing and inventory are fully decoupled per item.
```
```text
Rule: A conduction is idempotent per scheduleId.
Condition: request.scheduleId is non-null and a BomConduction already exists for it (active)
Implementation: BomConductOrchestrationServiceImpl.conduct(), checked before creating a new row
Class/Method: inventory-service, BomConductOrchestrationServiceImpl.conduct
Impact: Re-submitting "conduct" for the same schedule returns the existing result instead of
        double-consuming stock or double-billing. NOT guarded when scheduleId is null (PENDING
        whether that case occurs in practice).
```
```text
Rule: The config snapshot is taken once per conduction, at first draft save only.
Condition: !isUpdate && request.getBomConfigurationId() != null, inside saveDraft()
Implementation: BomConductOrchestrationServiceImpl.saveDraft -> persistConfigSnapshot
Class/Method: inventory-service, BomConductOrchestrationServiceImpl
Impact: Later edits to the live BOM configuration (Part 1) never retroactively change what an
        already-in-progress or completed conduction "meant" — the snapshot is the historical
        record. Editing the draft's items afterward does NOT re-snapshot.
```
```text
Rule: A stock item's available-quantity check is forced to zero if its price could only be
      resolved from a fallback/stale source.
Condition: itemReq.priceSource in {"NONE", "LAST_BATCH"}
Implementation: BomConductOrchestrationServiceImpl.getAvailableStock, early return 0f
Class/Method: inventory-service, BomConductOrchestrationServiceImpl
Impact: Such an item always routes its full requested qty to the pending queue at conduct time,
        even if some stock technically exists — apparently a deliberate "don't trust the price,
        don't auto-consume" guard, though the display-time fetch (BomItemFetchServiceImpl) and the
        conduct-time check are two independently-written pieces of logic (not shared code), so this
        specific coupling could silently drift if one is changed without the other. Flagged in §22.
```
```text
Rule: Mandatory config items cannot be deleted from the conduction UI.
Condition: item.isMandatory == true
Implementation: BomDetailsComponent.openDeleteDialog(), early return
Class/Method: Angular, BomDetailsComponent
Impact: Client-side only — no server-side re-check of "mandatory item was deleted" was found in
        BomConductOrchestrationServiceImpl; a malformed/bypassed request could in principle omit a
        mandatory item. PENDING further verification if this matters for the task at hand.
```

Remaining rules (patient eligibility, department/location eligibility beyond the stock-area filter
already noted in §5.1, approval workflow for the pending queue) are `PENDING` — Parts 3–5.

## 15. Quantity / UOM / Stock Calculations
`PENDING (Phase 3/4)` for the consumption-time formulas. Phase 1 only establishes that
configuration-time `qty`/`uom` are the *per-conduction-unit* recipe values, not the actual
consumed/reduced quantities.

## 16. Status & State Transitions (Phase 1 subset)

```text
DRAFT  <--> PAUSED  <--> DEPLOYED
```
Confirmed transitions: any status can be set via `updateBomStatus` (`BomStatus.valueOf(newStatus)`
— no explicit state-machine guard restricting which transitions are legal **except** the "≥1 item to
deploy" rule). So textually the code allows `DRAFT → DEPLOYED`, `DEPLOYED → PAUSED`,
`PAUSED → DEPLOYED`, `DRAFT → PAUSED`, etc., all through the same endpoint — there is no
explicit disallowed-transition table in `BomConfigurationServiceImpl.updateBomStatus`. Only the
"cannot edit while DEPLOYED" rule constrains anything transition-adjacent (edits, not status
changes, are blocked).

### Phase 2 additions — BOM Conduction states

`BomConductionStatus` (`inv_bom_conduction.status`): `DRAFT`, `CONDUCTED`, `PARTIALLY_CONSUMED`,
`PENDING`, `CANCELLED`. Confirmed transitions from code:
```text
(new)  --saveDraft()-->              DRAFT
DRAFT  --conduct()/finalizeDraft()--> CONDUCTED            (no items went to pending)
DRAFT  --conduct()/finalizeDraft()--> PARTIALLY_CONSUMED    (>=1 item went to pending)
PARTIALLY_CONSUMED --fulfil() all pending items--> CONDUCTED
```
`CANCELLED` and the bare `PENDING` conduction-level status value are declared in the enum but **no
code path setting them was found in this phase** — `PENDING (verify)`, possibly reserved for a
cancel-conduction flow not yet located, or dead enum values.

`BomConsumptionState` (`inv_bom_conduction_item.consumption_state`, **per item**, distinct from the
conduction-level status above): `CONSUMED`, `BILLED_ONLY`, `PENDING`, `SKIPPED`. Set once per item
per conduct/finalize/fulfil call — `CONSUMED` (full stock available), `PENDING` (shortage, routed to
pending queue), `BILLED_ONLY` (billing=true but inventory=false, or billing=true with no consumption
attempted), `SKIPPED` — enum value exists but **no assignment to `SKIPPED` was found** in
`BomConductOrchestrationServiceImpl` in this phase (`PENDING (verify)`).

`BomPendingStatus` (`inv_bom_consumption_pending(_item).status`): `PENDING`, `PARTIALLY_FULFILLED`,
`FULFILLED`, `CANCELLED`. Confirmed transitions:
```text
(created on shortage) --> PENDING
fulfil() some but not all pending items --> PARTIALLY_FULFILLED (pending header)
fulfil() all pending items for that queue --> FULFILLED (pending header AND each item)
```
`CANCELLED` here is likewise enum-declared but **no setter call found in this phase** — `PENDING
(verify, likely Part 3)`.

## 17. Error Handling & Edge Cases (Phase 1 subset)

```text
Error: NullPointerException risk in BomConfigurationServiceImpl.saveItems
Where it occurs: core-service, saveItems(), when itemDTO.getItemId() does not resolve to an
                 existing CatalogueItem
Root cause: iCatalogueItemRepository.findById(...).orElse(null) followed immediately by
            catalogueItem.getCategory() with no null check
How it is handled: Not handled — will NPE, caught only by the generic controller try/catch,
                    surfaced to the client as a 500 with a generic NPE message (no field-level
                    validation error)
User-visible behavior: Angular shows a generic "Failed to create/update BOM" toast
                        (data?.message will be a raw NPE message, not user-friendly)
Recovery: None automated; user must re-check which item id was invalid, which the error
          message does not clearly indicate
```
```text
Error: Kafka publish failure is swallowed after DB commit
Where it occurs: core-service, publishKafkaEvent(), catch (ApplicationException) — logs only
Root cause: Kafka publish is not part of the @Transactional DB write; no outbox/retry pattern
How it is handled: Logged as "Failed to publish BOM Kafka event", no user-facing error, no retry
User-visible behavior: UI reports success; inventory-service silently never receives the update
Recovery: None automated found in Phase 1 — would require manual reconciliation/replay
```
```text
Error: All backend exceptions collapse to HTTP 500 with raw exception message
Where it occurs: every BomConfigurationController endpoint
Root cause: uniform try/catch { return ApplicationResponse(FAILED, 500, e.getMessage(), null) }
How it is handled: no HTTP status differentiation between "not found", "validation failed",
                    "conflict", or genuine server error
User-visible behavior: Angular's onError()/onResult() branches only check data.code === "200"/"201"
                        vs anything else -> generic toast with data.message
Recovery: N/A — informational for anyone building better client-side error handling later
```
### Phase 2 additions

```text
Error: NullPointerException risk on CustomerNotFoundException during draft/conduct
Where it occurs: BomConductOrchestrationServiceImpl.conduct() and saveDraft(), catch
                 (CustomerNotFoundException e) { e.printStackTrace(); } leaves cta = null
Root cause: same catch-and-print pattern as core-service's BOM config service (§17 Phase 1);
            cta is then dereferenced unconditionally a few lines later in some paths
How it is handled: not handled — will NPE downstream, caught only by whatever generic handler
                    wraps the controller (not visible at the BomConductController level itself,
                    which does not try/catch its delegate calls at all, unlike core-service's
                    BomConfigurationController)
User-visible behavior: likely a raw 500 with no ApplicationResponse envelope, since
                        BomConductController methods don't wrap calls in try/catch
Recovery: none automated
```
```text
Error: Inconsistent Kafka-publish-failure policy within the same class
Where it occurs: BomConductOrchestrationServiceImpl — conduct()/finalizeFromDraft() rethrow on
                 DISPENSE/BILL publish failure (rolls back the whole transaction, including stock
                 already consumed in-process); fulfil()'s DISPENSE publish only logs and continues;
                 the shared publishBomEvent() helper itself swallows ApplicationException via
                 e.printStackTrace() regardless of caller
How it is handled: three different behaviors for what is conceptually the same failure mode
User-visible behavior: a Kafka outage during "conduct" fails the whole action (safe but disruptive);
                        during "fulfil" it silently succeeds with a missed event (quiet data gap)
Recovery: none automated; worth flagging to the team as an intentional-or-not inconsistency
```
```text
Error: Batch quantity mismatch on fulfil
Where it occurs: BomConductOrchestrationServiceImpl.fulfil(), per pending item
Root cause: sum of submitted batch quantities does not equal the pending item's qtyRequired
            (tolerance 0.001f)
How it is handled: throws RuntimeException, caught by nothing at the controller level (again, no
                    try/catch in BomConductController) -> propagates as an unhandled 500
User-visible behavior: raw 500, no structured "quantity mismatch" error code for the UI to key off
Recovery: user must resubmit with correct batch quantities; no partial-apply of the other items in
          the same fulfil request either, since the whole method is @Transactional (all-or-nothing)
```
```text
Error: BomConductController does not wrap any of its delegate calls in try/catch
Where it occurs: every method in BomConductController (contrast with BomConfigurationController and
                 BomItemController in Part 1, which both wrap every call)
Root cause: apparent inconsistency in error-handling convention between BOM's own controllers
How it is handled: any exception from BomConductService/BomConductOrchestrationService propagates
                    unhandled to whatever global exception handling (if any) the Spring app has
                    configured at the framework level — not traced in this phase
User-visible behavior: PENDING — depends entirely on whether a @ControllerAdvice or similar global
                        handler exists elsewhere in the app (not searched for in this phase)
Recovery: N/A — flagged for awareness, not a functional bug per se, just an inconsistency worth
          knowing before assuming "every BOM API returns the same ApplicationResponse envelope on
          error" — Part 2's conduct-side APIs may not.
```

Remaining error catalog (indent-specific errors, IPD billing errors) is `PENDING` — Parts 3/5.

## 18. Transaction & Rollback Behavior (Phase 1 subset)
Covered inline in §4.20/§4.22/§17 above: core-service writes are transactional; the Kafka
publish to inventory-service is **not** covered by that transaction (fire-and-forget, logged
failure only) — this is the single most important cross-service consistency caveat in Part 1 and
should be treated as a **known eventual-consistency gap**, not a bug to silently "fix" without
understanding why (see §21 AI Agent Modification Guide).

## 19. Code-Level Traceability (Phase 1 index)

| Concern | File |
|---|---|
| Config controller | `core-service/src/main/java/com/lifetrenz/lths/core/bom/controller/BomConfigurationController.java` |
| Config service impl | `core-service/src/main/java/com/lifetrenz/lths/core/bom/service/impl/BomConfigurationServiceImpl.java` |
| Config service iface | `core-service/src/main/java/com/lifetrenz/lths/core/bom/service/BomConfigurationService.java` |
| JPA repos | `core-service/.../domain/repository/bom/IBomConfigurationRepository.java`, `IBomConfigurationItemRepository.java` |
| JDBC read repo | `core-service/src/main/java/com/lifetrenz/lths/core/bom/repository/BomConfigurationRepository.java` |
| Raw SQL | `core-service/src/main/java/com/lifetrenz/lths/core/bom/repository/BomConfigurationSQL.java` |
| Entities | `core-service/.../domain/entity/bom/BomConfiguration.java`, `BomConfigurationItem.java`, `BomStatus.java`, `BomTriggeredOn.java`, `BomKafkaOperationType.java` |
| DTOs | `core-service/src/main/java/com/lifetrenz/lths/core/bom/dto/*.java` (8 files, all read in Phase 1) |
| Kafka consumer routing | `inventory-service/src/main/java/com/lifetrenz/lths/inventory/service/ConsumerService.java` (case `"HIS_BOM_CONFIGURATION"`, ~line 1016) |
| Kafka consumer logic | `inventory-service/.../service/settings/impl/BomConfigurationSyncServiceImpl.java` |
| Inventory replica entities | `inventory-service/.../domain/entity/masters/bom/BomConfiguration.java`, `BomConfigurationItem.java` |
| Item search controller | `inventory-service/src/main/java/com/lifetrenz/lths/inventory/controller/BomItemController.java` |
| Item search SQL | `inventory-service/src/main/java/com/lifetrenz/lths/inventory/query/bom/BomItemSQL.java`, `BomItemRepository.java` |
| Angular component | `lifetrenz-core/projects/masters/src/lib/module/bom-configuration/bom-configuration.component.ts` (+ `.html`/`.scss`, branch `origin/feature/bom`) |
| Angular service | `lifetrenz-core/projects/masters/src/lib/data/service/bom/bom-configuration.service.ts` |
| Angular DTOs | `lifetrenz-core/projects/masters/src/lib/data/model/bom/bom-configuration-dto.ts` |
| Angular API constants | `lifetrenz-core/projects/masters/src/lib/data/constant/master-api-constant.ts` (~2465-2473, and legacy ~1409-1411) |

### Phase 2 additions

| Concern | File |
|---|---|
| Conduct controller | `inventory-service/src/main/java/com/lifetrenz/lths/inventory/controller/BomConductController.java` |
| Conduct service iface/impl | `inventory-service/.../service/bom/conduct/BomConductService.java`, `.../impl/BomConductServiceImpl.java` |
| Orchestration iface/impl | `inventory-service/.../service/bom/conduct/BomConductOrchestrationService.java`, `.../impl/BomConductOrchestrationServiceImpl.java` (the central class — conduct/draft/finalize/fulfil) |
| Item fetch (display) | `inventory-service/.../service/bom/conduct/BomItemFetchService.java`, `.../impl/BomItemFetchServiceImpl.java` |
| Price variance service iface | `inventory-service/.../service/bom/conduct/BomPriceVarianceService.java` (impl file located, not opened this phase) |
| Entities | `inventory-service/.../domain/entity/masters/bom/conduct/BomConduction.java`, `BomConductionItem.java`, `BomConfigSnapshot.java`, `BomConfigSnapshotItem.java`, `BomConsumptionPending.java`, `BomConsumptionPendingItem.java` (all read); `BomConductionItemReason.java`, `BomConsumptionAlternateItem.java`, `BomBillingPriceVariance.java` (located, not opened) |
| Enums | `inventory-service/.../common/enums/BomConductionStatus.java`, `BomConsumptionState.java`, `BomEditActionType.java`, `BomPendingStatus.java`, `BomPriceSource.java` (all read) |
| Key DTOs | `inventory-service/.../dto/bom/conduct/BomConductRequestDTO.java`, `BomFinalizeRequestDTO.java` (read); ~20 more DTO files in the same package located but not individually quoted (field shapes are inferable from usage in the impl classes already read) |
| Angular conduction widget | `lifetrenz-core/src/app/base/components/bom-details/bom-details.component.ts` (+`.html`/`.css`) |
| Angular conduction services | `lifetrenz-core/src/app/base/service/bom.service.ts`, `bom-conduct.service.ts` |
| Angular host screen | `lifetrenz-core/projects/clinical-casesheet/src/module/conductq/administration-nonot/administration-nonot.component.ts` |
| Angular API constants | `lifetrenz-core/src/app/base/api/common-api-constant.ts` (~lines 234-256, 341) |

## 20. Change Impact Analysis
`PENDING` full map — Phase 1 partial: any change to `BomConfigurationKafkaDTO` (either side) must
be made in **both** `core-service`'s and `inventory-service`'s copies of that class (they are
independently defined, not a shared library — confirmed by two separate file reads in Phase 1),
and any field rename must account for the `@JsonIgnoreProperties(ignoreUnknown = true)` tolerance
already in place (safe for additive changes, unsafe for silent renames — old field will just stop
populating with no error).

## 21. AI Agent Modification Guide (Phase 1 subset)
- **BOM configuration CRUD** → `core-service`, package `com.lifetrenz.lths.core.bom.*`. This is the
  only place that should ever write to `bom_configuration`/`bom_configuration_item`.
- **Never write directly to `inv_bom_configuration`/`inv_bom_configuration_item`** from application
  code outside `BomConfigurationSyncServiceImpl` — those tables are a Kafka-driven projection; a
  direct write there will be silently overwritten/orphaned on the next sync event and will not be
  reflected back to core-service (one-way sync).
  the `HIS_BOM_CONFIGURATION` Kafka contract (or provide an equivalent migration), because
  inventory-service's `mdm_bom_configuration_id`/`mdm_bom_configuration_item_id` are the only join
  keys back to the source of truth.
- **Do not reintroduce MRP as a configuration-time price source** without checking Part 2–4 first —
  it was deliberately removed in favor of conduction-time pricing (see §4.17); reviving it in the
  configuration DTO without updating conduction logic would silently do nothing (the field would
  round-trip but nothing downstream reads it).
- The frontend BOM Configuration UI currently lives only on `origin/feature/bom` of the nested
  `masters` project — before modifying it, confirm with the team whether that branch is still the
  intended integration target or has since diverged/merged (Phase 1 did not check for a newer
  merge; see §22).

## 22. Known Gaps / Unknowns (Phase 1)

- `lib-bom-configuration`'s `.html` template was not read in this phase (only `.ts`/service/model)
  — visual layout, PrimeNG bindings, conditional rendering are `UNKNOWN` pending a template read.
- The **literal Kafka topic string** behind `KafkaTopics.LT_INVENTORY_EVENT` was not resolved.
- Whether `origin/feature/bom` (masters project) has since been merged, superseded, or abandoned
  relative to whatever branch is actually deployed was **not checked** — flagged explicitly so
  nobody assumes this UI is live in production off this analysis alone.
- Two sets of BOM-adjacent API constants exist in `master-api-constant.ts`:
  `HIS_BOM_CONFIGRATION`/`HIS_BOM_DETAILS_GET`/`HIS_BOM_DELETE` (~line 1409, note the typo
  "CONFIGRATION") alongside the `BOM_CONFIGURATION_*` block actually used by
  `BomConfigurationService` (~line 2465). The first group's callers were **not traced** in Phase 1
  — could be dead/legacy constants from an earlier BOM design, or used elsewhere (e.g. Part 2's
  `app-bom-details`). Marked `POTENTIALLY LEGACY / UNVERIFIED`, not confirmed dead.
- Raw SQL in `BomConfigurationSQL` / `BomItemSQL` interpolates `pageNo`, `pageSize`,
  `customerBusinessId`, `siteId`, `bomConfigId` directly into the query string rather than via bind
  parameters. These are framework-typed `Long`/`int` path/query parameters (not raw strings), so
  classic SQL injection via these specific parameters is unlikely, but `searchName`/
  `categoryIdentifierCode`/`typeIdentifierCode` in `BomItemSQL.searchBomItems` **are** string
  parameters concatenated with only a manual `replace("'", "''")` escape rather than a bound
  parameter — this is a string-concatenation pattern the project's own security standard
  (`~/.claude/rules/security.md`, "Never concatenate user input into SQL... even trusted internal
  inputs") flags as a defense-in-depth violation even where the escaping happens to be present.
  Noted for awareness; not in scope to fix as part of a KB-creation task.
- Server-side authorization/permission enforcement for BOM configuration endpoints beyond
  token/CTA scoping was not verified (gateway-service not analyzed).
- Everything under Parts 3 (indent-specific pieces beyond the pending queue already covered here),
  4 (the actual `PatientConsumptionServiceImpl`/stock-ledger mechanics — only its entry point
  `addNewPatientConsumption(StockOutDTO, ...)` is known so far, not its internals), and 5 (IPD-side
  bill-item creation) — `PatientConsumptionServiceImpl`, the IPD service, and the consumer side of
  `BOM_CONDUCTION_BILL`/`BOM_CONDUCTION_DISPENSE` were **not read** in this phase — do not assume
  anything about their behavior from the name alone.

### Phase 2 additions

- **Two Angular services with overlapping responsibility**: `BomService`
  (`src/app/base/service/bom.service.ts`) and `BomConductService`
  (`src/app/base/service/bom-conduct.service.ts`) both wrap the same `BOM_CONDUCT_CONFIGS` /
  `BOM_CONDUCT_CONFIG_ITEMS` / `BOM_CONDUCT_LOCATIONS` / `HIS_CS_REASONS_GET` / pending-queue
  endpoints. `BomDetailsComponent` (the only Part-2 component read in depth) uses `BomService`
  exclusively. Which component(s), if any, use `BomConductService` instead — and whether it's the
  actual driver for Part 3's `app-bom-pending-queue` — is `PENDING`, to check in the Part 3 phase.
- **`BomService` also exposes several endpoints not called by anything read so far**:
  `getBomDetails` (`core/boms`), `getBomConfigDetails`/`getChildItems` (`core/item-association*`),
  `deleteBom` (`core/bom/`). These target **core-service**, not inventory-service, and don't match
  any API documented in Part 1's core-service BOM controller (`BomConfigurationController` has no
  `/bom/`, `/boms`, or `/item-association` mappings) — these look like remnants of an **earlier,
  different BOM design** (possibly pre-dating the `BomConfiguration`/`BomConfigurationItem` rework
  seen in Part 1) that a matching backend controller may no longer exist for. `PENDING` — worth a
  targeted grep for `core/boms` and `core/item-association` controllers in core-service before
  assuming these are dead; not done in this phase to stay within Part 2's scope.
- **`BomGetDTO`** (`src/app/base/model/bom-details.ts`) is a small typed model
  (`inventoryItemId`, `active`, etc.) that matches none of the shapes `BomDetailsComponent` actually
  works with (it uses untyped `any` throughout) — likely a leftover from the same earlier design as
  the point above. `POTENTIALLY LEGACY / UNVERIFIED`, not confirmed dead.
- **UOM conversion at consumption time**: no arithmetic converting between the BOM config's UOM and
  the item's stock UOM was found in `BomConductOrchestrationServiceImpl` — quantities are compared/
  summed as raw numbers. `UNKNOWN / NOT FOUND IN SOURCE` whether this is handled elsewhere or is a
  gap; flagged in §5.8.
- **Duplicated shortage-detection logic**: whether an item counts as "in stock" is decided by two
  independently-written pieces of code that happen to agree today — `BomItemFetchServiceImpl`
  (display-time, via `BillingService.getItemBatchDetailsByItemIds`) and
  `BomConductOrchestrationServiceImpl.getAvailableStock` (conduct-time, direct
  `ItemBatchBalanceRepository` queries plus the `priceSource in {NONE, LAST_BATCH}` override). A
  change to one without the other could silently desync what the UI shows as available from what
  conduct-time actually allows to consume.
- **`e.printStackTrace()` used for exception handling in multiple places** across both Part 1 and
  Part 2 backend code (`BomConfigurationServiceImpl.saveItems`,
  `BomConductOrchestrationServiceImpl.conduct`/`saveDraft`/`publishBomEvent`) instead of structured
  logging — stack traces go to stdout, not through the SLF4J logger already used everywhere else in
  the same classes, meaning these particular failures could be invisible to whatever log aggregation
  the team relies on in production. Purely an observation, not something in scope to fix here.
- **Commented-out `conduction.setTotalCost(...)` calls** in both `conduct()` and
  `finalizeFromDraft()` (`BomConductOrchestrationServiceImpl`) alongside a still-computed but
  discarded local `totalCost` variable — suggests a `totalCost` column/feature was deliberately
  disabled mid-development but the dead computation was left in place. Not user-visible, but worth
  knowing before assuming `BomConduction` exposes a total-cost figure anywhere.

## 23. Quick Reference (Phase 1)

- BOM config owner: **core-service** (`/bom/configuration*` endpoints)
- BOM config replica owner: **inventory-service**, read-only via Kafka (`HIS_BOM_CONFIGURATION`)
- Item search for the config UI: **inventory-service** `GET /bom/items/search` (direct FE call)
- Sync join key: `mdmBomConfigurationId` / `mdmBomConfigurationItemId`
- Status values: `DRAFT`, `DEPLOYED`, `PAUSED`
- Item classification flags: `billing`, `inventory`, `isMandatory` (independent, per item)
- Trigger points (`triggeredOn`): `Conducting`, `SampleCollection`
- Pricing: resolved at conduction time, **not** at configuration time

### Phase 2 additions

- Conduction owner: **inventory-service**, package `com.lifetrenz.lths.inventory.service.bom.conduct`
- Central class: `BomConductOrchestrationServiceImpl` — conduct, saveDraft, finalizeDraft, fulfil all live here
- Two-step UI flow: **saveDraft → conduct/finalize** (finalize is triggered server-side by CCS via Feign after a schedule-status update, not directly by the BOM widget in that path)
- Conduction status: `DRAFT` → `CONDUCTED` or `PARTIALLY_CONSUMED` (if any item short) → `CONDUCTED` (after `fulfil`)
- Per-item consumption state: `CONSUMED` / `PENDING` / `BILLED_ONLY` (`SKIPPED` declared, unused so far)
- Billing is always for the full requested qty, decoupled from stock outcome
- Idempotency: guarded by `scheduleId` only
- Config snapshot: taken once, at first draft save, never re-taken on edits
- Kafka events fired: `BOM_CONDUCTION_DISPENSE` (per consumption), `BOM_CONDUCTION_BILL` (per billed item) — both on `LT_INVENTORY_EVENT`; consumer side not yet confirmed (likely IPD, Part 5)
- Stock check reuses `PatientConsumptionService.addNewPatientConsumption` in-process (not cross-service) — Part 4 internals still unread
- Item display reuses the same batch/price repo as manual billing (`BillingService.getItemBatchDetailsByItemIds`) — not a bespoke BOM query

---

*(End of Phase 6 for this file — Parts 3, 4, 5, and 6 are now in their own files. All five Parts of
the original brief have at least one pass, plus the extra Part 6 opened by a real captured API call.
Remaining open threads, in rough priority order: (1) identify which sibling component populates
`caseSheetData.bomConductionId` for the casesheet screen, and what sets
`UpdateScheduleStatusDTO.type = "BOM_CONDUCTION"` (Part 6 §7); (2) check whether RIS/haemodialysis
conduct controllers in CCS have their own parallel BOM-finalize trigger — a possible fourth entry
point (Part 6 §7); (3) confirm whether IPD's `PENDING`-status prescription-order-event-items from
Implementation B's billing path (Part 5) ever actually get submitted to a bill by something not yet
found; (4) read `EHRMapper` in ipd-clinical-service for the billing/inventory filtering
Implementation B relies on upstream of its Kafka publish; (5) confirm whether the Kafka
`@KafkaListener` methods for `BOM_ITEM`/`LT_BOM_EVENT` carry their own transaction boundaries, which
several Part 4/5 findings hinge on; (6) with this much cross-service detail now accumulated, §9
"Complete End-to-End BOM Lifecycle" and §20 "Change Impact Analysis" below could be filled in with
much higher confidence than a fresh pass would have.)*
