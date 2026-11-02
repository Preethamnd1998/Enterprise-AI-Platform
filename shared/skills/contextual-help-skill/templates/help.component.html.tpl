<p-button icon="pi pi-question-circle" [rounded]="true" [text]="true" pTooltip="Help" tooltipPosition="left" (onClick)="open()"></p-button>

<p-dialog
  [(visible)]="visible"
  [modal]="true"
  [style]="{ width: '50rem' }"
  [breakpoints]="{ '960px': '90vw' }"
  [dismissableMask]="true"
  styleClass="__PREFIX__-help-dialog"
>
  <ng-template pTemplate="header">
    <div class="flex align-items-center gap-3">
      <span class="__PREFIX__-help-badge"><i class="pi pi-info-circle"></i></span>
      <div class="flex flex-column">
        <span class="__PREFIX__-help-title">{{ content[activeTab].title }}</span>
        <span class="__PREFIX__-help-subtitle">Contextual help</span>
      </div>
    </div>
  </ng-template>

  <div class="__PREFIX__-help-body">
    <section class="__PREFIX__-help-section">
      <h4><i class="pi pi-bookmark" style="color: #2563eb"></i>{{ aboutHeading }}</h4>
      <p>{{ content[activeTab].about }}</p>
    </section>

    <section class="__PREFIX__-help-section">
      <h4><i class="pi pi-list-check" style="color: #0d9488"></i>How to use</h4>
      <ol>
        <li *ngFor="let step of content[activeTab].howTo">{{ step }}</li>
      </ol>
    </section>

    <section class="__PREFIX__-help-section" *ngIf="content[activeTab].fields.length">
      <h4><i class="pi pi-tags" style="color: #7c3aed"></i>Field descriptions</h4>
      <div class="__PREFIX__-help-field" *ngFor="let f of content[activeTab].fields">
        <span class="__PREFIX__-help-field-name">{{ f.name }}</span>
        <span class="__PREFIX__-help-field-desc">{{ f.description }}</span>
      </div>
    </section>

    <section class="__PREFIX__-help-section __PREFIX__-help-rules" *ngIf="content[activeTab].rules.length">
      <h4><i class="pi pi-shield" style="color: #b45309"></i>Business rules</h4>
      <ul>
        <li *ngFor="let r of content[activeTab].rules">{{ r }}</li>
      </ul>
    </section>

    <section class="__PREFIX__-help-section" *ngIf="content[activeTab].examples.length">
      <h4><i class="pi pi-lightbulb" style="color: #0891b2"></i>Examples</h4>
      <ul>
        <li *ngFor="let e of content[activeTab].examples">{{ e }}</li>
      </ul>
    </section>

    <section class="__PREFIX__-help-section __PREFIX__-help-notes" *ngIf="content[activeTab].notes.length">
      <h4><i class="pi pi-exclamation-triangle" style="color: #dc2626"></i>Important notes</h4>
      <ul>
        <li *ngFor="let n of content[activeTab].notes">{{ n }}</li>
      </ul>
    </section>

    <section class="__PREFIX__-help-section" *ngIf="content[activeTab].faqs.length">
      <h4><i class="pi pi-comments" style="color: #475569"></i>FAQs / Troubleshooting</h4>
      <p-accordion>
        <p-accordionTab *ngFor="let f of content[activeTab].faqs" [header]="f.q">
          <p class="m-0 text-color-secondary">{{ f.a }}</p>
        </p-accordionTab>
      </p-accordion>
    </section>
  </div>
</p-dialog>
