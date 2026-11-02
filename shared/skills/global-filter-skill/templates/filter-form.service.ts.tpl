import { Injectable } from "@angular/core";
import { FormBuilder, FormGroup } from "@angular/forms";
import { SharedFilterDto } from "@patient-lib/lib/data/model/shared-filter-dto";
import { ArtifactUtils } from "src/app/base/util/artifact-utils";
import { SearchMenuService } from "src/app/layout/service/search-menu.service";

/**
 * Root-scoped state shared by the filter panel (aux router outlet) and the host list.
 * Mirrors AllAppointmentService. providedIn:'root' is REQUIRED here (panel and list are siblings in
 * different outlets, they only meet through this service + SearchMenuService).
 * Per-module convention: if the library already has its own search-menu service, inject that one.
 */
@Injectable({ providedIn: "root" })
export class __Feature__FilterService {
  form: FormGroup = null;
  rangeDates: Date[] = [new Date(), new Date()];            // default = Today..Today (explicit, never undefined)
  componentFilterList: SharedFilterDto[] = [];
  searchString = "";

  // Quick-filter labels, in display order. A screen may use a SUBSET of these exact labels.
  time: string[] = ["Today", "Last 24 hours", "Last 7 days", "Last 15 days", "Last 30 days", "Next 7 days", "Next 15 days", "Next 30 days"];
  selectedIndex = -1;
  selectedTime = "";

  constructor(
    public searchMenuService: SearchMenuService,
    public fb: FormBuilder,
  ) {}

  initializeForm(): void {
    this.form = this.fb.group({
      rangeDate: [this.rangeDates],
      // __FIELDS__: one control per filter. Text => [""], select => [null], multi-select => [null], boolean => [false]
      search: [""],
      status: [null],
      filterName: [""],     // UI-only (save popup)
      showFilter: [false],  // UI-only (saved list toggle)
    });
    this.selectedIndex = 0;
    this.selectedTime = this.time[0];
  }

  /** filterJson === null => "nothing saved" branch: Today + every other field cleared. */
  setFilterFormValues(filterJson: string | null): void {
    this.rangeDates = [new Date(), new Date()];
    const f = filterJson ? JSON.parse(filterJson) : null;
    this.form.patchValue({
      rangeDate: f == null ? this.rangeDates : f.rangeDate,
      search: f?.search,
      status: f?.status,
      // __PATCH EVERY CONTROL EXPLICITLY__ (undefined clears)
      showFilter: true,
    });
    if (ArtifactUtils.isNull(f?.rangeDate)) {
      this.selectedIndex = 0;
      this.selectedTime = this.time[0];
    } else if (typeof f.rangeDate === "string") {
      this.selectedIndex = this.time.findIndex((t) => t === f.rangeDate);
      this.selectedTime = this.selectedIndex >= 0 ? this.time[this.selectedIndex] : "Custom";
    } else if (Array.isArray(f.rangeDate)) {
      this.selectedIndex = -1;
      this.selectedTime = "Custom";
    }
  }

  /** Expand a quick label to a real [from,to] BEFORE any request (the API must never see "Today"). */
  checkDateFormValue(isDefault: boolean, _isTop: boolean): void {
    this.searchMenuService.searchDateString = ArtifactUtils.isNull(this.selectedTime) ? "Custom" : this.selectedTime;
    const rangeDate = this.form.value.rangeDate;
    if (typeof rangeDate === "string") {
      if (rangeDate.includes("Today") || rangeDate.includes("Last") || rangeDate.includes("Next")) {
        const r = ArtifactUtils.getDateTimeFromRange(rangeDate);
        this.form.patchValue({ rangeDate: [r.fromDate, r.toDate] });
      }
    } else if (isDefault && (!Array.isArray(rangeDate) || rangeDate.length === 0)) {
      this.form.patchValue({ rangeDate: this.rangeDates });   // never overwrite a valid custom range
    }
  }

  /** Comma list of non-empty filters for the top-bar chip text. */
  updateChipValues(): string {
    const parts = Object.entries(this.form.value)
      .filter(([k, v]) => v !== null && v !== undefined && v !== "" && k !== "showFilter" && k !== "filterName")
      .map(([k, v]) => this.getChipLabel(k, v))
      .filter((s) => !!s);
    this.searchString = parts.join(", ");
    return this.searchString;
  }

  private getChipLabel(key: string, value: any): string {
    switch (key) {
      case "rangeDate": return "";                              // shown in the date label, not as a chip
      case "search": return value;
      case "status": return value?.nameEn ?? value?.name ?? "";
      // __ADD A CASE PER FILTER__ (text: raw value; select: .nameEn/.name; multi: names joined)
      default: return "";
    }
  }

  /** Top-bar quick search: today + exactly one field. Hosts normally implement this in handleTopBarSearch. */
  quickSearch(text: string, field: string = "search"): void {
    this.form.reset();
    this.selectedIndex = 0;
    this.form.patchValue({ rangeDate: [new Date(), new Date()], [field]: text });
  }
}
