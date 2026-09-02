---
name: abdm-integration-backend
description: Authoritative backend engineering skill for integrating ABDM (Ayushman Bharat Digital Mission) Milestones M1 (ABHA creation & verification), M2 (HIP – care context linking & health record share), M3 (HIU – consent request & record fetch), and M4 (NHPR – HPR/HFR native registration) into the Lifetrenz HIS Spring Boot microservice stack. Covers gateway session token lifecycle, request signing, Fidelius (ECDH+AES/GCM) encryption envelope, FHIR R4 bundle authoring, callback handler patterns, idempotency, async Kafka choreography, MongoDB clinical storage, PostgreSQL consent/audit storage, certification & WASA readiness, and sandbox/production environment isolation. MUST be loaded by every ABDM-touching backend agent (abdm-backend-engineer, abdm-integration-orchestrator, healthcare-backend-engineer when ABDM scope is detected) before reading, writing or modifying anything inside `abdm-integration-service/` or any service that emits / consumes ABDM data.
metadata:
  type: skill
  scope: backend
  domain: abdm
  stack: java-17, spring-boot-3.3, webclient, postgresql, mongodb, kafka, resilience4j, caffeine, fhir-r4
  audience: abdm-backend-engineer, abdm-integration-orchestrator, healthcare-backend-engineer
  loads-after: spring-enterprise-backend
---

# ABDM Integration Backend Skill

> Authoritative foundation for every ABDM-touching backend change in the Lifetrenz HIS platform.
> This skill loads **after** `spring-enterprise-backend.md` and inherits all of its baselines (Java 17, Spring Boot 3.3, ApplicationResponse envelope, Flyway, transactional safety). Where this skill and the base skill conflict, the **stricter** rule wins (ABDM is a regulated, certifiable integration with patient PHI).

---

## SECTION 1 — SKILL IDENTITY & SCOPE

This skill governs backend work that touches the National Health Authority (NHA) ABDM ecosystem:

| Milestone | NHA Scope | Lifetrenz Owner Service | Status (as of 2026-05) |
|-----------|-----------|--------------------------|------------------------|
| **M1** | ABHA Number / ABHA Address creation & verification (Aadhaar OTP, Biometric, Demographic offline, Driving License, Mobile, Profile, ABHA card/QR) | `abdm-integration-service` | scaffolded (`com.lifetrenz.abdm.controller.*Controller`), to be production-hardened |
| **M2** | HIP (Health Information Provider) – care context linking (HIP-initiated + Discovery & Link + SMS notify), consent artefact storage, health record packaging (FHIR R4), encrypted data push | `abdm-integration-service` + clinical sources (`ipd-clinical-service`, `core-service`, `clinical-workflow-service`) | to be added |
| **M3** | HIU (Health Information User) – consent request, consent grant/deny callback, record fetch, decryption, display, retention | `abdm-integration-service` + reader services | to be added |
| **M4** | NHPR – Healthcare Professional (HPID) & Healthcare Facility (HFR) native registration | `abdm-integration-service` (+ `core-service` for HFR/HPR ID storage on `provider` and `organization`) | to be added |

Every change inside `abdm-integration-service/`, and every cross-service Feign/Kafka contract that originates or terminates in that service, falls under this skill.

### Reference base URLs (NEVER hardcode — always resolve via `${abdm.base-url}` / `${abdm.abha-base-url}` / `${abdm.hiecm-base-url}`)

| Channel | Sandbox | Production |
|---------|---------|------------|
| ABHA Enrolment / Profile (M1) | `https://abhasbx.abdm.gov.in` | `https://abha.abdm.gov.in` |
| Gateway / HIE-CM (M2/M3) | `https://dev.abdm.gov.in` | `https://apis.abdm.gov.in` |
| NHPR (M4) | `https://hspsbx.abdm.gov.in` | `https://hsp.abdm.gov.in` |

Sandbox vs production credentials, base URLs, and certificate material come from **Spring Cloud Config Server** keyed by Spring profile (`dev`, `sit`, `v2qa`, `uat`, `prod`). Never read them from `application.yml` checked into the repo.

---

## SECTION 2 — VERIFIED LOCAL SERVICE LAYOUT

The owner service exists at `D:\Workspace\Claude\abdm-integration-service\`. Always preserve its conventions:

```
com.lifetrenz.abdm
├── audit/            @Audited annotation + AuditAspect AOP
├── client/           WebClient wrappers (AbdmTokenManager, AbdmEnrolmentClient, …)
├── config/           AsyncConfig, CacheConfig, JpaConfig, OpenApiConfig, WebClientConfig
├── controller/       REST controllers — base path /api/v3/abdm
├── dto/              Request/Response DTOs + ApplicationResponse + TokenPayload
├── dto/hiecm/        HIE-CM (gateway) payload shapes — M2/M3 lives here
├── entity/           JPA entities (Auditable + soft delete via @SQLDelete)
├── exception/        Exception hierarchy + GlobalExceptionHandler
├── mapper/           MapStruct mappers
├── repository/       I-prefixed Spring Data JPA repositories
├── service/          Interfaces + impl/ subpackage
└── util/             AbdmApiConstant, SensitiveDataMasker
src/main/resources/db/migration/V{N}__*.sql   (Flyway, history table abdm_flyway_history)
```

**Mandatory conventions** (copy these for every new file you author):

- Repository interfaces ALWAYS use the `I` prefix (`IConsentArtefactRepository`, `IHipNotificationRepository`).
- Every `@Service` and `@Repository` is annotated `@Lazy` to defeat circular-dep traps observed at boot.
- Impl classes are `@Component @Lazy`, NOT `@Service` (interface already carries `@Service`).
- All responses wrapped in `ApplicationResponse.success(message, data)` / `ApplicationResponse.error(code, message)`. Never return raw entities, raw lists, or `Map<String,Object>`.
- Controllers extract `TokenPayload` via `tokenService.getTokenPayload(headers)` from `HttpHeaders` — never trust the body.
- Every public controller method carries `@Audited(action="…", description="…")` so the `AuditAspect` writes an `abdm_audit_log` row.
- Entities (except `AuditLog` and `AbdmTokenCache`) extend `Auditable` to inherit `createdBy/createdAt/updatedBy/updatedAt/active`.
- Table prefix is `abdm_` (no exceptions).
- DTOs validate with Jakarta annotations (`@NotBlank`, `@Pattern`, `@Size`); business validation happens in service layer.
- Lombok everywhere: `@Data`, `@Builder`, `@RequiredArgsConstructor`, `@Slf4j`.

---

## SECTION 3 — GATEWAY SESSION TOKEN LIFECYCLE

The gateway token (`/v0.5/sessions`) is the auth principal for nearly every M2/M3/M4 call. Mishandling it is the #1 cause of sandbox/prod outages.

### Token rules

1. The token is cached in **`abdm_token_cache`** (PostgreSQL) and in `Caffeine#abdm-tokens` (TTL 25 min, max 100 entries). The DB row exists to survive pod restarts; Caffeine exists to avoid hot-path DB hits.
2. `AbdmTokenManager` is the **only** class allowed to mint, refresh, or read the gateway token. Every `client/` class injects it.
3. Refresh interval: `abdm.token.refresh-interval-ms = 1500000` (25 min). The token is technically valid 30 min — never let it age beyond 25 min in cache. A `@Scheduled` refresher runs at 24 min.
4. On `401 invalid_token` from any downstream call, the calling client invokes `AbdmTokenManager.invalidateAndRefresh()` once, then **retries exactly once**. Never retry on `401` more than once — that masks credential rotation.
5. Tokens are **per-environment**; never carry a sandbox token into a production WebClient bean. The Spring profile drives the WebClient bean's base URL.
6. Tokens must NEVER be logged. `SensitiveDataMasker` masks `Authorization`, `X-Token`, `accessToken`, `refreshToken`, `aadhaar`, `mobile`, `otp` before any log emission.

### Mandatory headers on outbound calls

| Header | When | Source |
|--------|------|--------|
| `Authorization: Bearer <gateway-token>` | every gateway call | `AbdmTokenManager` |
| `X-CM-ID` | M2/M3 gateway calls — value is `sbx` (sandbox) or the assigned CM suffix in prod | config |
| `X-HIP-ID` | M2 callbacks initiated by us as HIP | facility-mapped HFR ID |
| `X-HIU-ID` | M3 callbacks initiated by us as HIU | facility-mapped HFR ID |
| `REQUEST-ID` | every gateway call — fresh UUID v4 | `UUID.randomUUID().toString()` |
| `TIMESTAMP` | every gateway call — ISO-8601 UTC, ms precision | `Instant.now()` |

`REQUEST-ID` is **echoed** in the async callback; we use it as the correlation key on the `abdm_callback_pending` table (keyed transaction record). Without it, async reconciliation breaks.

---

## SECTION 4 — ENCRYPTION ENVELOPE (FIDELIUS / ECDH + AES-256-GCM)

M2 (HIP outbound) and M3 (HIU inbound) require the NHA-mandated Fidelius envelope:

1. **Key pair**: Curve25519 / X25519. Generate per request (`KeyMaterial` includes `cryptoAlg=ECDH`, `curve=Curve25519`, `dhPublicKey`, `nonce`).
2. **Nonce**: 32-byte random per request, base64-encoded.
3. **Shared secret**: HKDF-derive from HIU public key + HIP private key (or vice versa for the inverse direction), salted with XOR of the two nonces.
4. **Cipher**: AES-256-GCM, IV = first 12 bytes of derived key material as per Fidelius CLI; tag length 128 bits; AAD empty.
5. **Output envelope** (the JSON the gateway expects):
   ```json
   {
     "keyMaterial": {
       "cryptoAlg": "ECDH",
       "curve": "Curve25519",
       "dhPublicKey": { "expiry": "...", "parameters": "Curve25519/32byte random key", "keyValue": "<base64>" },
       "nonce": "<base64>"
     },
     "encryptedData": "<base64 ciphertext>"
   }
   ```
6. **Implementation**: prefer pulling the official `fidelius-cli` JAR as a Maven dependency. If not available, use Bouncy Castle (`bcprov-jdk18on`) with the helper class `com.lifetrenz.abdm.util.FideliusCryptoUtil` (to be authored when M2 starts). NEVER reimplement curve math by hand.
7. **Private keys** live ONLY in the JVM heap or HSM-fronted KeyStore. Never persist private keys to PostgreSQL or log them. Public keys may be cached in `abdm_key_material` for 5 minutes (the NHA contract).
8. **Test vectors**: every encryption code path ships with unit tests using NHA's published test vectors so a Bouncy Castle upgrade can't silently break decryption.

---

## SECTION 5 — MILESTONE-SPECIFIC IMPLEMENTATION PLAYBOOKS

### 5.1 — M1: ABHA Creation & Verification

**Already scaffolded.** Patterns to preserve when extending:

- Aadhaar number is encrypted client-side with NHA's published RSA public key BEFORE leaving Angular; backend stores **nothing**. The `EnrolmentService` accepts the encrypted blob and forwards it verbatim.
- The Aadhaar Verhoeff checksum must be verified on the **backend** before calling NHA (don't trust the Angular validator alone).
- `OtpTransaction` rows are pruned daily by `OtpTransactionCleanupJob` after 24 h — never extend retention.
- Profile data returned by NHA after OTP verification is persisted in `abdm_abha_profile` and indexed by `abha_number` + `abha_address`. NHA-issued ABHA number formatted with hyphens (`XX-XXXX-XXXX-XXXX`) — store unhyphenated as 14-digit numeric and format on read.
- "Default ABHA Address" suggestions are stateless GET — never cache.
- ABHA card and QR are PNG byte streams; return with `MediaType.IMAGE_PNG_VALUE` and `Content-Disposition: attachment` headers.
- Verification flows (mobile OTP / Aadhaar OTP / scan QR) MUST mark the patient as `new` vs `returning` based on `abdm_abha_profile.exists(abhaNumber)` — front-end relies on that flag to skip vs show the registration form.

### 5.2 — M2: HIP (Care Context Linking + Record Share)

Two linking scenarios from NHA docs — implement both:

- **Scenario 1 — HIP-initiated linking** (patient shared ABHA address during registration): on every new clinical event, call `POST /v0.5/links/link/add-contexts` with the saved `linkingToken`. The `linkingToken` was obtained during the patient's M1 verification and is stored on `abdm_abha_address.linking_token_cipher` (encrypted at rest via Jasypt with the service KEK).
- **Scenario 2 — Discovery & Link** (no ABHA on file): when a clinical event lands without an ABHA link, call `POST /v0.5/patients/sms/notify` to trigger the deep-link SMS. The patient initiates discovery from their PHR app; we respond on `/v0.5/care-contexts/discover` and `/v0.5/links/link/init` callbacks.

**Care context shape** (canonical):
```json
{
  "patient": { "referenceNumber": "<MRN>", "display": "<patient name>", "careContexts": [
    { "referenceNumber": "<encounterId>", "display": "<OP Visit on 2026-05-21>" }
  ], "hiType": "OPConsultation", "count": 1 }
}
```

**Health record packaging** — every HI Type below must produce a FHIR R4 bundle conforming to https://nrces.in/ndhm/fhir/r4/index.html. Implement all of them; NHA marks all mandatory:

| HI Type code | Bundle profile root | Authored from |
|--------------|--------------------|---------------|
| `Prescription` | `PrescriptionBundle` | `ipd-clinical-service.prescription` |
| `DiagnosticReport` | `DiagnosticReportBundle` | `lab` (ipd-clinical) + `radiology` |
| `OPConsultation` | `OPConsultRecordBundle` | `opd clinical` + casesheet |
| `DischargeSummary` | `DischargeSummaryRecordBundle` | `ipd-service.workflow.discharge` |
| `ImmunizationRecord` | `ImmunizationRecordBundle` | `ipd-clinical.immunization` |
| `HealthDocumentRecord` | `HealthDocumentRecordBundle` | uploaded docs (`core-service.document`) |
| `WellnessRecord` | `WellnessRecordBundle` | wellness metrics |
| `Invoice` | `InvoiceBundle` | `core-service.billing` |

Two acceptable bundle shapes: (a) `simple bundle + PDF/IMG attachment` (allowed for early integrators), (b) `structured FHIR bundle with coded resources`. **NHA requires migration to (b) within two years of certification** — write the bundler abstracted behind `FhirBundleBuilder` so we can flip per HI type without touching callers.

**Record share flow** (driven by HIU):
```
HIU → Gateway: POST /v0.5/health-information/cm/request
Gateway → HIP: POST {our}/v0.5/health-information/hip/request   ← async callback we handle
HIP → Gateway: POST /v0.5/health-information/hip/on-request
HIP → HIU.dataPushUrl: POST <dataPushUrl>  with encrypted bundle
HIP → Gateway: POST /v0.5/health-information/notify  status=TRANSFERRED|FAILED
```

Persist every step in `abdm_health_information_request` (PostgreSQL) for audit + retry. Status transitions: `RECEIVED → DATA_FETCHED → ENCRYPTED → TRANSFERRED | FAILED`. **TRANSFERRED notifications are non-negotiable** — NHA WASA penalises missing notifies.

### 5.3 — M3: HIU (Consent Request + Record Fetch)

Endpoints we ORIGINATE (call out to gateway):

| Endpoint | Purpose |
|----------|---------|
| `POST /v0.5/consent-requests/init` | raise consent request for an ABHA address |
| `GET /v0.5/consent-requests/{id}` | poll status (avoid; prefer callback) |
| `POST /v0.5/health-information/cm/request` | request the records once consent is GRANTED |

Endpoints we RECEIVE (callbacks the gateway POSTs to us):

| Endpoint | Purpose |
|----------|---------|
| `/v0.5/consent-requests/on-init` | consent request accepted by CM, returns `consentRequestId` |
| `/v0.5/consents/hiu/notify` | consent state changed: `GRANTED` (with `consentArtefacts[]`) or `DENIED` / `REVOKED` / `EXPIRED` |
| `/v0.5/consents/on-fetch` | the consent artefact body |
| `/v0.5/health-information/hiu/on-request` | gateway acknowledged our record request |
| `<our>/dataPushUrl` | HIP pushes the encrypted FHIR bundle here |
| `/v0.5/health-information/notify` | HIP confirms transfer status |

**Storage**:

- `abdm_consent_request` (PostgreSQL) — our outgoing request lifecycle.
- `abdm_consent_artefact` (PostgreSQL) — the GRANTED artefact JSON, signed by CM, kept for full lifetime + 7 years per HDM policy.
- Decrypted FHIR bundles land in **MongoDB** collection `abdm_fetched_health_records` (in `ipd-clinical-service.cluster` if we already share that Mongo, or a new `clinical_abdm` DB). Keys are `(consentArtefactId, careContextReference, hiType)`.

**Meta codes** the UI must let the user select when creating consent:

- `purpose`: `CAREMGT | BTG | PUBHLTH | HPAYMT | DSRCH | PATRQT` (subset from HL7 `v3-PurposeOfUse`).
- `hiTypes`: any of the 8 HI types above (multi-select).
- `dateRange.from/to`, `dataEraseAt`, `frequency` (`HOURLY/DAILY/etc.`), `hips[]` (filter by facility).

**Consent artefact verification** — every `GRANTED` artefact MUST have its signature verified using CM's published public key BEFORE we trust it. We never act on an unsigned/invalid artefact. The verifier lives at `com.lifetrenz.abdm.util.ConsentArtefactVerifier`.

### 5.4 — M4: NHPR (HPR + HFR)

After M1+M2+M3 are certified, NHA assigns the `HPID` and `HFR` roles to our client-id. M4 then enables:

- HPR (Healthcare Professional Registry) — register doctors, nurses, ayush, dentists. Endpoints under `${abdm.hpr-base-url}/api/v1/professional/...`.
- HFR (Health Facility Registry) — register hospitals, clinics, labs, pharmacies, bloodbanks. Endpoints under `${abdm.hfr-base-url}/api/v1/facility/...`.

**Storage extensions** (do NOT duplicate provider/facility data — extend the existing tables):

- `core-service.provider` gets `hpr_id` (varchar 50, unique nullable), `hpr_status` (`DRAFT | PENDING | VERIFIED | REJECTED`), `hpr_synced_at`.
- `core-service.organization` (facility) gets `hfr_id`, `hfr_status`, `hfr_synced_at`.

These additions live as Flyway migrations in `core-service/db-migration/`, NOT `abdm-integration-service/`. The orchestration of "create provider locally → register at HPR → store the assigned ID" is owned by `abdm-integration-service` calling `core-service` over Feign — never direct DB.

NHPR portal URL for documentation: https://hspsbx.abdm.gov.in/home → Resource Center → API Documentation.

---

## SECTION 6 — CALLBACK / ASYNC HANDLING

ABDM is callback-heavy. Every async leg must:

1. Accept the callback on a `@PostMapping` controller method that returns HTTP 202 within 100 ms. Heavy work goes to a Kafka topic for the worker pool.
2. Persist the inbound payload to `abdm_callback_event` (Mongo collection in `ipd-clinical-service` cluster — JSON shape is dynamic) with `(requestId, callbackType, receivedAt, processed=false)`.
3. Publish to Kafka topic `abdm.callback.<callbackType>` with manual-immediate ACK (matches our Kafka standard).
4. Idempotency: incoming `requestId` is the natural key. Duplicate callbacks are acknowledged with 202 but skipped (`abdm_idempotency_key` ensures this).
5. Reconcile: a `@Scheduled(fixedDelay = 60000)` job promotes `processed=false` rows older than 5 min to retry.
6. Failure: after 3 consumer retries the row moves to `abdm_callback_dead_letter` and Slack alerts go via the existing `notification-service`.

Callback URLs we expose to NHA:

```
https://<our-public-gw>/api/v3/abdm/callback/m1/auth-otp
https://<our-public-gw>/api/v3/abdm/callback/m2/care-contexts/on-discover
https://<our-public-gw>/api/v3/abdm/callback/m2/links/link/on-init
https://<our-public-gw>/api/v3/abdm/callback/m2/links/link/on-confirm
https://<our-public-gw>/api/v3/abdm/callback/m2/health-information/hip/request
https://<our-public-gw>/api/v3/abdm/callback/m3/consent-requests/on-init
https://<our-public-gw>/api/v3/abdm/callback/m3/consents/hiu/notify
https://<our-public-gw>/api/v3/abdm/callback/m3/consents/on-fetch
https://<our-public-gw>/api/v3/abdm/callback/m3/health-information/hiu/on-request
https://<our-public-gw>/api/v3/abdm/callback/m3/data-push/{transactionId}
https://<our-public-gw>/api/v3/abdm/callback/m3/health-information/notify
```

Register these in the integrator dashboard exactly once per environment. Changing them mid-cycle invalidates certification.

---

## SECTION 7 — DATA PROTECTION & PHI HANDLING

ABDM operates under NHA's Health Data Management Policy. Every change must:

- **Never log PHI** — Aadhaar (full or partial), ABHA number, mobile, OTP, name, DOB, gender, address. `SensitiveDataMasker` regex set covers all of these; extend the regex when adding new fields.
- **Encrypt at rest** — linking tokens, refresh tokens, consent artefact signatures, and any patient identifier stored alongside ABDM data MUST be encrypted using Jasypt with the service KEK loaded from config server. PostgreSQL columns holding ciphertext are suffixed `_cipher`.
- **Patient data minimisation** — when building FHIR bundles, include only the fields the HI Type profile requires. Do not opportunistically include extra IPD fields.
- **Consent scope** — when fetching records as HIU, the FHIR resources downloaded are stored under the `consentArtefactId` and **deleted at `dataEraseAt`** (a `@Scheduled` purger runs hourly).
- **Audit log** — every controller method writes one row to `abdm_audit_log` via `@Audited`. The row contains `action, description, principal, requestId, durationMs, status`. No PHI in the description.

---

## SECTION 8 — TESTING & CERTIFICATION

NHA certification gates:

1. **Functional Testing (NHA Team)** — record a video against the WASA test plan, share with `abdm.texp1@nha.gov.in` (and `facility.abdm@nha.gov.in` for M4).
2. **WASA Security Audit** — CERT-In empanelled vendor. The audit report + VAPT report must be attached to the integrators dashboard.
3. **HTC Demo** — Health Tech Committee live demo. Failures here block production credentials.

Local test bar (every change PR must pass):

- Contract tests against the NHA Postman collection for the touched milestone — run via WireMock with recorded responses (`src/test/resources/abdm/mocks/M{n}/...`).
- Integration tests with TestContainers — Postgres + Kafka + Mongo + WireMock. Real callback round trips.
- Encryption test vectors — pinned to NHA's published Fidelius CLI fixtures.
- Negative tests — 401 token expiry, signature mismatch, expired consent artefact, malformed FHIR bundle.

Never disable a test to make CI green. Open a ticket and tag `abdm-integration-orchestrator`.

---

## SECTION 9 — INTER-SERVICE CONTRACT RULES

`abdm-integration-service` does NOT own patient or clinical data. It ALWAYS goes through:

- `core-service` (Feign) — patient lookup, provider lookup, facility lookup.
- `ipd-clinical-service` (Feign) — clinical artefacts to package into FHIR bundles.
- `clinical-workflow-service` (Feign) — workflow trigger events for HIP-initiated linking.
- `ipd-service` (Feign) — billing/invoice records for the `Invoice` HI type.
- `notification-service` (Kafka) — async SMS / app push to the patient and clinician.

**No direct cross-service DB access. Ever.** If a needed read isn't exposed on Feign, add the Feign endpoint on the owner service first (delegate via `healthcare-backend-engineer`).

Outbound Kafka topics this service publishes:

| Topic | Payload | Consumer |
|-------|---------|----------|
| `abdm.linking.completed` | `{abhaAddress, mrn, careContextRef, linkedAt}` | `core-service` patient timeline |
| `abdm.consent.granted` | `{consentArtefactId, abhaAddress, hiTypes[], fromTo, hips[]}` | `clinical-workflow-service` |
| `abdm.records.received` | `{consentArtefactId, careContextRef, hiType, fhirRefs[]}` | `ipd-clinical-service` for stitching into the EHR view |
| `abdm.audit` | every controller call | `audit-service` long-term retention |

Inbound Kafka topics this service consumes:

| Topic | Producer | Purpose |
|-------|----------|---------|
| `clinical.event.created` | `ipd-clinical-service`, `clinical-workflow-service` | trigger HIP-initiated linking |
| `patient.registered.with.abha` | `core-service` | save `linkingToken` for later HIP links |
| `billing.invoice.finalised` | `core-service.billing` | emit Invoice HI type bundle on demand |

---

## SECTION 10 — DON'T-DO LIST

These are repeat-offender mistakes from prior NHA-integrating teams. Avoid all:

1. ❌ **Do NOT** store Aadhaar number, even encrypted. Forwarding the NHA-encrypted blob is fine; persisting is a compliance breach.
2. ❌ **Do NOT** treat `linkingToken` as plaintext. Encrypted at rest, encrypted in logs.
3. ❌ **Do NOT** chain synchronous calls across more than two services in a single request. ABDM flows are async by design — model them with Kafka, not nested Feign calls.
4. ❌ **Do NOT** assume callback ordering. `on-init` may arrive AFTER `on-confirm` under retry. State machine must be order-tolerant.
5. ❌ **Do NOT** put environment-specific URLs in `application.yml`. Always via Spring profile + config server.
6. ❌ **Do NOT** call NHA endpoints from any service other than `abdm-integration-service`. All other services request via Feign to us.
7. ❌ **Do NOT** invent your own consent artefact schema. Use exactly what CM signs.
8. ❌ **Do NOT** retry the gateway endlessly. Resilience4j `abdmApiRetry` caps at 3 with exponential backoff. After that, persist a `FAILED` row and emit an alert.
9. ❌ **Do NOT** package PHI inside Kafka messages on topics that other-service consumers read. Pass references only; the consumer pulls via Feign.
10. ❌ **Do NOT** disable signature verification on a consent artefact "to unblock dev". Use a known-good NHA test artefact in sandbox.

---

## SECTION 11 — CHANGE WORKFLOW

Before writing or modifying ABDM backend code:

1. **Re-read** the relevant section of this skill.
2. **Inspect** `abdm-integration-service/AGENT_GUIDE.md` for any updates since this skill was written.
3. **Verify** the target schema against the live PostgreSQL (`v2qa_core` / `sit_core` / etc. via the appropriate MCP) — never assume column types.
4. **Sketch** the request → gateway → callback → Kafka → reader flow, on paper or in the PR description.
5. **Author** in this order: Flyway migration → entity → repository → DTO → client (WebClient) → service → controller → mapper → tests.
6. **Add** the new callback URL to the integrators-dashboard ticket list (if any new URL).
7. **Run** the test bar from Section 8.
8. **Update** `AGENT_GUIDE.md` and this skill if a new convention was introduced (escalate to the orchestrator agent).

Every PR description for ABDM work MUST answer:

- Which milestone(s)?
- Which gateway endpoints touched (in/out)?
- New tables/columns/migrations?
- PHI surface change?
- New Kafka topic / Feign endpoint?
- Sandbox tested? WASA-relevant? Certification regression risk?

If you can't answer any of the above, you're not ready to merge.
