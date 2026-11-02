// Host list component — wiring for the global filter. Excerpts from AllAppointmentsComponent, generalised.
// Pagination wiring lives in ../../pagination-skill/templates/host-single.md.tpl (same component).

@Component({
  selector: "app-__feature__-list",
  standalone: true,
  providers: [MessageService, LtPaginatorService],       // component-scoped paginator (never the root singleton)
  imports: [/* ..., LtPaginationComponent */],
})
export class __Feature__ListComponent implements OnInit, OnDestroy, ApiCallBack {
  private subscriptionHandleSearch: Subscription;
  private subscriptionTopBarSearch: Subscription;
  private filterLoadInFlight = false;
  isDefaultPresent = false;

  constructor(
    public paginatorService: LtPaginatorService,
    public searchMenuService: SearchMenuService,
    public filterService: __Feature__FilterService,
    public conponentSearchService: ConponentSearchService,
    public fdmMainService: FdmMainService,              // module shell service holding `searchRoute` (use the module's own)
    public appData: AppData,
    public userData: UserData,
  ) {}

  ngOnInit(): void {
    if (this.filterService.form === null) this.filterService.initializeForm();
    this.setupSearch();
    this.filterLoadInFlight = true;                      // blocks replayed viewEvent$ until saved filters are known
    this.callComponentFilter();
  }

  setupSearch(): void {
    this.fdmMainService.searchRoute = "searchbar-__feature__";   // aux route the shell mounts on overlay open
    this.appData.isSearchVisible = true;
    this.appData.isDateVisible = true;                   // false for screens without a date range
    this.searchMenuService.searchDateString = "Today";
    this.searchMenuService.searchPlaceHolder = "Search __Entity__";
    this.subscriptionHandleSearch = this.searchMenuService.searchBarViewEvent$.subscribe((v) => this.handleSearch(v));
    this.subscriptionTopBarSearch = this.searchMenuService.searchDataEvent$.subscribe((v) => this.handleTopBarSearch(v));
  }

  ngOnDestroy(): void {
    this.subscriptionHandleSearch?.unsubscribe();
    this.subscriptionTopBarSearch?.unsubscribe();
    // screens that leave the filter must not leave the top bar search visible for the next screen:
    // the next filter screen sets it again; non-filter screens set isSearchVisible = false in their own ngOnInit.
  }

  callComponentFilter(): void {
    this.conponentSearchService.getComponentFilter(this, FilterComponentType.__FILTER_KEY__, FilterLevel.USER,
      Number(this.userData.userProfile.user?.coreUserId), Number(this.appData.getSiteId()),
      Number(this.appData.getCustomerBusinessId()));
  }

  /** First load + "set default": saved default wins, else Today/empty; then ONE fetch. */
  applyFilter(): void {
    this.isDefaultPresent = false;
    for (const f of this.filterService.componentFilterList) {
      if (f.isDefault) {
        this.isDefaultPresent = true;
        this.filterService.setFilterFormValues(f.formValue);
        this.filterService.checkDateFormValue(true, false);
        this.searchMenuService.searchStringEmit(this.filterService.updateChipValues());
      }
    }
    if (!this.isDefaultPresent) {
      this.filterService.setFilterFormValues(null);
      this.searchMenuService.searchStringEmit(this.filterService.updateChipValues());
    }
    this.fetch();
  }

  /** Panel -> host. Type guard prevents another screen's replayed event from running here. */
  handleSearch(filter: SearchFilterEvent): void {
    if (this.filterLoadInFlight) return;
    if (filter !== null && filter.type === FilterComponentType.__FILTER_KEY__) {
      if (!ArtifactUtils.isNull(this.paginatorService.paginator) && !ArtifactUtils.isNull(this.paginatorService.paginator.first)) {
        this.paginatorService.paginator.first = 0;       // reset WITHOUT emitting, so only one fetch happens
      }
      this.filterService.checkDateFormValue(false, filter.isTop);
      this.searchMenuService.searchStringEmit(this.filterService.updateChipValues());
      this.fetch();
    }
  }

  /** Top-bar free text: reset form, Today, exactly one field. */
  handleTopBarSearch(text: string): void {
    this.filterService.quickSearch(text, "search");      // or the page's single quick field
    this.isDefaultPresent = true;                        // reference sets it so applyFilter() keeps the quick values
    this.fetch();
  }

  /** Builds the request from the form; labels are expanded to dates first. */
  fetch(): void {
    this.loading = true;
    const range = this.filterService.form.value.rangeDate;
    if (!Array.isArray(range) || range.length < 2) { this.loading = false; return; }
    const [from, to] = UtcService.getUtcDateTimeRange([this.ensureDate(range[0]), this.ensureDate(range[1])]);
    // call the module service with: siteId, pageSize = this.paginatorService.noOfRecord,
    // pageNo = this.paginatorService.paginator?.getPage() ?? 0, from, to, ...filter values ("" when empty)
  }

  private ensureDate(v: any): Date { return v instanceof Date ? v : new Date(v); }

  onResult(result: any, type: any, other?: any): void {
    switch (type) {
      case AppGlobalConstant.OPD_COMPONENT_FILTER + "GET":
        this.filterService.componentFilterList = result?.data ?? [];
        this.applyFilter();                              // first fetch
        this.filterLoadInFlight = false;
        break;
      case __API_CONSTANT__:
        this.rows = result?.data;
        this.paginatorService.selectedPage = result?.page;   // PageDTO from the paged payload
        this.loading = false;
        break;
    }
  }

  onError(err: any, type: any): void {
    if (type === AppGlobalConstant.OPD_COMPONENT_FILTER + "GET") this.filterLoadInFlight = false;
    this.loading = false;
  }
}
