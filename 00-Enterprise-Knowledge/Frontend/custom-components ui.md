# UI — Custom LT Components

> Also read: `coding-standards/STANDARDS.md`.

---

## Rule: Prefer LT Components Over Re-implementing

Always check this list before building a custom component. If an LT component covers the use case, use it.

---

## Available LT Components

| Selector | Location | Purpose |
|---|---|---|
| `<lifetrenz-lt-pagination>` | `lt-pagination/` | Paginator + per-page dropdown — see `UI/pagination.md` |
| `<lifetrenz-lt-date>` | `lt-date/` | Standardised date display |
| `<lifetrenz-mandatory-label>` | `mandatory-label/` | Red asterisk mandatory field label |
| `<lifetrenz-mandatory-icon-label>` | `mandatory-icon-label/` | Icon + mandatory field label |
| `<lifetrenz-patient-name>` | `patient-name/` | Formatted patient name display |
| `<lifetrenz-gender-age-display>` | `gender-age-display/` | Gender/age chip |
| `<lifetrenz-editor-header>` | `editor-header/` | Rich text editor header bar |
| `<lifetrenz-mobile-number>` | `mobile-number/` | Mobile number input with country code |
| `<lifetrenz-lt-post-button>` | `lt-post-button/` | Async submit button with loading state |

---

## Usage Examples

### Mandatory Label
```html
<lifetrenz-mandatory-label [label]="'Patient Name' | translate"></lifetrenz-mandatory-label>
```

### Date Display
```html
<lifetrenz-lt-date [date]="row.admissionDate"></lifetrenz-lt-date>
```

### Patient Name
```html
<lifetrenz-patient-name [patient]="selectedPatient"></lifetrenz-patient-name>
```

### Gender/Age Display
```html
<lifetrenz-gender-age-display [patient]="row"></lifetrenz-gender-age-display>
```

### Async Submit Button
```html
<lifetrenz-lt-post-button
  [label]="'Save' | translate"
  [loading]="saving"
  (clicked)="save()">
</lifetrenz-lt-post-button>
```

---

## Creating a New LT Component

When a UI pattern is used in 3+ places across feature libraries, extract it to `src/app/lt-components/`.

### Checklist for new LT component:

1. **Location**: `src/app/lt-components/<component-name>/`
2. **Selector**: `lifetrenz-<component-name>`
3. **Inputs**: use `@Input()` with descriptive names and JSDoc
4. **Outputs**: use `@Output() EventEmitter` for user actions
5. **No API calls**: LT components are purely presentational — no service injection
6. **Standalone or Module**: match the existing pattern in `lt-components/`
7. **Translate**: all labels via `| translate` or `translateService.instant()`
8. **Export**: add to the shared module / re-export so feature libraries can import it
9. **Test**: add a `.spec.ts` covering input binding and output emission

### Template:

```typescript
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'lifetrenz-my-new-component',
  templateUrl: './my-new-component.component.html',
  standalone: true
})
export class MyNewComponent {

  /** The item to display */
  @Input() item: any;

  /** Emitted when the user clicks the action button */
  @Output() actionClicked = new EventEmitter<any>();

  onAction(): void {
    this.actionClicked.emit(this.item);
  }
}
```

---

## Rules

- Never re-implement functionality already in an LT component.
- LT components must be dumb/presentational — no API calls, no `ApiCallBack`.
- LT components must not have `MessageService` or toast logic — caller handles that.
- All labels must support translation.