# Public gateway + Mobility contract + NotiShell — what to touch for a new link screen

Verified 2026-11-02 on: public-gateway-service MRs !168 (development) / !169 (V2-QA), NotiShell branch
`feature/54064-notishell-native-approval` (MR !12), Mobility `feature/54064-decided-link-details`.

## 1. Mobility link API (as the browser sees it through the gateway)

Native Mobility path `/mobility/v1/n/**`; through the public gateway (`/{serviceId}/**`, prefix stripped once) it is `/mobility/mobility/v1/n/**`.
The client token is native `/route/auth/client/token`, so through the gateway `/mobility/route/auth/client/token` (JSON body `{}`, else 415).

| Call | Auth | Result |
|---|---|---|
| `GET  /n/{code}` | client token | `LinkView{code,state,purpose,requestType,reference,requesterName,expiresAt,loginType,ttlHours,...}`; 404 unknown code |
| `POST /n/{code}/login` | client token | `LoginResult{accessToken,expiresIn,username,displayName}`; 401/423(locked)/409(active session)/503 |
| `GET  /n/{code}/request` | user token | link + `embed{requestId,transactionRequestId,siteId,customerId,customerBusinessId}`; 403 not approver; 410 already decided (+ `decision`) |
| `POST /n/{code}/action` | user token | `WF_APPROVAL` only: Mobility forwards APPROVE/REJECT/SEND_BACK to supplementary |
| `POST /n/{code}/complete` | user token | instance-bound purposes: re-reads instance, link -> `USED`/`CLOSED`; 409 still PENDING |
| `POST /ltauth/logout?username=` | user token | ends the Lifetrenz session |

Link states: `ACTIVE`, `USED`, `CLOSED`, `REVOKED`, `LOCKED`; `EXPIRED` is derived when `expiresAt` has passed. Cache-Control `no-store`.

## 2. Public gateway allowlist

File `src/main/resources/api-allowlist.yml` in `public-gateway-service` (routes: `/{serviceId}/**`, `stripPrefix(1)`; matched on
service + method + **stripped** path, AntPathMatcher, lower-cased).

```yaml
    - service: ipd
      base-url: ${service-endpoints.ipd}
      paths:
        - method: GET
          pattern: /discount/transaction/requests
          user-token-required: true
          # list endpoint with open filters — only one request by id may be read
          required-params:
            - transactionReqestId
            - pageSize=1
        - method: POST
          pattern: /workflow/instance/*/approve/*
          user-token-required: true
          # Front Desk appends the site id: /workflow/instance/{id}/approve/{siteId}
```
Add new paths under the service's existing `paths:` list (do not repeat the service block); add a comment naming the screen and Redmine id.

Rules:
- `user-token-required: true` -> filter `ApiAllowlistGatewayFilterFactory` admits only a user's JWT (`preferred_username` present, not
  `service-account-*`, no `clientId` claim). The anonymous client token gets 403 "needs a signed-in user's token".
- `required-params` -> `name` or `name=value` must be present in the query (stops using a list API to enumerate).
- `SecurityConfig.PUBLIC_PATHS` = paths reachable with **no** JWT (only the client-token endpoint and the link resolve/login). It matches the full
  incoming path before the strip. Do not add data paths.
- Add each new entry to `NotiShellAllowlistTest` (`isAllowed` true for the exact call, false for near-misses, guard flags). 25 tests today.
- Existing exposure to know about: `GET /ipd/op/sales/order/receivables` is allowed with the anonymous token (pre-existing).

## 3. NotiShell structure (React 18 + Vite + Karma/Jasmine)

```
src/app/            App shell, features.ts (purpose -> lazy feature), approval-host (loads request, completes link)
src/common/         api/ApiService (the ONLY fetch), config, service (link, auth, routing), session, types, util, styles, components, testing
src/main/<feature>/ dto/<f>-api-constant.ts, dto/<f>.dto.ts, service/<f>.service(+spec), <f>-approval/{template.tsx,component.scss,component.ts,component.spec.ts}, index.ts
tools/              check-structure.mjs (run by npm test), generate.mjs
```
Rules: four files per component; feature imported only through its `index.ts`; no `fetch` outside `ApiService`; every call
`ApiCallHelper{service: 'mobility'|'ipd'|'ltauth', method, path, params?, body?, token?}`; `ApiCallBack` with `onResult/onError`.
Config: `VITE_API_BASE` = the public gateway (default `/public-gateway`); optional per-service overrides `VITE_MOBILITY_BASE`,
`VITE_AUTH_BASE`, `VITE_IPD_BASE`.

## 4. Add a feature

```
npm run generate -- feature purchase ipd          # scaffolds src/main/purchase
```
1. `dto/purchase-api-constant.ts`: paths with `{id}`, `{siteId}` (same as the Front Desk screen's constants) + a `PURCHASE_CALL` key map.
2. `service/purchase.service.ts`: one method per call using `apiService.getData(call, callback, type)`; token passed in the call.
3. Component: view-model in `.component.ts`; markup only in `.template.tsx`; styles use the breakpoints mixin (phone <= 640, desktop > 1000); fixed bottom
   action bar on phone; confirm with `common/components/confirm-dialog`.
4. Decision flow: load -> show -> on Approve/Reject open confirm -> RECHECK (re-read instance) -> if not pending `onAlreadyDecided()`
   else call approve/reject -> `onDecided(outcome)`; a 409 also means already decided. Optional remarks follow the Front Desk rule for that screen.
5. Register: `src/app/features.ts` add `PURCHASE_APPROVAL: lazy(() => import('../main/purchase').then(m => ({ default: m.PurchaseApprovalComponent })))`;
   add `'PURCHASE_APPROVAL'` to `InstanceApprovalPurpose` (`common/types/link.types.ts`) and to `isInstancePurpose`.
6. Help text (`common/util/helpText.ts`) and the "done" wording if the purpose needs its own.
7. Tests: spec for service (paths/params), component (render, validation, confirm, recheck, already-decided, session-expired), fixture JSON from a
   sanitized real response, e2e in `e2e/approval-native.pw.ts` (mock Mobility + service from the fixtures), `npm test`, `npm run build`.

## 5. Other login types
`common/service/auth.service.ts` resolves the token from `link.loginType`: `USER_LOGIN` (sign-in page, user token), `PATIENT_LOGIN`
(patient token), `NO_LOGIN` (client token), `OTHER` (throws `UNSUPPORTED_LOGIN_TYPE`, never falls back). A link with no loginType from an old
server is `USER_LOGIN` only for `WF_APPROVAL`. A non-approval screen (patient report, OTP page) needs: a route in `common/config/route.constants.ts`, a
branch in `common/service/link-routing.ts`, its own feature folder, and allowlist entries that accept the matching token.

## 6. Environments
Dev server proxies `/public-gateway` (`NOTISHELL_GATEWAY_PROXY` for a local gateway). Deployed app path `/Modules/NotiShell/`, hash routing;
nginx example `deploy/nginx-notify.conf.example`. The gateway on dev is deployed from `development`.
