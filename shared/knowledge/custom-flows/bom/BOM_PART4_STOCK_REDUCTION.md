# BOM FUNCTIONALITY KNOWLEDGE BASE — PART 4

## Stock Reduction

> **Status: DRAFT — Phase 4 of N.**
> Companion document to `BOM_FUNCTIONALITY_KNOWLEDGE_BASE.md` (Parts 1–2) and
> `BOM_PART3_NON_STOCK_INDENT_CONSUMPTION.md` (Part 3). Part 3 ended by flagging, as its single
> highest-priority open question, whether the legacy `BOM_ITEM` Kafka stock-reduction path
> (Implementations B/C — IPD clinical administration and IPD OT billing) has any shortage-handling
> at all. **This phase answers that question directly and finds a confirmed bug** (§6). It also
> documents Implementation A's full stock-reduction mechanics — the actual ledger/balance layer that
> both Part 2's `bom.conduct` engine and the legacy path converge on. Nothing here is invented;
> unverified items are marked `PENDING (Phase N)`, absent items `UNKNOWN / NOT FOUND IN SOURCE`.

---

## 0. Scope and how the three implementations relate at this layer

Per Part 3 §0.2, three BOM code paths exist upstream, but they converge on a much smaller set of
shared machinery once you get down to "actually change a stock number in the database":

```text
Implementation A (bom.conduct, Part 2)          Implementation B/C (legacy, Part 3 §0.2)
BomConductOrchestrationServiceImpl              EncounterClinicalAdministerServiceImpl /
  .conduct() / .finalizeFromDraft() / .fulfil()   OtBillingServiceImpl
        |                                               |
        v                                               v
  builds StockOutDTO directly,                   builds List<BomKafkaDTO>, publishes to
  calls in-process:                              Kafka topic BOM_ITEM (own producer/DTO
  PatientConsumptionService                      per service) -> inventory-service
    .addNewPatientConsumption(dto, token, "BOM")   ConsumerService.bomConsumptionToInventoryItem()
        |                                               |
        |                                               v
        |                                       PatientConsumptionService
        |                                         .reducedBomQuantityFromInventory(bomDto)
        |                                               |  (does its own FEFO batch loop, see §6,
        |                                               |   then ALSO calls addNewPatientConsumption
        |                                               |   internally with the pre-resolved batches)
        v                                               v
              PatientConsumptionServiceImpl.addNewPatientConsumption()  <-- BOTH implementations land here
                    |
                    v
              ItemBatchLedgerService.multipleItemBatchLedger()   (creates inv_item_batch_ledger rows)
                    |
                    v
              ItemBatchBalanceService.updateBatchBalance()       (mutates inv_item_batch_balance.current_balance,
                                                                    negative-stock guard, optimistic locking)
```

So **both** implementations ultimately call the same `addNewPatientConsumption` method and the same
ledger/balance services — the divergence documented in Part 3 (§0.2) is entirely in **how each
implementation decides what to pass into `addNewPatientConsumption`** (i.e., whether/how a shortage
is detected *before* reaching this shared core), not in the core deduction mechanics themselves. This
phase documents the shared core once (§1–§5), then documents each implementation's upstream
shortage-handling separately (§6), since that's where they actually differ and where the bug is.

---

## 1. Which service performs stock reduction — exact classes and methods

| Layer | Class | Method | Table(s) written |
|---|---|---|---|
| Entry point (both implementations) | `PatientConsumptionServiceImpl` | `addNewPatientConsumption(StockOutDTO, TokenPayload, String source)` and the 4-arg overload with `isOpMedAdministration` | `inv_transaction`, `inv_transaction_item`, `patient_consumption` (table `inv_trans_patient_consumption`), `patient_consumption_item` |
| Ledger row creation | `ItemBatchLedgerServiceImpl` | `multipleItemBatchLedger(List<InventoryTransactionItem>, Boolean isInTransist, String source)` | `inv_item_batch_ledger` |
| Balance mutation | `ItemBatchBalanceServiceImpl` | `updateBatchBalance(List<ItemBatchLedger>, TokenPayload, String source)` | `inv_item_batch_balance` |
| Legacy shortage-unaware pre-resolution | `PatientConsumptionServiceImpl` | `reducedBomQuantityFromInventory(List<BomKafkaDTO>)` | (feeds into the entry point above) |

## 2. APIs / Feign calls involved

None of this layer is exposed as a REST API of its own, and no Feign call was found *within* the
stock-reduction layer itself — `addNewPatientConsumption` is called **in-process** (same JVM, same
service) by both `BomConductOrchestrationServiceImpl` (Implementation A) and
`PatientConsumptionServiceImpl.reducedBomQuantityFromInventory` (itself, for Implementation B/C, via
the `BOM_ITEM` Kafka consumer). The only network hop feeding into this layer is the `BOM_ITEM` Kafka
event from `ipd-clinical-service`/`ipd-service`, already documented in Part 3.

## 3. Item-level quantity calculation — correcting an assumption from the original brief

The original task brief speculated a formula `Required Component Quantity = BOM Consumption Quantity
× Configured Component Quantity`. **This formula was not found in source.** There is no "how many
times was this BOM conducted" multiplier anywhere in `BomConductOrchestrationServiceImpl` or
`BomConfigurationItem` — a BOM conduction is a single event with one `qtyConsumed` per item (main KB
§4.16/§5), directly editable by the user in the UI (defaulting to, but independent of,
`qtyConfigured`). If the requester needs a multiplier-based formula for some other part of the
system, it was not located in the BOM feature specifically; stated here explicitly rather than
assumed, per instructions not to invent formulas not confirmed by implementation.

## 4. Stock availability checks (recap + consolidation)

Two independently-written checks exist, already flagged as a duplication risk in Part 2 §22:
- **Display-time** (`BomItemFetchServiceImpl`, main KB Part 2 §5.2): reuses
  `BillingService.getItemBatchDetailsByItemIds`.
- **Conduct-time** (`BomConductOrchestrationServiceImpl.getAvailableStock`, main KB Part 2 §5.6):
  direct `ItemBatchBalanceRepository` sum, forced to `0` if `priceSource` is `NONE`/`LAST_BATCH`.
- **Consumption-time** (this phase, new): a **third**, independent check happens inside
  `addNewPatientConsumption` itself (§5) and a **fourth**, independent one inside
  `updateBatchBalance` (§5.3) — meaning there are up to **four** separate places in the codebase that
  each independently decide "is there enough stock," not sharing a single source of truth function.
  This is stated as an architectural observation, not asserted to be wrong — redundant checks at
  different layers can be a deliberate defense-in-depth pattern — but it does mean a future bug fix
  to "the" stock-check logic would need to be applied in up to four places to be consistent.

## 5. Stock ledger creation / inventory transaction creation / balance update — Implementation A's path in detail

### 5.1 `addNewPatientConsumption` — header + item persistence, batch selection

1. Resolves the CTA (tenant/site scope), rejects if an active stock-verification/audit is in
   progress at the source location for a non-draft transaction (`getStockVerificationDetails` —
   **this is the closest thing to a "stock frozen for audit" guard found in the codebase**).
2. Creates and saves an `InventoryTransaction` header (`inv_transaction`) and a `PatientConsumption`
   header (`inv_trans_patient_consumption`), linked 1:1.
3. Resolves source/destination `InventoryLocation` — **confirmed dual convention**: when
   `isOpMedAdministration=true` (events published directly by `ipd-clinical-service`), location and
   item ids in the incoming DTO are treated as **cross-service MDM ids** and resolved via
   `findByMdmLocationIdAndCustomerTransactionAttribute_Active`/`findByMdmCatalogueItemId`; otherwise
   (BOM's own `bom.conduct` engine, OT billing) the caller is expected to have **already resolved**
   MDM ids to local primary keys before building the `StockOutDTO`, and plain `findById` is used.
   This is the same "who resolves MDM ids" convention already seen in `BomConductOrchestrationServiceImpl`
   (main KB Part 2) and in `reducedBomQuantityFromInventory` (Part 3) — confirmed here as a
   codebase-wide, deliberately-documented convention (explained in this method's own Javadoc, quoted
   in Part 3 §0.2), not a coincidence.
4. **Per requested item**, fetches all batches for that item at the source location
   (`stockTransferRepo.getTransferItemBatchDetails`), filters to the **matching batch number**
   (`""` for batchless) with positive balance, **sorts by expiry ascending (FEFO — First-Expiry-
   First-Out)**, then walks the sorted list consuming `qtyToUse = min(remainingQty, batchAvailableQty)`
   from each batch in turn, creating one `InventoryTransactionItem` (`inv_transaction_item`) and one
   `PatientConsumptionItem` (`patient_consumption_item`) row **per batch actually drawn from** — i.e.
   a single requested-item line can fan out into multiple persisted item rows if it had to span
   several batches.
5. **Hard shortage guard, confirmed**: after exhausting all matching batches for an item, if
   `remainingQty > 0`, throws `NotFoundException("Insufficient stock available for item ID: ...")`
   (line ~494-498). This is the check that (per §6) BOM's own `bom.conduct` engine is designed to
   never trigger in normal operation, because it pre-computes `consumeQty = min(requested, available)`
   itself before calling in — but see §9 for the residual race-condition risk this still leaves open.
6. If `!isDraft`, builds `ItemBatchLedger` rows from the persisted `InventoryTransactionItem` list
   (`itemBatchLedgerService.multipleItemBatchLedger`) and immediately updates balances
   (`itemBatchBalanceService.updateBatchBalance`) — both in the same method call, no separate
   "commit" step.
7. If `!isDraft && source != "BOM"`, additionally publishes a `KafkaIndentDispenseOrders` event —
   **explicitly skipped for BOM** (`!"BOM".equalsIgnoreCase(source)` guard) — meaning ordinary
   indent-dispense-order Kafka notifications are suppressed for BOM-driven consumption; BOM has its
   own separate notification mechanism (`BOM_CONDUCTION_DISPENSE`, main KB Part 2) instead.

### 5.2 `ItemBatchLedgerServiceImpl.multipleItemBatchLedger` — ledger row creation

Maps each `InventoryTransactionItem` to an `ItemBatchLedger` row via `InventoryMapper`. Handles
`isInTransist` branching for `STOCK_TRANSFER`/`DRUG_RECALL` transaction types (dispense vs. receive
sub-type, in-transit holding location) — **this branching is generic, shared infrastructure**, not
BOM-specific; BOM consumption doesn't go through the in-transit branch. `ItemBatchLedger.invTransactionType`
is stored via `@Enumerated(EnumType.ORDINAL)` — **an ordinal-based enum mapping**, meaning the
persisted value is the enum's declaration-order integer, not its name. This is a latent schema-fragility
risk: inserting a new `InventoryTransactionType` value anywhere except the very end of the enum
declaration would silently reclassify every existing ledger row whose ordinal shifted. Not asserted
to have happened — flagged as a standing risk given the annotation, per §12.

### 5.3 `ItemBatchBalanceServiceImpl.updateBatchBalance` — the actual number that changes

For each `ItemBatchLedger` row, branches on `InventoryTransactionType` (not `StockOutType` — these
are two different enums; exactly which `InventoryTransactionType` BOM consumption maps to was not
traced to the `InventoryMapper` conversion method in this phase — `PENDING (verify)`, though
`STOCK_OUT` is the most likely candidate given the branch this code takes for generic stock-out
types). For stock-out-family types (`STOCK_OUT`, `STOCK_TRANSFER_DISPENSE`,
`PHARMACY_SALE_STOCK_OUT`, `OP/IP/ER/DC_SALES_STOCK_OUT`, `CONSIGNMENT_TRANSFER`,
`CONSIGNMENT_CONSUME`):

1. Validates a source location exists on the ledger row.
2. Fetches all `ItemBatchBalance` rows for `(sourceLocation, item, batchNumber)` — note: **multiple
   balance rows can exist for the same item+batch+location** (not modeled as a single row per
   batch-location pair), which is why the next step loops.
3. **Sorts these balance rows by `currentBalance` descending** (documented as "optional" in a code
   comment, but present) and deducts `min(remainingQty, currentBalance)` from each in turn until the
   full ledger quantity is satisfied.
4. **Negative-stock prevention, confirmed**: if after exhausting all balance rows `remainingQty` is
   still `> 0` (`!sufficientStock`), throws `FailedException("Insufficient stock: required ... but
   available is only ...")` — a **second, independent** shortage guard, one layer below §5.1's.
5. **Concurrency protection, confirmed**: `ItemBatchBalance` has a JPA `@Version` column
   (`inv_item_batch_balance.version`) — genuine optimistic locking. A concurrent update to the same
   balance row between read and write throws `OptimisticLockException`, caught and rethrown as
   `StockUpdateException` with a user-facing "modified by another user, please retry" message. This
   is real, verified concurrency protection at the balance-mutation layer — not merely inferred.

**Two-layer batch handling, clarified**: batch *selection* (which `ItemBatch`/expiry to draw from) is
decided once, upstream, in §5.1 (FEFO by expiry). The balance-row deduction in §5.3 operates
**within** whatever single batch was already selected — its "sort by currentBalance descending" is
not a second FEFO pass, it's for the (apparently expected) case of multiple balance rows existing for
one already-chosen batch+location combination. `UNKNOWN / NOT FOUND IN SOURCE` exactly why multiple
balance rows can exist for the same batch+location (bin/sub-location split? historical
data-correction artifact? — not traced in this phase).

## 6. The legacy path's shortage handling — confirmed bug

Resolving Part 3's flagged open question directly. `PatientConsumptionServiceImpl.reducedBomQuantityFromInventory`
(Implementations B/C's shared landing point) does its **own** FEFO loop, separate from §5.1's:

```java
// PatientConsumptionServiceImpl.java, reducedBomQuantityFromInventory, ~line 1611-1648
for (BomKafkaDTO kafkaDto : bomDto) {
    float remainingQty = kafkaDto.getQty();
    List<ItemBatchDetailsDTO> batches = invRepo.getItemNearExpiryBatches(...);  // FEFO-sorted
    for (ItemBatchDetailsDTO batch : batches) {
        if (remainingQty <= 0) break;
        float usedQty = Math.min(availableQty, remainingQty);
        // ... builds one StockOutItemDTO per batch drawn, with batchQty = usedQty ...
        remainingQty -= usedQty;
    }
    if (remainingQty < 0) {                       // <-- BUG: should be `> 0`
        throw new FailedException("Insufficient stock for item ID " + kafkaDto.getItemId() + ...);
    }
}
stockOutDTO.setItem(stockOutItems);
addNewPatientConsumption(stockOutDTO, tokenPayload, "BOM");   // only the resolved (possibly short) items are sent
```

**This is confirmed, not speculative.** Because `usedQty = Math.min(availableQty, remainingQty)` on
every iteration, `remainingQty` can only ever decrease toward zero or stay at zero — it can
mathematically never go **below** zero through this subtraction. So `remainingQty < 0` is an
unreachable condition; the check **never fires**, regardless of how large the actual shortfall is.
The correct check — matching the intent of the error message and matching the equivalent guard in
Implementation A (§5.1 step 5) and the balance layer (§5.3 step 4) — would be `remainingQty > 0`.

**Consequence**: when IPD medication administration or IPD OT billing conducts a BOM item whose
inventory-tracked components don't have enough stock, this legacy path builds a `stockOutItems` list
covering only what stock actually allowed (each batch entry already capped at its own available
qty), silently **omits** the unfulfilled remainder, and calls `addNewPatientConsumption` with that
already-short list — which will **succeed** (§5.1's own guard only fires per-item if *that specific
batch-matched sub-request* can't be satisfied, and since every quantity here was pre-capped to what
was available, it always can be). No exception, no pending-queue-equivalent record, no log entry
distinguishing "fully fulfilled" from "silently short." The clinical event (medication administered /
OT procedure billed) proceeds as if full BOM consumption happened, while the patient/encounter's
actual recorded stock consumption for that item is less than the BOM configuration called for.

This is reported as a **CONFIRMED** correctness gap (high confidence, from direct code reading and
arithmetic reasoning about the loop invariant), not a "possible" one. Whether this is a live,
user-facing problem depends on how often IPD's BOM-tracked items actually run short on stock in
practice — that operational frequency was not assessed in this phase (out of scope for source
analysis). This document does not modify source code per the task's own instructions; flagging it
here is the deliverable.

## 7. UOM conversion

Consistent with main KB Part 2 §5.8: no unit-conversion arithmetic was found in either
implementation's stock-reduction path. `uomId`/`mdmUomId` flow through as opaque identifiers, resolved
to an `ItemUomConversion` row for display/tagging on the ledger item, never used in a multiplication
against quantity. Still `UNKNOWN / NOT FOUND IN SOURCE` whether conversion happens upstream of both
paths.

## 8. Warehouse / location / bin handling

Only location-level (not bin/sub-location) resolution was found anywhere in this feature — see §5.1's
MDM-vs-local-id convention. No bin, shelf, or sub-location field was found on `ItemBatchBalance`,
`ItemBatchLedger`, or any BOM-related entity. `UNKNOWN / NOT FOUND IN SOURCE` whether bin-level
tracking exists elsewhere in inventory-service outside this feature's scope.

## 9. Reserved stock / concurrent consumption / idempotency (consolidated)

- **Reserved stock**: **NOT FOUND IN SOURCE**. No "reserved," "held," or "allocated" quantity concept
  distinct from `currentBalance` was found anywhere in this phase's reading. Available stock for BOM
  purposes is always the live `currentBalance` at query time.
- **Concurrent consumption**: protected at the balance-mutation layer only (§5.3's `@Version`
  optimistic lock). **Not** protected at the earlier decision points — `BomConductOrchestrationServiceImpl.getAvailableStock()`
  (main KB Part 2) reads balance, then later in the same transaction `addNewPatientConsumption`
  re-reads and mutates it; between those two reads (both within the same DB transaction, but not the
  same statement) a concurrent transaction from a *different* conduction/consumption could interleave.
  Whether Postgres's default transaction isolation level (read committed, the Spring/Postgres
  default, unless configured otherwise — not verified in this phase) plus the optimistic-lock retry
  is sufficient to prevent a genuine over-consumption race was **not fully proven** — the optimistic
  lock guarantees the *final write* can't silently lose an update, but two concurrent transactions
  could both pass their own `getAvailableStock()` pre-check against the same stale balance before
  either commits, and the second-to-commit would only be caught by the ledger layer's own
  re-verification at `updateBatchBalance` time (§5.3 step 4), which **does** re-check on the
  transaction's own read — so in practice the negative-stock guard at §5.3 is the real backstop, not
  the earlier optimistic-looking pre-checks. Stated as a reasoned analysis of the code's structure,
  not as a confirmed incident.
- **Idempotency**: at the BOM level, only `scheduleId`-based (main KB Part 2 §5.9). No idempotency
  key was found at the `addNewPatientConsumption`/ledger layer itself — calling it twice with the
  same logical request would create two separate transactions/ledger rows/balance deductions; nothing
  at this layer detects or prevents a duplicate call.

## 10. Transaction boundaries and rollback behavior — a confirmed, source-documented gap

**`addNewPatientConsumption` itself carries no `@Transactional` annotation** — confirmed both by its
absence on the method declaration and by a direct code comment elsewhere in the same class
(`PatientConsumptionServiceImpl.java`, ~line 2265-2267): *"catalogueItem may be a stale Hibernate lazy
proxy: addNewPatientConsumption has no single enclosing @Transactional, so the session that
originally loaded it has already closed by the time this method runs."* — the original developer's
own words, describing a lazy-loading workaround made necessary by this exact fact.

Practical consequence, by call site:
- **Implementation A** (`BomConductOrchestrationServiceImpl.conduct()`/`finalizeFromDraft()`/`fulfil()`,
  each itself `@Transactional`): calling `addNewPatientConsumption` from within one of these methods
  means it **participates in the caller's transaction** (Spring's default `REQUIRED` propagation
  across bean boundaries) — so in this call path, stock consumption, BOM row persistence, and (until
  a Kafka-publish failure triggers rollback per main KB Part 2 §5.10-11) the whole unit **is**
  effectively transactional, just not by its own declaration.
- **Implementation B/C** (`reducedBomQuantityFromInventory`, invoked from a `@KafkaListener` method
  in `ConsumerService` that — `PENDING (verify)` — was not confirmed to carry its own `@Transactional`
  in this phase): if the Kafka consumer method itself isn't transactional either, then a multi-item
  BOM's stock consumption here could **partially commit** — e.g. item 1 of 3 succeeds and commits its
  ledger/balance changes, item 2 throws, items 2-3 never run, and there is **no rollback** of item 1's
  already-applied stock deduction. This would compound with §6's bug: a partial, uncaught shortfall
  *plus* a partially-applied multi-item batch, with no transactional safety net tying the items
  together. Flagged as a second, related risk in the legacy path, contingent on confirming the Kafka
  listener's own transaction boundary (or lack of one) in a future phase.

## 11. Reversal / cancellation

`PatientConsumptionService` exposes `fullCancelPatientConsumption(transactionId, tokenPayload,
source)` and `partialCancelPatientConsumption(transactionId, PatientConsumptionCancelDTO, ...)`, both
`@Transactional` (confirmed — the only two `@Transactional` methods in this class). `fullCancel`'s
opening validation (read in this phase): the transaction must be `APPROVED` or `PARTIAL_CANCELLED`
(rejects otherwise), and — same audit-lock guard as §5.1 step 1 — checks for an active stock
verification at the source location before allowing cancellation. Full internals (how the reversal
stock-in is built, whether it goes through `StockInService`, how `getCancellableItems`/
`getCancelledItems` distinguish state) were **not read in this phase** — `PENDING`. Whether BOM
conduction has its **own** cancel/reversal entry point (distinct from this generic
patient-consumption cancel) was not found — `UNKNOWN / NOT FOUND IN SOURCE`; recall from main KB
Part 2 §16 that `BomConductionStatus.CANCELLED` is a declared-but-unused enum value, consistent with
"no BOM-specific cancel flow was found," but this generic transaction-level cancel might still apply
to a BOM-originated `InventoryTransaction` since it's keyed by `transactionId`, not by source —
`PENDING (verify)`.

---

## 12. Database Knowledge — Phase 4 additions

| Table | Entity | Key columns | Notes |
|---|---|---|---|
| `inv_transaction` | `InventoryTransaction` | `id`, `inv_transaction_type` (ordinal-enum), `inv_transaction_status`, source/destination location FKs, `transaction_date` | Header row for every stock movement, including BOM |
| `inv_transaction_item` | `InventoryTransactionItem` | item/batch/qty (one row per batch actually drawn from) | Line items |
| `inv_trans_patient_consumption` | `PatientConsumption` | patient/encounter/admission context, links to `inv_transaction` | BOM-specific consumption header (also used by non-BOM patient consumption — same table) |
| `patient_consumption_item` | `PatientConsumptionItem` | cost price, output tax, links to `inv_transaction_item` | Line items, pricing snapshot at consumption time |
| `inv_item_batch_ledger` | `ItemBatchLedger` | `inv_transaction_type` (**ordinal-enum**, see §5.2 risk), `qty`, `opening_balance`/`closing_balance` columns (population point not directly confirmed in code read this phase), source/destination location, item, item_batch | The append-only movement log |
| `inv_item_batch_balance` | `ItemBatchBalance` | `current_balance`, `version` (JPA optimistic lock), cost/price fields | The mutable "current stock" number BOM (and everything else) actually reads |

## 13. Business Rules — Phase 4 additions

```text
Rule: A stock-out cannot proceed while an active stock verification (audit) exists at the source
      location.
Condition: getStockVerificationDetails(sourceLocationId, siteId) returns non-empty, and the
           transaction is not a draft
Implementation: PatientConsumptionServiceImpl.addNewPatientConsumption, checked before any writes
Impact: Applies to ALL patient consumption including BOM — a site-wide audit freeze blocks BOM
        conduction's stock-out step (though not necessarily the BOM row creation itself, which
        happens on the inventory-service side regardless — PENDING exact failure point if audit
        starts mid-conduct).
```
```text
Rule: Negative stock is prevented at two independent layers.
Condition: (1) addNewPatientConsumption's per-item batch loop; (2) updateBatchBalance's per-ledger
           balance-row loop
Implementation: both throw (NotFoundException / FailedException respectively) if requested qty
                exceeds what matching batches/balances can supply
Impact: A confirmed, real guarantee for Implementation A and for whatever portion of
        Implementation B/C's requests actually reach addNewPatientConsumption — but see §6: the
        legacy path's OWN pre-filtering bug means it never sends a genuinely over-requested amount
        into these guards in the first place, silently avoiding the error rather than being caught
        by it.
```
```text
Rule: BOM-sourced stock-out suppresses the generic indent-dispense Kafka notification.
Condition: source == "BOM" (case-insensitive) passed into addNewPatientConsumption
Implementation: addNewPatientConsumption, `!"BOM".equalsIgnoreCase(source)` guard around the
                KafkaIndentDispenseOrders publish
Impact: BOM relies entirely on its own BOM_CONDUCTION_DISPENSE event (Implementation A) or the
        legacy BOM_ITEM event (B/C) for downstream notification — nothing consuming the generic
        indent-dispense topic will see BOM-driven stock movements.
```

## 14. Error Handling & Edge Cases — Phase 4 additions

```text
Error: Legacy shortage check uses the wrong comparison operator (CONFIRMED BUG)
Where: PatientConsumptionServiceImpl.reducedBomQuantityFromInventory, ~line 1645
Root cause: `if (remainingQty < 0)` where the loop invariant guarantees remainingQty >= 0 always;
            should be `> 0` to detect an actual shortfall
How it is handled: not handled — the intended exception never throws
User-visible behavior: BOM items conducted via IPD clinical administration or IPD OT billing that
                        run short on stock are silently under-consumed with no error surfaced
                        anywhere in this code path
Recovery: none automated; would require a code fix (out of scope for this analysis-only task) —
          flagged with exact file/line for whoever picks this up
```
```text
Error: No @Transactional boundary on addNewPatientConsumption itself
Where: PatientConsumptionServiceImpl.addNewPatientConsumption (both overloads)
Root cause: relies entirely on the caller already being inside a transaction
How it is handled: works correctly when called from Implementation A (caller is @Transactional);
                    risk is unconfirmed for Implementation B/C's Kafka-listener call site (§10)
User-visible behavior: PENDING verification of the Kafka listener's own transaction annotation
Recovery: N/A — flagged for awareness
```
```text
Error: Up to four independent "is there enough stock" checks exist across the BOM feature (§4)
Where: BomItemFetchServiceImpl (display), BomConductOrchestrationServiceImpl.getAvailableStock
       (conduct pre-check), addNewPatientConsumption (consumption-time), updateBatchBalance
       (balance-mutation-time)
Root cause: no shared "check availability" function reused across layers
How it is handled: each layer independently queries stock; they generally agree because they all
                    read from the same current_balance data, but there is no code-level guarantee
                    they stay in sync if one is changed without the others
User-visible behavior: none currently observed; a latent maintenance risk
Recovery: N/A — observation for future refactoring consideration, not a current defect
```

## 15. Known Gaps / Unknowns — Phase 4

- Exact `InventoryTransactionType` that BOM consumption maps to (via `InventoryMapper.convertToInventoryTransaction`/
  `convertToItemBatchLedger`) was not traced to source in this phase — inferred as `STOCK_OUT` from
  branch matching in `updateBatchBalance`, not confirmed by reading the mapper itself.
- `ItemBatchLedger.opening_balance`/`closing_balance` column population point not confirmed — columns
  exist on the entity, whether/where they're actually set was not traced past `multipleItemBatchLedger`'s
  first ~220 lines read in this phase.
- Whether `ConsumerService`'s `@KafkaListener` method for `BOM_ITEM` carries its own `@Transactional`
  (directly bears on §10's partial-commit risk for Implementation B/C) — not confirmed.
- Full internals of `fullCancelPatientConsumption`/`partialCancelPatientConsumption` beyond their
  opening validation — not read in this phase.
- Why multiple `ItemBatchBalance` rows can exist for the same item+batch+location combination (§5.3)
  — not traced.
- The `EnumType.ORDINAL` mapping on both `InventoryTransaction.invTransactionType`-family columns and
  `ItemBatchLedger.invTransactionType` is a standing schema-fragility risk (§5.2) — not confirmed to
  have caused an actual data issue, flagged as a risk given the annotation alone.

## 16. Quick Reference — Phase 4

- Both BOM implementations converge on the same core: `addNewPatientConsumption` →
  `multipleItemBatchLedger` → `updateBatchBalance`
- Batch selection: FEFO (earliest expiry first), confirmed in both implementations' own pre-resolution
  loops
- Negative-stock prevention: two independent guards, both confirmed real
- Concurrency: real optimistic locking (`@Version`) on `ItemBatchBalance`, confirmed
- **CONFIRMED BUG**: `reducedBomQuantityFromInventory`'s shortage check (`remainingQty < 0`) can never
  fire — legacy IPD BOM paths silently under-consume on a real shortage, no error, no record
- `addNewPatientConsumption` has no transaction annotation of its own — safe under Implementation A
  (caller is transactional), unconfirmed under Implementation B/C's Kafka listener
- No reserved-stock concept, no bin/sub-location tracking, no UOM-conversion arithmetic found
  anywhere in this feature
- The brief's assumed "BOM Quantity × Component Quantity" formula does not exist in source — BOM
  conduction has no repeat-count multiplier

---

*(End of Phase 4. Remaining major open thread: Part 5 — Billing — including confirming which service
consumes `BOM_CONDUCTION_BILL` (Implementation A) and how `KafkaBomOrders`/`kafkaCoreService.markToBillToCore`
(Implementation B) and OT billing's own path (Implementation C) each turn into an actual bill line,
likely in IPD billing service (`ipd-service`) given `OtBillingServiceImpl` is already known to live
there.)*
