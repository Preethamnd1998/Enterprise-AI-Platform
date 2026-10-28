# NotiShell: the web app that notification links open (discount and refund approvals in an iframe)

Repo `ui/notishell` (React, Vite, TypeScript). Redmine #41100, #51456 (delivery #54064). Captured 2026-10-28.
**verified** = read in code or exercised in tests/browser; **inferred** = reasoned; **not verified** = never run.

Read with `Approval-Notifications-Notification-Service.md` (who sends the link, the Mobility link API, known ipd bug).

## 1. What it is

A small standalone app served at `<host>/Modules/NotiShell/`. A mail, SMS or WhatsApp link looks like
`<host>/Modules/NotiShell/#/n/<code>`. The person signs in with their Lifetrenz account, sees the request and decides in the
real Front Desk approval screen, shown in an iframe. NotiShell never decides anything itself.

## 2. Build and routing (verified)

- Fixed base `/Modules/NotiShell/` (`vite.config.ts`, override `NOTISHELL_BASE`), **hash routing** by default
  (`src/main.tsx`; `VITE_ROUTER=path` switches to path routing). The host serves plain static files with no SPA fallback.
- A server build is plain `npm run build`. The defaults live in `src/config.ts` (override with env if a host differs):
  `VITE_MOBILITY_BASE=/api-gateway/mobility`, `VITE_AUTH_BASE=/api-gateway/ltauth`, `VITE_FDM_BASE=/Modules/FDM/`,
  `VITE_CLIENT_TOKEN_PATH=/route/auth/client/token`, `VITE_LIFETRENZ_WEB`, `VITE_ORG_NAME`. All are relative, so the app
  follows whatever host serves it. `npm run build:e2e` sets base `/notify/`, path routing and its own values for the mock tests.
- Routes (`src/App.tsx`): `/` landing page, `/n/:code` (gate), `/n/:code/login`, `/review`, `/approval` (discount, refund),
  `/confirm/:action`, `/done`, and one status page per state (`expired, used, closed, revoked, locked, invalid, forbidden,
  conflict, error, signed-out, unsupported`).

## 3. The flow, in order (verified against canary and local Mobility)

1. `POST <mobility>/route/auth/client/token` (no auth) gives an anonymous **client token**.
2. `GET <mobility>/mobility/v1/n/<code>` with that token: link state and data. **The gateway answers 401 without the client
   token** on this call and on login. `src/api/client.ts` registers a token provider (`setPublicTokenProvider`, set by
   `src/auth/authService.ts`) so `resolve` and `login` always carry it (one cached, shared request).
3. `POST .../login` (client token) with the Lifetrenz user name and password: returns the user token (kept per link in
   sessionStorage, `src/session.ts`).
4. `GET .../request` (user token): the ids for the frame (`requestId`, `transactionRequestId`, `siteId`, `customerId`,
   `customerBusinessId`) or 403 (not an approver), 410 (dead, with who decided), 502 (try again).
5. The iframe opens `<FDM>/#/approval-embed/discount-approval/embed/<transactionRequestId>` (discount) or
   `.../refund-request/embed/<workflowInstanceId>` (refund) (`src/lib/embedBridge.ts`).
6. The frame says `LT_READY`; NotiShell answers `LT_AUTH {token, ids}`; the frame loads its data with the user's own token.
7. The frame reports `LT_DONE {status}` after a decision; NotiShell calls `POST .../complete`, which closes the link.
8. "Sign out" and "Sign in as someone else" call `POST <auth>/logout?username=<user>` (user token, best effort, 4 s cap), then
   clear the stored sign-in (`src/lib/signOut.ts`).

### Embed protocol (verified; `embedBridge.ts` here, `embed-protocol.ts` in the Front Desk host)

`LT_READY` (frame to parent), `LT_AUTH` (parent to frame, token and ids), `LT_DONE` (status APPROVED, REJECTED, CANCELLED,
ALREADY_ACTIONED), `LT_AUTH_EXPIRED`. **Gotcha:** the frame accepts `LT_AUTH` only from its parent window **on the frame's own
origin**, so NotiShell and Front Desk must be served from the same origin (deployed: both under the same host).

## 4. What the person sees after a decision (verified, unit and browser tests)

- The screen reports a decision only after the service accepted it, so it is the person's own. NotiShell then calls
  `complete` and shows "Approval/Rejection/Cancellation recorded".
- `ALREADY_ACTIONED` (the service refused with 409: someone else acted first, or it was reverted): nothing is recorded for the
  person. NotiShell re-reads the request and shows "Already decided: someone else has already acted on this request, so this
  link is no longer valid", with who decided, when and the comment.
- If `complete` returns a different ending from what the frame reported, that is also "someone else decided", **except REVERTED**:
  ipd-service can end an approved request as REVERTED (the self-revert bug); that is still the approver's own approval.
- Expired sign-in (401): sign-in page with "You kept this page open for too long, so your sign-in expired. Sign in again to
  continue." Temporary server problems (502, network) show "Something went wrong ... try again". A 404 for a link is the only
  "Link not recognised" case.
- "Close" tries `window.close()`; browsers refuse it for a link opened from mail, so it then goes to the static landing page
  (`src/lib/closeWindow.ts`), never a blank page. There is no "View the request" or "Open Lifetrenz" link.
- The number at the top is labelled "Sales order <SOR/...>" (discount) or "Refund request <...>" (`src/lib/reference.ts`).
  The help section (`src/screens/helpText.ts`, `HelpNote`) uses the link's own number, never a made-up example.

## 5. Look and layout (verified)

Light theme by default on every screen, whatever the device setting; the toggle saves `lt.nw.theme` in localStorage
(`src/lib/theme.ts`, `data-theme` on `<html>`). The approval page uses up to 1600 px (`.nw-main.is-wide`). The sign-in page has
a left panel (brand, steps, note) hidden below 1000 px.

## 6. Running it locally (verified)

`npm run dev` serves `http://localhost:4400/Modules/NotiShell/` (any port with `--port`). `vite.config.ts` `server.proxy` sends
`/api-gateway` and `/Modules/FDM` to canary (`NOTISHELL_PROXY`, default canary) so sign-in and the iframe are same-origin. A
build has no proxy.

- `NOTISHELL_FDM_PROXY=http://localhost:4440`: serve a locally running Front Desk (`ng serve --serve-path /Modules/FDM/` with
  `baseHref /Modules/FDM/`) on NotiShell's origin.
- `NOTISHELL_MOBILITY_PROXY=http://localhost:55019`: send the link calls to a local Mobility (needs Mongo with the link
  records, Kafka optional, VPN for Consul).
- **Gotcha, CORS:** canary's gateway answers an empty 403 to a browser whose Origin is a localhost port other than 4440 and 4200
  (checked with OPTIONS). The proxy sends canary's own origin to avoid it, and NotiShell showed this as "not an approver".
  A frame calling canary directly from another origin gets every call blocked and shows an empty screen.
- Unit tests `npx vitest run`; browser tests `npm run build:e2e` then `npx playwright test` (set `PW_CHROMIUM` to a Chrome).
  Playwright serves the build with `NOTISHELL_BASE=/notify/ npx vite preview --port 4400`; a stale server on that port gives false failures.

## 7. Front Desk side (verified in code; deployed state of canary checked 2026-10-28)

Host app: route `approval-embed` (`src/app/app-routing.module.ts`), `src/app/base/embed/` (`embed-protocol.ts`, `embed-bridge.ts`,
`embed-bootstrap.ts`, `embed-cookie.service.ts`). The embedded session is held in memory only (no real cookies). Bootstrap waits
for `LT_AUTH`, seeds cookies from it, loads the user profile and the site list (the site's region sets decimal places and
currency format). Library routes: `discount-approval/embed/:id` (transaction request id) and `refund-request/embed/:id`
(workflow instance id), both reuse the in-app components in `embedMode`.

**Gotcha:** at the time of writing the canary Front Desk bundle did not contain `approval-embed` (searched the entry bundle and all
52 lazy chunks), so the iframe could not show the screen there until the host and library changes are deployed together (the host's
recorded library pointer must include the embed route).

## 8. Not verified

A real sign-in and approval on a deployed environment (canary was only reached through the local proxy and a local Mobility);
the refund screen with real data; the deployed Front Desk with the embed route; phone-size layout beyond the 375 px browser test.
