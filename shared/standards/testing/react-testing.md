# React Testing — Jest + React Testing Library

> **Verification note:** no React application exists anywhere in this workspace
> (`UI-BE` contains only the Angular `lifetrenz-core` frontend; no `react`
> dependency, no `.jsx`/`.tsx` component tree, no CRA/Vite/Next config was found).
> This file is **reference guidance for if/when a React codebase is worked on**
> (a separate repo, a new module) — it documents standard, stable Jest/RTL APIs,
> not anything invented for this workspace. **Before applying anything here,
> confirm the target project's actual dependencies** (`package.json` for `react`,
> `@testing-library/react`, `jest` vs `vitest`) rather than assuming this stack.

## Stack assumptions this file makes (verify before use)

- Test runner: Jest (per `testing.md` §1's detection table: `package.json` +
  `jest.config.*`). If the target project uses Vitest instead
  (`vitest.config.*`), the APIs below are near-identical (`vi` vs `jest`
  namespace) but confirm before copy-pasting.
- Testing library: `@testing-library/react` + `@testing-library/user-event` —
  the current community standard for behavior-driven component testing (as
  opposed to Enzyme, which is legacy and shallow-rendering-oriented).

## Component testing

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

test('renders username and password fields', () => {
  render(<LoginForm onSubmit={jest.fn()} />);
  expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
});
```

**Decision rule:** query by role/label/text (`getByRole`, `getByLabelText`) the
way a real user or screen reader would find the element — not by test-id or CSS
class as a first choice. Reserve `data-testid` for elements with no accessible
role/label (e.g., a purely decorative loading spinner).

## Hooks / state testing

```jsx
import { renderHook, act } from '@testing-library/react';
import { useCountdown } from './useCountdown';

test('useCountdown decrements every second and stops at zero', () => {
  jest.useFakeTimers();
  const { result } = renderHook(() => useCountdown(3));

  act(() => jest.advanceTimersByTime(1000));
  expect(result.current).toBe(2);

  act(() => jest.advanceTimersByTime(2000));
  expect(result.current).toBe(0);

  jest.useRealTimers();
});
```

Always pair `jest.useFakeTimers()` with `jest.useRealTimers()` (in an `afterEach`
if used across multiple tests) — a leaked fake-timer context silently breaks
unrelated tests later in the same file.

## Forms

```jsx
test('submit button is disabled until required fields are filled', async () => {
  render(<LoginForm onSubmit={jest.fn()} />);
  const submit = screen.getByRole('button', { name: /log in/i });
  expect(submit).toBeDisabled();

  await userEvent.type(screen.getByLabelText(/username/i), 'alice');
  await userEvent.type(screen.getByLabelText(/password/i), 'secret');
  expect(submit).toBeEnabled();
});

test('shows a validation message for a mismatched confirm-password field', async () => {
  render(<ChangePasswordForm />);
  await userEvent.type(screen.getByLabelText(/new password/i), 'Abcd1234!');
  await userEvent.type(screen.getByLabelText(/confirm password/i), 'Different1!');
  await userEvent.click(screen.getByRole('button', { name: /submit/i }));

  expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
});
```

Prefer `userEvent` over `fireEvent` — it simulates the full sequence of real
browser events (focus, keydown, input, keyup) rather than dispatching a single
synthetic event, catching bugs that only manifest with realistic event ordering.

## API interaction

Mock at the network boundary (via `msw` — Mock Service Worker — if available, or
`jest.mock` on the fetch/axios client module), not by mocking the component's own
internal function:

```jsx
import { server } from '../test/mswServer'; // if MSW is set up in the target project
import { http, HttpResponse } from 'msw';

test('shows an error toast when the login API returns 401', async () => {
  server.use(
    http.post('/api/auth/login', () => HttpResponse.json({ error: 'invalid_grant' }, { status: 401 })),
  );

  render(<LoginForm />);
  await userEvent.type(screen.getByLabelText(/username/i), 'alice');
  await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
  await userEvent.click(screen.getByRole('button', { name: /log in/i }));

  expect(await screen.findByText(/invalid username or password/i)).toBeInTheDocument();
});
```

If MSW isn't set up in the target project, `jest.mock('./api/authClient')` with a
resolved/rejected promise is the fallback — but confirm which pattern the project
already uses before introducing a second one.

## User interaction, loading/error/empty states

```jsx
test('shows a loading spinner while the request is in flight, then the result', async () => {
  render(<UserList />);
  expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();

  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(screen.queryByRole('status', { name: /loading/i })).not.toBeInTheDocument();
});

test('shows an empty state when the API returns zero results', async () => {
  server.use(http.get('/api/users', () => HttpResponse.json([])));
  render(<UserList />);
  expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
});
```

## File upload / import

```jsx
test('rejects a file over the size limit before upload', async () => {
  render(<ExcelImport maxSizeMb={20} />);
  const oversized = new File([new ArrayBuffer(21 * 1024 * 1024)], 'big.xlsx');

  await userEvent.upload(screen.getByLabelText(/upload file/i), oversized);

  expect(await screen.findByText(/exceeds the maximum/i)).toBeInTheDocument();
});
```

## Accessibility

```jsx
import { axe } from 'jest-axe'; // only if the target project has jest-axe installed

test('login form has no accessibility violations', async () => {
  const { container } = render(<LoginForm />);
  expect(await axe(container)).toHaveNoViolations();
});
```

Don't assume `jest-axe` (or any a11y tool) is installed — check `package.json`
first; if it isn't and a11y testing is genuinely needed, propose adding it
explicitly rather than silently assuming.

## Regression testing

Same discipline as every other layer in this knowledge base — see
[coverage-and-regression.md](coverage-and-regression.md): a fixed bug gets a named
permanent test asserting the specific condition that broke, not a general
smoke-test re-run.

## Playwright as optional E2E — see the dedicated file

For end-to-end coverage across a React app's full stack, see
[playwright-e2e.md](playwright-e2e.md) — the same optional-E2E-layer guidance
applies regardless of whether the frontend is Angular or React.
