import { ListPaginationState } from "./list-pagination-state";

describe("ListPaginationState", () => {
  it("starts at page 0, size 15, no data", () => {
    const s = new ListPaginationState();
    expect(s.params()).toEqual({ pageNo: 0, pageSize: 15 });
    expect(s.pageData).toBeNull();
  });

  it("onPage stores the 0-based page and size from the PrimeNG event", () => {
    const s = new ListPaginationState();
    s.onPage({ page: 2, rows: 25 });
    expect(s.params()).toEqual({ pageNo: 2, pageSize: 25 });
  });

  it("onSize moves back to page 0", () => {
    const s = new ListPaginationState();
    s.onPage({ page: 4, rows: 15 });
    s.onSize(50);
    expect(s.params()).toEqual({ pageNo: 0, pageSize: 50 });
  });

  it("reset moves to page 0 and resets the paginator without emitting", () => {
    const s = new ListPaginationState();
    s.pageNo = 3;
    const paginator: any = { first: 45 };
    s.pager = { paginator } as any;
    s.reset();
    expect(s.pageNo).toBe(0);
    expect(paginator.first).toBe(0);
  });

  it("reset tolerates a missing paginator (hidden by *ngIf)", () => {
    const s = new ListPaginationState();
    s.pageNo = 2;
    expect(() => s.reset()).not.toThrow();
    expect(s.pageNo).toBe(0);
  });

  it("apply stores metadata, clears loading and returns rows", () => {
    const s = new ListPaginationState();
    s.loading = true;
    const rows = s.apply({ data: [1, 2], page: { totalPages: 1, currentPageNo: 0, currentPageSize: 2, total: 2 } });
    expect(rows).toEqual([1, 2]);
    expect(s.pageData?.total).toBe(2);
    expect(s.loading).toBeFalse();
  });

  it("two states are independent", () => {
    const a = new ListPaginationState();
    const b = new ListPaginationState();
    a.onPage({ page: 3, rows: 50 });
    expect(b.params()).toEqual({ pageNo: 0, pageSize: 15 });
  });
});
