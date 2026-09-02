# BE — Common Custom Annotations

> Also read: `entity.md`, `spring.md`.

These are **not** shared from a common library — each service that uses one
declares its **own copy** of the class (duplicated per-service, not inherited
from a shared jar). Check the specific service's own package before assuming
one of these exists there.

---

## `@Audited` — NOT the same thing as entity.md's banned `@Audited`

`entity.md` says "do NOT add `@Audited`" — that rule is about **Hibernate
Envers'** `@Audited` on **entities**. This is a **different, real, actively-used
custom annotation** on **controller methods**, for activity-audit logging. Do
not conflate the two.

Package: `com.lifetrenz.lths.core.audit.annotation.Audited`, present in
core-service, ipd-service, inventory-service, user-management-service (each
service declares its own copy). `@Target(METHOD)`.

```java
@Audited(
    moduleName = "MASTERS",
    entityName = "Bed Category",
    entityType = "BED_CATEGORY",
    description = "Create Bed Category",
    entityIdFromResponse = "id"
)
@PostMapping("/bed-category")
public ResponseEntity<?> createBedCategory(...) { ... }
```

Other params: `captureOldValue`, `captureNewValue`, `oldValueFetchMethod`,
`oldValueFetcher`, `entityIdFromPathVariable`, `entityIdFromRequestBody`,
`entityIdFromRequestParam`, `patientNameFromRequestBody`,
`patientMpiFromRequestBody`, `lookupPatientByEntityId`,
`entityTypeFromRequestBody`.

---

## `@Auditable` — a DIFFERENT annotation from `@Audited` above, not a rename

Despite the similar name/purpose (controller-method audit logging), this is
**not** the same annotation as `@Audited` — different package, different
attribute set, different implementation. Don't assume parity between them.

Package: `com.lifetrenz.lths.ipd_clinical.audit.Auditable` (ipd-clinical-service)
and `com.lifetrenz.lths.ccs.audit.Auditable` (clinical-common-service) — two
separately-declared but identical copies. `@Target(METHOD)`. Intercepted by
each service's own `AuditAspect`, which writes an entry to the shared MongoDB
`api_audit_log` collection.

```java
@Auditable(action = "CREATE_SETTINGS", module = "SETTINGS")
@PostMapping("/settings")
public ResponseEntity<?> addSettings(...) { ... }
```

Params: `action` (default `""`; audit-log action label), `module` (default
`"GENERAL"`; groups entries for filtering), `actionFromField` (optional —
name of a field on the `@RequestBody` DTO whose runtime value is read via
reflection and used as the action instead of the static `action()` value,
falling back to `action()` if the field can't be read).

---

## `@LogApiError`

`com.lifetrenz.lths.core.common.annotation.LogApiError`, `@Target(METHOD)`.
Marks a controller method for automatic API error logging via an
`ApiErrorLogger` aspect. Resolves `CustomerTransactionAttribute` for the log
entry in priority order: direct CTA param → siteId+TokenPayload → siteId only
from the `Authorization` header → skip. `stackLines` param, default 30.

```java
@LogApiError
@PostMapping("/bom/configuration")
public ResponseEntity<?> saveBomConfiguration(...) { ... }
```

---

## `@InjectCTA`

`com.lifetrenz.lths.core.common.annotation.InjectCTA`, `@Target(PARAMETER)`.
Injects `CustomerTransactionAttribute` from the auth token directly into a
controller method parameter — processed by `CTAInjectionAspect`.

```java
public ResponseEntity<?> someMethod(@InjectCTA CustomerTransactionAttribute cta) { ... }
```

> **`siteId` is NOT auto-injected from the token.** `customerId` and
> `customerBusinessId` come from the JWT payload, but `siteId` isn't part of
> the token — `CTAInjectionAspect` only fills it in if the caller sends it,
> either as a `?siteId=` query param or as a `siteId` field on the
> `@RequestBody` DTO (checked in that order). If neither is sent, `siteId`
> stays `null` on the CTA. Since `siteId` is just as important as the other
> CTA fields, whoever consumes `@InjectCTA` must make sure the UI actually
> sends `siteId` (query param or body field) — don't assume it's populated.

---

## `@IdentifierCodeConstraint`

`com.lifetrenz.lths.domain.annotation.IdentifierCodeConstraint`,
`@Target({METHOD, FIELD})`. A real Jakarta Bean Validation custom constraint
(`@Constraint(validatedBy = IdentifierCodeValidator.class)`), duplicated
per-service (core-service, ipd-service — two variants, inventory-service,
supplementary-service). Used on entity fields:

```java
@IdentifierCodeConstraint
private String identifierCode;   // seen on Bed.java, CatalogueCategory.java, CatalogueItem.java
```

---

## `@EncounterLocked` (ipd-service only)

`com.lifetrenz.lths.ipd.billing.aspect.EncounterLocked`, `@Target(METHOD)`.
Marker annotation, no params — an AOP aspect enforces an encounter-lock check
around the annotated method.

---

## `@InvalidateRcmSettingsCache` (core-service only)

`com.lifetrenz.lths.core.cache.annotation.InvalidateRcmSettingsCache`,
`@Target(METHOD)`. Auto-invalidates an RCM settings cache after the annotated
controller method runs. Has a `CacheScope` enum (`SITE` / `REGION` / `ALL`)
plus param-name/response-extraction options — see the annotation's own Javadoc
in core-service for the 4 documented usage examples before using it.

---

## Not found (do not invent)

- No shared custom annotation library across services — annotations with the
  same name in different services are separately-maintained copies, not one
  shared type.
- No custom Feign-call annotation.
- No custom method-level permission-check annotation (`@PreAuthorize`-style
  authorization, if used, is not implemented via a custom annotation in these
  services — don't assume one exists).

## Rules

- Before using any annotation above in a service not listed for it, confirm it
  actually exists in that service's own package — do not assume it's shared.
- Do not confuse controller-level `@Audited` (activity logging, this doc) with
  entity-level Hibernate Envers `@Audited` (banned, see `entity.md`).
- Do not confuse `@Audited` (core/ipd/inventory/user-management-service) with
  `@Auditable` (ipd-clinical-service/clinical-common-service) — similar
  purpose, different annotations with different attributes and backing store.
