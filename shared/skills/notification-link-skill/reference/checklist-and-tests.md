# Checklist and verification matrix

Copy into the task plan (`MY PLANS/<redmine>-<name>/PLAN.md`) and tick as you go.

## A. Design (before code)
- [ ] Kind chosen: A message only / B link to a view / C link to a decision
- [ ] Request type `<CODE>` and link purpose `<PURPOSE>` named; login type chosen (`USER_LOGIN` / `PATIENT_LOGIN` / `NO_LOGIN`)
- [ ] Who is notified (approvers / requester / patient) and over which channels
- [ ] Lifespan decided (default 72 h or `notification.link.ttl-hours.<CODE>`)
- [ ] Owning service endpoints the screen calls (detail, is-approver, approve/reject) listed
- [ ] Branch plan: from V2-QA, MR to development, same branch MR to V2-QA (separate branch from development if they diverged)

## B. Implementation
- [ ] Trigger: publishes `{requestType, data}` on `lt.notification.events` after commit; failure never fails the business action
- [ ] notification-service: enum, `LoginTypeRegistry`, consumer case, handler/`Kind`, link spec, default texts per channel, Mongock seed
- [ ] Mobility: `InstanceApprovalPurpose` entry (detail path -> `data.status`, `data.transactionRequestId`; approver path -> boolean)
- [ ] Public gateway: allowlist entries (`user-token-required`, `required-params`), `NotiShellAllowlistTest` updated, no data path in `PUBLIC_PATHS`
- [ ] NotiShell: feature generated, constants, service, component (4 files), `features.ts`, `InstanceApprovalPurpose`, help text, tests
- [ ] Knowledge updated (`notification-service-knowledge`, `notishell-knowledge`) with a change-history entry in each

## C. Verification matrix

| Check | Command / how | Pass means |
|---|---|---|
| notification-service unit | `./mvnw test -DskipTests=false -Dtest='Approval*Test,LoginTypeRegistryTest,LinkTtlPolicyTest,ChangeUnit*Test'` | green; no unmapped enum |
| Mobility | `./mvnw test` (`NotificationLink*`) | resolve -> login -> request -> complete journey green |
| Gateway | `./mvnw test -Dtest='NotiShellAllowlistTest,ApiAllowlistGatewayFilterFactoryTest'` | every new path allowed, near-misses refused, anon token 403 |
| NotiShell | `npm run typecheck && npm test && npm run build && npx playwright test` | structure check, Karma, Vitest, build, e2e at 1440/1280/390/375 |
| Link created | trigger the event on canary/local, read `url_mapping` and Mongo `notification_url` | one doc, `ACTIVE`, correct `expiresAt`, `loginType` |
| Message text | read the queued `messageBody` per channel | link present, no patient name in SMS/WhatsApp, "Click here" in email |
| Gateway live (anonymous) | client token -> resolve unknown code -> data path with client token | 200 / 404 / 403 |
| Signed-in journey | open the real link, sign in, decide | state `USED`, decision recorded by the owning service |
| Expiry | set a short TTL, wait | resolve shows `EXPIRED`, login/action refused 410 |
| Already decided | decide in Lifetrenz web first, open link | "already completed", no decision call is sent |

State clearly what was **not** verified (real SMS/email/WhatsApp delivery, a signed-in approval on a deployed environment).

## D. Debugging "link not valid / not recognised"
1. `url_mapping` has the code? No -> link creation failed (base URL not absolute, Kafka ack failed): grep `[ApprovalLink]` / `[WfLink]` logs.
2. Mongo `notification_url` has the code? No -> Mobility did not consume `lt.mobility.notification-url` (consumer error swallowed, wrong topic/group); check Kafka lag.
3. State? `EXPIRED` / `USED` / `CLOSED` / `LOCKED` explain the page; `notification_url_event` is the audit trail.
4. 403 on a data call -> missing/wrong allowlist entry or the anonymous token on a `user-token-required` path.
5. 415 on the client token -> body must be JSON `{}` with `Content-Type: application/json`.
6. 404 on the link API through the gateway -> path must be `/mobility/mobility/v1/n/...` (two `mobility`).
