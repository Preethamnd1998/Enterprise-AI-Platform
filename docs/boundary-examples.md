# Boundary Declaration Examples

**See also:** [`repo-onboarding.md`](repo-onboarding.md) · [`PROJECT-STRUCTURE.md`](../PROJECT-STRUCTURE.md) · [`README.md`](../README.md)

---

Boundaries power migration `mode=functionality` closure and the no-scan guarantee.
Put these in each repo's `.claude/CLAUDE.md`.

## Example A — Java / Spring Boot (modular monolith)
```
## Module boundaries
- com.lifetrenz.order
- com.lifetrenz.patient
- com.lifetrenz.scheduling

## Shared / allowed cross-module packages
- com.lifetrenz.common.*
- com.lifetrenz.shared.*
- com.lifetrenz.platform.audit.*

## Forbidden boundaries
- com.lifetrenz.billing.*
- com.lifetrenz.pharmacy.*
- com.lifetrenz.inventory.*

## Conventions
- OrderController → OrderService(Impl) → OrderRepository
- OrderPostDTO / OrderGetDTO / OrderMapper ; entity Order
- Flyway: src/main/resources/db/migration/VNNN__description.sql
```
A migration seeded in `com.lifetrenz.order` may follow refs into `common.*`/`shared.*`
but must STOP at `billing.*` unless a real reference crosses (then report it, don't auto-pull).

## Example B — Spring multi-service (one repo per service)
```
## Module boundaries
- com.lifetrenz.ipd            (this service only)
## Shared / allowed cross-module packages
- com.lifetrenz.common.*       (the shared library dependency)
## Forbidden boundaries
- (other services are separate repos — never reachable; no entry)
```

## Example C — Angular (Nx-style libs)
```
## Module boundaries
- libs/refund
- libs/patient-registration
## Shared / allowed cross-module packages
- libs/shared/*
- libs/ui/*          (LT component library)
## Forbidden boundaries
- libs/billing/*
## Conventions
- refund-payment.component.{ts,html,scss} ; refund.service.ts ; refund-routing.module.ts
```

## Example D — Flutter (feature-first)
```
## Module boundaries
- lib/features/refund
- lib/features/patient_registration
## Shared / allowed cross-module packages
- lib/shared/*
- lib/core/*         (theming, DI setup, base widgets)
## Forbidden boundaries
- lib/features/billing/*
## Conventions
- refund_screen.dart ; refund_bloc.dart / refund_state.dart / refund_event.dart
- refund_repository.dart ; refund_model.dart (freezed)
```
