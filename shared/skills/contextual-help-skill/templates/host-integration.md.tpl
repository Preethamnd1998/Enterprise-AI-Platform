# Host integration — add to the screen's shell component

## 1. Imports

```ts
import { __Pascal__HelpComponent } from "./__PREFIX__-help/__PREFIX__-help.component";
import { __Pascal__HelpTab } from "./__PREFIX__-help/__PREFIX__-help-content";
// add __Pascal__HelpComponent to the standalone `imports: [...]` array (or the NgModule's imports)
```

## 2. Header slot (p-card header, right end)

Reference markup (`clinical-component-config.component.ts`). Keep the host's own title block;
only add the right-hand div.

```html
<p-card class="col-12 animation-duration-1000 shadow-3">
  <ng-template pTemplate="header">
    <div class="flex justify-content-between align-items-center p-3 bg-primary-50 border-round-top">
      <div class="justify-content-left flex align-items-center">
        <i class="pi pi-<feature-icon> text-primary text-2xl mr-3"></i>
        <label class="text-xl font-semibold text-primary">{{ title }}</label>
      </div>
      <div class="justify-content-right">
        <__SELECTOR__ [activeTab]="helpTab"></__SELECTOR__>
      </div>
    </div>
  </ng-template>
  ...
</p-card>
```

Single (non-tabbed) screen: drop `[activeTab]`, use
`<__SELECTOR__ aboutHeading="About this screen"></__SELECTOR__>` and a single `"main"` key.

## 3. Tabbed screen: key mapping

```ts
const HELP_TAB_BY_INDEX: __Pascal__HelpTab[] = [/* "tabA", "tabB", ... in tab order */];

helpTab: __Pascal__HelpTab = "<firstKey>";

onTabChange(ev: { index: number }): void {
  this.helpTab = HELP_TAB_BY_INDEX[ev.index] ?? "<firstKey>";
  // ...existing per-tab refresh logic stays here
}
```

```html
<p-tabView (onChange)="onTabChange($event)"> ... </p-tabView>
```

If the host already has an `(onChange)` handler, add the one `helpTab` line to it — do not add
a second handler.

## 4. Diff discipline

- Host change = import + imports array + one header div + (tabbed) const, field, one line in the
  handler. Nothing else.
- Do not alter existing layout classes, titles, or tab logic.
