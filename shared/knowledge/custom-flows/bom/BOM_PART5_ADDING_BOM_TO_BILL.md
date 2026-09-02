# BOM FUNCTIONALITY KNOWLEDGE BASE — PART 5

## Adding BOM to Bill

> **Status: DRAFT — Phase 5 of N.**
> Companion document to `BOM_FUNCTIONALITY_KNOWLEDGE_BASE.md` (Parts 1–2),
> `BOM_PART3_NON_STOCK_INDENT_CONSUMPTION.md` (Part 3), and `BOM_PART4_STOCK_REDUCTION.md` (Part 4).
> This phase traces all three implementations' billing paths to their actual consumers and finds a
> second confirmed, serious gap (§3) alongside a confirmed behavioral divergence in what gets billed
> at all across implementations (§0, §5). All three billing consumers turned out to live in
> **`ipd-service`**, in the same class (`IPDPrescriptionOrderServiceImpl`) that also handles OT/
> indent/regular prescription billing — BOM billing is not a separate subsystem, it's three
> different entry points into the same shared billing infrastructure. Nothing here is invented;
> unverified items are marked `PENDING (Phase N)`, absent items `UNKNOWN / NOT FOUND IN SOURCE`.

---

## 0. The three billing paths, consolidated

```text
Implementation A (bom.conduct engine, Part 2)
  inventory-service: BomConductOrchestrationServiceImpl
    publishes BOM_CONDUCTION_BILL (per billed item, full requested qty, stock-independent — Part 2 §14)
    on topic LT_INVENTORY_EVENT
        |
        v
  ipd-service: InventoryConsumerService (case "BOM_CONDUCTION_BILL")
    deserializes BomConductBillPayload
        |
        v
  ipd-service: IPDPrescriptionOrderServiceImpl.processBomConductBill(payload)
    - builds ONE PrescriptionOrderEvent + PrescriptionOrderEventItem + InventoryBatchDetails
    - AUTO-SUBMITS to the open bill immediately (ipBillProcessingService.ipPrescriptionOrder)
    - graceful early-return + warn-log on any missing prerequisite (patient/encounter/admission/
      price book/currency) — no silent swallow, but no retry either

Implementation B (IPD clinical administration, Part 3 §0.2)
  ipd-clinical-service: EncounterClinicalAdministerServiceImpl.conductBom()
    "bills the BOM's billing-flagged child items unconditionally" (own Javadoc, Part 3)
    -> KafkaInventoryService... no, billing goes via:
    -> kafkaCoreService.markToBillToCore(KafkaBomOrders)  [ipd-clinical-service's OWN KafkaCoreService]
    publishes to topic LT_BOM_EVENT
        |
        v
  ipd-service: IPDClinicalConsumerService.bomOrders()  (@KafkaListener(topics = LT_BOM_EVENT))
        |
        v
  ipd-service: IPDPrescriptionOrderServiceImpl.bomOrders(kafkaBomOrders)
    - builds ONE PrescriptionOrderEvent + ONE PrescriptionOrderEventItem PER activity item in the
      batch (not one Kafka message per item, unlike Implementation A)
    - saves the items with status PENDING — does NOT call ipBillProcessingService / auto-submit
    - entire method wrapped in an EMPTY catch(Exception e) {} — see §3, confirmed silent-failure gap

Implementation C (IPD OT billing, Part 3 §0.2 / Part 4)
  ipd-service: OtBillingServiceImpl.conductBom()
    - checks only item.getInventory() across BOM child items
    - if any inventory-tracked child item exists, publishes to BOM_ITEM (Part 3/4's legacy stock
      path) for stock deduction only
    - NO billing call of any kind for BOM child items was found in this method
    - the OT procedure itself IS billed, but through the ordinary OT sales-order-item flow
      (addSurgicalSalesOrderItems / ipBillProcessingService.initializeIpReceivables) that already
      runs in the surrounding addSalesOrderItems() method, independent of the BOM child items
```

**Confirmed divergence**: whether a BOM's component items get their own bill line at all differs by
implementation. Implementation A always bills `billing=true` items (Part 2). Implementation B builds
bill-eligible event items for every activity in its batch (filtering, if any, happens upstream —
§2). Implementation C, as far as traced, **does not bill BOM child items separately at all** — only
stock-deducts the inventory-tracked ones; only the surrounding OT procedure order gets billed. This
is stated from what was actually read in `OtBillingServiceImpl.conductBom()` (Part 4's read) — no
billing-side call was found there, and no BOM-specific billing method elsewhere in that class was
located in this phase. If OT-context BOM child-item billing happens through some other path not yet
found, it would have to be outside `conductBom()` and outside this phase's search — marked
`PENDING (verify)`, stated as the strongest available evidence rather than absolute certainty.

---

## 1. Where billing is initiated / which service creates bill items

**All three implementations' bill-line creation lands in the same class**:
`ipd-service`'s `IPDPrescriptionOrderServiceImpl` (package `com.lifetrenz.lths.ipd.billing.service.impl`),
using the same core entities — `PrescriptionOrderEvent`, `PrescriptionOrderEventItem`,
`PrescriptionOrderEventItemInventoryBatchDetails` — that the class's own code comments confirm are
shared with ordinary OT and indent/out-clinic prescription billing ("same pattern as OT/indent
out-clinic billing", `processBomConductBill`'s comment). **BOM billing is not its own subsystem** —
it's Kafka-triggered entry points into the existing prescription-order billing engine. This mirrors
the architectural shape already seen in Part 4 for stock reduction (multiple upstream triggers,
one shared downstream mechanism), just one layer further down the pipeline.

## 2. Whether the BOM itself is billed or individual components are billed

**Components only, confirmed across all three paths that do bill anything.** In Implementation A,
`BomConductBillPayload.getItemId()`/`getItemName()` come from `BomConductionItem` (main KB Part 2) —
a component item, never the BOM header or its activity item. In Implementation B,
`BomOrderItemsDTO.getCatalogueItemId()` (from `kafkaBomOrders.getBomOrdersActivity().getActivities()`)
is likewise a per-child-item entry. Neither path was found to create a bill line for "the BOM
configuration" or "the activity" as a whole — the activity itself is presumably already billed
separately through its own normal order/procedure billing flow (e.g. the OT sales order in
Implementation C, or the underlying clinical order in A/B), with BOM only contributing its
**component** items' bill lines on top of that. This structurally matches main KB Part 1 §4.1's
framing of a BOM as "things to additionally consume/bill when this activity happens," not a
replacement for billing the activity itself.

## 3. CONFIRMED bug/gap: Implementation B's billing method silently swallows all failures

```java
// IPDPrescriptionOrderServiceImpl.bomOrders(), ~line 3949-4077
public void bomOrders(KafkaBomOrders kafkaBomOrders) throws ApplicationException {
    CustomerTransactionAttribute cta = null;
    try {
        if (kafkaBomOrders.getBomOrdersActivity().getPatientId() == null) {
            throw new BadRequestException("PatientId can not be null");
        }
        // ... more validation, patient/encounter/admission lookups, event-item construction ...
        if (items.size() > 0) {
            this.saveAllPrescriptionOrderEventItems(items);
        }
        this.prescriptionOrderEventItemInvBatchDetailsService.saveAll(invBatchDetails);
    } catch (Exception e) {
        // EMPTY — no log, no rethrow, no metric, nothing
    }
}
```

The method's own explicit validation (missing `patientId`/`encounterId`/`admissionId` throws
`BadRequestException`), its `NotFoundException`s for missing patient/encounter/admission, and any
exception from the DB saves are **all caught by a single empty `catch` block** at the very end. There
is no `LOGGER.warn`/`error` call anywhere inside this method's catch path (contrast directly with
Implementation A's `processBomConductBill`, which logs a `WARN` for every one of the equivalent
missing-prerequisite cases before returning). **A BOM_ITEM-driven billing failure for IPD clinical
administration produces zero observable trace anywhere** — no log line, no failed-event record (no
`MessageEvent`/`saveEvent` call was found in this method, unlike the `ProducerServiceImpl` pattern
documented for Kafka *publish* failures elsewhere in this codebase's own knowledge docs — this is a
*consumer-side* silence, a different and arguably worse failure mode since there's no
`MessageEvent` audit trail to replay from). This is reported as a **CONFIRMED** gap — read directly
from the method body, not inferred — and is a second, independent silent-failure finding after
Part 4 §6's confirmed stock-side bug, both located in the same general "legacy BOM Kafka path"
family (Implementations B/C) as opposed to the newer, better-logged Implementation A.

## 4. Stock BOM vs. non-stock BOM billing behavior

- **Implementation A**: confirmed stock-independent (main KB Part 2 §14) — `billing=true` items are
  always billed for the full requested quantity regardless of whether they were fully consumed,
  partially consumed (pending queue), or not consumed at all.
- **Implementation B**: no `billing`/`inventory` flag check was found inside `bomOrders()` itself —
  every activity item in the incoming `KafkaBomOrders` payload gets a `PrescriptionOrderEventItem`.
  This implies the **filtering to billing-flagged items only happens upstream**, in
  `ipd-clinical-service`'s own payload-building step (`EncounterClinicalAdministerServiceImpl`'s
  Javadoc explicitly says it "bills the BOM's billing-flagged child items unconditionally" — main KB
  Part 3 §0.2 — implying the filter is applied before the Kafka publish, likely inside
  `ehrMapper.convertToBillingKafkaDTO`, which was **not read in this phase**). So the *principle*
  (bill billing-flagged items regardless of stock outcome) appears consistent with Implementation A,
  but the *mechanism* differs (filter-before-publish vs. filter-and-branch-per-item-at-consume-time)
  — `PENDING (verify the mapper)` for full certainty.
- **Implementation C**: as established in §0, no billing branch for BOM child items was found at
  all in `conductBom()` — the `billing`/`inventory` distinction that matters here is purely whether
  to trigger stock deduction (`item.getInventory()`), with no parallel `item.getBilling()` check
  visible in the method read.

## 5. Price calculation

**Implementation A**: `salesPrice`/`taxAmount` travel in the `BomConductBillPayload`, sourced from
`BomConductionItem.salesPrice`/`.taxAmount` (main KB Part 2 — resolved at BOM conduction time via
`BomItemFetchServiceImpl`'s price-fallback chain `CURRENT_BATCH → LAST_BATCH → NONE`, or a manual
override). At the billing consumer:
```text
rate  = convertCurrencyUnitToSubunit(salesPrice, currencyUnit)
gross = convertCurrencyUnitToSubunit(salesPrice * qty, currencyUnit)
taxPercent (if taxIdentifierCode present, salesPrice>0, qty>0) =
    ((taxAmount / qty) / salesPrice) * 100
```
Note the last line: tax is transmitted as an **absolute amount** (`taxAmount`, the total tax already
computed at conduct time) but the billing consumer **back-calculates a percentage** from it via
division, to populate an `ItemTax` record that apparently expects a percent field. This is a
derived/reverse-engineered value, not a directly-carried one — a latent precision-loss and
edge-case risk (division by a possibly-zero or rounded `salesPrice`/`qty` — guarded by the `>0`
checks shown, so at least a `NaN`/divide-by-zero can't occur, but rounding drift across the
convert-then-reconstruct round trip was not further analyzed).

**Implementation B**: `BomOrderItemsDTO` carries `rate`/`gross` directly (already-computed `Money`
values via `MoneyConversionUtil.convertCurrencyUnitToSubunit`), plus a `tax` field passed straight
through to `opBillingMapper.mapToPrescriptionOrderEventItemInventoryBatchDetails` — no
back-calculation observed here; the upstream producer (`ipd-clinical-service`) appears to compute
and carry a ready-to-use tax value rather than the amount-only shape Implementation A uses. Exact
shape/computation of that upstream value was **not traced** (would require reading
`EHRMapper.convertToBillingKafkaDTO` in ipd-clinical-service) — `PENDING`.

## 6. Price book usage

**Confirmed hard dependency, Implementation A**: `processBomConductBill` requires
`admission.getDefaultPriceBook()` to be non-null, else it warn-logs and returns without billing —
**a BOM component item cannot be billed for an admission with no default price book assigned**, and
this fails silently from the caller's perspective (the conduct/consume side already succeeded and
committed by the time this Kafka-driven billing step runs asynchronously — see §9 for the
consistency implication). Same dependency confirmed for Implementation B
(`admission.getDefaultPriceBook()` used to resolve `corePriceBookId`, though the exact failure mode
if absent wasn't as explicitly guarded as Implementation A's — `admission == null` is checked and
throws `NotFoundException`, but a non-null admission with a null price book wasn't specifically
guarded in what was read, meaning it may NPE rather than gracefully warn-and-skip like Implementation
A does — `PENDING (verify exact behavior)`).

## 7. Quantity calculation

Already established: Implementation A bills the **full requested quantity** (`qtyConsumed`, not the
possibly-smaller `consumeQty`), independent of stock outcome (main KB Part 2 §14, Part 5 §0 above).
Implementation B bills `bomOrderItemsDTO.getOrderQty()` (defaulting to `1` if null) — same principle,
quantity is carried as-is from the upstream activity payload, no stock-outcome-dependent adjustment
visible in the consumer.

## 8. Tax / discount calculation

Tax: see §5. **Discount**: the only discount-related code touched in this phase was in
`OtBillingServiceImpl.addSalesOrderItems` (Implementation C's surrounding method, not BOM-specific)
— it checks for and **reverts** a bill-level discount before adding new sales-order items
(`discountService.isDiscountApplied`/`revertDiscount`). No BOM-specific discount handling was found
in any of the three BOM billing paths themselves — `UNKNOWN / NOT FOUND IN SOURCE` whether BOM
component bill lines participate in discount calculation at all, beyond whatever generic
bill-level discount logic already applies to any bill line once it's on the bill (out of scope to
trace further in this phase).

## 9. Patient/encounter association, bill status, duplicate prevention, transaction boundaries

- **Patient/encounter association**: all three paths resolve `Patient`/`Encounter`/`Admission` fresh
  from the payload's ids at billing-consumption time (not reusing any cached/passed-through entity
  object) — `patientService.findByCorePatientId`, `encounterService.findById`,
  `admissionService.findById`, each independently, in both Implementation A's and B's consumer
  methods.
- **Bill status / auto-add to open bill**: Implementation A explicitly submits
  (`ipBillProcessingService.ipPrescriptionOrder(submitDTO, tokenPayload)`) — the item becomes part of
  an active/open bill immediately, same call path the code comments say OT module billing uses.
  Implementation B **only saves** the `PrescriptionOrderEventItem` rows with
  `OrderActivityStatus.PENDING` — it does **not** call the equivalent submit method. Whether
  something else later picks up `PENDING` prescription-order-event-items and adds them to a bill
  (a scheduled job, a manual "pending orders" review screen, another Kafka consumer) was **not
  found or searched for** in this phase — `PENDING`. If nothing does, Implementation B's BOM bill
  lines would exist in the database but never actually appear on a patient's bill — a second,
  independent way (beyond §3's silent-exception gap) that Implementation B's billing could fail to
  reach the patient, this one structural rather than exceptional.
- **Duplicate bill prevention**: no BOM-specific idempotency/dedupe key was found at either billing
  consumer. Both rely entirely on their respective upstream triggers firing exactly once per real
  event (Implementation A inherits main KB Part 2's `scheduleId`-based conduction idempotency;
  Implementation B has no equivalent idempotency documented anywhere in Parts 1-5 so far).
- **Transaction boundaries**: **neither** `processBomConductBill` nor `bomOrders` carries a
  `@Transactional` annotation (confirmed — the only `@Transactional` method found anywhere in
  `IPDPrescriptionOrderServiceImpl` in this phase is an unrelated method at line 967). Each internal
  save (`saveAllPrescriptionOrderEventItems`, `prescriptionOrderEventItemInvBatchDetailsService.saveAll`)
  commits independently (or per Spring's default, each participates in whatever ambient transaction
  context the Kafka listener framework itself provides, which was **not confirmed** in this phase —
  same open question flagged in Part 4 §10 for the stock-side consumers). A failure partway through
  either method (e.g. event item saves but batch-detail save throws) could leave a bill line without
  its pricing/batch detail row, or vice versa, with no compensating rollback confirmed.

## 10. Cross-service calls (Phase 5 additions to main KB §13)

- `inventory-service` → `ipd-service`: Kafka only, `BOM_CONDUCTION_BILL` on `LT_INVENTORY_EVENT`
  (Implementation A) — **now confirmed** (main KB Part 2 had flagged the consumer as unconfirmed;
  this phase closes that open item).
- `ipd-clinical-service` → `ipd-service`: Kafka only, on `LT_BOM_EVENT` (Implementation B) — a
  **new** topic/hop not previously documented in Parts 1-4.
- `ipd-service` (OT billing) → itself, in-process, for the activity's own billing; no cross-service
  hop specific to BOM child-item billing was found for Implementation C (because, per §0, none
  appears to exist).
- No Feign calls were found anywhere in the billing layer for any of the three implementations —
  billing, like stock reduction (Part 4), is entirely Kafka-mediated between services, with Feign
  reserved (per main KB Part 2 §5.4) for the one synchronous CCS→inventory-service finalize call.

---

## 11. Business Rules — Phase 5

```text
Rule: BOM component items are billed independently of the BOM's own activity/header billing.
Condition: N/A — structural, confirmed by absence of any "bill the BOM itself" code path
Implementation: all three implementations only ever construct bill lines for CHILD/component items
Impact: Whoever owns "the activity's" billing (a separate order/procedure billing flow) must
        already exist independently of BOM; BOM strictly ADDS component-item bill lines on top.
```
```text
Rule: A missing default price book on the admission silently blocks Implementation A's BOM billing
      (graceful) but risks an unguarded failure in Implementation B (ungraceful — PENDING verify).
Condition: admission.getDefaultPriceBook() == null
Implementation: processBomConductBill (explicit warn+return) vs bomOrders (not explicitly guarded
                 for this specific null, though wrapped in the empty catch-all of §3 regardless)
Impact: Either way, the caller observes silence — Implementation A logs at least a WARN,
        Implementation B's empty catch means even that visibility is lost.
```
```text
Rule: Implementation B saves BOM bill-eligible items as PENDING without auto-submitting to bill.
Condition: N/A — confirmed by absence of the ipBillProcessingService submit call in bomOrders()
Implementation: IPDPrescriptionOrderServiceImpl.bomOrders
Impact: Structural risk that IPD-clinical-administration-triggered BOM billing never surfaces on
        an actual bill unless something else (not found in this phase) later processes PENDING
        prescription-order-event-items.
```

## 12. Error Handling & Edge Cases — Phase 5

```text
Error: bomOrders() swallows every exception with an empty catch block (CONFIRMED, see §3)
Where: IPDPrescriptionOrderServiceImpl.bomOrders, ~line 4073-4075
Root cause: `catch (Exception e) { }` with no logging, no rethrow, no audit record
How it is handled: not handled at all
User-visible behavior: none — total silence, both to the end user and to any log/monitoring system
Recovery: none automated; this is the most severe error-handling gap found across all five Parts of
          this KB so far, precisely because it produces zero observable signal
```
```text
Error: OtBillingServiceImpl.addSalesOrderItems's BOM conduction call is wrapped in a catch that
       only prints to stdout
Where: OtBillingServiceImpl.addSalesOrderItems, ~line 264-266:
       `catch (Exception e) { System.out.print("BOM Conduction Failed: " + ...); }`
Root cause: same "print instead of log" pattern already flagged in Part 1/2 (e.printStackTrace())
            but here using System.out.print on a plain string, not even a stack trace
How it is handled: not handled — printed to stdout, not through SLF4J, not persisted anywhere
User-visible behavior: the OT sales order item itself still succeeds/returns normally (this catch
                        wraps only the BOM conduction call, which happens after the main response is
                        already built) — so OT billing "succeeds" from the caller's perspective even
                        if BOM conduction/billing for that OT item silently failed entirely
Recovery: none automated
```

## 13. Known Gaps / Unknowns — Phase 5

- Exact content of `EHRMapper.convertToBillingKafkaDTO`/`convertToInventoryKafkaDTO` in
  `ipd-clinical-service` (what filtering, if any, happens before Implementation B's Kafka publish) —
  not read in this phase.
- Whether anything downstream processes `OrderActivityStatus.PENDING` prescription-order-event-items
  into an actual submitted bill for Implementation B — not found, not searched exhaustively.
- Whether `admission.getDefaultPriceBook() == null` causes a graceful skip or an NPE in
  `bomOrders()` — not fully traced (moot in practice anyway, since §3's empty catch would swallow
  either outcome without a trace).
- Whether the Kafka listener methods (`InventoryConsumerService`'s dispatcher,
  `IPDClinicalConsumerService.bomOrders`) carry their own transaction boundaries that would make
  §9's per-save-independent-commit concern moot — not confirmed.
- Whether IPD OT billing (Implementation C) truly never bills BOM child items separately, or does so
  through a path outside `conductBom()`/`addSalesOrderItems()` not searched in this phase — flagged
  as the strongest available reading of the code found, not as absolute certainty.

## 14. Quick Reference — Phase 5

- All three BOM billing paths converge on the same class: `ipd-service`'s
  `IPDPrescriptionOrderServiceImpl`, using the shared `PrescriptionOrderEvent`/`Item`/
  `InventoryBatchDetails` entities also used for OT/indent billing generally
- BOM never bills itself/its header — only component items, always additively on top of whatever
  bills the activity itself
- Implementation A (`BOM_CONDUCTION_BILL` on `LT_INVENTORY_EVENT`): well-logged, auto-submits to
  the open bill, stock-independent by design (Part 2)
- Implementation B (`LT_BOM_EVENT`, from ipd-clinical-service): **CONFIRMED silent-failure gap** —
  empty catch block swallows every exception with zero trace; saves items as `PENDING` without
  auto-submitting — a second, structural way BOM bill lines from this path might never reach a bill
- Implementation C (IPD OT billing): as far as traced, does **not** separately bill BOM child items
  at all — only stock-deducts inventory-tracked ones; the OT procedure itself is billed through the
  ordinary sales-order flow, independent of BOM
- A default price book on the admission is a hard prerequisite for BOM billing to proceed (at least
  for Implementation A, explicitly)
- Tax in Implementation A is back-calculated as a percentage from an absolute amount at billing time
  — a derived value, not directly carried
- No @Transactional found on either billing consumer method; no BOM-specific duplicate-bill
  prevention found at this layer

---

*(End of Phase 5 — all five Parts of the original brief now have at least one pass. Remaining
threads across the whole KB, roughly in priority order: (1) confirm whether IPD's PENDING
prescription-order-event-items ever get submitted, since that determines whether Implementation B's
billing is a real gap or just delayed; (2) read `EHRMapper` in ipd-clinical-service for the
billing/inventory filtering Implementation B relies on; (3) the still-open Part 4 questions about
Kafka-listener transaction boundaries; (4) main KB §9 "Complete End-to-End BOM Lifecycle" and §20
"Change Impact Analysis" could now be written with much higher confidence given how much cross-service
detail has accumulated across Parts 1-5.)*
