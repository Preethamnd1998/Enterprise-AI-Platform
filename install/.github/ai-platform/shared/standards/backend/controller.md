# BE — Controller Instructions

> Also read: `coding-standards/STANDARDS.md` before writing any controller.

---

## Responsibilities

Controllers are the HTTP entry point only. They must:
1. Accept and validate request inputs (`siteId`, `dto`)
2. Extract `TokenPayload` from headers via `TokenService`
3. Build the `CustomerTransactionAttribute` (CTA) context via `getCta(tokenPayload, siteId)`
4. Delegate ALL business logic to the service layer
5. Catch `ApplicationException` and return a failed `ApplicationResponse`
6. Never contain business logic or repository calls

---

## Required Annotations

| Annotation | Where | Purpose |
|---|---|---|
| `@RestController` | Class | Marks as REST controller |
| `@RequestMapping("/base-path")` | Class | Base path for all endpoints |
| `@LogApiError` | Every method | Centralised API error logging (AOP) |
| `@Autowired` | All injected fields | Use field injection per project convention |

---

## Method Pattern (canonical template)

```java
@PostMapping("/price-book/multifactor/configuration/save/{siteId}")
@LogApiError
public ApplicationResponse<MultifactorConfigurationGetDTO> saveOrUpdateConfiguration(
        @RequestHeader HttpHeaders headers,
        @PathVariable Long siteId,
        @RequestBody MultifactorConfigurationPostDTO dto) {

    // 1. Validate siteId
    if (dto.getSiteId() == null || dto.getSiteId() == 0) {
        return new ApplicationResponse<>(CommonConstants.FAILED,
                String.valueOf(HttpStatus.INTERNAL_SERVER_ERROR.value()),
                "Site Id is null", null);
    }

    TokenPayload tokenPayLoad = null;
    try {
        // 2. Extract token
        tokenPayLoad = tokenService.getTokenPayload(headers);

        // 3. Delegate to service with CTA context
        MultifactorConfigurationGetDTO result = configurationService
                .saveOrUpdate(getCta(tokenPayLoad, dto.getSiteId()), dto);

        // 4. Return success response
        return new ApplicationResponse<>(CommonConstants.SUCCESS,
                String.valueOf(HttpStatus.OK.value()), CommonConstants.OK, result);

    } catch (ApplicationException e) {
        // 5. Catch business exceptions — map to ApplicationResponse
        return new ApplicationResponse<>(CommonConstants.FAILED,
                String.valueOf(e.getCode()), e.getMessage(), null);
    }
}
```

---

## GET endpoint pattern

```java
@GetMapping("/auto-follow-up/rules/{siteId}")
@LogApiError
public ApplicationResponse<List<RuleAssignmentGetDTO>> getRulesForSite(
        @RequestHeader HttpHeaders headers,
        @PathVariable Long siteId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "15") int size) {

    if (siteId == null || siteId == 0) {
        return new ApplicationResponse<>(CommonConstants.FAILED,
                String.valueOf(HttpStatus.BAD_REQUEST.value()), "Site Id is required", null);
    }
    try {
        TokenPayload tokenPayLoad = tokenService.getTokenPayload(headers);
        List<RuleAssignmentGetDTO> result = ruleService.getRules(
                getCta(tokenPayLoad, siteId), siteId, PageRequest.of(page, size));
        return new ApplicationResponse<>(CommonConstants.SUCCESS,
                String.valueOf(HttpStatus.OK.value()), CommonConstants.OK, result);
    } catch (ApplicationException e) {
        return new ApplicationResponse<>(CommonConstants.FAILED,
                String.valueOf(e.getCode()), e.getMessage(), null);
    }
}
```

---

## Rules

- `siteId` must always be validated before calling any service method.
- `HttpHeaders` must be accepted so `TokenService.getTokenPayload()` can extract the token.
- Never call a repository directly from a controller.
- Never write business logic (calculations, data transformation) in the controller.
- All HTTP methods return `ApplicationResponse<T>` — never `ResponseEntity<?>` directly.
- Use `@PathVariable Long siteId` for operations scoped to a site.
- Use `@RequestParam` with defaults for pagination parameters.