# Angular Testing — Jasmine + Karma

**Verified stack:** Angular 17, Jasmine `~4.6.0`, Karma `~6.4.2` (`karma-jasmine`,
`karma-chrome-launcher`, `karma-coverage`) — `UI-BE/lifetrenz-core/package.json`.
UI component library is **PrimeNG** (`p-table`, `p-fileUpload`, `p-paginator`,
etc. — confirmed via component templates), not Angular Material — write selectors
and harness expectations against PrimeNG's DOM/CSS classes, not Material's.

**Current state of this suite, honestly:** the `.spec.ts` files found in this
workspace (e.g. `bom-details.component.spec.ts`, `dashboard.component.spec.ts`)
are still the **unedited Angular CLI-generated stubs** (`TestBed.configureTestingModule`
+ a single `'should create'` assertion, using the outdated `async()` helper instead
of the modern `waitForAsync()`/plain `async/await`). Treat any of these as a
placeholder to replace, not a pattern to copy verbatim — in particular, don't
propagate the deprecated `async()` import into new tests.

## Component testing — TestBed basics

```typescript
describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    authServiceSpy = jasmine.createSpyObj('AuthService', ['login', 'removeLogin', 'removeToken', 'removeRefreshToken', 'removeShiftLogin']);

    await TestBed.configureTestingModule({
      declarations: [LoginComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        MessageService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // triggers ngOnInit — builds the reactive forms
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
```

Prefer `jasmine.createSpyObj` over a hand-written fake class for service
dependencies — it fails loudly (with a clear error) if the component calls a
method the spy wasn't told to expect, catching drift between the component and
its test double.

## Form validation testing

`LoginComponent` builds three `FormGroup`s in `ngOnInit`, including a
**cross-field validator** (`passwordsMatchValidator`, a group-level validator
comparing `newPassword`/`confirmPassword`) — this is the pattern to follow for
any multi-field validation, not per-control `Validators.pattern` alone:

```typescript
it('loginForm is invalid when username or password is empty', () => {
  component.loginForm.setValue({ username: '', password: '' });
  expect(component.loginForm.valid).toBeFalse();
});

it('changePasswordForm rejects mismatched passwords via the group validator', () => {
  component.changePasswordForm.setValue({
    newPassword: 'Abcd1234!',
    confirmPassword: 'DifferentPassword1!',
  });
  expect(component.changePasswordForm.hasError('passwordsMismatch')).toBeTrue();
});

it('changePasswordForm accepts matching passwords', () => {
  component.changePasswordForm.setValue({
    newPassword: 'Abcd1234!',
    confirmPassword: 'Abcd1234!',
  });
  expect(component.changePasswordForm.hasError('passwordsMismatch')).toBeFalse();
});
```

Also test the **UX-facing derived state**, not just the raw form validity — e.g.
`LoginComponent.passwordHints`/`isConditionMet`/`isAllPasswordConditionsMet` derive
a live checklist from a runtime-loaded password policy (`policyService.policyData`).
This needs the policy service mocked with representative policy data, and each
hint's real/individual condition function tested — a single "form is valid"
assertion misses bugs in the individual hint-matching regexes.

## Event handling testing

```typescript
it('onKeyboardInput appends a digit up to 8 characters', () => {
  for (let i = 0; i < 8; i++) component.onKeyboardInput(String(i));
  expect(component.passcode.length).toBe(8);
  component.onKeyboardInput('9'); // 9th digit — must be ignored
  expect(component.passcode.length).toBe(8);
});

it('onKeyboardInput "del" removes the last character', () => {
  component.passcode = '123';
  component.onKeyboardInput('del');
  expect(component.passcode).toBe('12');
});
```

## API interaction testing — this codebase's actual pattern (not `HttpClient.subscribe` in the component)

**Important, non-obvious convention**: `LoginComponent` does not subscribe to an
Observable directly. It implements `ApiCallBack` and passes `this` into service
calls (`this.authService.login(payload, returnUrl, this)`); the service invokes
`onResult(data, type, other)` / `onError(err, type, other)` back on the component,
dispatched by a `type` constant (`CommonApiConstant.AUTH_LOGIN`, etc.). **Test this
pattern by invoking the callback methods directly** — don't try to mock an
Observable return value the component never actually subscribes to:

```typescript
it('login() calls authService.login with the callback set to itself', () => {
  component.loginForm.setValue({ username: 'alice', password: 'secret' });
  component.login();
  expect(authServiceSpy.login).toHaveBeenCalledWith(
    { username: 'alice', password: 'secret' },
    'home',
    component, // the component itself is the callback target
  );
});

it('onResult(AUTH_LOGIN) with a token delegates to authService.onLoginCallBack', () => {
  const data = { token: 'irrelevant-in-test' };
  component.onResult(data, CommonApiConstant.AUTH_LOGIN);
  expect(authServiceSpy.onLoginCallBack).toHaveBeenCalledWith(data, undefined);
});

it('onError(AUTH_LOGIN) with password_change_required opens the change-password dialog', () => {
  component.onError({ error: { error: 'password_change_required' } }, CommonApiConstant.AUTH_LOGIN);
  expect(component.passwordChangeRequired).toBeTrue();
});
```

Look for this `ApiCallBack`/`onResult`/`onError` pattern in **any** component
before defaulting to `HttpClientTestingModule`-style mocking — check the actual
service method signature first (does it take a callback argument, or does it
return an `Observable`?). Both patterns exist across a codebase this size; assume
neither without checking the specific component/service pair.

## Error, loading, and empty states

`LoginComponent.errorText` is a real, security-relevant example: it **filters raw
backend error text** so strings like `"NullPointerException"` or `"Cannot invoke"`
never reach the UI, falling back to a generic "Invalid username or password."
message instead. This is exactly the kind of logic that needs explicit test
coverage — a regression here would leak internal stack-trace detail to end users:

```typescript
it('errorText hides raw backend exception text from the user', () => {
  component.setError({ error_description: 'NullPointerException at line 42' });
  expect(component.errorText).toBe('Invalid username or password.');
});

it('errorText passes through a legitimate, safe error description', () => {
  component.setError({
    error: 'invalid_grant', isDisabled: false, passwordExpirySeconds: null,
    maxFailures: 5, numFailures: 2, error_description: 'Incorrect password',
  });
  expect(component.errorText).toContain('3 attempts left');
});
```

Loading-state pattern: assert the boolean flag (`isLoading`,
`isForgotPasswordLoading`, `isChangingPassword`) flips true synchronously on
action and false in both the success (`onResult`) and failure (`onError`) paths —
a common real bug is a flag that's reset on success but left stuck `true` after an
error.

## Countdown / timer logic (`fakeAsync`, not real waits)

`setError`'s account-lockout countdown uses RxJS `interval(1000)` plus a
`setTimeout`. Test this with `fakeAsync`/`tick()`, never a real wall-clock wait:

```typescript
it('countdown decrements every second and clears at zero', fakeAsync(() => {
  component.setError({ isDisabled: true, remainingSeconds: 3 });
  expect(component.countdown).toBe(3);

  tick(1000);
  expect(component.countdown).toBe(2);

  tick(2000);
  expect(component.countdown).toBeNull(); // cleared once it reaches zero
  discardPeriodicTasks();
}));
```

`discardPeriodicTasks()` is required here — an un-cleared `interval` subscription
left running will make `fakeAsync` fail with "periodic timer still in the queue"
and can leak between tests otherwise.

## Pagination / filter / sort (PrimeNG `p-table`)

Test the **component's own state/query-building logic** feeding the table, not
PrimeNG's internal rendering:

```typescript
it('onPageChange updates the page index used for the next API call', () => {
  component.onPageChange({ first: 20, rows: 10 });
  expect(component.currentPage).toBe(2); // 20/10
});

it('onSort builds the correct sortField/sortOrder query params', () => {
  component.onSort({ field: 'createdOn', order: -1 });
  expect(component.lastQueryParams.sortField).toBe('createdOn');
  expect(component.lastQueryParams.sortOrder).toBe('desc');
});
```

Don't assert against `p-table`'s rendered DOM rows for logic-level pagination/sort
tests — that couples the test to PrimeNG's template internals. Reserve DOM
assertions (`fixture.debugElement.query(By.css(...))`) for verifying your own
template bindings (e.g., "the loading spinner shows while `isLoading` is true").

## File upload / Excel import UI

For a PrimeNG `p-fileUpload`-driven component, test the **component method bound
to the upload event**, not the PrimeNG widget itself:

```typescript
it('onFileSelect rejects a file over the configured size limit', () => {
  const oversized = new File([new ArrayBuffer(21 * 1024 * 1024)], 'big.xlsx'); // > 20MB limit
  component.onFileSelect({ files: [oversized] } as any);
  expect(component.uploadError).toContain('exceeds the maximum');
  expect(component.selectedFile).toBeNull();
});

it('onFileSelect accepts a valid .xlsx file', () => {
  const valid = new File(['content'], 'import.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  component.onFileSelect({ files: [valid] } as any);
  expect(component.selectedFile).toBe(valid);
  expect(component.uploadError).toBeFalsy();
});
```

Match the size/type limits asserted here against the **actual backend contract**
for the specific import (see [java-file-upload-testing.md](java-file-upload-testing.md))
— a frontend test asserting a made-up limit that doesn't match the backend's real
`isValidFileFormat`/size config gives false confidence.

## Accessibility-related testing

- Assert critical interactive elements have accessible names/roles Playwright (or
  a Jasmine DOM query) can locate reliably — e.g. `fixture.debugElement.query(By.css('button[aria-label="LOGIN"]'))`.
  finding a button by visible role/label rather than by CSS class alone also
  keeps the test resilient to styling refactors.
- Verify focus management on dialogs (`forgotPasswordDialog`,
  `passwordChangeRequired`) — when a dialog opens, is focus moved into it? This is
  a common real accessibility regression when dialogs are toggled via a boolean
  flag rather than a dedicated focus-trap directive.
- Don't assume a dedicated a11y testing tool (e.g. `axe-core`) is wired in — it
  wasn't found in `package.json`; if genuinely needed, propose adding
  `@angular-eslint`/`axe-core` explicitly rather than assuming it's available.

## Regression testing

Follow the same discipline as [coverage-and-regression.md](coverage-and-regression.md):
every fixed Angular bug (a form validator edge case, a state flag left stuck, an
error-message leak like the `errorText` filtering above) gets a permanent spec
tied to the specific condition, not just a re-run of "should create."
