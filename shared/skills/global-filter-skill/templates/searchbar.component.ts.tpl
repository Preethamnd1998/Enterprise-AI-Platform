import { CommonModule, DatePipe } from "@angular/common";
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { TranslateModule } from "@ngx-translate/core";
import { FilterComponentType } from "@patient-lib/lib/data/model/filter-component-type";
import { FilterLevel } from "@patient-lib/lib/data/model/filter-level";
import { SharedFilterDto } from "@patient-lib/lib/data/model/shared-filter-dto";
import { CustomerTransactionAttributeDTO } from "@patient-lib/lib/patient-lib/data/model/patient";
import { ConfirmationService, MessageService } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { Calendar, CalendarModule } from "primeng/calendar";
import { CheckboxModule } from "primeng/checkbox";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import { DividerModule } from "primeng/divider";
import { DropdownModule } from "primeng/dropdown";
import { InputTextModule } from "primeng/inputtext";
import { MultiSelectModule } from "primeng/multiselect";
import { OverlayPanel, OverlayPanelModule } from "primeng/overlaypanel";
import { SplitterModule } from "primeng/splitter";
import { ToastModule } from "primeng/toast";
import { TooltipModule } from "primeng/tooltip";
import { SearchFilterEvent } from "src/app/base/model/filter-event";
import { AppData } from "src/app/base/service/app-data";
import { UserData } from "src/app/base/service/user-data";
import { ArtifactUtils } from "src/app/base/util/artifact-utils";
import { LtPaginatorService } from "src/app/data/service/lt-paginator.service";
import { SearchMenuService } from "src/app/layout/service/search-menu.service";
// adjust relative imports to the owning library:
import { ConponentSearchService } from "__LIB_ALIAS__/lib/service/conponent-search.service";
import { AppGlobalConstant } from "__LIB_ALIAS__/lib/constant/global-constant";
import { __Feature__FilterService } from "__LIB_ALIAS__/lib/service/__feature__-filter.service";

/**
 * Global filter panel for __SCREEN__. Mounted in the aux router outlet `searchbar` of the module shell
 * (route: searchbar-__feature__). Talks to the list ONLY through SearchMenuService + __Feature__FilterService.
 * Clone of SearchbarAllAppointmentComponent; keep behaviour identical.
 */
@Component({
  selector: "app-searchbar-__feature__",
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, ButtonModule, CheckboxModule, ConfirmDialogModule, DividerModule,
    DropdownModule, InputTextModule, MultiSelectModule, OverlayPanelModule, CalendarModule, SplitterModule,
    ToastModule, TooltipModule, TranslateModule,
  ],
  templateUrl: "./searchbar-__feature__.component.html",
  styleUrls: ["./searchbar-__feature__.component.scss"],
  providers: [DatePipe, ConfirmationService, MessageService, LtPaginatorService],
})
export class Searchbar__Feature__Component implements OnInit, AfterViewInit {
  @ViewChild("searchComponent") searchComponent: ElementRef;
  @ViewChild("top") overlayPanel: OverlayPanel;

  minDate: Date = new Date(new Date().getFullYear(), new Date().getMonth() - 3, new Date().getDate());
  fromDate: Date;
  toDate: Date;
  saveFilterLoading = false;

  // option lists for the dropdowns (fill from master data)
  statusOptions: any[] = [];

  defaultComponentFilter: SharedFilterDto = null;
  defaultFilterApplied = false;
  shouldTriggerDefaultSearch = false;

  constructor(
    public datePipe: DatePipe,
    public appData: AppData,
    public userData: UserData,
    public messageService: MessageService,
    public searchMenuService: SearchMenuService,
    public filterService: __Feature__FilterService,
    public conponentSearchService: ConponentSearchService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (this.filterService.form === null) {
      this.filterService.initializeForm();
    }
    this.loadMasters();
    this.callComponentFilter();
    this.initializeCustomDate();

    const current = this.filterService.form.get("rangeDate")?.value;
    if (Array.isArray(current) && current.length === 2) {
      const f = this.convertToValidDate(current[0]);
      const t = this.convertToValidDate(current[1]);
      if (f && t) { this.fromDate = f; this.toDate = t; }
    } else if (typeof current === "string" && current) {
      this.updateFromToDateFromQuickFilter();
    }

    // keep From/To in sync with the form (also when a saved filter is applied)
    this.filterService.form.get("rangeDate")?.valueChanges.subscribe((range) => {
      if (Array.isArray(range) && range.length === 2) {
        const f = this.convertToValidDate(range[0]);
        const t = this.convertToValidDate(range[1]);
        this.fromDate = f && t ? f : null;
        this.toDate = f && t ? t : null;
      } else if (typeof range === "string" && range) {
        this.updateFromToDateFromQuickFilter();
      }
    });
  }

  ngAfterViewInit(): void {
    // default filter applied only after the view is stable, else controls overwrite the patch
    if (this.shouldTriggerDefaultSearch) {
      setTimeout(() => { this.search(); this.shouldTriggerDefaultSearch = false; }, 500);
    }
  }

  private loadMasters(): void {
    // this.statusOptions = this.systemMaster.<list>;
  }

  initializeCustomDate(): void {
    const saved: string = this.filterService.form.value.rangeDate;
    if (saved && this.filterService.time.includes(saved)) {
      this.filterService.selectedIndex = this.filterService.time.findIndex((i) => i === saved);
      this.filterService.selectedTime = this.filterService.time[this.filterService.selectedIndex];
      this.filterService.form.patchValue({ rangeDate: this.filterService.selectedTime });
    }
  }

  // ---- time chips -------------------------------------------------------------------------
  handleItemClick(index: number): void {
    this.filterService.selectedIndex = index;
    this.filterService.selectedTime = this.filterService.time[index];
    this.filterService.form.patchValue({ rangeDate: this.filterService.selectedTime });
    this.updateFromToDateFromQuickFilter();
  }

  updateFromToDateFromQuickFilter(): void {
    const sel = this.filterService.selectedTime;
    if (sel && this.filterService.time.includes(sel)) {
      const r = ArtifactUtils.getDateTimeFromRange(sel);
      this.fromDate = r.fromDate;
      this.toDate = r.toDate;
    }
  }

  /** JSON turns Dates into strings: always convert before using. */
  private convertToValidDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date && !isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  closeFromDateCalendar(calendar: Calendar): void {
    if (this.fromDate !== null && this.fromDate !== undefined) {
      setTimeout(() => {
        const to = this.toDate || this.fromDate;
        this.filterService.form.patchValue({ rangeDate: [this.fromDate, to] });
        this.filterService.selectedIndex = -1;
        this.filterService.selectedTime = "";
        calendar.hideOverlay();
      }, 100);
    }
  }

  closeToDateCalendar(calendar: Calendar): void {
    if (this.toDate !== null && this.toDate !== undefined) {
      setTimeout(() => {
        if (this.fromDate && this.toDate < this.fromDate) {
          ArtifactUtils.showErrorViaToast(this.messageService, "To Date cannot be before From Date");
          return;
        }
        this.filterService.form.patchValue({ rangeDate: [this.fromDate, this.toDate] });
        this.filterService.selectedIndex = -1;
        this.filterService.selectedTime = "";
        calendar.hideOverlay();
      }, 100);
    }
  }

  // ---- search / clear ---------------------------------------------------------------------
  /** Emits the filter to the host. Host expands labels, resets paginator, fetches. */
  search(): void {
    const v = this.filterService.form.value;
    if (typeof v.rangeDate === "string" && v.rangeDate) {
      this.filterService.checkDateFormValue(false, false);
    }
    const filter = new SearchFilterEvent();
    filter.type = FilterComponentType.__FILTER_KEY__;
    filter.filterValue = JSON.stringify(this.filterService.form.value);
    this.searchMenuService.updateSearchBarViewEvent(filter);
  }

  clearSearch(): void {
    const def = this.filterService.componentFilterList.find((f) => f.isDefault) ?? null;
    if (!ArtifactUtils.isNull(def)) {
      this.filterService.setFilterFormValues(def.formValue);
      this.filterService.checkDateFormValue(true, false);
      this.searchMenuService.searchStringEmit(this.filterService.updateChipValues());
    } else {
      this.filterService.setFilterFormValues(null);
      this.searchMenuService.searchStringEmit(this.filterService.updateChipValues());
      this.handleItemClick(0);
      this.fromDate = null;
      this.toDate = null;
    }
  }

  onChangeStopPropagation(event: any): void {
    event?.originalEvent?.stopPropagation?.();
  }

  // ---- saved filters ----------------------------------------------------------------------
  callComponentFilter(): void {
    this.conponentSearchService.getComponentFilter(
      this,
      FilterComponentType.__FILTER_KEY__,
      FilterLevel.USER,
      Number(this.userData.userProfile.user?.coreUserId),
      Number(this.appData.getSiteId()),
      Number(this.appData.getCustomerBusinessId()),
    );
  }

  onFilter(): void {
    // pre-fill "Filter N" with N = highest existing "Filter n" + 1
    let max = 0;
    for (const f of this.filterService.componentFilterList) {
      const m = /^Filter (\d+)$/.exec(f.filterName ?? "");
      if (m) max = Math.max(max, Number(m[1]));
    }
    this.filterService.form.patchValue({ filterName: "Filter " + (max + 1) });
  }

  saveFilter(): void {
    if (ArtifactUtils.isNull(this.filterService.form.value?.filterName)) {
      ArtifactUtils.showWarnViaToast(this.messageService, "Please Enter Filter name");
      return;
    }
    const dto = new SharedFilterDto();
    const cta = new CustomerTransactionAttributeDTO();
    cta.customerId = Number(this.appData.getCustomerId());
    cta.customerBusinessId = Number(this.appData.getCustomerBusinessId());
    cta.siteId = Number(this.appData.getSiteId());
    cta.createdBy = this.userData.userProfile.user?.coreUserId;
    cta.createdByName = this.userData.getUserFullName();
    dto.customerTransactionAttribute = cta;
    dto.componentType = FilterComponentType.__FILTER_KEY__;
    dto.filterName = this.filterService.form.value.filterName;
    dto.isDefault = false;                                   // becoming default is a separate action
    dto.level = FilterLevel.USER;
    dto.filterSiteId = this.appData.getSiteId();
    dto.filterUserId = this.userData.userProfile.user?.coreUserId;
    dto.formValue = JSON.stringify(this.filterService.form.value);
    this.conponentSearchService.saveComponentFilter(this, dto);
    this.overlayPanel.hide();
  }

  setDefaultFilter(filter: SharedFilterDto, isDefault: boolean, _flag: string): void {
    filter.isDefault = isDefault;
    this.conponentSearchService.updateComponentFilter(this, filter);
  }

  updateFilterName(filter: SharedFilterDto, nameInput: HTMLInputElement): void {
    filter.filterName = nameInput?.value;
    this.conponentSearchService.updateFilterName(this, filter);
  }

  deleteFilter(filter: SharedFilterDto): void {
    this.conponentSearchService.deleteFilter(this, filter.id);
  }

  onSelectFilter(filter: SharedFilterDto, triggerSearch = true): void {
    const obj = JSON.parse(filter.formValue);
    const isLabel = typeof obj.rangeDate === "string" &&
      (obj.rangeDate.includes("Today") || obj.rangeDate.includes("Last") || obj.rangeDate.includes("Next"));
    if (isLabel) {
      const idx = this.filterService.time.findIndex((t) => t === obj.rangeDate);
      if (idx >= 0) { this.filterService.selectedIndex = idx; this.filterService.selectedTime = obj.rangeDate; }
      const r = ArtifactUtils.getDateTimeFromRange(obj.rangeDate);
      this.fromDate = r.fromDate;
      this.toDate = r.toDate;
    } else {
      this.filterService.selectedIndex = -1;
      this.filterService.selectedTime = "";
      if (Array.isArray(obj.rangeDate) && obj.rangeDate.length === 2) {
        const f = this.convertToValidDate(obj.rangeDate[0]);
        const t = this.convertToValidDate(obj.rangeDate[1]);
        this.fromDate = f && t ? f : null;
        this.toDate = f && t ? t : null;
      } else { this.fromDate = null; this.toDate = null; }
    }
    // re-hydrate option objects by identity code here if a control holds an object (e.g. obj.visitType)
    this.filterService.form.patchValue({
      rangeDate: this.fromDate && this.toDate ? [this.fromDate, this.toDate] : obj.rangeDate,
      search: obj.search,
      status: obj.status,
      // __PATCH EVERY CONTROL EXPLICITLY__
      showFilter: true,
    });
    if (typeof obj.rangeDate === "string") this.filterService.checkDateFormValue(true, false);
    this.cdr.detectChanges();
    if (triggerSearch) this.search();
  }

  getFilterDate(date: any): string {
    return "(" + ArtifactUtils.getRecordedDetails(new Date(date), new Date()) + ")";
  }

  // ---- ApiCallBack ------------------------------------------------------------------------
  onResult(data: any, type: any, other?: any): void {
    switch (type) {
      case AppGlobalConstant.OPD_COMPONENT_FILTER + "GET": {
        this.filterService.componentFilterList = data?.data || [];
        if (!this.defaultFilterApplied && this.filterService.componentFilterList.length > 0) {
          const def = this.filterService.componentFilterList.find((f) => f.isDefault);
          if (def) {
            this.defaultComponentFilter = def;
            this.defaultFilterApplied = true;
            this.shouldTriggerDefaultSearch = true;
            this.onSelectFilter(def, false);          // values only; search fires in ngAfterViewInit
          }
        }
        break;
      }
      case AppGlobalConstant.OPD_COMPONENT_FILTER:
        this.filterService.componentFilterList.push(data?.data);
        ArtifactUtils.showSuccessViaToast(this.messageService, "Filter saved successfully");
        break;
      case AppGlobalConstant.OPD_COMPONENT_FILTER_DEFAULT:
        if (other?.isDefault) {
          this.searchMenuService.searchStringEmit(this.filterService.updateChipValues());
          this.search();
        } else {
          this.clearSearch();
        }
        break;
      case AppGlobalConstant.OPD_COMPONENT_FILTER_UPDATE:
        this.callComponentFilter();
        ArtifactUtils.showSuccessViaToast(this.messageService, "Filter updated successfully");
        break;
      case AppGlobalConstant.OPD_COMPONENT_FILTER_DELETE + "DELETE": {
        const i = this.filterService.componentFilterList.findIndex((f) => f.id === data?.data?.id);
        if (i >= 0) {
          this.filterService.componentFilterList.splice(i, 1);
          ArtifactUtils.showSuccessViaToast(this.messageService, "Filter deleted successfully");
        }
        break;
      }
      default:
        break;
    }
  }

  onError(_err: any, type: any, _other?: any): void {
    if (type === AppGlobalConstant.OPD_COMPONENT_FILTER + "GET") {
      this.filterService.componentFilterList = [];
    }
  }
}
