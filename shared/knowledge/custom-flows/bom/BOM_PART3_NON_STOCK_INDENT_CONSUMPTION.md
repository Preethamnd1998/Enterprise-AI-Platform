# BOM FUNCTIONALITY KNOWLEDGE BASE — PART 3

## Non-Stock BOM Consumption / Pending Queue ("Indent") Workflow

> **Status: DRAFT — Phase 3 of N.**
> Companion document to `BOM_FUNCTIONALITY_KNOWLEDGE_BASE.md` (Parts 1–2: BOM Configuration, and
> Showing/Consuming BOM). Split into its own file per explicit request. Cross-references the main
> file's §5 (Part 2) heavily, since the backend pending-queue/fulfil endpoints were already read and
> documented there (`BomConductController`, `BomConductOrchestrationServiceImpl.fulfil`,
> `BomConductServiceImpl.getPendingQueue/getPendingDetail`) — this phase does **not** re-quote that
> code, it adds the frontend `app-bom-pending-queue` flow and one major architectural correction/
> finding. Nothing here is invented; unverified items are marked `PENDING (Phase N)`, absent items
> `UNKNOWN / NOT FOUND IN SOURCE`.

---

## 0. Important correction to scope, and a major cross-cutting finding

### 0.1 "Non-stock BOM" vs. "the pending queue" are not the same thing

The original task brief assumed non-stock BOM items flow through an "indent" approval queue. Phase 2
already established (main KB §5.5) that this isn't quite how the code works:

- A BOM item's `inventory` flag (`true`/`false`) decides whether it is stock-tracked **at all**. If
  `inventory=false`, the consume branch in `BomConductOrchestrationServiceImpl` never runs for that
  item — it can only ever end up `BILLED_ONLY` (if `billing=true`) or with no consumption state at
  all (if `billing=false` too). **A non-stock item never appears in the pending queue.**
- The pending queue (`inv_bom_consumption_pending` / `inv_bom_consumption_pending_item`,
  `app-bom-pending-queue`) is populated only for **stock items (`inventory=true`) that had
  insufficient stock at conduct time** — i.e. it is a **shortage queue**, not a non-stock-item queue.
  A stock-item shortage is what later gets "fulfilled" (batch-picked and consumed) by a pharmacist/
  store user through this queue.

So this document is titled to match the folder/file the requester asked for, but documents what the
code actually does: **the shortage-fulfilment queue for stock BOM items**, reached through the
`indent` Angular library project (hence the "Indent" framing in the requester's brief — the queue's
screens live in that project, at routes under `/indent/consumption/...`) but **not built on top of
any formal Indent-request/approval entity**. No `Indent`, `IndentRequest`, `IndentItem` table or
approval-workflow entity was found anywhere in this BOM path — the word "indent" in this codebase
here means "the Angular library project named `indent`, which happens to also host general
inventory-department-consumption screens," not a BOM-specific indent/requisition record. This is
stated plainly rather than assumed, per instructions not to infer relationships not confirmed in
source.

### 0.2 Major finding: there are at least THREE independent BOM stock-reduction implementations

While tracing how a `BomKafkaDTO`-style payload reaches inventory, grep across all backend services
for the method name that Part 2's `BomConductOrchestrationServiceImpl` did **not** use
(`reducedBomQuantityFromInventory` / `bomReduceItemStockInInventory`) turned up a second,
**structurally unrelated, still-actively-called** BOM consumption mechanism — actually two more, in
two different services:

```text
Implementation A — OPD Non-OT procedures (documented in Part 2 of the main KB)
  Angular: app-bom-details / app-administration-nonot
  → inventory-service: BomConductController → BomConductOrchestrationServiceImpl
    (conduct / saveDraft / finalizeDraft / fulfil)
  → in-process call: PatientConsumptionService.addNewPatientConsumption(StockOutDTO, ...)
  → publishes BOM_CONDUCTION_DISPENSE / BOM_CONDUCTION_BILL on topic LT_INVENTORY_EVENT
  Entities: inv_bom_conduction(_item), inv_bom_config_snapshot(_item),
            inv_bom_consumption_pending(_item)  <-- the ONLY path with a shortage/pending queue

Implementation B — IPD clinical administration (medication/procedure administer events)
  Java: ipd-clinical-service, EncounterClinicalAdministerServiceImpl.conductBom()
        (async, @Async("taskExecutor"))
    File: src/main/java/.../ehr/service/impl/EncounterClinicalAdministerServiceImpl.java:1564-1615
    - Bills BOM billing-flagged child items unconditionally via a separate Kafka publish
      (kafkaCoreService.markToBillToCore, KafkaBomOrders DTO) — a THIRD billing mechanism,
      distinct from Part 2's BOM_CONDUCTION_BILL.
    - Inventory-flagged items: gated by an explicit `deductInventoryViaBom` boolean parameter.
      When true, calls ipd-clinical-service's own KafkaInventoryService.bomReduceItemStockInInventory()
      → publishes to Kafka topic BOM_ITEM (ipd-clinical-service's own BomKafkaDTO class)
    - The method's own Javadoc explicitly documents a double-deduction hazard: this legacy
      BOM_ITEM path and the caller's alternative publishAdministerStockOutToInventory() path
      BOTH ultimately converge on inventory-service's addNewPatientConsumption and "unconditionally
      update the batch ledger/balance, so letting both run double-deducts the same stock" — quoted
      directly from the source comment. deductInventoryViaBom exists specifically so callers don't
      accidentally trigger both.

Implementation C — IPD OT (operation theatre) billing
  Java: ipd-service, OtBillingServiceImpl (billing.service.impl package)
    File: src/main/java/.../ipd/billing/service/impl/OtBillingServiceImpl.java:290-298, 481-511
    - Its own bomReduceItemStockInInventory(bomKafkaList, tokenPayload, siteId) method, its own
      convertToInventoryKafkaDTO(), its own BomKafkaDTO class
      (com.lifetrenz.lths.ipd.billing.dto.sales.BomKafkaDTO — a FOURTH independently-defined copy
      of this DTO shape, after core-service's, inventory-service's, and ipd-clinical-service's)
    - Also publishes to Kafka topic BOM_ITEM

Consumer for BOM_ITEM (both B and C land here):
  inventory-service: ConsumerService.bomConsumptionToInventoryItem()
    (@KafkaListener(topics = KafkaTopics.BOM_ITEM), line ~504)
  → PatientConsumptionService.reducedBomQuantityFromInventory(List<BomKafkaDTO>)
    Impl: PatientConsumptionServiceImpl.java:1573+
    - Resolves destination/source InventoryLocation, builds a StockOutDTO
    - Per item: FEFO batch resolution via InventoryRepository.getItemNearExpiryBatches(), consumes
      from the nearest-expiry batch(es) first, min(availableQty, remainingQty) per batch, loop ends
      when batches run out
    - **No shortage/pending-queue concept at all** — if batches don't cover the full requested qty,
      the loop simply stops; there is no equivalent of Part 2's BomConsumptionPending fallback.
      Whether a shortfall here throws, silently under-consumes, or is caught elsewhere was NOT
      traced past this method in this phase — `PENDING (verify — high priority)`, since a silent
      under-consumption would be a real correctness gap if confirmed.
```

**Practical implication for anyone extending BOM functionality**: "the BOM engine" is not one thing
in this codebase. OPD Non-OT procedures go through the modern, well-audited `bom.conduct` package
documented in Part 2 (draft/snapshot/pending-queue/variance-tracked). IPD medication administration
and IPD OT billing go through an older, Kafka-topic-based (`BOM_ITEM`) mechanism with FEFO batch
consumption and **no pending queue**, maintained separately in each of `ipd-clinical-service` and
`ipd-service`, each with its **own** copy of the `BomKafkaDTO` class and its **own** publish method,
converging only at `inventory-service`'s `PatientConsumptionServiceImpl.reducedBomQuantityFromInventory`.
A change to "how BOM consumes stock" made only in `BomConductOrchestrationServiceImpl` (Part 2) would
**not** affect IPD's BOM consumption at all — they are different code paths end to end. This was not
knowable from Part 2 alone; it only surfaced by specifically grepping for the method Part 2's engine
did *not* call. Given the scope, this phase documents Implementations B and C only at the entry-point
level (enough to know they exist, where they live, and that they're live/reachable — confirmed by
finding real call sites, not just unused method definitions in isolation for B and C; the *original*
CCS copy of this same pattern, `clinical-common-service`'s `KafkaInventoryService.bomReduceItemStockInInventory`,
by contrast, has **zero call sites found** anywhere in that service's source in this phase and looks
dead/superseded by the OPD Non-OT `bom.conduct` engine). Full internals of B and C (how `BomDetails`/
`bom.getChildItems()` gets populated in IPD, what triggers `conductBom()`, OT billing's own BOM
trigger point) are `PENDING` — recommend a dedicated future phase ("Part 3b" or folded into Part 4)
if IPD/OT BOM behavior specifically is in scope for whatever task motivated this KB.

---

## 1. What makes a BOM item eligible for the pending queue (Implementation A only)

Only items where `BomConductionItem.inventory == true` **and** the requested `qtyConsumed` exceeds
what `BomConductOrchestrationServiceImpl.getAvailableStock()` reports as available at the
conduction's `sourceLocationId` (see main KB §5.5–5.7 for the exact `consumeQty`/`shortageQty` split
formula). Confirmed there is no separate "is this BOM item eligible for indent" flag — eligibility is
purely the arithmetic outcome of `requestedQty - min(requestedQty, availableQty) > 0`, evaluated at
`conduct()`/`finalizeFromDraft()` time.

## 2. How a shortage enters the pending queue

Per item, inside the same transaction as the rest of conduct: `getOrCreatePendingQueue()` lazily
creates one `BomConsumptionPending` header per conduction (only if at least one item needs it,
reused across items in the same conduct call), then `persistPendingItem()` creates one
`BomConsumptionPendingItem` row per shortfall item with `qtyRequired = shortageQty`,
`qtyFulfilled = 0`, `status = PENDING`. The parent `BomConduction.status` is set to
`PARTIALLY_CONSUMED` if any item went to pending (main KB §5.9/§16). No separate "indent request"
object is created — the pending row **is** the request; there is no approval step before it becomes
visible in the queue (see §4).

## 3. Pending queue list — frontend flow

```text
app-bom-pending-queue (BomPendingQueueComponent)
  route: /indent/consumption/bom-pending-queue
  file: projects/indent/src/lib/modules/consumption/bom-pending-queue/bom-pending-queue.component.ts
        (branch feature/bom of the `indent` nested repo — this IS the currently checked-out branch,
         unlike Part 1's masters-project UI which required checking out a different branch)
        |
        v
  BomPendingService.getPendingQueue()  (projects/indent/src/lib/service/bom-pending/bom-pending.service.ts)
        |  GET inventory/bom/conduct/pending?siteId&customerBusinessId&page&size
        v
  inventory-service: BomConductController.pending() -> BomConductServiceImpl.getPendingQueue()
        -> BomConsumptionPendingRepository.findBySiteIdAndCustomerBusinessIdAndActiveTrue (paged)
        -> per pending header: count of BomConsumptionPendingItem rows (header-level only, no
           item array in the list response — confirmed: "Note: Do NOT set items array - return
           header-level data only", BomConductServiceImpl.getPendingQueue comment)
        returns Page<BomPendingViewDTO>
```
The Angular component **flattens** the nested response shape defensively
(`flattenPendingQueueResponse()`) — it defensively handles both a nested `pending.items[]` shape and
an already-flat shape, even though the backend method it actually calls (`getPendingQueue`,
confirmed above) never populates an `items` array. This dead branch either reflects an earlier API
contract the frontend hasn't been cleaned up from, or defensive coding against a response shape that
doesn't currently occur — flagged in §14 Known Gaps, not asserted as a bug.

## 4. Approval workflow

**NOT FOUND IN SOURCE.** No approve/reject action, no `APPROVED`/`REJECTED` status value (only
`PENDING`, `PARTIALLY_FULFILLED`, `FULFILLED`, `CANCELLED` exist on `BomPendingStatus`), and no
role/permission check specific to the pending queue was found in `BomConductController` or
`BomConductServiceImpl`/`BomConductOrchestrationServiceImpl`. Any authenticated user who can reach
`app-bom-pending-queue` can fulfil a pending item directly — there is no gate between "shortage
appeared in the queue" and "shortage was fulfilled." (Authorization at the gateway/route-guard level
was not checked in this phase — same caveat as Part 1 §4.21.)

## 5. Rejection workflow

**NOT FOUND IN SOURCE.** No reject/cancel action was found wired to the pending queue UI or its
backend. `BomPendingStatus.CANCELLED` and `BomConductionStatus.CANCELLED` are both declared enum
values with **no setter call found** anywhere in the code read across Phases 2–3 — `PENDING
(verify)`, most likely either dead enum values or set by a code path not yet located (e.g. a
schedule-cancellation flow elsewhere that was out of scope for this phase).

## 6. Consumption (fulfilment) workflow — two different UI entry points, one backend endpoint

Both call the same backend: `POST inventory/bom/conduct/pending/{pendingId}/fulfil/{siteId}` →
`BomConductController.fulfil` → `BomConductOrchestrationServiceImpl.fulfil` (fully documented in main
KB §5, reproduced here only at the level needed for traceability): validates submitted batch
quantities sum to exactly the required quantity (throws otherwise), consumes per batch via
`PatientConsumptionService.addNewPatientConsumption` (Implementation A's normal path, **not** the
legacy `BOM_ITEM` mechanism), publishes a `BOM_CONDUCTION_DISPENSE` event per batch for logging only
("IPD ignores DISPENSE, only acts on BILL" — direct code comment), computes a price variance via
`BomPriceVarianceService.computeAndPersist` if the item was billed, and marks the pending item/queue
`FULFILLED` or `PARTIALLY_FULFILLED`.

**Two different frontends drive this, with two different UX models:**

- **`BomPendingQueueComponent`**'s own "Fulfil" dialog (opened inline from the queue list, without
  navigating away) supports **multiple batch rows per item** (`batchRows[]`, `addBatchRow()`/
  `removeBatchRow()`), letting the user manually split one item's required qty across several
  batches, with client-side validation that the sum matches (`isQtyBalanced`).
- **`BomPendingDetailComponent`** (`app-bom-pending-detail`, reached via "View Detail" →
  `/indent/consumption/bom-pending-detail/:id`) instead lets the user **select** which
  already-in-stock items to complete (`selectAll`/per-item `selected` checkboxes, gated on
  `item.currentStock > 0`) and submits **one batch per item** only
  (`batches: [{ batchNo: item.batchNumber, ..., qty: item.qtyRequired }]`) — no multi-batch split UI
  here. Both ultimately hit the identical `fulfilPending()` service method and the identical backend
  endpoint, but the detail-page flow can only satisfy an item from a single batch whereas the queue
  dialog can split across several — a genuine UX/capability asymmetry between the two entry points to
  the same action, not a bug, but worth knowing when deciding which screen to extend.

## 7. Quantity calculations

`qtyRequired` (the shortfall) = `requestedQty - min(requestedQty, availableQtyAtConductTime)`,
computed once at conduct time (main KB §5.5). At fulfil time, the **sum of submitted batch
quantities must equal `qtyRequired` exactly** (tolerance `0.001f`) — partial fulfilment of a single
pending *item* is not supported by the API (`fulfil()` throws if the sum doesn't match); partial
fulfilment only exists at the **pending queue header** level, across multiple *items* (some fulfilled
in one `fulfil()` call, others left `PENDING` for a later call).

## 8. Component item expansion

Not applicable in the sense the original brief implied (BOMs don't have nested/recursive sub-BOMs in
any code read so far — a `BomConfigurationItem`'s `item` is a plain inventory `Item`, not another
`BomConfiguration`). "Expansion" in this system is simply "read the frozen `BomConfigSnapshotItem`
rows for this conduction" (main KB §5.9), not a recursive BOM-of-BOMs expansion. `UNKNOWN / NOT FOUND
IN SOURCE` whether nested BOMs exist anywhere else in the app outside this feature — not searched for
in this phase.

## 9. Stock-independent behavior

Confirmed and already central to §0.1 above: **billing is stock-independent** (fires for full
requested qty regardless of shortage), but **the pending queue itself is entirely stock-*dependent***
— its only reason to exist is a stock shortfall. There is no BOM behavior in Implementation A that is
simultaneously "non-stock" and "queued" — those are mutually exclusive categorizations in this
codebase (§0.1).

## 10. Patient / department / location association

`BomConsumptionPending` carries a full denormalized copy of the conduction's patient/context fields
(`patientId/name`, `mpi`, `encNumber`, `encounterId`, `admissionId`, `admissionDashboardId`,
`patientWard`, `admissionCategory`, `sourceLocationId`, `activityName`) — snapshotted at
pending-row-creation time from the parent `BomConduction`, not joined at read time (main KB §12 table
already documents these columns). This means the pending queue list/detail screens never need to
call back to core-service or CCS for patient display data — everything needed is already denormalized
onto the pending row itself. `sourceLocationId` here is consistently the **MDM location id**
(resolved to the inventory-service local PK only when needed for stock queries, via
`InventoryLocation` lookups — same pattern as main KB §5, `resolveInventoryLocationId`).

## 11. API calls between services (Phase 3 additions to main KB §13)

No new cross-service calls beyond what Part 2 already covers for the pending/fulfil endpoints
themselves (they're inventory-service-local, called directly by the Angular `indent` project, no
Feign hop). The new cross-service fact from this phase is the **`BOM_ITEM` Kafka topic**
(§0.2): a shared inbound topic on `inventory-service`, published to independently by
`ipd-clinical-service` and `ipd-service` (each has its own producer method and DTO class), consumed
by `inventory-service`'s `ConsumerService.bomConsumptionToInventoryItem` →
`PatientConsumptionServiceImpl.reducedBomQuantityFromInventory`. This is architecturally the same
shape as Part 1's `HIS_BOM_CONFIGURATION` config-sync event (one inbound topic, multiple semantic
payload types) but is a **completely separate topic and payload family**, unrelated to
`LT_INVENTORY_EVENT`/`BOM_CONDUCTION_BILL`/`BOM_CONDUCTION_DISPENSE`.

## 12. Database records created (Phase 3 — pending-queue-specific; full column list in main KB §12)

`inv_bom_consumption_pending` (header, one per conduction with ≥1 shortage) and
`inv_bom_consumption_pending_item` (one per shortfall line) — both already fully documented in the
main KB. No additional tables specific to the *queue UI* itself (no separate "assignment" or
"claimed by user" table — the queue is not user-assigned/claimed, it's a shared pool any authorized
user can act on, consistent with §4's finding of no approval gate).

## 13. Status transitions

Already fully documented in main KB §16 (`BomPendingStatus`: `PENDING` →
`PARTIALLY_FULFILLED`/`FULFILLED` per header, `PENDING` → `FULFILLED` per item, `CANCELLED`
unconfirmed/unused). Nothing new to add from the frontend read in this phase beyond confirming the UI
never exposes a cancel action (§5).

## 14. Failure scenarios / retry / audit — Phase 3 additions

```text
Error: fulfilPending() called with a missing 4th argument in the (likely dead) opd-clinical copy
       of BomPendingDetailComponent
Where it occurs: src/app/modules/opd-clinical/pages/bom-pending-detail/bom-pending-detail.component.ts,
                  onComplete(): this.bomPendingService.fulfilPending(this, this.pendingId, request)
                  — BomPendingService.fulfilPending() requires 4 args (callback, id, payload, siteId);
                  siteId is silently undefined here
Root cause: apparent duplicate/superseded component — see next finding
How it is handled: not handled — the built URL (`.../fulfil/${siteId}`) would literally contain the
                    string "undefined", which would fail routing/parsing on the backend
User-visible behavior: would fail (400/404/500 depending on how Spring parses the malformed path
                        variable) if this component were ever reached
Recovery: N/A — see §14 dead-code finding below; this path does not appear to be reachable via
          routing in the app as currently configured
```
```text
Finding: TWO components share the selector `app-bom-pending-detail` and class name
         `BomPendingDetailComponent`
Where: (1) projects/indent/src/lib/modules/consumption/bom-pending-detail/bom-pending-detail.component.ts
           — standalone:true, full PrimeNG imports, multi-batch-aware, paginated, correctly calls
           fulfilPending() with siteId. CONFIRMED wired into routing:
           projects/indent/src/lib/modules/consumption/consumption-routing.module.ts maps
           'bom-pending-detail/:id' -> this component.
       (2) src/app/modules/opd-clinical/pages/bom-pending-detail/bom-pending-detail.component.ts
           — NOT standalone (no `standalone: true`, no imports array — would need an NgModule
           declaration to be usable, none was found referencing it), missing-arg bug above,
           single-batch-only, no pagination. Grep across the entire lifetrenz-core src tree for
           `BomPendingDetailComponent`/`bom-pending-detail` found NO other file referencing this
           second copy — it does not appear in any routing module or component's `imports` array.
Conclusion: (2) is very likely an abandoned/superseded duplicate of (1), left in the opd-clinical
            module tree from an earlier iteration of where this screen was meant to live, and is
            not currently reachable through the app's routing as configured. Stated as a strong
            inference from the evidence (no referencing import found anywhere), not stated as
            certain dead code — a full app-wide route table was not exhaustively enumerated in this
            phase.
```

Deeper failure/retry/audit questions specific to the legacy `BOM_ITEM` path (Implementations B/C —
what happens on a batch shortfall there, since no pending-queue equivalent was found) are `PENDING`
per §0.2.

---

## 15. Component & Service Inventory — Phase 3 additions

### Frontend

| Component/Service | Path | Responsibility | APIs Used | Notes |
|---|---|---|---|---|
| `BomPendingQueueComponent` (`app-bom-pending-queue`) | `projects/indent/src/lib/modules/consumption/bom-pending-queue/bom-pending-queue.component.ts` | Paginated shortage queue list; inline multi-batch fulfil dialog; price-variance dialog on fulfil | `BOM_PENDING_QUEUE` (get + fulfil), `INV_BOM_ITEM_BATCH_DETAILS` | Routed at `/indent/consumption/bom-pending-queue` |
| `BomPendingDetailComponent` (`app-bom-pending-detail`) — **live copy** | `projects/indent/.../bom-pending-detail/bom-pending-detail.component.ts` | Per-pending-record detail with live stock check per item, select-and-complete (single batch/item), pagination | `BOM_PENDING_DETAIL`, `BOM_PENDING_QUEUE_FULFIL` | Routed at `/indent/consumption/bom-pending-detail/:id` |
| `BomPendingDetailComponent` (`app-bom-pending-detail`) — **likely-dead duplicate** | `src/app/modules/opd-clinical/pages/bom-pending-detail/bom-pending-detail.component.ts` | Same intent as above, buggy (missing arg), simpler (no pagination, no multi-select granularity) | (same constants) | Not found referenced by any routing module or component `imports[]` in this phase — see §14 |
| `BomPendingService` | `projects/indent/src/lib/service/bom-pending/bom-pending.service.ts` | HTTP wrapper: `getPendingQueue`, `getPendingDetail`, `getItemBatchDetails`, `fulfilPending` | `inventory/bom/conduct/pending*`, `inventory/bom/item/batch/details` | Third distinct Angular BOM service, after `BomService`/`BomConductService` from Part 2 — this one is confirmed to be the actual driver for the pending-queue screens (Part 2's open question about `BomConductService`'s pending-queue methods being used or not is still `PENDING` — `BomPendingService` is confirmed used instead) |
| API constants | `projects/indent/src/lib/constant/api-constant.ts` (~lines 492-495) | `BOM_PENDING_QUEUE`, `BOM_PENDING_QUEUE_FULFIL` (both `inventory/bom/conduct/pending`, distinguished only by the constant *name*, not value — the actual path differs only via the `/fulfil` suffix appended in code), `BOM_PENDING_DETAIL`, `INV_BOM_ITEM_BATCH_DETAILS` | — | — |

### Backend

No new controllers/services beyond Part 2's `BomConductController` (`pending`, `getPendingDetail`,
`fulfil` endpoints) and `BomConductServiceImpl`/`BomConductOrchestrationServiceImpl` — already fully
documented in the main KB. This phase's backend-side addition is the **`BOM_ITEM` legacy path**
(§0.2), summarized in its own table:

| Service | Class | Method | Trigger | Notes |
|---|---|---|---|---|
| clinical-common-service | `KafkaInventoryService` | `bomReduceItemStockInInventory` | none found | Publishes to `BOM_ITEM`; **no call site found in this phase** — likely dead/superseded |
| ipd-clinical-service | `EncounterClinicalAdministerServiceImpl` | `conductBom` (async) | medication/procedure administer event, gated by caller-passed `deductInventoryViaBom` | Bills via a third mechanism (`kafkaCoreService.markToBillToCore`/`KafkaBomOrders`), separately gates inventory deduction via legacy `KafkaInventoryService.bomReduceItemStockInInventory` (this service's own copy) |
| ipd-clinical-service | `KafkaInventoryService` | `bomReduceItemStockInInventory` | called from `EncounterClinicalAdministerServiceImpl.conductBom` | Publishes to `BOM_ITEM` |
| ipd-service | `OtBillingServiceImpl` | `bomReduceItemStockInInventory` | OT billing BOM conduction (call site at line ~294, upstream trigger not traced) | Publishes to `BOM_ITEM`, own `BomKafkaDTO`/`convertToInventoryKafkaDTO` |
| inventory-service | `ConsumerService` | `bomConsumptionToInventoryItem` (`@KafkaListener(topics=BOM_ITEM)`) | Kafka | Routes to `PatientConsumptionService.reducedBomQuantityFromInventory` |
| inventory-service | `PatientConsumptionServiceImpl` | `reducedBomQuantityFromInventory` | Kafka consumer above | FEFO batch consumption, **no pending-queue fallback found** |

---

## 16. Business Rules — Phase 3 additions

```text
Rule: A pending item can only be fulfilled in one shot — no partial-item fulfilment via the API.
Condition: sum(submitted batch qtys) must equal pendingItem.qtyRequired exactly (tolerance 0.001f)
Implementation: BomConductOrchestrationServiceImpl.fulfil() (documented in main KB §5, referenced
                 here for the pending-queue-specific consequence)
Impact: The two frontends (queue dialog vs detail page) both have to construct a batch-quantity
        set that sums exactly to the requirement before submitting; neither UI allows "fulfil what
        you can now, leave the rest pending" at the single-item granularity.
```
```text
Rule: The pending queue has no approval or claim step.
Condition: N/A — absence of code, not a positive rule
Implementation: No role/status gate found between "shortage recorded" and "any user can fulfil it"
Impact: Any authenticated user reaching the screen can fulfil any pending item; whether this is
        intentional (fast pharmacy turnaround) or a missing feature (should require a specific
        role) cannot be determined from source alone — flagged for the requester's own judgment
        rather than assumed either way.
```
```text
Rule: Billing and inventory-deduction are decoupled identically in the legacy BOM_ITEM path as in
      the modern bom.conduct path, just via different mechanisms.
Condition: ipd-clinical-service's conductBom() bills unconditionally (kafkaCoreService.markToBillToCore)
           and deducts inventory only if isInventory && deductInventoryViaBom
Implementation: EncounterClinicalAdministerServiceImpl.conductBom, per its own Javadoc
Impact: Confirms the billing/inventory decoupling principle established in Part 2 (main KB §14) is
        a codebase-wide design intent for BOM, not specific to the OPD Non-OT implementation —
        even though the two implementations share no code, they independently arrived at (or were
        deliberately built to) the same billing-is-independent-of-stock-outcome rule.
```

---

## 17. Known Gaps / Unknowns — Phase 3

- **Whether `BOM_ITEM`/Implementation B or C ever produces a stock shortfall, and what happens if
  so** — no pending-queue equivalent was found for either. `PENDING (verify — flagged high
  priority)`: if IPD medication administration or OT billing can legally request more than available
  stock, and the FEFO loop in `PatientConsumptionServiceImpl.reducedBomQuantityFromInventory` simply
  stops when batches run out with no error raised and no shortfall record created, that would be a
  silent under-consumption (patient billed/administered for a quantity partially not actually
  deducted from stock) — but this was **not confirmed**, only the absence of an obvious pending-queue
  equivalent was confirmed. Read the full method body and its callers' error handling before
  concluding this is a real bug.
- **`clinical-common-service`'s copy of `bomReduceItemStockInInventory` appears to have zero
  callers** in that service's own source — likely dead code, possibly a leftover from before the
  OPD Non-OT flow was rebuilt as the modern `bom.conduct` engine (Part 2). Not confirmed dead beyond
  a single grep pass within that one service's `src` tree.
- **The likely-dead duplicate `BomPendingDetailComponent`** in `opd-clinical` (§14) — flagged as
  probably unreachable, not confirmed via an exhaustive route-table audit of the whole app.
- **`BomPendingQueueComponent`'s dead flattening branch** for a nested `items[]` response shape the
  actual backend method never returns (§3) — low-risk, but worth knowing before assuming the
  component's data-shape handling reflects the current API contract exactly.
- **Four independently-defined `BomKafkaDTO` classes** now confirmed across the codebase: core-service
  did NOT have one (Part 1 used `BomConfigurationKafkaDTO`, a different concept), but
  inventory-service, ipd-clinical-service, and ipd-service each have their own `BomKafkaDTO` for the
  legacy `BOM_ITEM` topic, plus core-service/inventory-service's separate
  `BomConfigurationKafkaDTO` pair from Part 1. This is a broader pattern in this codebase (no shared
  DTO library between services for Kafka payloads) rather than a Part-3-specific issue, but is now
  confirmed at a larger scale than Part 1 alone suggested.
- Full internals of Implementations B and C (what actually populates `BomDetails`/`ItemBOMDetails`
  in IPD, what UI/workflow triggers `conductBom()` and OT billing's BOM path, whether either has any
  concept of BOM *configuration* reuse from Part 1's `bom_configuration` tables or has its own
  separate config source) are `PENDING` — out of scope for this phase, recommended as a dedicated
  future phase if IPD/OT BOM behavior matters for the task at hand.

---

## 18. Quick Reference — Phase 3

- Pending queue = **shortage queue for stock items**, not a generic non-stock-item queue
- No formal "Indent" entity backs this — "indent" here is only the Angular project's name
- No approval/claim/reject step exists in source
- Fulfilment is all-or-nothing per pending item (batch quantities must sum exactly)
- Driven by a third Angular service, `BomPendingService` (indent project), distinct from Part 2's
  `BomService`/`BomConductService`
- **Three separate BOM stock-reduction backends exist**: `bom.conduct` (OPD Non-OT, has a pending
  queue), IPD clinical administration's `BOM_ITEM` Kafka path (no pending queue, FEFO), IPD OT
  billing's own `BOM_ITEM` Kafka path (no pending queue, FEFO) — all three converge only at
  `PatientConsumptionService`'s two different entry-point methods
  (`addNewPatientConsumption` for Implementation A, `reducedBomQuantityFromInventory` for B/C)
- One likely-dead duplicate Angular component and one likely-dead legacy Java Kafka-producer method
  identified this phase

---

*(End of Phase 3. The biggest open thread this phase surfaced is whether the legacy `BOM_ITEM` /
Implementations B & C path has any shortage-handling at all — recommend that be the focus of
whichever phase covers Part 4 (Stock Reduction) in depth, alongside `PatientConsumptionServiceImpl`'s
full internals for Implementation A's own stock-ledger mechanics.)*
