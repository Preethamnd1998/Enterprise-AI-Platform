---
name: notification-link-skill
description: |
  How to add a NEW notification type end to end on Lifetrenz, from the business trigger to the screen the recipient
  opens: trigger event on Kafka `lt.notification.events` -> notification-service (request type, handler, templates for
  EMAIL / SMS / WHATSAPP / INBOX, default channels, Settings seed) -> tiny URL generation (10-char code, `url_mapping`,
  `lt.mobility.notification-url`) -> Mobility link API (`notification_url`, state, expiry, login type, `/complete`) ->
  public-gateway allowlist (client token, `user-token-required`, `required-params`) -> NotiShell screen (React, no
  iframe). Covers the rules and regulations (what may be in a URL, token handling, expiry per type, one decision per
  link, who is notified, PHI in SMS), how to send the URL by each channel, a worked example (discount / refund
  approval, Redmine #54064), a file-by-file checklist and a test/verification matrix. MUST be loaded by any agent or
  developer asked to add or change a notification, a mail/SMS/WhatsApp message with a link, an approval-by-link or
  view-by-link flow, a NotiShell screen, a Mobility link purpose, or to debug "Link not recognised / expired / not valid".
---

# Notification Link Skill — new notification, URL, and NotiShell screen

Verified against source on 2026-11-02 (branches named in each section). Every "how" below is the pattern the discount and
refund approvals (#54064) use; copy it, do not invent a second one.

## 1. Pick the kind first

| Kind | What the recipient gets | Needs |
|---|---|---|
| **A. Message only** | Mail / SMS / WhatsApp / browser notification, no link | Steps 1, 2 (no link), 6 |
| **B. Link to a view** | Message + tiny URL that opens a read-only screen after sign-in | Steps 1-5 |
| **C. Link to a decision** | Message + tiny URL that opens a screen where the user approves / rejects | Steps 1-5, one decision per link |

Choose the **login type** now (stored with the link, decided on the server, never taken from the client):
`USER_LOGIN` (staff, own Lifetrenz token) · `PATIENT_LOGIN` (patient token) · `NO_LOGIN` (anonymous client token: OTP,
passcode, registration) · `OTHER` (unsupported: NotiShell shows "unsupported", never guesses a token).
NotiShell today implements the full screens only for `USER_LOGIN` instance approvals; any other login type needs its own
NotiShell work (see `reference/notishell-and-gateway.md` §5).

## 2. The whole flow (one picture)

```
[trigger service]  publish {requestType, data} on  lt.notification.events          (key Integer 1, data = JSON string)
      |
notification-service  SimpleConsumerService  case <CODE>  ->  handler
      |   recipients (who) -> subscribers/templates (Settings) or default templates/channels -> channels (EMAIL/SMS/...)
      |   if link:  WorkflowLinkService.createApprovalLink(spec)
      |        code = 10 chars SecureRandom, unique vs url_mapping            <- tiny URL generation
      |        url  = <base>/n/<code>   base = ${LTHS_BASE_URL}/Modules/NotiShell/#   (absolute, keeps the '#')
      |        publish NotificationUrlEvent on  lt.mobility.notification-url  (own producer, acks=all, waits <=10 s)
      |        then save url_mapping {shortCode, originalUrl, urlType=purpose, identifierCode, loginType, expiryDuration}
      v
Mobility  NotificationUrlConsumer -> NotificationLinkService.register -> Mongo notification_url (ACTIVE) + notification_url_event
      |
recipient taps  https://<host>/Modules/NotiShell/#/n/<code>
      v
NotiShell (public React app)  -- every call goes to the PUBLIC GATEWAY (VITE_API_BASE), nothing is called directly --
   POST /mobility/route/auth/client/token      anonymous client token (JSON body {})
   GET  /mobility/mobility/v1/n/{code}          resolve: state, purpose, loginType, ttlHours (no request detail yet)
   POST /mobility/mobility/v1/n/{code}/login    user signs in (same login as Lifetrenz web); 10 failures lock the link
   GET  /mobility/mobility/v1/n/{code}/request  Mobility checks the link + the user is an approver, returns {link, embed ids}
   <feature screen> -> /ipd/... (or other service) with the USER's token   <- service stays the authority on who may act
   POST /mobility/mobility/v1/n/{code}/complete Mobility re-reads the instance, marks the link USED / CLOSED
```

Key design rules behind it (do not break):
- The **code is only a pointer**. Nothing about the request is shown before sign-in. State lives in Mobility, not in the URL.
- The **decision is taken with the user's own token** by the owning service (ipd / supplementary). Mobility only decides
  whether the link may still be used. NotiShell never decides who may approve.
- **Only Mobility is called through the Mobility route**; every other service (ipd, ltauth, ...) is called directly through the public
  gateway, each path added to `api-allowlist.yml`.

## 3. Step-by-step: implement a new type

Use `<CODE>` for the new request type (e.g. `PURCHASE_APPROVAL_REQ`) and `<PURPOSE>` for the link purpose
(e.g. `PURCHASE_APPROVAL`). Kind A skips the link steps.

### Step 1 — Trigger (the service that owns the business event)
1. Publish to `lt.notification.events` with key `1` (Integer) and value `{"requestType":"<CODE>","data":"<JSON string>"}`.
2. Payload must include `customerId`, `customerBusinessId`, `siteId`, the recipients (`usres` = list of user ids/names for
   approvals) and a stable id of the thing (workflow instance id, transaction id) plus display data (reference, requester).
3. Serialise with a **java.time-aware ObjectMapper** (a bare one silently returns `""` for `LocalDateTime`).
4. Publish **after commit** and **never fail the business transaction** if the publish fails (log, do not throw).
5. Keep the payload free of secrets. Money is plain decimal text in currency units.
Reference: `ipd-service` `WorkflowInstanceServiceImpl.notifyUsersForDiscountRequest`, `RefundWorkflowInstanceServiceImpl.notifyAfterCommit`.

### Step 2 — notification-service (message + link)
Repo `BE/notification-service`, base package `com.lifetrenz.lths.notification`. Full detail: `reference/notification-service.md`.
1. **Enum**: add `<CODE>("<CODE>")` to `domain/enums/NotificationRequestType.java`.
2. **Login type**: add the code to exactly one group in `service/link/LoginTypeRegistry.java` (a unit test fails while any enum
   value is unmapped). If the link purpose is not an enum value, add a constant + `m.put(<PURPOSE>, USER_LOGIN)`.
3. **Consumer case**: in `service/consumer/SimpleConsumerService.java` add `case <CODE>:` calling your handler (approvals: call
   `approval/ApprovalNotificationService.process(Kind.<X>, payload, correlationId)` after adding a `Kind` constant with
   `code, purpose, linkRequestType, screen, toApprovers`).
4. **Recipients**: resolve from the payload (approvers: `usres`; result messages: the requester). Subscribers only choose
   channel + template; they must not add recipients for approvals.
5. **Link** (kinds B/C): build an `ApprovalLinkSpec(purpose, identifierCode, requestId, requestType, reference, title,
   requesterName, intendedUserIds, customerId, customerBusinessId, siteId)` and call `WorkflowLinkService.createApprovalLink`.
   ONE link per request, shared by all approvers. If it cannot be created, send the message **without** a link (log ERROR);
   never fall back to an old portal URL.
6. **Expiry**: `notification.link.ttl-hours` (default 72) or per type `notification.link.ttl-hours.<identifierCode>`; clamped to
   1 h - 14 days (`LinkTtlPolicy`). Expiry is enforced by Mobility from `expiresAt`.
7. **Default texts**: add `<CODE>.<MODE>.subject|body` lines to `src/main/resources/default-templates/approval-defaults.properties`
   for EMAIL, INBOX, SMS, WHATSAPP (placeholders `${name}`; see `reference/notification-service.md` §4).
8. **Settings seed**: add the activity to a new Mongock `ChangeUnitNNNN...` (idempotent) so tenants can configure the event and
   subscribers under Settings → Notification (see `ChangeUnit0006CreateApprovalActivities`).
9. **Tests**: handler test, link-creation test, default-text test, `LoginTypeRegistryTest` stays green (`ApprovalNotificationServiceTest`,
   `ApprovalLinkCreationTest` are the templates).

### Step 3 — Mobility (link state and the instance check)
Repo `BE/mobility`, package `com.lifetrenz.lths.mobility.notificationlink`. Branch with the instance-bound code:
`feature/54064-decided-link-details` (the base `development` has only resolve / login / request / action).
1. Kind C with an owning-service instance: add an entry to `InstanceApprovalPurpose` — `<PURPOSE>("<svc>/.../instance/%d/detail",
   "<svc>/.../is-approver/%d/%d")`. The detail path must return `data.status` (`PENDING` while open) and `data.transactionRequestId`;
   the approver path must return a boolean for the calling user.
2. Nothing else changes for purposes that follow that contract: `request` (link alive only while PENDING and user is an approver),
   `complete` (re-reads the instance with the user's token; APPROVED/REJECTED -> `USED`, other terminal -> `CLOSED`, still PENDING -> 409).
3. Kind B (view only): add a purpose branch in `request`; no `complete` needed (link stays ACTIVE until expiry).
4. Tests: `NotificationLinkService*Test` and the controller journey test (resolve -> login -> request -> complete) on `development`.

### Step 4 — Public gateway (allowlist)
Repo `BE/public-gateway-service`, `src/main/resources/api-allowlist.yml`. Detail and examples: `reference/notishell-and-gateway.md` §2.
1. One entry per (service, method, **stripped** path) the screen calls. Do not allow `**`; use `*` for one segment.
2. Anything that returns data of a signed-in user: `user-token-required: true` (the anonymous client token is refused with 403).
3. Narrow reads with `required-params: [name, name=value]` (e.g. `pageSize=1`) so a list API cannot be used to enumerate.
4. `SecurityConfig.PUBLIC_PATHS` only for calls made **without** a user token (the client-token endpoint). Never add decision or data paths.
5. Tests: add the entries to `NotiShellAllowlistTest` (binds the real yml) with near-miss rejections.
6. Branching: from V2-QA -> MR to development -> same branch MR to V2-QA; if they diverge, create a separate branch from development.

### Step 5 — NotiShell (the screen)
Repo `UI/notishell`. Detail: `reference/notishell-and-gateway.md` §3-4.
1. `npm run generate -- feature <name> [service]` -> `src/main/<name>/` with `dto/`, `service/`, and a four-file component
   (`.template.tsx`, `.component.scss`, `.component.ts`, `.component.spec.ts`). Only `index.ts` is imported from outside.
2. Put the owning service's paths in `dto/<name>-api-constant.ts` (same paths as the Front Desk screen) and call them **only**
   through `apiService` (`common/api`), never `fetch`.
3. Register the purpose in `src/app/features.ts` (one lazy line) and add it to the `InstanceApprovalPurpose` type in
   `common/types/link.types.ts` / `isInstancePurpose` in `common/config/route.constants.ts`.
4. The component receives `ApprovalFeatureProps {token, ids, userName, onDecided, onAlreadyDecided, onSessionExpired}`; before a
   decision it re-reads the instance (RECHECK) and calls `onAlreadyDecided()` if it is no longer pending. The host then calls
   `/complete` and shows the done page.
5. Responsive: phone <= 640 px, desktop > 1000 px (`common/styles/_breakpoints.scss`); fixed action bar on phone.
6. Tests: Karma/Jasmine specs next to the code, fixtures from sanitized real responses, Playwright flow at 1440/1280/390/375,
   `npm test` (runs `check:structure`) and `npm run build`.

### Step 6 — Verify and document
Run the matrix in `reference/checklist-and-tests.md`, then update `notification-service-knowledge/` and
`notishell-knowledge/` (change-history entry in each). Never claim a real SMS/mail/WhatsApp delivery that was not sent.

## 4. Rules and regulations (non-negotiable)

1. **No data in the URL.** Only the random code. Never ids, names, amounts, tokens, usernames or passwords (the old
   `PASSWORD_RESET` and `PASSCODE` URLs put Base64 ids in the URL — do not copy them).
2. **Code**: 10 characters from `SecureRandom`, alphabet without `0 O 1 I l`, unique against `url_mapping` (5 tries). Mobility accepts
   `[A-Za-z0-9]{6,32}` only.
3. **Base URL** must be absolute (`https://host/Modules/NotiShell/#`) — NotiShell uses hash routing; if not absolute, no link is created.
4. **Expiry**: default 72 h, per type override, clamped 1 h - 14 days. A request that is decided elsewhere closes the link
   (`CLOSED`); a decision through it makes it `USED`; expiry is derived (`EXPIRED`), never stored. One link per request.
5. **One decision per link.** After it, anyone who opens the link sees "already completed"; an approver of that request is
   told who decided, when and why (`decision`), others are not.
6. **Identity**: the user signs in with their own credentials; the token lives in browser memory only (never storage, URL,
   cookies, logs). 10 failed sign-ins lock the link (`LOCKED`, 423).
7. **Authorisation stays in the services.** NotiShell / Mobility never grant approver rights; ipd checks the approver on every decision.
8. **Recipients**: approvals go only to the request's own approvers (`usres`); result messages to the requester. A subscriber of
   type fixed-user/role adds nobody for approvals.
9. **PHI**: SMS and WhatsApp texts never carry the patient name (encounter number and MPI only). Email may carry it.
10. **Never block the business action** on notification or link failure; log and continue. Idempotent: the same payload twice
    gives one trigger, one link (`findByPayloadExact`).
11. **Link creation order**: publish to Mobility first and wait for the broker ack, then save `url_mapping` (never list a link that cannot be opened).
12. **Fail closed** on login type: unknown / invalid -> `OTHER` -> NotiShell shows "unsupported".
13. **Gateway**: least privilege — exact paths, `user-token-required` for user data, `required-params` on list APIs, no wildcard services.

## 5. How the URL is sent, per channel

| Channel (`NotificationMode`) | How the link appears | Placeholder in default text |
|---|---|---|
| EMAIL | `<a href=URL>Click here</a> to review and decide.` (address hidden) | `${linkHtml}` (names ending `Html` are not escaped), `${validity}` |
| INBOX (browser notification) | "Click here to review and decide." | `${linkClick}` |
| SMS / WHATSAPP | plain address, `Review and decide: <url>`; no patient name | `${linkLine}` |
| PUSH_NOTIFICATION | link in `actionUrl` | `${ACTION_URL}` in a configured template |

Configured templates (Settings → Notification) show the link **only** if they contain `${ACTION_URL}`. Defaults used when no
template or a failing one; nothing configured -> `DefaultChannelPolicy` (`notification.default.channels`, default `INBOX,EMAIL`;
per event `notification.default.<CODE>.channels`). SMS/WhatsApp are off by default.

## 6. Known pitfalls

- A link that Mobility never received answers "This link is not valid": the service-wide `ProducerService` is a logging fallback —
  always publish links with `WorkflowLinkPublisher`.
- `LTHS_BASE_URL` ends with `/`; `url()` collapses double slashes after the scheme.
- Client token needs `Content-Type: application/json` (415 otherwise). Through the gateway it is `/mobility/route/auth/client/token`,
  while the link API is `/mobility/mobility/v1/n/...` (two `mobility`).
- A new data path missing from the allowlist gives 403 only at the gateway, not in unit tests — run the gateway test and a live smoke.
- `REQUEST_DATE` reads `TemplateVariableDTO.createdOn`.
- Result messages need the exact code the consumer switch matches (`OP_DISCOUNT_APPROVED` vs `OP_DISCOUNT_APP` mismatch is an open bug).

## 7. Where to read more
- `reference/notification-service.md` — enum, consumer, link service, templates, tokens, seed, TTL, login type.
- `reference/notishell-and-gateway.md` — allowlist entries, security config, NotiShell structure, feature registration, tests.
- `reference/checklist-and-tests.md` — copy-ready checklist and the verification matrix.
- Repo knowledge: `notification-service-knowledge/business/link-and-approval-flow.md`, `notishell-knowledge/business/link-flow.md`,
  `notishell-knowledge/api/mobility-contract.md`.
