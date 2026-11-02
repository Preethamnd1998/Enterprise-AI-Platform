---
name: abdm-integration-frontend
description: Authoritative Angular frontend skill for ABDM patient-facing and clinician-facing flows across Milestones M1 (ABHA creation & verification), M2 (consent capture + care context awareness for HIP), M3 (consent request + records view as HIU), and M4 (HPR / HFR registration screens). Covers Aadhaar/Mobile OTP UX, NHA consent language enforcement, ABHA QR scan + decode, ABHA card download, KYC consent overlay, consent artefact viewer, records timeline, scan-and-share, accessibility (WCAG 2.1 AA per NHA guidelines), error/empty/loading states, and the precise endpoint contract consumed from abdm-integration-service. MUST be loaded by every ABDM-touching Angular agent (abdm-ui-engineer, abdm-integration-orchestrator, angular-healthcare-ui when ABDM scope is detected) before changing any component under lifetrenz-core that talks to abdm-integration-service.
metadata:
  type: skill
  scope: frontend
  domain: abdm
  stack: angular-17, primeng, rxjs, ngrx-signals, scss
  audience: abdm-ui-engineer, abdm-integration-orchestrator, angular-healthcare-ui
  source: "Reclassified from shared/knowledge/custom-flows/abdm/abdm-integration-frontend.md
    (already had skill-shaped frontmatter but wasn't named SKILL.md or under shared/skills/, so
    it was invisible to Claude Code's/OpenCode's actual skill scanner) during the 2026-10-13
    shared/skills + shared/knowledge + shared/standards reorganization. The original
    loads-after: angular-enterprise-ui field has been removed: no skill or agent named
    angular-enterprise-ui exists anywhere in this platform (dangling reference), and loads-after
    is not a field either Claude Code's or OpenCode's skill loader reads anyway - it was inert
    metadata. See shared/standards/frontend/angular.md for the actual Angular baseline
    conventions this skill builds on; see shared/reports/ for the full audit."
---

# ABDM Integration Frontend Skill

> Authoritative foundation for every ABDM-related Angular change in the Lifetrenz HIS platform.
> This skill inherits the baselines in `shared/standards/frontend/angular.md` — read that
> standard first. Where this skill and that standard conflict, the **stricter** rule wins — ABDM
> screens are seen by NHA assessors during HTC demo and by patients sharing PHI.

---

## SECTION 1 — IDENTITY & SCOPE

This skill governs every Angular surface that:

- Collects identity input intended for NHA (Aadhaar, ABHA address, mobile, DL number).
- Renders consent language to a patient or healthcare worker.
- Displays ABHA profile data, ABHA card image, ABHA QR code.
- Captures or displays a consent request / artefact / status.
- Renders records fetched as HIU (FHIR bundles + PDF attachments).
- Provides HPR / HFR self-service or assisted registration.
- Embeds the ABHA QR scanner (camera) for verification or scan-and-share.

These surfaces live under `lifetrenz-core/src/app/abdm/` (to be created as a feature module — do NOT scatter them across `patient/`, `appointment/`, etc.). One feature module → many lazy-loaded sub-routes.

---

## SECTION 2 — FEATURE MODULE LAYOUT

```
lifetrenz-core/src/app/abdm/
├── abdm-routing.module.ts                 // lazy-load child routes
├── abdm.module.ts                         // declares shared ABDM components, providers
├── shared/
│   ├── components/
│   │   ├── consent-overlay/               // mandatory NHA consent text card
│   │   ├── aadhaar-input/                 // 12-digit input + Verhoeff hint
│   │   ├── otp-input/                     // 6-digit OTP w/ resend timer
│   │   ├── abha-card-viewer/              // PNG card preview + download
│   │   ├── abha-qr-scanner/               // camera scanner (zxing-ngx-scanner)
│   │   ├── hi-types-multiselect/          // 8 HI Types per NHA spec
│   │   ├── purpose-of-use-select/         // 6 purposes per HL7 subset
│   │   └── consent-summary-card/          // reusable display of a consent artefact
│   ├── directives/
│   │   └── mask-phi.directive.ts          // mask Aadhaar / ABHA / mobile when blur
│   ├── pipes/
│   │   ├── abha-number.pipe.ts            // formats XX-XXXX-XXXX-XXXX
│   │   └── abha-mask.pipe.ts              // X•••••••XXX form for read-only views
│   ├── models/                            // strict TS types matching backend DTOs
│   ├── services/
│   │   ├── abdm-api.service.ts            // all REST calls — only this talks HTTP
│   │   ├── abdm-state.service.ts          // NgRx Signals store for enrolment txn
│   │   ├── abdm-error.service.ts          // NHA error code → user message
│   │   ├── abha-qr-decoder.service.ts     // decode QR JSON envelope
│   │   └── abdm-config.service.ts         // exposes env URLs + feature flags
│   ├── interceptors/
│   │   └── abdm-correlation.interceptor.ts // adds X-Correlation-Id, X-Tenant-Id
│   └── guards/
│       └── abdm-feature.guard.ts          // checks tenant flag abdm.enabled
├── m1-enrolment/                          // ABHA creation (M1)
│   ├── enrolment.routes.ts
│   ├── pages/
│   │   ├── method-picker.page.ts          // Aadhaar OTP / Biometric / Demographic / DL
│   │   ├── aadhaar-otp.page.ts
│   │   ├── aadhaar-biometric.page.ts
│   │   ├── aadhaar-demographic.page.ts
│   │   ├── driving-license.page.ts
│   │   ├── abha-address.page.ts           // suggestions + create
│   │   ├── download-card.page.ts
│   │   └── profile-edit.page.ts
├── m1-verification/                       // ABHA / ABHA Address verification at patient reg
│   └── pages/
│       ├── scan-facility-qr.page.ts       // user scans facility QR (mandatory NHA test)
│       ├── scan-abha-qr.page.ts           // staff scans patient's ABHA QR
│       ├── otp-verify.page.ts             // verify via OTP path
│       └── new-vs-returning.page.ts       // mandatory branching screen
├── m2-care-context/                       // HIP linking screens
│   ├── pages/
│   │   ├── linking-status.page.ts         // shows on patient profile
│   │   ├── notify-mobile.page.ts          // trigger SMS flow
│   │   └── consent-language-preview.page.ts
├── m3-consent/                            // HIU consent + records
│   ├── pages/
│   │   ├── new-consent-request.page.ts    // doctor raises consent
│   │   ├── consent-status.page.ts         // tracks REQUESTED / GRANTED / DENIED / REVOKED
│   │   ├── consent-artefact-detail.page.ts
│   │   ├── records-timeline.page.ts       // unified timeline of fetched FHIR data
│   │   ├── records-by-encounter.page.ts
│   │   └── record-pdf-viewer.page.ts
└── m4-nhpr/
    ├── pages/
    │   ├── hpr-self-registration.page.ts  // doctor/nurse self
    │   ├── hpr-assisted-registration.page.ts  // staff registers a provider
    │   ├── hfr-facility-registration.page.ts
    │   └── nhpr-status-dashboard.page.ts
```

**Lazy-load everything.** Each milestone is its own route bundle. Do NOT pull `m3-consent` into the main bundle.

---

## SECTION 3 — BACKEND CONTRACT (single source of truth)

Every HTTP call goes through `AbdmApiService`. Never `HttpClient` directly in a component. The contract:

Base path: `/api/v3/abdm` (proxied through `lifetrenz-gateway` to `abdm-integration-service`).

Response envelope (always):
```ts
interface ApplicationResponse<T> {
  status: 'SUCCESS' | 'ERROR';
  code: string;            // backend code, e.g. 'OTP_INVALID', 'ABHA_NOT_FOUND'
  message: string;         // human-safe message (Hindi/English per locale)
  data: T | null;
}
```

`AbdmApiService` exposes typed RxJS methods that unwrap `data` on `SUCCESS` and `throw` on `ERROR` so component code stays imperative-free.

Method group → backend endpoint groups (mirror `AbdmApiConstant.java`):

```ts
// M1
enrolment.initAadhaarOtp(req: AadhaarOtpInitReq): Observable<EnrolTxn>
enrolment.verifyAadhaarOtp(req: AadhaarOtpVerifyReq): Observable<EnrolTxn>
enrolment.completeAadhaarEnrolment(req: AadhaarCompleteReq): Observable<AbhaProfile>
enrolment.initMobileOtp(req): Observable<EnrolTxn>
enrolment.verifyMobileOtp(req): Observable<EnrolTxn>
enrolment.getEnrolmentDetails(txnId: string): Observable<AbhaProfile>
enrolment.getAddressSuggestions(txnId: string): Observable<string[]>
enrolment.createAbhaAddress(req): Observable<AbhaProfile>

auth.init(req): Observable<AuthInitResp>
auth.verifyOtp(req): Observable<AuthVerifyResp>
auth.loginByAbhaNumber(req): Observable<AbhaProfile>
auth.loginByAbhaAddress(req): Observable<AbhaProfile>

profile.fetch(xToken: string): Observable<AbhaProfile>
profile.getByAbhaNumber(num): Observable<AbhaProfile>
profile.getByAbhaAddress(addr): Observable<AbhaProfile>
profile.update(req): Observable<AbhaProfile>
profile.getCardPng(): Observable<Blob>
profile.getQrPng(): Observable<Blob>

address.create(req)
address.check(req): Observable<{available: boolean}>
address.getSuggestions(txnId)
address.list(abhaNumber)

// M2
link.careContext(req): Observable<LinkAck>
link.delinkCareContext(req): Observable<LinkAck>
link.listContexts(abhaNumber): Observable<CareContext[]>

// M3
consent.init(req: NewConsentReq): Observable<ConsentTxn>           // POST /m3/consent-requests/init
consent.status(consentReqId): Observable<ConsentStatus>
consent.listArtefacts(filters): Observable<ConsentArtefact[]>
records.fetch(consentArtefactId): Observable<HealthRecordTimelineEntry[]>
records.viewBundle(entryId): Observable<FhirBundle | PdfAttachment>

// M4
nhpr.hprSelfInit(req): Observable<HprTxn>
nhpr.hprAssistedRegister(req): Observable<ProviderHprResp>
nhpr.hfrRegister(req): Observable<FacilityHfrResp>
nhpr.status(): Observable<NhprStatusSummary>
```

**Do NOT** call NHA directly from Angular. The Aadhaar / OTP / consent payloads cross **only** through `abdm-integration-service`. The one exception: **encryption of Aadhaar/mobile/OTP before submit** uses NHA's published RSA public key inside the browser (see Section 5).

---

## SECTION 4 — STATE MANAGEMENT (NgRx Signals)

ABDM flows are wizard-shaped and survive page refreshes. Use NgRx Signal Stores. One store per milestone:

```ts
// m1-enrolment.store.ts
{
  txnId: signal<string | null>(null),
  method: signal<'AADHAAR_OTP' | 'BIO' | 'DEMO' | 'DL' | null>(null),
  step: signal<'METHOD' | 'OTP' | 'MOBILE' | 'PROFILE' | 'ADDRESS' | 'CARD' | 'DONE'>('METHOD'),
  profile: signal<AbhaProfile | null>(null),
  errors: signal<NhaErrorEntry[]>([]),
  // computed
  canProceedToProfile: computed(() => this.txnId() && this.step() === 'OTP' && !this.errors().length)
}
```

Persist the store to `sessionStorage` (NOT localStorage — wizard state is single-tab) with a transient encryption key (random per session) so a hostile bookmarklet can't read the txnId. The `abdm-state.service` exposes `restoreFromSession()` and is called from each wizard page's `ngOnInit`.

When the wizard completes OR the route changes outside `/abdm/m1/*`, clear the store.

---

## SECTION 5 — CLIENT-SIDE ENCRYPTION OF SENSITIVE FIELDS

Per NHA spec, **Aadhaar number, OTP, and mobile number must be RSA-encrypted in the browser** before they reach `abdm-integration-service`. Even though TLS protects transit, NHA explicitly requires this.

Implementation:

- NHA publishes the RSA public certificate at `/v0.5/certs` (cached at `abdm-config.service` for the lifetime of the SPA load).
- `abdm-crypto.service` exposes `encrypt(value: string): string` using JSEncrypt (RSA OAEP, SHA-256). Add `jsencrypt` to `package.json` (BSD-2).
- Validation must happen BEFORE encryption (Aadhaar Verhoeff, mobile regex `^[6-9]\d{9}$`). Never encrypt an invalid value — the round trip wastes a backend call.
- After encryption, plaintext is overwritten with `'***'` in the form model and is **never** logged.
- `mask-phi` directive auto-masks the displayed value on blur for any input named `aadhaar`, `mobile`, `otp`.

---

## SECTION 6 — NHA CONSENT LANGUAGE ENFORCEMENT

NHA mandates exact consent text wording per integration role:

- **Government applications** keep the word "government" in the consent paragraph.
- **Private applications must remove** the word "government". The Lifetrenz HIS is a private/operator application — confirm this with the tenant config before rendering. The `abdm-config.service` exposes `isGovernmentDeployment: boolean`.

The consent text is stored in `assets/i18n/abdm-consent.{lang}.json` per locale (en, hi, ta, te, kn, ml, mr, bn, gu) and is loaded by the `consent-overlay` component.

**Do NOT** allow the user to skip the consent overlay. Use a PrimeNG `p-dialog` with `[closable]="false"` and a single primary action ("I Agree") that becomes enabled only after the user has actually scrolled to the bottom (use an `IntersectionObserver` on a sentinel `<div>` at the end of the text).

---

## SECTION 7 — UX RULES PER MILESTONE

### 7.1 M1 (Enrolment & Verification)

- Aadhaar input: render as 4-4-4 digit groups (`____-____-____`) with `inputmode="numeric"`. Do not show the Aadhaar back to the user after submit.
- OTP input: 6 separate single-char inputs with auto-advance; resend button disabled for 60s; allowed up to 2 resends before forcing back to step 1 (NHA spec).
- Aadhaar-linked mobile mismatch flow: if NHA returns `MOBILE_MISMATCH`, slide in a second OTP step for the user-entered mobile. Don't restart the wizard.
- ABHA address suggestions: server-driven, 5 chips. Allow custom edit but always re-validate via `address.check`.
- ABHA card download: `Blob` → `URL.createObjectURL` → `<a download>` click. Revoke URL on next tick.
- **Mandatory verification UX**: "New vs Returning Patient" screen MUST appear after successful verification and offer two paths (Continue Registration / Skip — Patient Already Registered). NHA tests for this exactly.

### 7.2 M2 (Care Context Linking)

- Patient profile sidebar shows `Linked: ✔ <count> contexts` or `Not linked` with a "Link Now" button that triggers `link.careContext` for the latest encounter.
- If linking fails because `linkingToken` is expired, surface a non-blocking toast "Patient needs to re-authenticate ABHA — send SMS?" → triggers `notify-mobile` flow.
- Consent language preview is mandatory in clinician's pre-link UI per NHA. Do not hide it behind a tooltip.

### 7.3 M3 (Consent + Records)

- New consent request form: patient ABHA address (validated via `auth.loginByAbhaAddress` lookup), `purposeOfUse` (single-select), `hiTypes` (multi-select with all 8 default-checked but editable), `dateRange.from/to` (mandatory), `frequency`, `expiry`. Submit calls `consent.init`.
- Consent status page polls every 5 s for the first 2 minutes, then every 30 s for the first hour, then stops (NHA expects the user to refresh manually after that).
- Records timeline: group by `dateOfEvent` desc, with cards per `hiType`. PDF attachments render in an embedded viewer (`ng2-pdf-viewer`); structured FHIR resources render via type-specific cards (`PrescriptionCard`, `DiagnosticReportCard`, `OPConsultCard`, `DischargeSummaryCard`, `ImmunizationCard`, `WellnessCard`, `InvoiceCard`, `HealthDocumentCard`).
- A **consent expiry banner** appears on every records page when `consentArtefact.expiresAt - now() < 24h`. After expiry, records become non-viewable (backend returns 410 GONE; UI shows "Consent expired — request again").

### 7.4 M4 (NHPR)

- HPR self-registration: walks the doctor through OTP, system-of-medicine select (Modern / Ayurveda / Unani / Siddha / Sowa-Rigpa / Homeopathy / Dentistry / Nursing), council registration number, qualifications upload (PDF/JPG ≤ 5 MB), preview, submit.
- HPR assisted: lets a hospital admin pre-fill and dispatch a verification link to the doctor's mobile.
- HFR registration: facility type taxonomy (Hospital, Clinic, Diagnostic Lab, Imaging Center, Pharmacy, Blood Bank, …), ownership (govt / private / PPP / charitable), services offered (multi-select from NHA taxonomy), address (lat/lng via Google Places restricted to `country: 'in'`), uploads.
- NHPR status dashboard: lists local providers and their HPR sync status (`DRAFT / PENDING / VERIFIED / REJECTED`) with retry actions on rejected rows.

---

## SECTION 8 — ACCESSIBILITY (WCAG 2.1 AA — non-negotiable)

NHA HTC reviewers test accessibility. Every ABDM screen MUST:

- Use semantic HTML (`<form>`, `<fieldset>`, `<legend>`, `<label for>`).
- Maintain ≥ 4.5:1 contrast for body text, ≥ 3:1 for large/UI.
- Be keyboard-navigable end-to-end; visible focus ring on every interactive element (do NOT remove the PrimeNG focus style).
- Announce dynamic changes via `aria-live="polite"` regions (OTP errors, consent status changes).
- Honor the user's OS prefers-reduced-motion (disable wizard slide animations when set).
- Support 200% zoom without horizontal scrollbars.
- Provide Hindi + English at minimum (NHA mandates both); other locales optional per tenant.

---

## SECTION 9 — ERROR HANDLING & NHA ERROR CODES

NHA returns numeric/string codes that need humanised mapping. `abdm-error.service.ts` keeps the map (extend, never inline):

```ts
const ABDM_ERROR_MAP: Record<string, ErrorRendering> = {
  'ABDM-1001': { i18n: 'abdm.error.aadhaar_invalid',       severity: 'error',  action: 'RESTART' },
  'ABDM-1002': { i18n: 'abdm.error.aadhaar_otp_invalid',   severity: 'warn',   action: 'STAY' },
  'ABDM-1003': { i18n: 'abdm.error.aadhaar_otp_expired',   severity: 'warn',   action: 'RESEND' },
  'ABDM-1006': { i18n: 'abdm.error.txn_not_found',         severity: 'error',  action: 'RESTART' },
  'ABDM-2001': { i18n: 'abdm.error.abha_address_taken',    severity: 'info',   action: 'PICK_NEW' },
  'ABDM-3001': { i18n: 'abdm.error.consent_denied',        severity: 'info',   action: 'CLOSE' },
  'ABDM-3002': { i18n: 'abdm.error.consent_expired',       severity: 'warn',   action: 'REQUEST_AGAIN' },
  'ABDM-3003': { i18n: 'abdm.error.consent_revoked',       severity: 'info',   action: 'CLOSE' },
  'ABDM-4001': { i18n: 'abdm.error.hpr_dup',               severity: 'error',  action: 'BLOCK' },
  // …extend per encountered code
};
```

Errors NEVER show the raw NHA text — always go through the i18n map. The fallback (`unmapped`) is `"We couldn't complete that — please retry or contact your administrator."` with `console.error` of the raw code for support.

---

## SECTION 10 — TESTING & DEMO

- **Jest unit tests** for every store, service, pipe, directive (≥ 80% lines for `abdm/shared` and `abdm/m*/services`).
- **Component tests** with Testing Library for every page — at minimum: happy path, NHA error case, loading state, empty state.
- **Cypress E2E** scripted against the sandbox base URL (driven by `cypress/abdm/m1/*.cy.ts` etc.). NHA's HTC demo follows the WASA test plan — Cypress tests mirror it 1:1.
- **Accessibility audits**: run `cypress-axe` on every ABDM page snapshot.

Do NOT mock the encryption layer in tests — JSEncrypt is deterministic given a fixed RSA pair; ship the test cert in `cypress/fixtures/abdm-test-pub.pem`.

---

## SECTION 11 — DON'T-DO LIST

1. ❌ Don't call `https://*.abdm.gov.in` directly from Angular. Everything via `abdm-integration-service`.
2. ❌ Don't render unencrypted Aadhaar or OTP in any DOM node, attribute, or `console.log`.
3. ❌ Don't store wizard state in `localStorage`.
4. ❌ Don't bypass the consent overlay, ever.
5. ❌ Don't fork the `ApplicationResponse` shape — extend the typed map instead.
6. ❌ Don't poll consent status more aggressively than the schedule in 7.3. NHA rate-limits.
7. ❌ Don't put ABDM strings inline in templates. Use i18n keys so Hindi + English ship.
8. ❌ Don't render the records timeline without the consent expiry banner.
9. ❌ Don't allow uploading > 5 MB for NHPR documents — NHA rejects, and the user loses progress.
10. ❌ Don't skip Verhoeff client validation; saving even one wasted network call matters at scale.

---

## SECTION 12 — CHANGE WORKFLOW

Before writing or modifying any ABDM Angular code:

1. Read the relevant milestone section of this skill.
2. Inspect the corresponding backend controller and DTOs in `abdm-integration-service` — these define the contract.
3. Check `lifetrenz-core/src/app/abdm/` for any existing component you can extend before creating a new one.
4. Sketch the wizard's state diagram on paper or in the PR description.
5. Author in this order: model types → `AbdmApiService` method → store → page → child components → tests.
6. Ensure i18n keys are added for **all** strings (en + hi minimum).
7. Run `cypress-axe` for accessibility regressions.
8. Verify the Aadhaar/OTP encryption code path by inspecting the network tab — payloads MUST be base64 ciphertext.
9. Demo against the sandbox; capture a screen recording for the HTC submission folder under `D:\Workspace\Claude\abdm-integration-service\docs\htc\`.

Every ABDM Angular PR description MUST answer:

- Which milestone(s)?
- Which routes / components added or changed?
- Which backend endpoints consumed (and confirm they exist)?
- Consent overlay rendered? Encryption applied? a11y validated?
- Screenshots / screen recording attached?

If you can't answer any of the above, the PR isn't ready.
