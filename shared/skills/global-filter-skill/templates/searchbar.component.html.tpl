<div #searchComponent class="grid">
  <p-splitter [panelSizes]="[30, 70]" [style]="{ height: 'auto' }">
    <!-- LEFT: time range (omit this whole panel + date label for screens without a date range) -->
    <ng-template pTemplate>
      <div class="mt-2 pr-2 bg-bluegray-50 border-round-lg">
        <div class="time-container">
          <h6 class="text-primary">__Entity__ Date</h6>
          <div
            *ngFor="let item of filterService.time; let i = index"
            (click)="handleItemClick(i)"
            [ngClass]="{ selected: i === filterService.selectedIndex }"
            class="list-item block"
          >
            {{ item }}
            <span *ngIf="i === filterService.selectedIndex" class="tick-mark">&#10003;</span>
          </div>
        </div>
        <div class="date-range-container">
          <div class="date-field-wrapper">
            <label for="fromDate" class="font-medium text-800">{{ "From Date" | translate }}</label>
            <p-calendar
              [(ngModel)]="fromDate" #fromDateCalendar id="fromDate" selectionMode="single" inputId="fromDate"
              [minDate]="minDate" appendTo="body" dateFormat="dd-mm-yy"
              placeholder="{{ 'Select From Date' | translate }}" showButtonBar="true"
              [style]="{ minWidth: '100%', border: '1px solid rgb(0 0 0 / 23%)' }" [showIcon]="true"
              (onClose)="closeFromDateCalendar(fromDateCalendar)"
            ></p-calendar>
          </div>
          <div class="date-field-wrapper">
            <label for="toDate" class="font-medium text-800">{{ "To Date" | translate }}</label>
            <p-calendar
              [(ngModel)]="toDate" #toDateCalendar id="toDate" selectionMode="single" inputId="toDate"
              [minDate]="minDate" appendTo="body" dateFormat="dd-mm-yy"
              placeholder="{{ 'Select To Date' | translate }}" showButtonBar="true"
              [style]="{ minWidth: '100%', border: '1px solid rgb(0 0 0 / 23%)' }" [showIcon]="true"
              (onClose)="closeToDateCalendar(toDateCalendar)"
            ></p-calendar>
          </div>
        </div>
      </div>
    </ng-template>

    <!-- RIGHT: fields + actions -->
    <ng-template pTemplate>
      <form [formGroup]="filterService.form">
        <div class="col-12 grid">
          <!-- text -->
          <div class="form-group col-12 xl:col-6 lg:col-6 md:col-12 sm:col-12">
            <label for="search" class="font-medium text-800">{{ "Name/MPI" | translate }}</label>
            <input
              class="w-full" type="text" pInputText formControlName="search" (keydown.enter)="search()"
              placeholder="{{ 'Name/MPI' | translate }}"
              [style]="{ minWidth: '100%', border: '1px solid rgb(0 0 0 / 23%)' }"
            />
          </div>

          <!-- single select -->
          <div class="form-group col-12 xl:col-6 lg:col-6 md:col-12 sm:col-12">
            <label class="font-medium text-800">{{ "Status" | translate }}</label>
            <p-dropdown
              formControlName="status" name="status" optionLabel="nameEn" [options]="statusOptions" appendTo="body"
              placeholder="{{ 'All' | translate }}" [showClear]="true" [filter]="true" filterBy="nameEn"
              (keydown.enter)="search()" (onChange)="onChangeStopPropagation($event)"
              [style]="{ minWidth: '100%', border: '1px solid rgb(0 0 0 / 23%)' }"
            ></p-dropdown>
          </div>

          <!-- more fields: copy the matching recipe from reference/ui-spec.md §6 (multi-select, numeric text, masked, checkbox) -->

          <!-- actions -->
          <div class="col-12 flex flex-wrap justify-content-start align-items-center -mb-3" style="gap: 0.5rem 0">
            <button pButton pRipple [pTooltip]="'Clear'" label="Clear" type="button" class="p-button-danger mr-2"
              [style]="{ minWidth: '55px', background: '#E54646' }" (click)="clearSearch()"></button>
            <button pButton pRipple [pTooltip]="'Search'" type="button" label="Search" class="mr-2"
              [style]="{ minWidth: '55px', background: '#0BC9B8' }" (click)="search()"></button>

            <button pButton pRipple [pTooltip]="'Filter'" type="button" label="Save Filter" class="p-button-warning mr-2"
              [style]="{ minWidth: '55px', background: '#F8C649', color: '#333333' }"
              (click)="onFilter(); top.toggle($event)"></button>

            <p-checkbox class="ml-1" label="Show filter" name="showFilter" formControlName="showFilter" [binary]="true"></p-checkbox>

            <p-overlayPanel #top [showCloseIcon]="true" [style]="{ width: '19rem' }" appendTo="body">
              <ng-template pTemplate>
                <div>
                  <div class="mb-2">
                    <label for="filter">{{ "FilterName" | translate }}</label>
                    <input
                      id="filterName" [style]="{ width: '15rem' }" type="text" pInputText formControlName="filterName"
                      oninput="this.value = this.value.replace(/[^A-Za-z0-9-,.;'&/.() ]|^ /g, '')"
                    />
                  </div>
                  <div class="flex flex-wrap justify-content-end align-content-center">
                    <button id="SaveFilter" pButton pRipple class="p-button-warning" [loading]="saveFilterLoading"
                      type="button" (click)="saveFilter()" label="{{ 'Save' | translate }}"></button>
                  </div>
                </div>
              </ng-template>
            </p-overlayPanel>
          </div>
        </div>
      </form>
    </ng-template>
  </p-splitter>

  <!-- saved filters -->
  <div class="col-12" *ngIf="filterService.form.value.showFilter && filterService.componentFilterList.length === 0">
    <div class="col-12 flex flex-wrap justify-content-center align-content-center mt-2">
      {{ "No Filters Saved- Filters Once saved will display here" | translate }}
    </div>
  </div>
  <div class="col-12" *ngIf="filterService.form.value.showFilter && filterService.componentFilterList.length !== 0">
    <div class="col-12" *ngFor="let filter of filterService.componentFilterList">
      <div class="grid flex" (click)="onSelectFilter(filter)">
        <div class="col-1" style="height: 100%">
          <button *ngIf="filter.isDefault" pButton pRipple [pTooltip]="'Default'" type="button"
            class="p-button-rounded mr-2" icon="pi pi-stop-circle"
            (click)="$event.stopPropagation(); setDefaultFilter(filter, false, 'setDefault')"></button>
          <button *ngIf="!filter.isDefault" pButton pRipple [pTooltip]="'Set as default'" type="button"
            class="p-button-rounded mr-2" style="background-color: gray" icon="pi pi-stop-circle"
            (click)="$event.stopPropagation(); setDefaultFilter(filter, true, 'unsetDefault')"></button>
        </div>
        <div class="col-10">
          <div>
            <input #name type="text" style="border: none" value="{{ filter.filterName }}"
              (click)="$event.stopPropagation()" (keydown.enter)="updateFilterName(filter, name)" />
          </div>
          <div class="flex flex-wrap">
            <label style="color: rgb(62, 110, 110)">{{ filter?.customerTransactionAttribute?.createdByName }}</label>
            <label class="ml-1" style="color: gray">{{ getFilterDate(filter?.customerTransactionAttribute?.createdOn) }}</label>
          </div>
        </div>
        <div class="col-1" style="height: 100%">
          <button pButton pRipple [pTooltip]="'Delete'" type="button" class="p-button-rounded p-button-danger"
            icon="pi pi-trash" (click)="$event.stopPropagation(); deleteFilter(filter)"></button>
        </div>
        <div class="col-12"><p-divider class="col-12 p-0 m-0"></p-divider></div>
      </div>
    </div>
  </div>
</div>
<p-toast key="tst" [preventOpenDuplicates]="true"></p-toast>
<p-confirmDialog [style]="{ width: '450px' }"></p-confirmDialog>
