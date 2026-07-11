# Coding Standards & Style Guide

Applies to ALL code in this project — Java (BE), TypeScript (UI), and Dart (Flutter mobile).

---

## 1. Class & File Size Limits

| Rule | Limit |
|---|---|
| Max lines per class / component file | **500 lines** |
| Max lines per function / method | **150 lines** |
| Max parameters per function | **5** (use a DTO/object if more are needed) |
| Max nesting depth | **3 levels** (use early returns to reduce nesting) |

When a class approaches 500 lines, extract responsibilities into helper classes, services, or utility classes.
When a function approaches 150 lines, extract meaningful sub-operations into private/helper methods.

---

## 2. Single Responsibility Principle

Every function/method must do **one thing** and its name must describe that one thing:

```java
// BAD — does multiple things, vague name
public void process(Long siteId) {
    // validates input
    // fetches from DB
    // transforms data
    // sends Kafka event
    // updates audit log
}

// GOOD — each function has one job
public void assignRule(Long siteId, RuleDTO dto) {
    validateAssignment(siteId, dto);
    RuleAssignment saved = persistAssignment(siteId, dto);
    publishRuleAssignedEvent(saved);
}
```

```typescript
// BAD
loadPatientData() {
  // calls API, transforms, sets pagination, handles error, shows toast
}

// GOOD
ngOnInit(): void {
  this.loadPatientList();
}

private loadPatientList(): void {
  this.loading = true;
  this.patientService.getPatients(this);
}
```

---

## 3. Naming Conventions

### Java
| Entity | Convention | Example |
|---|---|---|
| Classes | `PascalCase` | `AutoFollowUpRuleService` |
| Interfaces | `PascalCase`, prefix `I` for repos | `IAutoFollowUpRuleRepository` |
| Methods | `camelCase`, verb-first | `findActiveRulesBySite`, `saveAssignment` |
| Constants | `UPPER_SNAKE_CASE` | `CommonConstants.SUCCESS` |
| Packages | `lowercase.dot.separated` | `com.lifetrenz.ipd.rule` |
| DTOs | suffix `DTO`, split GET/POST | `RuleAssignmentGetDTO`, `RuleAssignmentPostDTO` |

### TypeScript / Angular
| Entity | Convention | Example |
|---|---|---|
| Classes / Components | `PascalCase` | `PatientListComponent` |
| Files | `kebab-case` | `patient-list.component.ts` |
| Methods | `camelCase`, verb-first | `loadPatients`, `onSave` |
| Constants | `UPPER_SNAKE_CASE` (in constant classes) | `AppGlobalConstant.PATIENT_GET` |
| Interfaces / Models | `PascalCase` | `PatientDTO`, `PageDTO` |

### Dart / Flutter
| Entity | Convention | Example |
|---|---|---|
| Classes / Widgets | `PascalCase` | `PatientListScreen` |
| Files | `snake_case` | `patient_list_screen.dart` |
| Methods / variables | `camelCase`, verb-first for methods | `loadPatients`, `onSave` |
| Constants | `camelCase` (Dart convention — no `UPPER_SNAKE_CASE`) | `apiTimeoutSeconds` |
| Models / DTOs | `PascalCase`, split request/response when shapes diverge | `PatientRequest`, `PatientResponse` |

---

## 4. Constants — No Magic Strings or Numbers

Never hardcode strings or numbers inline:

```java
// BAD
return new ApplicationResponse<>("SUCCESS", "200", "OK", result);

// GOOD
return new ApplicationResponse<>(CommonConstants.SUCCESS,
    String.valueOf(HttpStatus.OK.value()), CommonConstants.OK, result);
```

```typescript
// BAD
apiObject.service = '/api/patient/list';

// GOOD
apiObject.service = AppGlobalConstant.PATIENT_LIST_GET;
// where PATIENT_LIST_GET is defined in AppGlobalConstant or a module ApiConstant class
```

---

## 5. Logging Standards

### Java
- Annotate all service classes with `@Slf4j` (Lombok).
- Log at `DEBUG` for routine flow; `INFO` for significant business events; `WARN` for recoverable anomalies; `ERROR` only on caught exceptions.
- Always include context: `siteId`, entity ID, and operation name.
- Never log sensitive data (passwords, tokens, PII).

```java
@Slf4j
public class AutoFollowUpRuleCheckingServiceImpl implements AutoFollowUpRuleCheckingService {

    public void checkRulesForSite(Long siteId, ...) {
        log.info("Checking auto follow-up rules for siteId={}", siteId);
        try {
            // business logic
            log.debug("Rule check complete for siteId={}, rulesFound={}", siteId, rules.size());
        } catch (ApplicationException e) {
            log.error("Rule check failed for siteId={}: {}", siteId, e.getMessage(), e);
            throw e;
        }
    }
}
```

### TypeScript / Angular
- Use `console.error()` only for unexpected errors in catch blocks.
- Do NOT use `console.log()` in production code — remove all debug logs before committing.
- Toast messages (via `AppUtils`) are the UI-layer equivalent of info logs for user-facing events.

### Dart / Flutter
- Use the project's logger (e.g. `logger` package) — never `print()` in production code; `debugPrint()` is acceptable only in debug-only code paths guarded by `kDebugMode`.
- Never log request/response bodies that may contain PII or tokens.
- `SnackBar`/`Toast` shown via a shared helper is the UI-layer equivalent of info logs for user-facing events.

---

## 6. Comments & Documentation

### When to comment
- **Always comment** non-obvious business rules, algorithm choices, or workarounds.
- **Never comment** obvious code (`i++; // increment i`).
- Prefer self-documenting names over comments.

### Java Javadoc
- Public API methods on service interfaces must have Javadoc.
- Private helpers do not need Javadoc but may have a one-line `//` comment if the intent is not obvious.

```java
/**
 * Assigns an auto follow-up rule to the given site.
 * Throws {@link ApplicationException} if rule is already assigned or site is inactive.
 *
 * @param siteId  the target site
 * @param dto     rule assignment payload
 * @param cta     caller transaction attribute (from token + siteId)
 * @return the persisted assignment DTO
 */
RuleAssignmentGetDTO assignRule(Long siteId, RuleAssignmentPostDTO dto, CustomerTransactionAttribute cta);
```

### TypeScript
- Component class header should have a one-line comment describing the feature's purpose if it is not obvious from the file name.
- Complex `onResult` switch blocks should have brief `//` comments per case.

---

## 7. Error Handling

### Java
- Use `ApplicationException` for all business-level errors. Do NOT throw raw `RuntimeException`.
- Catch at the controller boundary and return `ApplicationResponse` with the error code and message.
- Do NOT swallow exceptions with empty catch blocks.

```java
// BAD
try {
    service.doSomething();
} catch (Exception e) {
    // ignore
}

// GOOD
try {
    result = service.doSomething(siteId, dto);
} catch (ApplicationException e) {
    log.error("Operation failed siteId={}: {}", siteId, e.getMessage(), e);
    return new ApplicationResponse<>(CommonConstants.FAILED,
        String.valueOf(e.getCode()), e.getMessage(), null);
}
```

### TypeScript
- Always implement `onError` in `ApiCallBack`.
- Use `AppUtils.showErrorViaToast` for user-facing errors.
- Set `loading = false` in `onError` to unblock the UI.

### Dart / Flutter
- Catch `DioException` (or the project's HTTP client's exception type) at the repository boundary; never let raw exceptions/stack traces reach the UI as display text.
- Emit an explicit error state from the Bloc/Cubit (`MyFeatureError(message)`) — never leave the UI in a stuck loading state on failure.
- Do NOT swallow exceptions with empty catch blocks.

```typescript
onError(err: any, type: any, other?: any): void {
    this.loading = false;
    AppUtils.showErrorViaToast(
        this.messageService,
        this.translateService.instant('An error occurred. Please try again.')
    );
}
```

---

## 8. Code Hygiene

- **No unused imports** — remove before committing.
- **No TODO/FIXME without a ticket reference** — `// TODO: LT-1234 — replace with paginated query`.
- **No commented-out code** in commits — delete it; version control preserves history.
- **No duplicate logic** — extract to a shared utility or base class.
- **One concept per commit** — atomic, reviewable changes.

---

## 9. Testing Expectations

- Every new public service method must have at least one unit test.
- Controller tests must cover: happy path, null `siteId` validation, and `ApplicationException` catch path.
- Angular components must have a `.spec.ts` (Karma/Jasmine) covering: component creation and `onResult` cases.