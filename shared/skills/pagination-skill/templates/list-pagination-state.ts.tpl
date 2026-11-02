import { Injectable } from "@angular/core";
import { PageDTO } from "src/app/data/model/page-dto";
import { LtPaginationComponent } from "src/app/lt-components/lt-pagination/lt-pagination.component";

/**
 * Independent pagination state for ONE paged list. NOT in the reference code (the reference shares
 * LtPaginatorService + [selectedPage]); introduced by pagination-skill for pages with 2+ lists.
 * Plain class => `new ListPaginationState()` per list in the same component.
 * Separate child components / DI: subclass per list with @Injectable() and provide in that component.
 */
export class ListPaginationState {
  static readonly DEFAULT_PAGE_SIZE = 15;

  pageNo = 0;                                        // 0-based, sent as `pageNo`
  pageSize = ListPaginationState.DEFAULT_PAGE_SIZE;  // sent as `pageSize`
  pageData: PageDTO | null = null;                   // bind to [selectedPage]
  loading = false;
  /** Set via a ViewChild setter for this list's <lifetrenz-lt-pagination #pagerX>. */
  pager?: LtPaginationComponent;

  /** (pageChange) */
  onPage(event: { page: number; rows: number }): void {
    this.pageNo = event.page ?? 0;
    this.pageSize = event.rows ?? this.pageSize;
  }

  /** (noOfRecordChange) — the paginator already moved to page 1; keep state in step. */
  onSize(value: number): void {
    this.pageSize = value;
    this.pageNo = 0;
  }

  /** Filter/search change for THIS list: back to page 1 without emitting a page event. */
  reset(): void {
    this.pageNo = 0;
    if (this.pager?.paginator) {
      this.pager.paginator.first = 0;
    }
  }

  /** Store the response metadata; returns the rows so callers can assign in one line. */
  apply<T>(result: { data?: T[]; page?: PageDTO } | null | undefined): T[] {
    this.pageData = result?.page ?? null;
    this.loading = false;
    return result?.data ?? [];
  }

  /** Request params for this list. */
  params(): { pageNo: number; pageSize: number } {
    return { pageNo: this.pageNo, pageSize: this.pageSize };
  }
}

/** DI flavour: one subclass per list when lists live in separate components. No providedIn => provide in `providers`. */
@Injectable()
export class __List__PaginationState extends ListPaginationState {}
