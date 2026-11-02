---
name: print-header-footer-browserprint-skill
description: |
  Institutional root-cause-and-fix reference for this codebase's shared browser-print technique
  (iframe + <table><thead>/<tbody>/<tfoot>) used across multiple casesheet/report print flows to
  make a header repeat on every printed page and a footer stay pinned to the bottom of every
  page — this is COMMON, shared print functionality, not a one-off: at least three real
  components (ProcedureSummaryComponent, PacPrintOutComponent, PrintOrderComponent) independently
  port the same pattern. Covers: logo/header not repeating on every printed page, footer not
  pinned to the bottom, print output blank or unstyled after moving to an iframe, content
  silently clipped at a page boundary, a blank gap under the header, too many nested borders,
  content split/garbled across a page break on a box with a border/background
  (box-decoration-break), a PrimeFlex utility-class override (!important) silently losing to an
  Angular-encapsulated attribute selector, a flex-laid-out block (e.g. a signature block) getting
  cut in half across two printed pages, or print output not fitting on one page. Distilled from
  Redmine #49419 (PAC/Procedure print flow) and updated with the newer, more robust fixes found in
  PrintOrderComponent's independent port of the same pattern. MUST be loaded by any agent asked to
  fix a print-layout bug on a casesheet/report component, port this iframe print technique to a
  new component, or diagnose why printed output is blank/unstyled/clipped/split-across-pages/
  missing a repeating header or pinned footer/not fitting on one page.
metadata:
  type: skill
  scope: frontend-print-layout
  stack: angular, html-table-print, css-print-media
  audience: frontend-agents, healthcare-frontend-engineer, debugging-agents
  source: "Converted from print-header-footer-detailed-analysis-imp.md (Redmine #49419 RCA), 2026-10-13; updated 2026-10-13 with fixes found in PrintOrderComponent (src/module/case-sheet/casesheet-component/print-order/), a third, independent, later port of this same pattern."
---

# Print Header/Footer/Browser-Print Skill — Multi-Page Print RCA & Fix Pattern

> The institutional pattern for making a header repeat on every printed page and a footer pin to
> the bottom of every printed page in this codebase's Angular print flows (the shared
> "browser-print" technique), plus every regression found across its three known real
> implementations and exactly why each one happened. Read this top to bottom before touching a
> `print()`/`printPage()` method that currently calls `window.print()` directly on multi-page
> content — it is written so an agent with zero prior context on this codebase's print flows can
> port the fix correctly and diagnose a recurrence without re-deriving the root causes from
> scratch.

## When to use this skill

Load this skill immediately when the task is any of:
- "Logo/header only prints on one page, not every page" / "footer should be pinned to the
  bottom of every printed page" (the original bug shape — Redmine #49419).
- Porting the iframe + `<table>` browser-print technique (§10a) to a **new** casesheet/report
  component that currently calls `window.print()` directly on multi-page content. This is
  genuinely common functionality — treat a new request to "add print with repeating
  header/footer" as "port this skill's pattern," not as a fresh design problem.
- Print output is blank, unstyled, has a gap under the header, is missing its footer, has too
  many nested borders, splits a bordered/backgrounded box awkwardly across a page break, loses a
  CSS override to a PrimeFlex utility class, cuts a flex-laid-out block (e.g. a signature) in half
  across two pages, or doesn't fit on one page — on **any** component already using this iframe
  technique, including but not limited to `ProcedureSummaryComponent`, `PacPrintOutComponent`, or
  `PrintOrderComponent`.
- Any task touching `ProcedureSummaryComponent.printPage()`, `PacPrintOutComponent.print()`,
  `PrintOrderComponent.print()` / `PrintOrderModelComponent` (the order-selection screen that
  launches it), `PrintPatientDetailsComponent`, or `NonOtProcedureReportComponent` (the working
  reference).

**Known real implementations of this one shared pattern** (read §14 for what the third one fixed):
1. `ProcedureSummaryComponent.printPage()` — `.../case-sheet/procedure-summary/procedure-summary.component.ts`
2. `PacPrintOutComponent.print()` — `.../case-sheet/casesheet-component/pac-print-out/pac-print-out.component.ts`
3. `PrintOrderComponent.print()` — `.../case-sheet/casesheet-component/print-order/print-order.component.ts`,
   launched from `PrintOrderModelComponent` (the order-type/item selection screen) at
   `.../casesheet-render/casesheet/print-order-model/print-order-model.component.ts` — **that
   selection screen itself has no print/header/footer logic**; it only builds the selection and
   navigates to/embeds `<app-print-order>`, which is where this pattern actually lives.

Do NOT use this skill for print styling that has nothing to do with multi-page pagination,
header repetition, or footer pinning (e.g. a one-page print layout with no header/footer
requirement) — §9's border/spacing cleanup is PacPrintOutComponent-specific polish, not a
general print-styling guide.

---

## 1. The original bug report

Screenshots on Redmine #49419 showed, when printing a multi-page casesheet report:
- The hospital logo (header) appeared only once, on whatever page it happened to land on — not on every printed page ("LOGO should be static").
- The footer logo/accreditation strip appeared only at the very end of the content, not pinned to the bottom of every page ("footer should be on bottom").

The user separately pointed at a **working reference** — `NonOtProcedureReportComponent` (the "Non OT Results" eye-icon print preview in Front Desk Management → Reports) — where the header and footer render correctly on every page.

**Components fixed:**
1. `ProcedureSummaryComponent` — `procedure-summary.component.ts` / `.html` / `.scss` (`lifetrenz-core/projects/clinical-casesheet/src/module/case-sheet/procedure-summary/`)
2. `PacPrintOutComponent` — `pac-print-out.component.ts` / `.html` / `.scss` (`lifetrenz-core/projects/clinical-casesheet/src/module/case-sheet/casesheet-component/pac-print-out/`)

**Reference (working) component used as the model:**
`NonOtProcedureReportComponent` — `lifetrenz-core/projects/patient-lib/src/lib/patient-lib/diagnostic-results/NonOtProcedureReportComponent.component.ts` / `.html`

Shared header/patient-details component used by both fixed components:
`PrintPatientDetailsComponent` — `lifetrenz-core/projects/clinical-casesheet/src/module/case-sheet/casesheet-component/print-patient-details/print-patient-details.component.ts` / `.html` / `.scss`

---

## 2. Root cause #1 — plain `window.print()` cannot repeat/pin content

**Where:** `ProcedureSummaryComponent.printPage()` and `PacPrintOutComponent.print()` (both, originally) simply called `window.print()`.

**Why this fails for multi-page documents:**
Native browser printing has no concept of "repeat this DOM node on every printed page" or "pin this node to the bottom of every page" for arbitrary HTML/CSS. A plain `<div>` header/footer just sits once in the document's normal flow — wherever the page-break math lands it, that's the only place it prints.

**How the reference solves it — `NonOtProcedureReportComponent.print()`:**
1. Clones the printable root (`.layout-invoice-content`).
2. Pulls the header (`.header-content`) and footer (`.hospital-footer`) OUT of the clone (`outerHTML` captured, then `.remove()`).
3. Creates a hidden, off-screen `<iframe>`.
4. Writes a **new, isolated HTML document** into that iframe:
   ```html
   <table>
     <thead><tr><td>HEADER</td></tr></thead>
     <tbody><tr><td class="print-body">BODY</td></tr></tbody>
     <tfoot><tr><td>FOOTER</td></tr></tfoot>
   </table>
   ```
   - `<thead>` is a native browser printing primitive: **browsers repeat `<thead>` content at the top of every printed page** when a `<table>` spans multiple pages.
   - `<tfoot>` is styled `position: fixed; bottom: 12mm` so it's pinned to the bottom of every page regardless of table pagination behavior (fixed-position is more reliable across browsers than relying on `tfoot` repetition alone).
5. Calls `iframe.contentWindow.print()` on that isolated document instead of `window.print()`.
6. Removes the iframe after `afterprint`.

**Fix applied (same pattern ported to both components):**
- `ProcedureSummaryComponent.printPage()` → `procedure-summary.component.ts:674-830` (approx.)
- `PacPrintOutComponent.print()` → `pac-print-out.component.ts:640-770` (approx.)

Both now build the same iframe + `<table><thead>/<tbody>/<tfoot>` structure.

---

## 3. Root cause #2 — moving into an iframe strips Angular's compiled styles

**Symptom (first regression found after the initial fix):** After switching to the iframe technique, the patient-details block (Patient Name / MPI / Encounter / Gender / Date / Physician) printed as a **plain unstyled stacked list** instead of the reference's clean two-column, colon-aligned grid.

**Why:** The iframe is a brand-new, blank HTML document (`iframeDocument.open()/write()/close()`). It has **none** of the app's compiled CSS. A first pass that only injects a small hand-written `<style>` block (table/header/footer rules) misses anything that defines `.patient-grid`, `.detail-row`, `.detail-label`, `.detail-value`, `p-fieldset` styling, etc. Those come from the app's real bundled stylesheets (`<link rel="stylesheet">` tags and Angular-injected `<style>` tags in the live document `<head>`), which must be copied over.

**Why the reference component doesn't hit this:** `NonOtProcedureReportComponent`'s header/patient-detail markup is written entirely with **inline `style="..."` attributes** in its HTML template — it has zero dependency on external CSS classes, so cloning it into a bare iframe "just works." `PrintPatientDetailsComponent` (used by both fixed components) instead relies on real SCSS classes, so it does NOT survive an unstyled iframe.

**Fix:** Before `iframeDocument.write()`, copy every `link[rel="stylesheet"]` and `<style>` tag from the live `document` into the iframe's `<head>`, placed **before** the print-specific override `<style>` block (so print overrides still win the cascade):
```ts
const appStyles: string[] = [];
document.querySelectorAll('link[rel="stylesheet"]').forEach((lnk) => {
  const href = (lnk as HTMLLinkElement).href;
  if (href) appStyles.push(`<link rel="stylesheet" href="${href}">`);
});
document.querySelectorAll("style").forEach((st) => {
  appStyles.push(`<style>${st.innerHTML}</style>`);
});
```
Also harden the print timing: instead of a blind `setTimeout`, wait for each injected `<link>` stylesheet's `load`/`error` event (external stylesheets load asynchronously in the iframe) before calling `print()`, with a `1500ms` hard fallback so printing never hangs indefinitely.

---

## 4. Root cause #3 — a global print stylesheet hides everything by default

**Symptom (second regression):** After fixing the missing styles, the print preview showed the header and footer correctly repeating, but the **entire body was blank** — no patient details, no diagnosis sections, nothing.

**Root cause:** Two global stylesheets, loaded app-wide, define:
- `lifetrenz-core/src/assets/layout/styles/layout/_invoice.scss`
- `lifetrenz-core/src/assets/layout/styles/theme/custom-styles.css`

Both contain the identical rule:
```css
@media print {
  body * { visibility: hidden; }
  .layout-invoice-content { position: absolute; left: 0; top: 0; }
  .layout-invoice-content * { visibility: visible; ... }
}
```
This is the app's existing (and, for a single `window.print()` call on the *live* page, correct) mechanism: hide the whole page except the on-screen `.layout-invoice-content` element, which is then positioned absolutely at the print origin.

Because copying app stylesheets into the iframe (§3) pulls this rule into the iframe too, and because the iframe markup only injects `clone.innerHTML` (the **contents** of `.layout-invoice-content`) into a plain `<td>` — the element carrying the literal class `.layout-invoice-content` never exists inside the iframe's own DOM — nothing matches the re-reveal selector `.layout-invoice-content *`, so `body * { visibility: hidden }` hides everything with nothing to un-hide it.

**Fix:** Add an unconditional override in the iframe's own `<style>` block, written after the injected app stylesheets so it wins by cascade order, and using `!important` so it wins regardless of specificity too:
```css
body *, body { visibility: visible !important; }
```
This neutralizes both global rules inside the isolated iframe document without touching the global stylesheets themselves (which are still needed, unmodified, for every other print flow in the app that doesn't use this iframe technique).

---

## 5. Root cause #4 — leftover empty wrapper creates a gap between logo and patient details

**Symptom (third regression, screenshot-reported):** A large blank vertical gap appeared between the hospital logo and the "Patient Name" row.

**Structural cause:** `PrintPatientDetailsComponent`'s template has two *sibling* top-level nodes:
```html
<div class="col-12">
  <div class="print-header">
    <div class="profile-image-container">
      <print-image *ngIf="customerSiteImage?.length" ...></print-image>
    </div>
  </div>
</div>
<!-- sibling, not nested inside the above -->
<div class="patient-grid patient-border"> ... Patient Name / MPI / etc ... </div>
```
The print code does:
```ts
const header = clone.querySelector("app-print-patient-details .print-header");
header?.remove();
```
This removes only the inner `.print-header` div — but its **parent** (`<div class="col-12">`) is left behind in the clone, now completely empty. That empty `<div class="col-12">` still carries whatever grid/padding rules apply to `.col-12`, producing a visible blank block sitting directly above `.patient-grid` in the body.

**Fix:** After removing the header node, also remove its parent if it has become childless:
```ts
const headerWrapper = header?.parentElement;
header?.remove();
if (headerWrapper && !headerWrapper.hasChildNodes()) {
  headerWrapper.remove();
}
```
Applied in both `procedure-summary.component.ts` and `pac-print-out.component.ts`.

---

## 6. Class-name collision — two different elements are both called `.print-header`

**Trap to watch for:** `.print-header` is used at **two different nesting levels**:
- **Outer** — in `procedure-summary.component.html` / `pac-print-out.component.html`, a wrapper `<div class="col-12 card print-header">` (or similar) wraps the **entire** `<app-print-patient-details>` component (logo **and** the patient-details grid together).
- **Inner** — inside `print-patient-details.component.html` itself, `<div class="print-header">` wraps **only** the logo (`.profile-image-container`).

`document.querySelector('.print-header')` (unscoped) returns the **first match in document order**, which is the **outer** wrapper — i.e. logo + patient details combined. If that whole block were pulled into the repeating `<thead>`, the patient-details grid would repeat on every page too, which is never part of the reported bug shape and would be an unwanted scope change.

**Fix:** Scope the selector to the *inner* element specifically:
```ts
const header = clone.querySelector("app-print-patient-details .print-header");
```
This targets only the logo block inside the child component, leaving the patient-details grid in the body (printed once, in normal flow) — exactly matching the reported bug's scope.

---

## 7. Porting the fix to a component with no existing footer

`PacPrintOutComponent` had the identical `window.print()` bug, using the same shared `PrintPatientDetailsComponent` for its header — so it inherits the exact same root causes #1–#5 once the pattern is ported. Watch for these differences when porting to any new component in a similar state:

- **No footer originally exists** — no `customerPrintFooterImage` field, no `getProfilePhoto()`, no footer markup. A component that already has a footer (`ProcedureSummaryComponent`) has all of this already.
- **A `.print-only`-style toggle** (`display:none` on screen / `display:block !important` in print, via its own `@media print` block) on the wrapper around `<app-print-patient-details>`, instead of always rendering it. This still works correctly with the iframe technique because `iframe.contentWindow.print()` triggers a real `@media print` evaluation inside that iframe document.

**Porting steps:**
1. Port the iframe + `<table>` print technique into `print()`/`printPage()` (§10a).
2. If no footer exists yet, add the image fields and loader (`customerSiteImage`, `customerPrintFooterImage`, `getAllCustomerSiteImage()`, `getProfilePhoto()`), mirroring an existing component that already has one.
3. Add `AppGlobalConstant.GET_CUSTOMER_SITE_LOGO` handling in `onResult()` if not already present.
4. Add a `.print-footer` block to the template, using the same `print-image`/`LtPrintImage` component, placed as a sibling right after the main content panel (still inside `.layout-invoice-content`).
5. Wire footer extraction into `print()` (`<tfoot>`, `position: fixed; bottom: 12mm`, `40mm` body padding-bottom reserved) — identical pattern to an already-fixed sibling component.

---

## 8. On-screen visibility is per-component — do not conflate it across components

This is explicit and easy to get backwards — **different components can intentionally behave differently on the live screen**, independent of their print behavior:

| Component | Header on screen | Footer on screen |
|---|---|---|
| `ProcedureSummaryComponent` | Always visible (no screen-hiding rule) | **Always visible** (no screen-hiding rule) — the user explicitly wanted the footer and header kept visible on the live screen |
| `PacPrintOutComponent` | Hidden on screen via `.print-only { display: none }`, shown only in `@media print` | Hidden on screen via `.print-footer { display: none }` (added), shown only in `@media print` — the user explicitly wanted the footer hidden on screen and shown only while printing |

**Do not copy a `.print-footer { display: none }` screen-hiding rule from one component onto a sibling component without checking that sibling's own intended on-screen behavior first.** Each component's on-screen visibility is a deliberate, per-component choice, not a shared convention — this was tried once and explicitly reverted per user direction.

**Why an empty box can appear on the live screen:** if `.print-footer` has no screen `display:none` rule (unlike `.print-only`, which has one), and the image field (e.g. `customerPrintFooterImage`) hasn't loaded yet or is empty, an `else emptyFooter`-style template branch can render a bordered, empty placeholder box — visible on the live page at all times. Fix by adding the screen-hiding rule (table above), with a matching `display: block !important` inside `@media print` as a fallback safety net.

---

## 9. Print-layout cleanup — borders, spacing, content clipping

Independent of the header/footer mechanics, print output can have pre-existing layout issues that are only visible once printing actually renders real content (not introduced by the header/footer fix itself, but surfaced by it):

### 9a. Content silently clipped at page bottom
**Root cause:** a block-level wrapper (e.g. `.border-bluegray-200`) with `overflow: hidden !important; max-height: 100% !important` applied even in print. `max-height: 100%` in a print/page-broken flow context is unreliable (percentage often resolves against an undefined/zero parent height), and combined with `overflow: hidden`, this **silently clips** trailing list items instead of letting the block flow to the next page.
**Fix:** In `@media print`, change to `overflow: visible !important; max-height: none !important` (both on the wrapper and its child list), relying solely on `page-break-inside: avoid` to keep blocks intact across page boundaries — never truncating content.

### 9b. Too many heavy borders
**Root cause:** every section block drawing its own full box border, plus an outer card/theme wrapper adding a further border/shadow layer — multiple visual layers of boxing stacked.
**Fix (in `@media print`):**
- Each inner block: `border: 0 !important; border-bottom: 1px solid #e0e0e0 !important` (light divider only, no box), with `:last-child` removing even that.
- The single surrounding container: `border: 1px solid #d9d9d9 !important; border-radius: 4px !important` — this becomes the *one* visible border.

### 9c. Excess spacing/margins
**Fix (in `@media print`):** tighten internal panel padding and utility-class margins (`.mt-2` / `.pt-3` / `.p-2`, etc.) — all scoped to print only, screen view untouched.

### 9d. Gap between header logo and patient details (layout tuning, on top of the fix in §5)
**Fix:** reduce the iframe-injected `.print-header` top padding if the reference value (e.g. `12mm`, sized for a simpler single-purpose header) is excessive once stacked with `PrintPatientDetailsComponent`'s own internal spacing — e.g. down to `6mm` plus a small `padding-bottom`.

**All of §9's fixes must be scoped inside `@media print` in the component's own `.scss` file — the on-screen (non-print) appearance must stay untouched.**

---

## 10. Reference implementation

### 10a. `printPage()` / `print()` — final shape

```ts
print(): void {
  const reportRoot = document.querySelector(
    "app-<selector> .layout-invoice-content",
  ) as HTMLElement;

  if (!reportRoot) {
    window.print();
    return;
  }

  const clone = reportRoot.cloneNode(true) as HTMLElement;

  // Scoped selector — avoids the outer/inner .print-header collision (§6)
  const header = clone.querySelector("app-print-patient-details .print-header");
  const footer = clone.querySelector(".print-footer");
  const headerHtml = header?.outerHTML || "";
  const footerHtml = footer?.outerHTML || "";

  // Remove header, and its now-empty parent wrapper (§5)
  const headerWrapper = header?.parentElement;
  header?.remove();
  if (headerWrapper && !headerWrapper.hasChildNodes()) {
    headerWrapper.remove();
  }
  footer?.remove();

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);

  const iframeDocument = iframe.contentDocument;
  if (!iframeDocument) {
    iframe.remove();
    window.print();
    return;
  }

  // Carry over the app's real compiled stylesheets (§3)
  const appStyles: string[] = [];
  document.querySelectorAll('link[rel="stylesheet"]').forEach((lnk) => {
    const href = (lnk as HTMLLinkElement).href;
    if (href) appStyles.push(`<link rel="stylesheet" href="${href}">`);
  });
  document.querySelectorAll("style").forEach((st) => {
    appStyles.push(`<style>${st.innerHTML}</style>`);
  });

  iframeDocument.open();
  iframeDocument.write(`
    <!doctype html>
    <html>
      <head>
        <title></title>
        ${appStyles.join("")}
        <style>
          @page { size: A4; margin: 0; }
          html, body { margin: 0; padding: 0; }
          body { background: #fff; }
          *, *::before, *::after { box-sizing: border-box; }
          /* Neutralize the global _invoice.scss / custom-styles.css hide-everything rule (§4) */
          body *, body { visibility: visible !important; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; padding: 0 12mm; }
          thead { display: table-header-group; }  /* repeats on every printed page */
          tbody { display: table-row-group; }
          tfoot { display: table-row-group; }
          td { padding: 0; border: 0; vertical-align: top; }
          .layout-invoice-content {
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            padding: 0 0 40mm 0 !important;
            overflow: visible !important;
            box-shadow: none !important;
          }
          .print-header { width: 100%; display: block !important; padding-top: 6mm; padding-bottom: 2mm; margin: 0 !important; }
          .print-header img { width: 100%; max-width: 100%; height: auto; object-fit: contain; }
          .print-footer {
            position: fixed;      /* pinned to bottom of every page, not relying on tfoot repetition alone */
            left: 12mm; right: 12mm; bottom: 12mm; height: 25mm;
            display: flex; align-items: flex-end; justify-content: center; background: #fff;
          }
          .print-footer img { width: 100%; max-width: 100%; max-height: 25mm; object-fit: contain; }
          .print-body { padding-bottom: 40mm !important; }
        </style>
      </head>
      <body>
        <table>
          <thead><tr><td>${headerHtml}</td></tr></thead>
          <tbody><tr><td class="print-body">${clone.innerHTML}</td></tr></tbody>
          <tfoot><tr><td>${footerHtml}</td></tr></tfoot>
        </table>
      </body>
    </html>
  `);
  iframeDocument.close();

  // Wait for injected stylesheets to actually load before printing (§3)
  let hasPrinted = false;
  const printFrame = () => {
    if (hasPrinted) return;
    hasPrinted = true;
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };

  const linkEls = Array.from(
    iframeDocument.querySelectorAll('link[rel="stylesheet"]'),
  ) as HTMLLinkElement[];
  let pendingStylesheets = linkEls.length;

  if (pendingStylesheets === 0) {
    setTimeout(printFrame, 300);
  } else {
    const onStylesheetSettled = () => {
      pendingStylesheets -= 1;
      if (pendingStylesheets <= 0) setTimeout(printFrame, 100);
    };
    linkEls.forEach((link) => {
      link.addEventListener("load", onStylesheetSettled, { once: true });
      link.addEventListener("error", onStylesheetSettled, { once: true });
    });
  }

  setTimeout(printFrame, 1500); // hard fallback
  iframe.contentWindow?.addEventListener("afterprint", () => iframe.remove(), { once: true });
}
```

### 10b. `.scss` — screen vs. print visibility pattern

```scss
// Screen: hidden by default
.print-footer {
  display: none;
}

@media print {
  // Print: force visible
  .print-footer {
    display: block !important;
  }
}
```

### 10c. `.scss` — single-border layout pattern

```scss
@media print {
  .border-bluegray-200 {
    page-break-inside: avoid !important;
    overflow: visible !important;      // never clip content (§9a)
    max-height: none !important;
    border: 0 !important;
    border-bottom: 1px solid #e0e0e0 !important;  // divider, not a box
    margin-bottom: 6px !important;
    padding: 6px 0 !important;
  }
  .border-bluegray-200:last-child {
    border-bottom: 0 !important;
  }
  .grid.card {
    border: 1px solid #d9d9d9 !important;  // the one container border
    border-radius: 4px !important;
    padding: 8px !important;
  }
}
```

---

## 11. Diagnostic checklist (walk in order on a recurrence)

If a print-related bug ("logo not repeating", "footer missing", "content blank", "unstyled", "gap under header", "content cut off", "too many borders") comes up on a **different** casesheet/report component, walk this checklist in order — it maps directly to the root causes above:

1. **Does `print()`/`printPage()` call `window.print()` directly?**
   → Root cause #1. Port the iframe + `<table><thead>/<tbody>/<tfoot>` pattern (§10a).

2. **After porting the iframe pattern, does styled content (grids, fieldsets, patient-details) render unstyled?**
   → Root cause #2. Confirm the app's `link[rel="stylesheet"]` / `<style>` tags are being copied into the iframe `<head>` *before* the custom print `<style>` block.

3. **Is the entire print output blank?**
   → Root cause #3. Check whether a global hide-everything print rule (e.g. `body * { visibility: hidden }`) got pulled into the iframe via the stylesheet copy, with no matching re-reveal element present in the iframe DOM. Fix: add `body *, body { visibility: visible !important; }` to the iframe's own `<style>` block.

4. **Is there a blank gap between the header logo and the next content block?**
   → Root cause #4. Check whether removing the header (or an equivalent element) left an empty parent wrapper behind in the clone. Remove the wrapper too if it has no remaining children.

5. **Did an unrelated block (e.g. a patient-details grid, or something bigger than intended) get pulled into the repeating header/footer?**
   → Root cause/trap #6. Check for a class-name collision between an outer wrapper and an inner, more specific element. Scope the `querySelector` to the specific inner element, never the bare class name.

6. **Does the header/footer show or hide on the live screen when it shouldn't (or vice versa)?**
   → Check §8 first — confirm what THIS specific component's intended screen behavior actually is (it may differ from other components) before adding/removing any `display: none` screen rule. Don't assume one component's convention applies to another.

7. **Is content getting silently cut off at a page boundary (not just badly paginated)?**
   → Check for `overflow: hidden` combined with `max-height: <percentage>` on the section wrapper inside `@media print`. Switch to `overflow: visible; max-height: none` and rely on `page-break-inside: avoid` alone to keep blocks intact.

8. **Too many nested borders/boxes in the printed output?**
   → Very likely pre-existing template/theme styling, not something introduced by the print-technique change. Fix via `@media print` overrides only (strip inner borders to dividers, keep one outer container border) — never restructure the HTML or touch on-screen styling to "fix" print-only cosmetics.

9. **A bordered/backgrounded box renders oddly (missing edge, doubled edge) right at a page break?**
   → §14c. Add `box-decoration-break: clone` (with the `-webkit-` prefix) to that box.

10. **A CSS override for a PrimeFlex/utility class (`.mb-2`, `.mb-3`, `.mt-3`, etc.) has no visible effect even though it's present in the injected print `<style>` block, after the app's stylesheets?**
    → §14d. Specificity, not source order — Angular compiles the utility class to a
    class+attribute selector. Repeat/combine the class selector (`.mb-3.mb-3`) to match it.

11. **A flex-laid-out block (signature, small card) gets cut in half across two printed pages despite a page-break-avoid rule?**
    → §14e. Switch that block from `display: flex` to block flow inside `@media print`.

12. **Print content doesn't fit on one page and it's expected to?**
    → §14f. Reduce base font-size/line-height and tighten heading/cell padding inside
    `@media print` — scoped the same way as §9/§14f, never touching on-screen sizing.

---

## 12. Strict do-not rules

- ❌ **Do not keep calling `window.print()` directly** on multi-page content that needs a repeating header or a pinned footer — port the iframe + `<table>` technique (§10a) instead.
- ❌ **Do not skip copying the app's real stylesheets into the iframe.** A hand-written override `<style>` block alone will not style classes defined by the app's compiled CSS (§3).
- ❌ **Do not touch the global `_invoice.scss` / `custom-styles.css` hide-everything print rules.** Neutralize them *inside the iframe's own* `<style>` block (`body *, body { visibility: visible !important; }`) — other print flows in the app still depend on the global rules as-is (§4).
- ❌ **Do not leave an emptied parent wrapper behind** after removing a header/footer node from the clone — check `hasChildNodes()` and remove the wrapper too if it's now empty (§5).
- ❌ **Do not use an unscoped `querySelector('.print-header')` / `.print-footer`** when the same class name exists at more than one nesting level — scope to the specific inner element (§6).
- ❌ **Do not copy one component's on-screen visibility rule onto a sibling component without checking that sibling's own intended behavior first** — on-screen visibility is a deliberate per-component choice, not a shared convention (§8).
- ❌ **Do not fix clipped content by adjusting `max-height` percentages** — switch to `overflow: visible; max-height: none` and rely on `page-break-inside: avoid` (§9a).
- ❌ **Do not restructure HTML or touch on-screen styling to fix print-only cosmetic issues** (excess borders/spacing) — scope every such fix inside `@media print` (§9).
- ❌ **Do not clone print content before its asynchronously-loaded images (signature, site logo, footer image) have actually rendered** — the clone will capture empty/broken `<img>` tags (§14b).
- ❌ **Do not assume `!important` + later source order wins a specificity fight against an Angular-encapsulated PrimeFlex utility class** — match or exceed its specificity instead (§14d).
- ❌ **Do not lay out a block that must survive a page break with `display: flex`** — Chrome's print engine can split it across two pages regardless of page-break-avoid rules; use block flow in `@media print` (§14e).
- ❌ **Do not invent a new print mechanism for a component that needs a repeating header/pinned footer.** At least three components already share this exact pattern — port it (§14), don't reinvent it.

---

## 13. Agent integration rules

### Loading
Any agent or developer given a task matching any of the following MUST load this skill first:
- "Header/logo not repeating on every printed page" / "footer not pinned to bottom" on a
  casesheet/report print flow.
- Porting the iframe print technique to a new print component — this is shared, common app
  functionality (§14), so default to reusing this pattern rather than inventing a new one.
- Print output blank, unstyled, gapped, clipped, over-bordered, split awkwardly across a page
  break, not fitting on one page, or losing a CSS override to a utility class, on a component
  already using this technique.
- Any task touching `ProcedureSummaryComponent`, `PacPrintOutComponent`, `PrintOrderComponent`,
  `PrintOrderModelComponent`, `PrintPatientDetailsComponent`, or `NonOtProcedureReportComponent`.

### Precedence
1. **Never truncate content** to fix a layout/clipping issue — switch `overflow`/`max-height`
   handling instead (§9a, §12).
2. **Per-component on-screen visibility is authoritative over "consistency with a sibling
   component"** — check §8's table (or the live component) before changing any screen-visibility
   rule.
3. **This skill's iframe + `<table>` pattern wins over inventing a new print mechanism** for a
   new component with the same repeating-header/pinned-footer requirement.
4. **Explicit user instructions in the current task** win over everything when unambiguous.

### Reporting back
When an agent completes work under this skill, report:
- Which root cause(s) (§2–§6) applied, with the specific symptom observed.
- Whether the component already had a footer, or one was newly added (§7).
- The component's confirmed on-screen visibility behavior for header and footer, and how it was
  confirmed (read the live template/SCSS, not assumed from a sibling component).
- Any pre-existing, unrelated print-layout issues surfaced (§9) — named explicitly as
  pre-existing, with evidence.

---

## 14. Newer fixes — learned from `PrintOrderComponent`'s independent port

`PrintOrderComponent` (`.../case-sheet/casesheet-component/print-order/print-order.component.ts`)
ported this exact pattern independently, after the original two components, and its code comment
explicitly cites the earlier RCA by name — confirming this is one shared, reusable technique, not
three unrelated implementations. Its port fixed/refined several things the earlier two
components' version did not need to handle (different content shape, more async-loaded images,
tighter one-page fit requirement). These refinements supersede the equivalent parts of §2–§10 for
any **new** port — apply them from the start rather than hitting the same issues again.

### 14a. Footer: plain flow inside `<tfoot>`, not `position: fixed`
The original pattern (§2, §10a) pins the footer with `position: fixed; bottom: 12mm`. The newer
implementation instead leaves the footer in normal flow inside the `<tfoot>` (`tfoot { display:
table-footer-group; }` — the semantically correct table-footer display value, vs. the original's
`table-row-group`) and styles `.print-footer` as a plain `display: flex` block with no
`position`. **When porting to a new component, prefer the flow-based `tfoot` approach** (it is
the more recent, battle-tested version) — reserve `position: fixed` only if a flow-based footer
is confirmed not to stay at the bottom of every page for that component's specific content shape.

### 14b. Wait for async-loaded content before cloning
`PrintOrderComponent.print()` wraps its entire body in `setTimeout(() => { ... }, 500)`. This
component loads the customer site/footer images and the user's signature image
asynchronously (`getAllCustomerSiteImage()`, `getUserSignature()` → `getSignatureImage()`) and
renders them into the DOM slightly after `ngOnInit`. Cloning `.layout-invoice-content`
synchronously, before those images attach, would capture empty/broken `<img>` tags in the clone.
**If a component's print content includes any asynchronously-loaded image (signature, site
logo, footer image, etc.), delay the clone/print build** until that content is confirmed
rendered — a fixed `setTimeout` is the pragmatic fix used here; a more precise fix (await the
actual image-load observable/promise) is preferable if the component's data flow makes that easy.

### 14c. `box-decoration-break: clone` on content that may fragment across a page
```css
.layout-invoice-content, .print-body {
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
```
When a styled box (background, border, padding) is split across a page break, the default
`box-decoration-break: slice` can render the box's edges oddly at the break — only the piece on
each page gets drawn, so a bottom-page fragment can be missing its "closing" border/background
and a top-page fragment its "opening" one. `clone` makes each page's fragment render as if it
were its own complete, independent box (full border/background/padding repeated), which is what
a reader expects from a printed page boundary. Add this to any container in the print flow whose
content can legitimately span a page break with visible box styling.

### 14d. A PrimeFlex utility class can out-specificity a plain `!important` override
```css
/* PrimeFlex ships .mb-2/.mb-3 as Angular-encapsulated rules, e.g.
   .mb-2[_ngcontent-xxx] { margin-bottom: .75rem !important }.
   A class+attribute selector is MORE SPECIFIC than a lone class selector,
   so a plain override loses even with !important, regardless of source order. */
.mb-3.mb-3 { margin-bottom: 6px !important; }
.mb-2.mb-2 { margin-bottom: 4px !important; }
```
**Trap:** writing `.mb-3 { margin-bottom: 6px !important; }` in the print override `<style>`
block, placed *after* the app's injected stylesheets in source order, can still lose — because
Angular's view encapsulation compiles PrimeFlex's own `!important` utility rule to
`.mb-3[_ngcontent-xxx] { ... !important }`, and a class+attribute-selector combination beats a
bare class selector on specificity, independent of cascade order. `!important` only breaks ties
at equal specificity; it does not override a more specific selector.
**Fix:** repeat/combine the class selector (`.mb-3.mb-3`) to match or exceed that specificity,
rather than assuming source order or `!important` alone will win. Check this whenever a print
override for a PrimeFlex/utility class appears to have no effect despite being present in the
injected `<style>` block.

### 14e. `display: flex` can be split across a page break by Chrome's print engine
```css
/* A flex item (e.g. a right-aligned signature block) can render partially on
   one printed page and again on the next under display:flex, even with
   page-break-inside: avoid set. Switch to block flow for print. */
.flex.justify-content-end { display: block !important; }
.flex.justify-content-end > .text-center { margin-left: auto !important; width: fit-content !important; }
```
Chrome's print pagination does not reliably honor `page-break-inside: avoid` (or the signature
block's own page-break rules — see the sibling `.signature-block` rules in
`print-order.component.scss`) on a `display: flex` container — a flex item can still be split,
rendering half on each of two pages. **If a block that must never be split across a page
(signature, footer, a small info card) uses `display: flex` for alignment, switch it to block
flow (e.g. `margin-left: auto` for right-alignment) inside `@media print`**, and keep the
on-screen flex layout untouched.

### 14f. Shrink-to-fit sizing to keep content on one printed page
```css
body { font-size: 12px; line-height: 1.3; }
h4 { margin: 6px 0 4px 0 !important; font-size: 14px; }
td[style] { padding: 4px 8px !important; }
```
When a component's print content (header + patient details + orders + a checklist + a
signature) is expected to fit on one page, reducing base font size/line-height and tightening
heading margins and inline-styled table-cell padding inside `@media print` — scoped the same way
as §9's border/spacing cleanup — is a legitimate, low-risk way to reclaim vertical space, as long
as it stays inside the print-only style block and does not touch on-screen sizing.

### 14g. No outer `.print-header` wrapper in every component
§6's class-name collision trap (an outer `.print-header` wrapping both logo and patient details,
vs. an inner one wrapping only the logo) assumes an outer wrapper exists. `PrintOrderComponent`'s
own template has no such outer wrapper — its `print()` still scopes the selector to
`"app-print-patient-details .print-header"` for consistency with the other two components, even
though the unscoped case would be harmless here. **Keep the scoped selector as the default even
when you've confirmed no collision exists for the current component** — a future template change
could introduce one, and the scoped form costs nothing when there's no collision to avoid.

---

**Source:** Converted from `print-header-footer-detailed-analysis-imp.md` (Redmine #49419 RCA —
`ProcedureSummaryComponent` / `PacPrintOutComponent`, reference `NonOtProcedureReportComponent`).
Updated 2026-10-13 with §14's fixes, found by reading `PrintOrderComponent` /
`PrintOrderModelComponent` — a third, independent, later port of the same pattern, confirming
this is shared/common print functionality across the app rather than a one-off. The original RCA
document remains the fuller incident narrative if needed; this skill is its distilled,
agent-loadable, now multi-implementation form.
