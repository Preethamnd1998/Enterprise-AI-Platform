# Playwright E2E — Optional Automation Layer

**Verified stack:** `@playwright/test` `^1.62.1` in `Playright-Projects/package.json`.
`playwright.config.ts` is the **default, largely unedited CLI scaffold** —
`baseURL` and `webServer` are both commented out, meaning every test must
`page.goto()` a full absolute URL itself, and Playwright does **not** auto-start
a dev server before running. Confirmed real target environment from the one
existing spec: `https://v2qa.lifetrenz.com` (a QA environment, not local).

Per `testing.md` §1: Playwright is an **optional** plugin/soft dependency for the
`/test` command — its absence should never block `/test`'s core output.

## Current state — read before adding to this suite

`Playright-Projects/tests/lifetrenz-flow.spec.ts` is a **raw, unedited Playwright
Codegen recording** (`npx playwright codegen` output saved as-is), not a
maintained test. It has every problem covered in
[testing-anti-patterns.md](testing-anti-patterns.md):

- Hardcoded test credentials in plaintext (`fill('preetham')`, a plaintext
  password) — see `rules/security.md`: credentials never belong in source,
  including test source. **Flag this for the file's owner to rotate/parameterize;
  do not add more specs following this pattern.**
- Brittle, position-based selectors (`.nth(2)`, `div` filtered by visible text)
  that break the moment unrelated UI content shifts.
- **Zero assertions** — the whole file drives the UI and checks nothing; it
  proves the recorder could click through the flow once, not that the
  application behaved correctly.
- No `test.describe` grouping, no fixtures, no page objects — a single anonymous
  `test('test', ...)`.

**Do not use this file as a template.** It's kept here as the concrete "before"
example this knowledge base's guidance exists to prevent.

## When to use Playwright E2E (and when not to)

**Use it for:**
- A small number of **critical, cross-cutting user journeys** — login → navigate
  to a module → complete one core action — where a real browser, real network,
  and real backend integration matter more than isolating one layer.
- Smoke-testing a deployment (does the QA/staging environment actually come up
  and let a user log in) — a different purpose from regression coverage.

**Don't use it for:**
- Anything a component test (Angular/Jasmine, or React/RTL) or an API test
  ([java-api-testing.md](java-api-testing.md)) can cover faster and more
  reliably. E2E is the slowest, most environment-sensitive, most flaky-prone
  layer — reserve it, don't default to it.
- Validation-rule coverage (BVA/EP-style input sweeps) — write those as
  component or API tests; driving 15 boundary-value variants through a real
  browser is slow and adds little over one that hits the API/component
  directly.

## Turning a codegen recording into a real test

```typescript
import { test, expect } from '@playwright/test';

test.describe('Patient registration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://v2qa.lifetrenz.com/#/auth/login');
    await page.getByRole('textbox', { name: 'User Name' }).fill(process.env.E2E_USERNAME!);
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.E2E_PASSWORD!);
    await page.getByRole('button', { name: 'LOGIN' }).click();
    await expect(page).toHaveURL(/#\/home/);
  });

  test('registers a new patient and confirms it appears in the patient list', async ({ page }) => {
    await page.getByRole('link', { name: 'Patient Registration' }).click();

    await page.getByRole('textbox', { name: 'Enter first name' }).fill('Test');
    await page.getByRole('spinbutton', { name: 'Enter Age' }).fill('30');
    await page.getByRole('button', { name: 'Register patient' }).click();

    // an actual assertion — the recording had none
    await expect(page.getByText(/Patient registered successfully/i)).toBeVisible();
    await expect(page.getByRole('cell', { name: /^RMH\// })).toBeVisible();
  });
});
```

Changes from the raw recording, and why each matters:
- **Credentials from environment variables**, never hardcoded — set
  `E2E_USERNAME`/`E2E_PASSWORD` via CI secrets or a local `.env` (gitignored, per
  `rules/security.md`), never committed.
- **Role-based locators** (`getByRole`) instead of brittle `div`/`nth()` chains —
  resilient to unrelated layout changes.
- **Real assertions** at the end of the flow — a success message and the new
  record actually appearing, not just "the clicks didn't throw."
- **`test.describe` + `beforeEach`** for the shared login flow, so it's written
  once and reused, not copy-pasted into every spec.

## Config hygiene — close the gaps in the current scaffold

- Set `baseURL` in `playwright.config.ts` once a real target environment is
  agreed (currently commented out — every test hardcodes a full URL, which
  breaks the moment the target environment changes).
- Consider a `webServer` block only if this suite is ever meant to run against a
  locally-started app rather than a shared QA environment — for now, tests
  target `v2qa.lifetrenz.com` directly, so `webServer` should likely stay
  disabled rather than being enabled with a mismatched assumption.
- `trace: 'on-first-retry'` and `retries: process.env.CI ? 2 : 0` are sensible
  scaffold defaults — keep them; they give a trace file to inspect exactly when a
  test starts flaking in CI.

## What NOT to do

- Don't save further raw Codegen output directly as a committed spec — Codegen is
  a fine **starting point** for discovering selectors, but every recording needs
  the assertions, credential-handling, and locator cleanup shown above before
  it's a real test.
- Don't use Playwright to test validation logic that a unit/component/API test
  already covers more cheaply (see the "when not to" list above).
- Don't hardcode a QA environment's data assumptions (a specific patient ID, a
  specific existing record) into an E2E test without creating that data within
  the test itself first — a shared QA environment's data drifts, and a test
  depending on "whatever happens to be there" will eventually fail for reasons
  unrelated to a real regression.
