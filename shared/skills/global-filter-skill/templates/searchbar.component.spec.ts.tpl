import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { TranslateModule } from "@ngx-translate/core";
import { FilterComponentType } from "@patient-lib/lib/data/model/filter-component-type";
import { SearchMenuService } from "src/app/layout/service/search-menu.service";
import { Searchbar__Feature__Component } from "./searchbar-__feature__.component";
import { __Feature__FilterService } from "__LIB_ALIAS__/lib/service/__feature__-filter.service";
// provide stubs for AppData, UserData, ConponentSearchService per the library's existing specs

describe("Searchbar__Feature__Component (scoped)", () => {
  let fixture: ComponentFixture<Searchbar__Feature__Component>;
  let component: Searchbar__Feature__Component;
  let service: __Feature__FilterService;
  let menu: SearchMenuService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Searchbar__Feature__Component, NoopAnimationsModule, TranslateModule.forRoot()],
      // providers: [{ provide: AppData, useValue: ... }, { provide: UserData, useValue: ... }, { provide: ConponentSearchService, useValue: { getComponentFilter: () => {}, ... } }],
    }).compileComponents();
    fixture = TestBed.createComponent(Searchbar__Feature__Component);
    component = fixture.componentInstance;
    service = TestBed.inject(__Feature__FilterService);
    menu = TestBed.inject(SearchMenuService);
    fixture.detectChanges();
  });

  it("defaults to Today", () => {
    expect(service.selectedIndex).toBe(0);
    expect(service.selectedTime).toBe("Today");
  });

  it("chip click sets the label and selects the chip", () => {
    component.handleItemClick(2);
    expect(service.form.value.rangeDate).toBe(service.time[2]);
    expect(service.selectedIndex).toBe(2);
  });

  it("custom From date clears the chip selection", () => {
    jasmine.clock().install();
    component.fromDate = new Date();
    component.closeFromDateCalendar({ hideOverlay: () => {} } as any);
    jasmine.clock().tick(150);
    expect(service.selectedIndex).toBe(-1);
    jasmine.clock().uninstall();
  });

  it("search emits one event with the filter type and expands a label to dates", () => {
    const emitted: any[] = [];
    menu.searchBarViewEvent$.subscribe((v) => emitted.push(v));
    component.handleItemClick(0);
    component.search();
    const last = emitted[emitted.length - 1];
    expect(last.type).toBe(FilterComponentType.__FILTER_KEY__);
    expect(Array.isArray(JSON.parse(last.filterValue).rangeDate)).toBeTrue();
  });

  it("clear without a default restores Today and empties fields", () => {
    service.form.patchValue({ search: "abc" });
    service.componentFilterList = [];
    component.clearSearch();
    expect(service.form.value.search ?? "").toBe("");
    expect(service.selectedTime).toBe("Today");
  });

  it("onFilter pre-fills the next Filter N", () => {
    service.componentFilterList = [{ filterName: "Filter 1" } as any, { filterName: "Filter 3" } as any];
    component.onFilter();
    expect(service.form.value.filterName).toBe("Filter 4");
  });
});
