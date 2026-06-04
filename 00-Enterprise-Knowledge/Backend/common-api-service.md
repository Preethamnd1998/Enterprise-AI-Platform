# BE — Common API Service

> Also read: `coding-standards/STANDARDS.md`.

---

## Purpose

`CommonApiService` (and related cross-cutting services like `TokenService`, `CTAService`) provide shared infrastructure that every module uses. Never duplicate this logic in individual services.

---

## TokenService

Extracts and validates the JWT token from HTTP headers. Every controller and Kafka consumer that needs auth context calls this.

```java
@Service
@Slf4j
public class TokenService {

    public TokenPayload getTokenPayload(HttpHeaders headers) {
        String authHeader = headers.getFirst(HttpHeaders.AUTHORIZATION);
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new ApplicationException(HttpStatus.UNAUTHORIZED.value(), "Missing or invalid auth token");
        }
        // parse and validate JWT, return payload
        log.debug("Token extracted for user={}", payload.getUserId());
        return payload;
    }
}
```

Usage in controllers:
```java
TokenPayload tokenPayLoad = tokenService.getTokenPayload(headers);
```

---

## CTAService / getCta Helper

Builds the `CustomerTransactionAttribute` (audit/context object) from token + siteId. This must be passed to every service method that persists data.

```java
// Controller helper method (inherited from a base controller or a utility)
protected CustomerTransactionAttribute getCta(TokenPayload tokenPayload, Long siteId) {
    CustomerTransactionAttribute cta = new CustomerTransactionAttribute();
    cta.setSiteId(siteId);
    cta.setCreatedBy(tokenPayload.getUserId());
    cta.setCreatedOn(Instant.now());
    return cta;
}
```

---

## ApplicationResponse Wrapper

All controllers must return `ApplicationResponse<T>`. Never return raw objects or `ResponseEntity`.

```java
// Success
return new ApplicationResponse<>(
    CommonConstants.SUCCESS,
    String.valueOf(HttpStatus.OK.value()),
    CommonConstants.OK,
    resultDTO
);

// Failure (validation)
return new ApplicationResponse<>(
    CommonConstants.FAILED,
    String.valueOf(HttpStatus.BAD_REQUEST.value()),
    "Site Id is required",
    null
);

// Caught ApplicationException
return new ApplicationResponse<>(
    CommonConstants.FAILED,
    String.valueOf(e.getCode()),
    e.getMessage(),
    null
);
```

---

## ApplicationException

Throw this (never raw RuntimeException) for all business-level errors:

```java
throw new ApplicationException(HttpStatus.NOT_FOUND.value(), "Rule assignment not found");
throw new ApplicationException(HttpStatus.CONFLICT.value(), "Rule already assigned to site");
throw new ApplicationException(HttpStatus.BAD_REQUEST.value(), "Invalid rule configuration");
```

---

## CommonConstants

Reference `CommonConstants` (never hardcode "SUCCESS", "FAILED", "OK"):

```java
CommonConstants.SUCCESS    // "SUCCESS"
CommonConstants.FAILED     // "FAILED"
CommonConstants.OK         // "OK"
```

---

## Cross-Service HTTP Calls

When one microservice needs to call another, use `CommonApiService` (wraps `RestTemplate`/`WebClient`). Never call another module's repository bean directly.

```java
@Service
@Slf4j
public class CommonApiService {

    @Autowired
    private RestTemplate restTemplate;

    public <T> T get(String url, Class<T> responseType, HttpHeaders headers) {
        log.debug("External GET {}", url);
        ResponseEntity<T> response = restTemplate.exchange(
            url, HttpMethod.GET, new HttpEntity<>(headers), responseType);
        return response.getBody();
    }

    public <T, R> R post(String url, T requestBody, Class<R> responseType, HttpHeaders headers) {
        log.debug("External POST {}", url);
        ResponseEntity<R> response = restTemplate.exchange(
            url, HttpMethod.POST, new HttpEntity<>(requestBody, headers), responseType);
        return response.getBody();
    }
}
```