# Test Case Design

A standard procedure for deriving a test case list like an experienced QA architect
— from requirements and real implementation, not by guessing.

## Design inputs, in priority order

1. **Business rules / acceptance criteria** — the Redmine story, PLAN.md, or ticket
   description. This defines *what correct means*, not the code.
2. **Existing implementation** — read the actual method/endpoint/component before
   writing test cases. Test cases invented without reading the code miss real
   branches and invent scenarios that don't exist.
3. **Existing tests** — check what's already covered so you extend, not duplicate.
   A duplicate test case that re-asserts an already-covered path adds maintenance
   cost with zero new protection.
4. **API contract** — request/response DTO shape, status codes, error format.
5. **DB behavior** — constraints, cascades, unique indexes, triggers — these define
   negative cases (e.g., a unique constraint violation must produce a clean 409/400,
   not a raw `DataIntegrityViolationException` leaking to the client).
6. **Validation rules** — every `@NotNull`, `@Size`, `@Pattern`, custom validator.

## Design techniques

### Equivalence Partitioning (EP)

Split inputs into classes where every member of a class should behave the same way.
Test one representative per class, not every value.

Example — `siteId` parameter:
- Valid, existing site → success class
- Valid format, non-existent site → "not found" class
- Null/missing → "missing required" class
- Non-numeric string → "malformed" class

### Boundary-Value Analysis (BVA)

Bugs cluster at boundaries. For every range/limit, test: just below, at, and just
above the boundary.

Example — a `pageSize` capped at 100:
- `0` (or the documented minimum)
- `1`
- `100` (exactly at limit)
- `101` (just over — must be rejected or clamped, per the documented contract)
- negative value

Example — large Excel import capped at 10,000 rows (see
[java-large-data-import-testing.md](java-large-data-import-testing.md)):
- `9,999` rows, `10,000` rows, `10,001` rows.

### Decision Tables

Use when an outcome depends on a **combination** of conditions, not a single input.

Example — patient-merge eligibility (conditions: `mergeStatus`, `hasActiveEncounter`,
`isRollbackInProgress`):

| mergeStatus | hasActiveEncounter | isRollbackInProgress | Expected outcome |
|---|---|---|---|
| COMPLETED | any | any | Reject — already terminal |
| IN_PROGRESS | true | false | Reject — active encounter blocks merge |
| IN_PROGRESS | false | true | No-op (idempotency guard) |
| IN_PROGRESS | false | false | Proceed |

Each row becomes (at minimum) one test case. This is the technique to reach for
whenever you catch yourself writing nested `if`-driven test names.

### State Transition Testing

Use for entities with a lifecycle (order status, merge status, import job status).
For each state, test:
- Every **valid** transition out of it.
- At least one **invalid** transition attempt (and that it's rejected, not silently
  ignored).
- Terminal states reject all further transitions.

Example from `PatientMergeEvent.MergeStatus` — `initiateAutoRollback` must be a
no-op once the event is already `ROLLING_BACK` or any terminal status; this is
exactly the "already rolling back → no-op" case documented in
`PatientMergeServiceRollbackTest`.

### Negative Testing

For every positive case, ask: what's the corresponding way this input/precondition
can be wrong?
- Missing required field / null
- Wrong type / malformed format
- Value out of allowed range or enum
- Referenced entity doesn't exist (FK to a deleted/non-existent row)
- Caller lacks permission for this specific resource (not just "any valid token" —
  see `rules/security.md`'s authorization section: verify the caller has rights to
  the *specific* resource, not just a valid token)
- Duplicate submission (idempotency)
- Concurrent modification (see [java-performance-load-testing.md](java-performance-load-testing.md) §Concurrency)

### Failure / Recovery Scenarios

For anything with multi-step processing (batch import, multi-service orchestration,
rollback flows):
- Failure at step N of M — does the system leave partial state, or roll back
  cleanly? Which is the documented contract?
- Retry after failure — is it idempotent, or does retrying double-apply the effect?
- The `PatientMergeService` rollback hardening (`FAILED_UNRECOVERABLE` persisted via
  an isolated `REQUIRES_NEW` transaction so a poisoned caller transaction doesn't
  block it) is exactly this category — it belongs in the design checklist for any
  new multi-step state machine.

## Minimum high-value set, then edge cases

For every feature, produce test cases in two passes:

**Pass 1 — minimum high-value set** (write these first, always):
- One canonical positive case per distinct business rule.
- One negative case per required validation.
- One authorization boundary case (if the endpoint is protected).

**Pass 2 — additional edge cases** (add as time/risk warrants):
- BVA edges, decision-table combinations, concurrency, malformed-but-parseable
  input, locale/timezone variations, large-payload behavior.

Stop generating cases once new ones stop mapping to a **distinct code path or
distinct business rule** — a 6th rephrasing of "invalid string" testing the same
`@NotBlank` annotation adds no value.

## Avoiding meaningless / duplicate test cases

Before adding a test case, check:
- Does it exercise a code path (branch, validation, query) not already covered?
- Does it correspond to a real business rule or documented failure mode — not a
  hypothetical the requirements never mention?
- Would this test ever fail for a reason a reviewer would care about? If a test can
  only fail due to a typo in the test itself, it's not adding protection.

## Worked example — end to end

Feature: `POST /bed-category` (see `@Audited` example in `custom-annotations.md`).

1. Read the controller, service, entity, and DTO validation annotations.
2. Business rule from PLAN.md: bed category names must be unique per site.
3. Derive cases:
   - Positive: create with valid name + siteId → 201, audit log entry created
     (`entityIdFromResponse = "id"` — verify the audit captures the created ID).
   - Negative: blank name → 400 with field-level validation error.
   - Negative: duplicate name for same site → 409/400 per documented contract, not
     a raw DB constraint stack trace.
   - Boundary: name at max length allowed by `@Size`, and one character over.
   - Authorization: caller without the required role/permission → 403.
   - Regression: if a past bug allowed duplicate names across sites incorrectly,
     add a permanent test locking in "same name, different site → allowed."
4. Stop — a 2nd duplicate-name variant with different casing only adds value if the
   uniqueness check is documented as case-insensitive; otherwise skip it.
