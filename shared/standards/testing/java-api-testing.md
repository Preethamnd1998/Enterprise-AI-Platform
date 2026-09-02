# Controller / API Testing

## Established pattern in this codebase — read before writing a new controller test

**Verified in `core-service`** (`BomConfigurationControllerTest`): there is **no
MockMvc harness in use in `core-service` today**. The existing convention is:

- Instantiate the controller **directly** (`new SomeController()`), then inject
  mocked collaborators with `ReflectionTestUtils.setField(controller, "fieldName",
  mock)` — because these controllers use field injection (`@Autowired` fields), not
  constructor injection, so there's no constructor to pass mocks into.
- `@ExtendWith(MockitoExtension.class)` + `@Mock` for the service/token
  collaborators, same as [java-junit-mockito.md](java-junit-mockito.md).
- Call the controller method directly (`controller.createBomConfiguration(...)`) —
  not through an HTTP layer. This does **not** test Spring's request
  mapping/deserialization/validation pipeline, only the controller method's own
  logic (delegation to service, response shaping).
- Many of these controllers follow a **catch-and-return** convention: both success
  and failure paths return an `ApplicationResponse` object, distinguished only by
  its `status` field (`CommonConstants.SUCCESS` / `FAILED`) — there is **no
  `@ControllerAdvice`** translating exceptions to HTTP error codes for these
  endpoints. **This changes what "negative test" means here**: you assert
  `response.getStatus() == FAILED` and inspect the response body's error message,
  not the HTTP status code, because the HTTP status may still be 200.

```java
@ExtendWith(MockitoExtension.class)
class BomConfigurationControllerTest {

    @Mock private BomConfigurationService bomConfigurationService;
    @Mock private TokenService tokenService;
    private BomConfigurationController controller;

    @BeforeEach
    void setUp() {
        controller = new BomConfigurationController();
        ReflectionTestUtils.setField(controller, "bomConfigurationService", bomConfigurationService);
        ReflectionTestUtils.setField(controller, "tokenService", tokenService);
    }

    @Test
    @DisplayName("createBomConfiguration — happy path returns SUCCESS with the created detail")
    void createBomConfiguration_success() throws Exception {
        when(tokenService.getTokenPayload(any(HttpHeaders.class))).thenReturn(new TokenPayload());
        when(bomConfigurationService.createBomConfiguration(any(), any(), anyLong()))
                .thenReturn(new BomConfigurationDetailDTO());

        ApplicationResponse response = controller.createBomConfiguration(dto, headers);

        assertEquals(CommonConstants.SUCCESS, response.getStatus());
    }

    @Test
    @DisplayName("createBomConfiguration — service throws NotFoundException returns FAILED, not an exception")
    void createBomConfiguration_notFound_returnsFailedResponse() throws Exception {
        when(bomConfigurationService.createBomConfiguration(any(), any(), anyLong()))
                .thenThrow(new NotFoundException("Site not found"));

        ApplicationResponse response = controller.createBomConfiguration(dto, headers);

        assertEquals(CommonConstants.FAILED, response.getStatus());
    }
}
```

**Before writing a controller test in any given service, check that service's own
existing controller tests first** (if any) — don't default to MockMvc if the
service already has an established direct-instantiation convention, and don't
invent the catch-and-return pattern if a *different* service's controllers do use
`@ControllerAdvice` + real HTTP status codes instead. Confirm per-controller; the
convention is not guaranteed to be uniform across every controller even within one
service.

## MockMvc / `@WebMvcTest` — the general technique, where no direct-instantiation convention exists yet

Use `@WebMvcTest` when you need to verify the things direct-instantiation tests
skip: request-body deserialization, `@Valid` validation triggering, path/query
parameter binding, actual HTTP status codes, and (if present) `@ControllerAdvice`
exception mapping.

```java
@WebMvcTest(BedCategoryController.class)
class BedCategoryControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;
    @MockBean private BedCategoryService bedCategoryService;

    @Test
    void createBedCategory_blankName_returns400WithFieldError() throws Exception {
        mockMvc.perform(post("/bed-category")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors[0].field").value("name"));
    }
}
```

**Decision rule:** `@WebMvcTest` only pulls in the web layer, not the full Spring
context — much faster than `@SpringBootTest`. Use `@SpringBootTest(webEnvironment =
RANDOM_PORT)` + `TestRestTemplate`/`WebTestClient` only when you genuinely need the
full context (e.g., verifying `@InjectCTA`'s `CTAInjectionAspect` actually fires,
since that's an AOP aspect around real controller beans — a `@WebMvcTest` alone may
not activate custom `@Aspect` beans depending on configuration; verify this for the
specific aspect before relying on it).

## What a controller test should and shouldn't verify

**Should:**
- Correct HTTP status / response-status-field for success and each documented
  failure mode.
- Request parameter/body binding (right DTO fields land in the right place).
- Delegation to the correct service method with the correct arguments
  (`ArgumentCaptor` — see [java-junit-mockito.md](java-junit-mockito.md)).
- Error response *shape* — field names, structure — not just "it errored."
- Custom annotation behavior at the boundary that's specific to the controller
  layer: `@Audited`/`@Auditable` firing (verify via the audited service/repository
  being called, not by re-testing the aspect itself), `@InjectCTA` populating the
  parameter (see `custom-annotations.md`'s siteId-resolution-order note — a
  controller test that exercises `@InjectCTA` should cover: siteId from query
  param, siteId from request body fallback, and siteId absent entirely).

**Shouldn't:**
- Business logic already covered by a service-layer unit test — a controller test
  re-asserting a calculation's correctness duplicates coverage and doubles
  maintenance cost when the calculation changes.
- The aspect/framework's own internals (don't re-test that `CTAInjectionAspect`'s
  reflection-based field lookup works in general — that belongs to the aspect's
  own unit test, if any exists; the controller test just verifies the annotated
  method received a usable CTA).

## API testing with generated/autogenerated test data

Use for **broad input-shape coverage** — malformed JSON, wrong types, boundary
string lengths, unexpected extra fields — where the semantic value of the data
doesn't matter, only its shape.

```java
@ParameterizedTest
@ValueSource(strings = {"", " ", "a".repeat(256)}) // blank, whitespace-only, over max length
void createBedCategory_invalidName_rejected(String invalidName) throws Exception {
    mockMvc.perform(post("/bed-category")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(new BedCategoryDTO(invalidName))))
        .andExpect(status().isBadRequest());
}
```

**Don't** use generated/random data for anything asserting a *business-meaningful*
outcome (e.g., a discount calculation) — use realistic, deliberately chosen values
there so the expected result is traceable to a real business rule, not an
arbitrary generator seed.

## API testing using verified database-backed test data

Use when the endpoint's correctness genuinely depends on real relational state —
foreign keys, joins, aggregates that a hand-built DTO can't represent faithfully.

- Seed via Testcontainers-backed integration test (see
  [java-db-testing.md](java-db-testing.md)) with **explicit, named fixture rows**
  created in the test itself (`@BeforeEach` or a builder) — not by depending on
  Flyway seed/reference data, which can change independently of the test.
- Assert against values you set up yourself, traceable line-by-line in the test —
  never assert "whatever's currently in the dev DB," which breaks the moment
  someone else's data changes.
- This is the right layer for testing `siteId`-scoped queries end-to-end (e.g.,
  confirming a `CustomerBusinessSite` lookup genuinely filters by the injected
  CTA's `siteId` and doesn't leak cross-site data) — a pure Mockito test can't
  catch a missing `WHERE site_id = ?` clause in a real query.

## Authentication / authorization testing

- Verify a request with **no token** is rejected before it reaches business logic.
- Verify a request with a **valid token for the wrong tenant/site/resource** is
  rejected — per `rules/security.md`: never trust a `tenantId`/`siteId` from the
  request body without verifying it against the JWT; write the test that would
  catch a regression of that check.
- If `@InjectCTA`/`@Audited` participate in the authz path, cover them explicitly
  (see the "Should" list above) rather than assuming the framework wiring is
  correct.

## API response-time assertions at this layer

A quick sanity check belongs here; full load/perf testing belongs in
[java-performance-load-testing.md](java-performance-load-testing.md):

```java
@Test
void listBomConfigurations_respondsUnder500ms() {
    long start = System.nanoTime();
    controller.listBomConfigurations(pageRequest);
    long elapsedMs = (System.nanoTime() - start) / 1_000_000;
    assertThat(elapsedMs).isLessThan(500);
}
```

Keep this class of assertion generous and rare (a handful of critical endpoints) —
CI hardware variance makes tight response-time assertions in the unit-test suite
flaky. Real SLA verification belongs in a dedicated load test.
