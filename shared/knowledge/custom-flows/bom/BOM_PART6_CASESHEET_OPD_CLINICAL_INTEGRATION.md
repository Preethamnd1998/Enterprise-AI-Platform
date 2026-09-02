# BOM FUNCTIONALITY KNOWLEDGE BASE — PART 6

## UI: Case Sheet & OPD Clinical Integration (`app-administration-casesheet`)

> **Status: DRAFT — Phase 6 of N.**
> Companion document to `BOM_FUNCTIONALITY_KNOWLEDGE_BASE.md` (Parts 1–2, plus cross-cutting
> sections), `BOM_PART3_NON_STOCK_INDENT_CONSUMPTION.md` (Part 3),
> `BOM_PART4_STOCK_REDUCTION.md` (Part 4), and `BOM_PART5_ADDING_BOM_TO_BILL.md` (Part 5). This
> phase was triggered by a captured API call (`PUT .../ccs/schedule/status/update`, backend
> `clinical-common-service`) associated with a different host component,
> `app-administration-casesheet`, than the one documented in Part 2 (`app-administration-nonot`).
> Tracing it **closes a question left open since Part 2** — exactly how `clinical-common-service`
> (CCS) reaches `inventory-service`'s `finalizeDraft` endpoint — and surfaces a concrete,
> double-confirmed dead-code finding in the casesheet component itself. Nothing here is invented;
> unverified items are marked `PENDING (Phase N)`, absent items `UNKNOWN / NOT FOUND IN SOURCE`.
>
> **A note on the captured request**: the curl example that prompted this phase included a live
> bearer token and, once decoded, staff PII (name, email, department, user id) embedded in the JWT
> claims. Neither is reproduced in this document — only the HTTP method, path, and request-body
> *shape* are documented, which is what matters for tracing the code. The token was not used for
> anything beyond identifying which endpoint to trace.

---

## 0. What this phase confirms and finds

1. **Closes Part 2's open item**: main KB §5.4 documented `BomConductController.finalizeDraft` as
   "called by CCS via Feign" but had not read the CCS side. This phase found and read it —
   `NonotConductingServiceImpl.conductBomViaFeign()` in `clinical-common-service`, which calls
   `InventoryProxy.finalizeBomConduct()`, a Spring Cloud Feign client (`@FeignClient(name =
   "inventory")`) mapped to exactly `POST /bom/conduct/{bomConductionId}/finalize`. **Fully
   confirmed**, not inferred.
2. **`app-administration-casesheet` is a sibling of `app-administration-nonot`**, not a duplicate —
   both are "mark schedule conducted" host screens that funnel into the same CCS endpoint
   (`PUT /schedule/status/update`, controller `NonotConductController`), but
   `app-administration-casesheet` is the more general-purpose one, handling conduct for RAD, NONOT,
   SPTPY (speech therapy), ATY (audiometry), OTY (occupational therapy), DENT (dental), and other
   order types (visible in its own post-conduct routing switch) — not scoped to Non-OT procedures
   specifically the way `app-administration-nonot` is.
3. **Double-confirmed dead code**: `AdministrationCasesheetComponent._doMarkConducted()` contains an
   elaborate mapping of `ConductQService.bomDeatails` (an array, presumably meant to hold BOM child
   items with pricing/tax/UOM detail) into `ItemBomDetails[]` for the outgoing `bomDetails.childItems`
   payload. Two independent facts confirm this code path is unreachable under the current codebase:
   - **Frontend**: `ConductQService.bomDeatails` is declared (`bomDeatails: any;`) but a full-tree
     grep for any assignment to it (`conductQService.bomDeatails = ...` or `this.bomDeatails = ...`
     within a class that injects `ConductQService`) found **no live assignment anywhere** — the only
     matches were an unrelated same-named local field in a completely different component
     (`ot-orders.component.ts`, ADT/OT billing module) and a commented-out assignment in
     `emar-pending-order.component.ts`. So `conductQService.bomDeatails` is always `undefined` at
     the point `_doMarkConducted()` reads it.
   - **Backend**: even if it *were* populated and sent, `conductBomViaFeign()` (§0.1) never reads
     `bom.getChildItems()` at all — it only forwards header/context fields (patient, encounter,
     admission, order, schedule ids) into `BomFinalizeRequestDTO`, because Implementation A's
     `finalizeDraft` (main KB Part 2 §5.4) is deliberately a "slim finalize" that reloads all item
     data from the already-persisted DRAFT in the database, never from the request body.
   So the `childItems` construction code is dead on **both** ends — nothing populates its input, and
   nothing reads its output. This reads as a vestige of an earlier design (possibly one where CCS's
   endpoint carried full BOM item detail directly, before the "Locked flow" refactor — see §0.1's
   quoted code comment) that was never cleaned up after the newer Feign-based design replaced it.

---

## 1. `app-administration-casesheet` overview

`AdministrationCasesheetComponent` (selector `app-administration-casesheet`,
`projects/clinical-casesheet/src/module/conductq/administration-casesheet/administration-casesheet.component.ts`)
is a large "conduct this scheduled clinical activity" screen: patient banner (vitals, allergies,
VIP/high-alert flags, admission/location info), a conduct-date/time picker (with RAD-specific
start/end date handling and chargeType-based capture dialogs for `BASED_ON_HRS`/`BASED_ON_LITERS`
order types), and a "Mark Conducted" action (`administermedication()` → `_doMarkConducted()`).
Unlike `AdministrationNonotComponent` (Part 2), **it does not host `<app-bom-details>` itself** — no
`BomDetailsComponent` import, no `@ViewChild(BomDetailsComponent)`. It only *reads* shared state
(`caseSheetData.bomConductionId`, `conductQService.bomDeatails`/`selectedCatalogItemId`/
`doctorConsultingStoreRoomId`) that some other, sibling component in the same page context is
presumably responsible for populating. **Which component that is, in the casesheet layout that hosts
`app-administration-casesheet`, was not identified in this phase** — `PENDING`. It has an
`onBomConductionSaved(event)` handler identical in shape to `AdministrationNonotComponent`'s (main KB
Part 2), suggesting a `BomDetailsComponent` instance elsewhere on the same parent page emits into
this component's/`caseSheetData`'s shared state, but the parent template wiring that would confirm
this was not read in this phase.

## 2. The captured API call

```text
PUT {gateway}/ccs/schedule/status/update
Content-Type: application/json
Authorization: Bearer <redacted>

Body (UpdateScheduleStatusDTO):
{
  "id": "<mongo ObjectId of the ClinicalSchedule>",
  "clinicalScheduleStatus": "CONDUCTED",
  "scheduleConductStatus": "CONDUCTED",
  "conductedOn": "<ISO timestamp>",
  "conductRecordedOn": "<ISO timestamp>",
  "scheduleEndDate": "<ISO timestamp>",
  "scheduleStartDate": "<ISO timestamp>",
  "scheduleConductedById": <coreUserId>,
  "scheduleConductedBy": "<display name>",
  "scheduleNo": 1,
  "bomDetails": null
}
```
In the captured instance, `bomDetails` was `null` — consistent with main KB §5.1: the schedule's
activity had no `DEPLOYED` BOM configuration attached, or the conduct screen simply had none to
report. This is the normal, expected shape for any conduct action with no BOM involvement — this
confirms the `bomDetails` field is genuinely optional/nullable on the wire, not always populated.

## 3. Field mapping: Angular `BomDetails`/`ItemBomDetails` → CCS `BomDetails`/`BomFinalizeRequestDTO`

| Angular (`_doMarkConducted`, `BomDetails`) | CCS (`BomDetails` DTO, `com.lifetrenz.lths.ccs.dto.BomDetails`) | Forwarded into `BomFinalizeRequestDTO`? |
|---|---|---|
| `bomConductionId` | `getBomConductionId()` | Used as the Feign path variable, not forwarded into the body |
| `catalogueItemId`, `qty` (always `null`, confirming main KB Part 4 §3's finding — no repeat-count) | — | Not read by `conductBomViaFeign` |
| `patientId` | `getPatientId()` | Yes — `req.setPatientId(...)` |
| `patientName` | `getPatientName()` | Yes |
| `patinetMPI` (typo preserved identically on both FE and BE — `getPatinetMPI()`) | `getPatinetMPI()` | Yes — `req.setMpi(...)` |
| `encounterId`, `admissionId`, `admissionDashboardId`, `orderId`, `scheduleId` | same names | Yes, all forwarded |
| `locationId`, `locationName`, `admitType` | present on the DTO | Not read by `conductBomViaFeign` |
| `childItems` (the whole dead-code-fed array, §0.3) | present on the DTO (`ItemBomDetails[]` equivalent) | **Never read** — confirms §0.3 |

## 4. Backend flow — full trace

```text
NonotConductController.updateScheduleStatus()          [PUT /schedule/status/update]
  -> NonotConductingServiceImpl.updateScheduleStatus()
       -> updateEmarScheduleStatus(statusDTO, tokenPayload)
            1. Load ClinicalSchedule (MongoDB) by statusDTO.getId(); warn+return false if not found
            2. Update ClinicalScheduleDetails fields (status, conducted-by/on, chargeType actuals,
               comment/remark) directly on the Mongo document; save
            3. If now CONDUCTED: fire a notification Kafka event (best-effort, logged on failure)
            4. Look up next PENDING schedule for the same order (to decide PARTIALLY_CONDUCTED vs
               fully CONDUCTED/VERIFIED order-activity status)
            5. Update the parent AdmissionClinicalOrder's status via admissionOrderService
            6. (further down, not shown above) publish RELAY_ORDER_STATUS_UPDATE Kafka
            7. BOM branch:
                 BomDetails bomDetails = statusDTO.getBomDetails();
                 hasDraftId = bomDetails != null && bomDetails.getBomConductionId() != null;
                 if (hasDraftId) {
                     conductBom(bomDetails, clinicalSchedule, tokenPayload,
                                admissionClinicalOrder, statusDTO.getType());
                 }
               wrapped in try/catch that LOGS "BOM Conduction failed for scheduleId=..." on error
               (a real logger.error call here, not a swallowed/printed one — better than several
               patterns flagged in earlier Parts)
            8. return true

@Async("taskExecutor")
conductBom(bom, clinicalSchedule, tokenPayload, admissionClinicalOrder, type)
    if (bom.getBomConductionId() != null || "BOM_CONDUCTION".equals(type)):
        conductBomViaFeign(bom, clinicalSchedule, tokenPayload, admissionClinicalOrder)
    "CCS does NOT publish Kafka in this path" (direct code comment)

conductBomViaFeign(bom, clinicalSchedule, tokenPayload, admissionClinicalOrder)
    builds BomFinalizeRequestDTO (siteId, tokenPayload, patient/encounter/admission/order/schedule
    context from `bom` — see §3 table)
    inventoryProxy.finalizeBomConduct(bom.getBomConductionId(), req)
        -> Feign POST /bom/conduct/{bomConductionId}/finalize on the "inventory" service
        -> inventory-service: BomConductController.finalizeDraft (main KB Part 2 §5.4, fully
           confirmed as the receiving end)
    on Exception: System.err.println(...) then throw new RuntimeException(...)
```

## 5. Trigger conditions for the CCS→inventory Feign path

Two independent triggers, either sufficient on its own:
1. **`bomDetails.bomConductionId` is present** — the normal case: the user already saved a BOM
   DRAFT (via whatever component populates `caseSheetData.bomConductionId`, presumably a
   `BomDetailsComponent` instance elsewhere on the page, per §1), and marking the schedule conducted
   finalizes that existing draft.
2. **`statusDTO.getType()` equals `"BOM_CONDUCTION"`** — a second, independent trigger not
   mentioned anywhere in Parts 1–5. `UpdateScheduleStatusDTO.type` was **not found being set
   anywhere** in `AdministrationCasesheetComponent` or `AdministrationNonotComponent` (both leave
   the DTO's `type` field unset in what was read in this phase and Part 2's) — `PENDING`, this
   trigger condition may be exercised by some other caller of the same CCS endpoint not yet located
   (a third host component, or a non-UI caller), or may be a currently-unreachable defensive branch.
   Worth a targeted search if this endpoint's full caller set matters for future work.

## 6. Async / error-visibility analysis

`conductBom()` is `@Async("taskExecutor")` — `updateEmarScheduleStatus()` calls it and does **not**
wait for it; the HTTP response to the Angular client (and thus the "Conducted Successfully" toast
the user sees, `AdministrationCasesheetComponent._doMarkConducted()`'s `accept:` callback) is sent
back **before** the Feign call to inventory-service has necessarily completed, or even started. The
try/catch around the `conductBom(...)` call site (§4 step 7) only guards the **synchronous dispatch**
of the async method — because `conductBom` returns immediately (Spring's `@Async` proxy), that
try/catch cannot observe an exception thrown later, asynchronously, inside `conductBomViaFeign`'s own
try/catch (which does its own `System.err.println` + rethrow, §4). Whether Spring's default
`SimpleAsyncUncaughtExceptionHandler` (or a custom one configured in this app — not checked in this
phase) does anything beyond a default log call for that rethrown exception was **not verified**.

**Net effect, stated plainly**: a failure in the CCS→inventory-service Feign finalize call is
**structurally invisible to the end user** — the schedule is already marked conducted, the success
toast has already shown, and the BOM finalize failure (if any) surfaces, at best, only in
inventory-service-side or CCS-async-thread-side logs that the clinician conducting the procedure will
never see. This is architecturally consistent with the pattern already observed across Parts 1–5 (BOM
side-effects are consistently decoupled from, and non-blocking to, the primary clinical action they're
attached to) but is documented here with a fully-traced, concrete mechanism rather than an inference.

## 7. Known Gaps / Unknowns — Phase 6

- Which component actually populates `caseSheetData.bomConductionId` when
  `AdministrationCasesheetComponent` is the host screen (it doesn't host `<app-bom-details>` itself)
  — not identified; the parent page/template structure was not read in this phase.
- What sets `UpdateScheduleStatusDTO.type` to `"BOM_CONDUCTION"` (§5's second trigger) — no call
  site found in either administration component read across Parts 2 and 6.
- Whether Spring's async-exception handling for `conductBom`'s rethrown `RuntimeException` does
  anything beyond a default log — not verified.
- Full behavior of `updateEmarScheduleStatus` beyond the BOM branch (order-activity status
  transitions, the RELAY_ORDER_STATUS_UPDATE publish, `admissionOrderService.updateOrderStatus`) was
  read only as much as needed to place the BOM branch in context — not a complete trace of that
  method, which handles much more than BOM.
- Whether any other CCS endpoint (RIS conduct, haemodialysis conduct, etc. — `RisConductController`,
  `HaemoDialysisController`, both seen alongside `NonotConductController` in this phase's initial
  grep) has its own, parallel BOM-finalize trigger, potentially a **fourth** BOM entry point beyond
  the three already catalogued in Part 3 §0.2 — not investigated in this phase, flagged as worth a
  future targeted check given how consistently new BOM entry points have turned up each phase so far.

## 8. Quick Reference — Phase 6

- `app-administration-casesheet` and `app-administration-nonot` are siblings, both funneling into
  CCS's `PUT /schedule/status/update` — the general-purpose one (casesheet) handles RAD/SPTPY/ATY/
  OTY/DENT/etc.; the Non-OT-specific one hosts the BOM widget directly.
- **CONFIRMED** (closes Part 2's open item): CCS → `InventoryProxy.finalizeBomConduct` (Feign) →
  inventory-service `POST /bom/conduct/{bomConductionId}/finalize` → `BomConductController.finalizeDraft`.
- The Feign call only forwards header/context fields — never BOM child-item detail — because
  Implementation A's finalize is deliberately "slim" (reloads from the DB draft).
- **Double-confirmed dead code**: `AdministrationCasesheetComponent`'s `childItems` payload
  construction is fed by a never-assigned field (`ConductQService.bomDeatails`) and, even if it were
  populated, would be ignored by the backend Feign call regardless.
- The whole CCS→inventory Feign hop is fire-and-forget (`@Async`) from the schedule-status-update
  caller's perspective — a downstream BOM finalize failure does not surface to the user or block the
  "Conducted" response.
- A second trigger condition (`type == "BOM_CONDUCTION"`) exists in the CCS code but no caller
  setting that value was found — open question for a future phase.

---

*(End of Phase 6. This phase was scoped narrowly around the captured API call rather than a full
Part; it closes one long-standing open question (the CCS→inventory Feign hop) and raises two new
ones (§7) — the missing BOM-widget host component for the casesheet screen, and the possibility of a
fourth BOM entry point via RIS/haemodialysis conduct controllers. Either would be a reasonable next
phase.)*
