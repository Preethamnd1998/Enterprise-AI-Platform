# notification-service — what to touch for a new notification type

Repo `BE/notification-service`. Verified on branch `feature/54064-approval-message-details` (the link + login-type + approval code),
2026-11-02. Base package `com.lifetrenz.lths.notification`. `V2-QA` does **not** have `WorkflowLinkService`, `LoginTypeRegistry`,
`ApprovalNotificationService` or `ChangeUnit0003/0006`; merge them before expecting a link on that branch.

## 1. Files, in the order you change them

| # | File | Change |
|---|---|---|
| 1 | `domain/enums/NotificationRequestType.java` | `<CODE>("<CODE>")`; `fromValue()` must map it |
| 2 | `service/link/LoginTypeRegistry.java` | add the code to ONE group (`USER_LOGIN` / `PATIENT_LOGIN` / `NO_LOGIN` / `OTHER`). Unit test fails if an enum value is unmapped. Override per deployment: `notification.link.login-type-overrides=CODE=USER_LOGIN,...` |
| 3 | `service/consumer/SimpleConsumerService.java` | `case <CODE>:` -> handler (approvals: `ApprovalNotificationService.process(Kind.X, payload, correlationId)`) |
| 4 | `approval/ApprovalNotificationService.java` | add `Kind(code, purpose, linkRequestType, screen, toApprovers)`; extend `Request` only with optional fields (`@JsonIgnoreProperties(ignoreUnknown = true)`), add template tokens in `templateVars` |
| 5 | `service/workflow/WorkflowLinkService.java` | usually no change: call `createApprovalLink(new ApprovalLinkSpec(...))` |
| 6 | `src/main/resources/default-templates/approval-defaults.properties` | default subject/body per mode |
| 7 | `migration/ChangeUnit000N...java` | seed `notification_activity` so tenants can configure the event in Settings |
| 8 | `application*.properties` / config repo | `notification.link.base-url` only if the default `${LTHS_BASE_URL}/Modules/NotiShell/#` is wrong; `notification.link.ttl-hours.<CODE>` for a custom lifespan |
| 9 | `notification-service-knowledge/` | `business/link-and-approval-flow.md` + a `changes/history/` entry |

For a message with **no** link and a different pipeline, follow `TRIGGER_IMPLEMENTATION_CHECKLIST.md` in the repo root (DTO ->
enum -> consumer case -> `GenericNotificationService` method -> mapper -> queue -> channel coordinator). All triggers share the one
topic `lt.notification.events`; the type is the `requestType` field.

## 2. Tiny URL generation (exact behaviour)

`WorkflowLinkService.createApprovalLink(ApprovalLinkSpec s)`:
1. `url("x")` must start with `http(s)://` else `IllegalStateException` (no link is created).
2. `code = uniqueCode()` — 10 chars, `SecureRandom`, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789`, up to 5 retries against
   `UrlMappingRepository.existsByShortCode`.
3. `expires = now + LinkTtlPolicy.hours(identifierCode)`.
4. `loginType = LoginTypeRegistry.resolve(identifierCode)` — server-side only.
5. Publish `NotificationUrlEvent{code, purpose, identifierCode, loginType, requestId, requestType, reference, title, requesterName,
   intendedUserIds, customerId, customerBusinessId, siteId, createdAt, expiresAt}` on `lt.mobility.notification-url` via
   `WorkflowLinkPublisher` (own `KafkaProducer`, `acks=all`, `get(10 s)`; throws when not acknowledged).
6. Save `url_mapping{shortCode, originalUrl, urlType=purpose, identifierCode, loginType, customerBusinessId, timestamp, createdAt,
   expiryDuration, isUsed=false}`.
7. Return `Link(code, url, expiresAt)`; `url = <base>/n/<code>`.

`ApprovalLinkSpec` fields: `purpose` (link purpose = Mobility `InstanceApprovalPurpose` name, e.g. `DISCOUNT_APPROVAL`), `identifierCode`
(drives login type and TTL, usually the request type), `requestId` (the **instance id** the link is bound to), `requestType`,
`reference`, `title`, `requesterName`, `intendedUserIds`, `customerId`, `customerBusinessId`, `siteId`.

Skeleton for a new approval kind (inside `ApprovalNotificationService`):
```java
WorkflowLinkService.Link link = null;
try {
    link = linkService.createApprovalLink(new WorkflowLinkService.ApprovalLinkSpec(kind.purpose, kind.code, r.workflowInstanceId,
            kind.linkRequestType, display(r), kind.screen, r.requesterName, approverIds(r), r.customerId, r.customerBusinessId, r.siteId));
} catch (Exception ex) {
    log.error("[ApprovalLink] link not created for {}: {}", r.workflowInstanceId, ex.getMessage()); // send without a link
}
```

## 3. Recipients, channels, subscribers

- Targets come from the payload (`usres` for approvers, requester for results). Duplicate guard: `triggerRepository.findByPayloadExact(payload)`.
- Event is looked up by `(code, customerBusinessId)`. Valid subscriber = `isRunning`, gateway `active`, `transactionAttribute.active`.
  If any valid subscriber exists only those are used; otherwise `DefaultChannelPolicy` (`notification.default.channels`,
  default `INBOX,EMAIL`; `notification.default.<CODE>.channels`).
- Body per recipient: configured template if present and it renders (FreeMarker), else `DefaultTemplateProvider`
  (`approval-defaults.properties`). Then `ChannelStrategyCoordinator.processNotification(req, subscriber, queue, vars)`.
- Channels (`NotificationMode`): `EMAIL`, `SMS`, `WHATSAPP`, `INBOX`, `PUSH_NOTIFICATION`. INBOX/SMS/WHATSAPP queue rows are saved first.

## 4. Text and tokens

Default file key format: `<CODE>.<MODE>.subject` / `.body`, placeholders `${name}`, unknown ones render empty.
Variables: `requestNumber, requesterName, patientName, patientMpi, approverName, amount, admitType, siteName, encounterNumber,
billAmount, discountAmount, discountPercent, requestedDiscount, discountType, discountReason, linkLine, linkHtml, linkClick, validity`.
Configured (FreeMarker) tokens: `REQUEST_NUMBER, SITE_NAME, ENCOUNTER_NUMBER, REASON, BILL_AMOUNT, REQUESTED_DISCOUNT, DISCOUNT_TYPE,
REFUND_AMOUNT, ADMISSION_TYPE, PATIENT_NAME, PATIENT_MPI, REQUESTED_BY, APPROVER, REQUEST_DATE, ACTION_URL`. A variable added only
in the Settings UI never renders — add it in `TemplateVariableDTO` + `FreeMarkerServiceImpl` + `templateVars`.

Example default set for a new approval `PURCHASE_APPROVAL_REQ`:
```properties
PURCHASE_APPROVAL_REQ.EMAIL.subject=Purchase approval needed: ${requestNumber}
PURCHASE_APPROVAL_REQ.EMAIL.body=<p>Hello ${approverName},</p><p>${requesterName} needs your approval for ${requestNumber}.</p><p>${linkHtml}</p><p>${validity}</p>
PURCHASE_APPROVAL_REQ.INBOX.body=Purchase approval requested: ${requestNumber} by ${requesterName}. ${linkClick}
PURCHASE_APPROVAL_REQ.SMS.body=Lifetrenz: purchase approval needed. Ref: ${requestNumber}. By: ${requesterName}. ${linkLine}
PURCHASE_APPROVAL_REQ.WHATSAPP.body=Lifetrenz: purchase approval needed. Ref: ${requestNumber}. By: ${requesterName}. ${linkLine}
```
No patient name in SMS/WhatsApp.

## 5. Settings seed (Mongock)

Copy `ChangeUnit0006CreateApprovalActivities`: insert the `notification_activity` documents (code, name, identifier) only if absent
(idempotent), plus a test like `ChangeUnit0006CreateApprovalActivitiesTest`. Tenants then add the event and subscribers under
Settings → Notification → Event Template. Mongock change-unit order numbers must be unique and increasing; never edit an applied unit.

## 6. Tests to add
`ApprovalNotificationServiceTest` (recipients, one link, defaults), `ApprovalConfiguredTemplateTest` (template wins, `${ACTION_URL}`),
`ApprovalLinkCreationTest` (publish before save, absolute base, TTL, login type), `LoginTypeRegistryTest`, `LinkTtlPolicyTest`,
`DefaultNotificationDefaultsTest`, `ChangeUnit*Test`. Run: `./mvnw test -DskipTests=false -Dtest=<Class>` (embedded Mongo).

## 7. Other URL mechanisms (legacy, do not copy)
`url_mapping` + `UrlMappingServiceImpl` (generic CRUD), `ForgotPasswordMapper` (Base64 request in URL), `PasscodeMapper` (Base64 ids in URL),
`BookAppointmentMapper` (`createShortUrl` is commented out). New flows use the pointer-code link above.
