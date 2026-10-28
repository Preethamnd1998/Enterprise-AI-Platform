# Approval notifications: discount and refund (notification-service + Mobility link API)

Redmine #41100, #51456 (delivery #54064). Captured from the work done and tested in the session of 2026-10-28.
Statuses used below: **verified** = read in code or checked against canary data/tests; **inferred** = reasoned, not checked;
**not verified** = never run.

Read together with `NotiShell.md` in this folder (the web app the link opens).

## 1. What it does

When a discount (OP) or refund request is raised, every approver stored on the request gets a message (browser notification,
email, SMS, WhatsApp) with ONE shared link. The link opens NotiShell, the approver signs in, and decides in the Front Desk
screen shown in an iframe. After the first decision the link is dead for good.

## 2. Flow (verified)

```
ipd-service                      Kafka lt.notification.events          notification-service
 WorkflowInstanceServiceImpl  -> {requestType, data}               ->  ApprovalNotificationService.process
  .notifyUsersForDiscountRequest   OP_DISCOUNT_REQ                       1. targets = usres (stored approvers)
 RefundWorkflowInstanceServiceImpl                                       2. duplicate guard (findByPayloadExact)
  .notifyAfterCommit               REFUND_REQ / REFUND_APP / REFUND_REJ  3. link: WorkflowLinkService.createApprovalLink
                                                                         4. variables() + subscribers or defaults
   usres = the rows of workflow_instance_approver (exact list that may decide)

notification-service -> Kafka lt.mobility.notification-url -> Mobility stores notification_url (Mongo LTHS-MBLTY)
                     -> url_mapping (Mongo LTHS-NOTIFICATION): metadata only (code, urlType, loginType, timestamps)
```

- Message DTOs: `OpDiscountApprovalNotificationDto` (ipd), `RefundApprovalNotificationDto` (ipd); read by
  `ApprovalNotificationService.Request` (notification-service).
- `Kind` enum: `OP_DISCOUNT_REQ`, `REFUND_REQ` (to approvers, with link); `REFUND_APP`, `REFUND_REJ` (to the requester).
- The link is `<LTHS_BASE_URL>/Modules/NotiShell/#/n/<code>` (`WorkflowLinkService.DEFAULT_BASE_URL`; override with
  `notification.link.base-url`). The code is 10 random characters. Lifespan is per type (72 hours default).
- `requestNumber` shown to people: discount = the sales order number (`SOR/25-26/13832`); refund = `#<transactionRequestId>`
  (ipd sends no refund number: this is a known weak spot).

## 3. Who gets the message (verified, test `ApprovalNotificationServiceTest`)

**Only the request's own people.** `recipients()` ignores the subscriber's recipient setting: it always resolves the approvers in
`usres` (the requester for a result), de-duplicated. A subscriber configured with a fixed user or role does NOT add anyone.
The subscriber supplies the channel and the template only.

## 4. Template first, default otherwise (verified)

1. Events: `eventRepository.findByIdentifierCodeAndCustomerBusinessId(code, customerBusinessId)`; subscribers of that event.
2. A subscriber is valid only if it is **running**, its **gateway is active** and its transaction attribute is active.
3. If at least one valid subscriber exists, ONLY those are used (the defaults are not added). A configured SMS-only event
   sends SMS only.
4. If none is valid, the **default channels** carry the built-in text: `notification.default.channels` (default
   `INBOX,EMAIL`), or per event `notification.default.<CODE>.channels`. SMS and WhatsApp are not default (their texts need
   provider registration). An empty value switches the default off.
5. For each message: the subscriber's configured template body is rendered with FreeMarker (`FreeMarkerServiceImpl`); if it is
   blank or fails to render, the built-in text (`default-templates/approval-defaults.properties`) is used.

### Built-in templates

`src/main/resources/default-templates/approval-defaults.properties`, keys `<CODE>.<MODE>.subject|body`, placeholders `${name}`
(lower case). `DefaultTemplateProvider` HTML-escapes values for EMAIL only, **except placeholders whose name ends in `Html`**
(trusted markup built by the service). Link placeholders:

| Placeholder | Used by | Value |
|---|---|---|
| `linkHtml` | EMAIL | `<a href="URL">Click here</a> to review and decide.` (address not printed) |
| `linkClick` | INBOX (browser) | `Click here to review and decide.` |
| `linkLine` | SMS, WHATSAPP | `Review and decide: URL` (plain text cannot hide the address) |

SMS and WhatsApp texts carry the MPI and encounter number, never the patient name.

### Tokens for templates configured in Settings

Upper case, `${TOKEN}` or `{{TOKEN}}`; mapped in `FreeMarkerServiceImpl` from `TemplateVariableDTO`, which
`ApprovalNotificationService.templateVars()` fills: `REQUEST_NUMBER, SITE_NAME, ENCOUNTER_NUMBER, REASON, BILL_AMOUNT,
REQUESTED_DISCOUNT, DISCOUNT_TYPE, REFUND_AMOUNT, ADMISSION_TYPE, PATIENT_NAME, PATIENT_MPI, REQUESTED_BY, APPROVER,
REQUEST_DATE, ACTION_URL`. A configured template shows the link only if it contains `${ACTION_URL}`.

**Gotcha:** `${REQUEST_DATE}` reads `TemplateVariableDTO.createdOn`, not `requestDate`; setting only `requestDate` leaves it
empty. A token that is not mapped (or has no value) renders empty without an error.

## 5. Configuring it in the UI (verified for the code, not walked in the running UI)

Events are Mongo documents. The global master list is `notification_activity`; each tenant then adds the event and its
subscribers in Settings, Notification Setting (screens Event Template and Event Mapping, a template screen per channel,
Gateway and Notification Queue; the route names in the settings library are `event-template`, `notification-event-mapping`,
`notification-gateway`, `notification-queue`).

`ChangeUnit0006CreateApprovalActivities` (Mongock, `migration/`) seeds the six masters: `OP_DISCOUNT_REQ`, `OP_DISCOUNT_APP`,
`OP_DISCOUNT_REJ`, `REFUND_REQ`, `REFUND_APP`, `REFUND_REJ`. Idempotent; rollback removes an activity only while no event uses it.
Not verified: which masters already exist on canary (the canary Mongo tool was not connected).

## 6. Mobility side: the link API (verified in code and with real canary calls)

`NotificationLinkService` / `NotificationLinkController`, path `/mobility/v1/n/<code>` (through the gateway:
`/api-gateway/mobility/mobility/v1/n/<code>`).

| Call | Needs | Notes |
|---|---|---|
| `GET /n/<code>` | gateway **client token** | 401 without it; link state ACTIVE, USED, CLOSED, EXPIRED, REVOKED, LOCKED |
| `POST /n/<code>/login` | client token | calls Lifetrenz sign-in (`ltauth/login`); 401 bad credentials, 409 active session |
| `GET /n/<code>/request` | user token | instance read; embed ids; see 7 |
| `POST /n/<code>/complete` | user token | re-reads the instance, closes the link as USED (approved/rejected) or CLOSED |

Client token: `POST /api-gateway/mobility/route/auth/client/token`, no auth.

Outcomes: 404 not a link, 401 sign in, 403 not an approver, 410 dead (carries `decision`: who, when, comment), 423 locked,
409 not decided yet, 502 temporary (see gotchas).

### Who may open it (verified, tests `InstanceApprovalLinkTest`)

`requestInstance`: the user's token `coreUserId` must be in the link's `intendedUserIds` (the approvers it was sent to), for
pending and decided requests alike. ipd-service's `is-approver` call is used only for a token without a user id, and only
while pending. (ipd's `is-approver` answers true only for a PENDING instance, which made decided/reverted links look like
"not an approver".)

### Calling other services (verified, test `ApiGatewayClientTest`)

`ApiGatewayClient.urlFor(path)`: with `service-endpoints.api-gateway` set, `<gateway>/<path>`; otherwise the per-service
endpoints Mobility already has, by the first path segment: `ltauth` (else `auth`, canary's name), `ipd`, `supplementary`.
**Gotcha:** `api-gateway` was a key only this feature used; canary's Mobility did not have it, and sign-in answered 503
"service-endpoints.api-gateway is not configured" while every other Mobility route worked.

## 7. Known problems and gotchas

- **ipd approval reverts itself (verified on canary data, NOT fixed).** `WorkflowInstanceServiceImpl.approveWorkflow` sets the
  instance APPROVED and saves it, then applies the discount; applying calls
  `markApprovedInstanceRevertedForSalesOrder`, which finds "the latest APPROVED instance for the sales order", which is the
  one just approved. Result: action log `CREATED > REVERTED > APPROVED`, instance status REVERTED, the discount reverted.
  Seen on instances 257, 258, 259, 262; instance 261 ended APPROVED (intermittent, likely depends on the sales order having a
  discount already). Proposed fix: apply the discount first, set APPROVED afterwards. The in-app approve button is affected too.
  NotiShell shows an approval the service accepted as the approver's own even when the instance then reads REVERTED.
- `OP_DISCOUNT_APPROVED` (sent by ipd) never reaches `OP_DISCOUNT_APP` / `OP_DISCOUNT_REJ` handlers: those result messages
  never fire.
- Credit-note discount requests (`CREDIT_NOTE_DISCOUNT`) are never notified: ipd only builds the message for
  `ApplyMultipleDiscountsRequestDTO`.
- A 404 from ipd while loading the instance is a temporary failure (canary served 404 for the same call during a restart);
  Mobility answers 502 so the page says "try again", never "link not recognised".
- A percentage discount's `amount` in the request data is the percent (30.0 = 30 %); the amount in money is computed from the
  bill in `WorkflowInstanceServiceImpl.fillDiscountDetails`.
- Local run: in zsh pass the JVM flags as an array (`"${COMMON[@]}"`); an unquoted variable becomes one argument and Mobility
  fails on `${CONSUL_HOST}`. Mobility also needs canary's Consul on port 8500 (VPN) at start.

## 8. Not verified

Real SMS, email and WhatsApp delivery with these texts; refund approval end to end with real data (only mocked in tests);
the Settings screen labels (taken from route names); the self-revert in the refund approval path (only the discount path was read).

## 9. Tests

notification-service: `ApprovalNotificationServiceTest`, `ApprovalMessageDetailsTest`, `ApprovalConfiguredTemplateTest`,
`DefaultNotificationDefaultsTest`, `ChangeUnit0006CreateApprovalActivitiesTest`.
Mobility: `InstanceApprovalLinkTest`, `InstanceApprovalLinkApiTest`, `ApiGatewayClientTest`.
