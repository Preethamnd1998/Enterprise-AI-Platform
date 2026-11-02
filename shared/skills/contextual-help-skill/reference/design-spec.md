# Design Spec — extracted from `lib-ccc-help`

Every value below is taken verbatim from
`ccc-help.component.html/.scss` and `clinical-component-config.component.ts`
(`novel/his-ehr/ui/ui-library/settings`, `development`).

## 1. Trigger button

| Property | Value |
|---|---|
| Component | `<p-button>` (PrimeNG ButtonModule) |
| Icon | `pi pi-question-circle` |
| Shape / style | `[rounded]="true" [text]="true"` (icon-only, transparent, round hover) |
| Tooltip | `pTooltip="Help"`, `tooltipPosition="left"` |
| Click | `(onClick)="open()"` → `visible = true` |

No label, no severity, no custom size — it inherits the primary text colour of the card header.

## 2. Placement (host card header)

```html
<p-card class="col-12 animation-duration-1000 shadow-3">
  <ng-template pTemplate="header">
    <div class="flex justify-content-between align-items-center p-3 bg-primary-50 border-round-top">
      <div class="justify-content-left flex align-items-center">
        <i class="pi pi-sliders-h text-primary text-2xl mr-3"></i>
        <label class="text-xl font-semibold text-primary">Screen title</label>
      </div>
      <div class="justify-content-right">
        <lib-xxx-help [activeTab]="helpTab"></lib-xxx-help>
      </div>
    </div>
  </ng-template>
  ...
</p-card>
```

- Header strip: `bg-primary-50`, `p-3`, `border-round-top`, flex space-between, vertically centred.
- Left: feature icon (`text-primary text-2xl mr-3`) + title label (`text-xl font-semibold text-primary`).
- Right: the help component, nothing else is required beside it (extra header actions may sit
  in the same right div, help last/right-most).
- Header mirrors `lib-apply-followup-rules` card header (icon + coloured bar) for consistency.

## 3. Dialog shell

| Property | Value |
|---|---|
| `[(visible)]` | `visible` |
| `[modal]` | `true` |
| `[style]` | `{ width: '50rem' }` |
| `[breakpoints]` | `{ '960px': '90vw' }` |
| `[dismissableMask]` | `true` |
| `styleClass` | `<prefix>-help-dialog` |

### Dialog header (custom `pTemplate="header"`)

```
[ badge ]  Title (content[key].title)
           CONTEXTUAL HELP (subtitle)
```

| Element | Class | Style |
|---|---|---|
| Header bar | `.p-dialog-header` | `background: linear-gradient(135deg, #0f766e 0%, #0369a1 100%); padding: 1.1rem 1.5rem` |
| Close icon | `.p-dialog-header-icon` | `color:#fff`; hover `background: rgba(255,255,255,.15); color:#fff` |
| Content area | `.p-dialog-content` | `padding: 0` |
| Badge | `.<p>-help-badge` | 2.25rem circle, `rgba(255,255,255,.18)` bg, white, `font-size 1.1rem`, flex-centred, `flex-shrink:0`; icon `pi pi-info-circle` |
| Title | `.<p>-help-title` | white, 600, `1.05rem`, `line-height 1.3` |
| Subtitle | `.<p>-help-subtitle` | `rgba(255,255,255,.75)`, `.75rem`, `letter-spacing .02em`, uppercase; fixed text "Contextual help" |
| Layout | wrapper | `flex align-items-center gap-3`; text in `flex flex-column` |

## 4. Body

| Element | Style |
|---|---|
| `.<p>-help-body` | `max-height: 65vh; overflow-y:auto; padding: 1.25rem 1.5rem 1.5rem; display:flex; flex-direction:column; gap:1.1rem` |
| `.<p>-help-section` | card: `background var(--surface-card,#fff)`, `border 1px solid var(--surface-border,#e2e8f0)`, `border-radius 10px`, `padding .9rem 1.1rem 1rem` |
| section `h4` | flex, gap `.5rem`, `margin 0 0 .6rem`, `.92rem`, `700`, `color var(--text-color,#1e293b)` |
| `p, ul, ol` | `margin:0`; `ul/ol`: `padding-left 1.2rem`, flex column, gap `.35rem`; `li line-height 1.45` |
| `.<p>-help-rules` | `background #fffbeb; border-color #fde68a` (amber) |
| `.<p>-help-notes` | `background #fef2f2; border-color #fecaca` (red) |
| `.<p>-help-field` | flex column, gap `.1rem`, padding `.4rem 0`; consecutive rows separated by `1px dashed var(--surface-border,#e2e8f0)` |
| `.<p>-help-field-name` | `600`, `.85rem`, `#0f766e` |
| `.<p>-help-field-desc` | `.85rem`, `var(--text-color-secondary,#64748b)`, `line-height 1.4` |
| FAQ answer | `<p class="m-0 text-color-secondary">` inside `p-accordionTab [header]="q"` |

## 5. Sections — fixed order, icon, colour, visibility

| # | Heading text | Icon | Icon colour (inline `style="color:…"`) | Element | Section class | Shown when |
|---|---|---|---|---|---|---|
| 1 | About this tab | `pi pi-bookmark` | `#2563eb` | `<p>` | — | always |
| 2 | How to use | `pi pi-list-check` | `#0d9488` | `<ol>` | — | always |
| 3 | Field descriptions | `pi pi-tags` | `#7c3aed` | name/desc rows | — | `fields.length` |
| 4 | Business rules | `pi pi-shield` | `#b45309` | `<ul>` | `<p>-help-rules` | `rules.length` |
| 5 | Examples | `pi pi-lightbulb` | `#0891b2` | `<ul>` | — | `examples.length` |
| 6 | Important notes | `pi pi-exclamation-triangle` | `#dc2626` | `<ul>` | `<p>-help-notes` | `notes.length` |
| 7 | FAQs / Troubleshooting | `pi pi-comments` | `#475569` | `p-accordion` | — | `faqs.length` |

Heading 1 reads "About this tab" in a tabbed screen. For a single (non-tabbed) screen use the
template switch `aboutHeading` (default "About this tab"; set "About this screen" when not tabbed).

Icon colours are semantic and intentionally inline; do not move them to the SCSS or alter them.

## 6. Content model (TypeScript)

```ts
export interface XxxHelpSection {
  title: string;                                   // dialog title (usually the tab name)
  about: string;                                   // 2-4 sentence purpose paragraph
  howTo: string[];                                 // ordered steps
  fields: { name: string; description: string }[]; // label → meaning
  rules: string[];                                 // enforced business rules
  examples: string[];                              // concrete scenarios
  notes: string[];                                 // warnings / gotchas
  faqs: { q: string; a: string }[];                // troubleshooting Q&A
}
export type XxxHelpTab = "a" | "b";
export const XXX_HELP_CONTENT: Record<XxxHelpTab, XxxHelpSection> = { a: A, b: B };
```

All eight fields are mandatory in the type (use `[]` for none) so the template never null-checks.

## 7. Behaviour

- `visible=false` initially; `open()` sets true; `p-dialog` two-way binding handles close
  (X, ESC, mask click).
- Content switches reactively when host changes `activeTab`; dialog is closed during switch so no
  in-dialog state to preserve.
- Responsive: below 960px viewport width the dialog is 90vw.
- Tooltip text is the only visible label — keep exactly "Help".

## 8. Accessibility add-ons (allowed, do not change visuals)

- `ariaLabel="Help"` on the p-button is allowed.
- Body is natural document order (headings → lists), no extra ARIA required.
