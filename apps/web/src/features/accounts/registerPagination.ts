export const REGISTER_DEFAULT_PAGE_SIZE = 100;

export type RegisterLoadMoreContinuation =
  | { readonly before: { readonly date: string; readonly id: string } }
  | { readonly offset: number };

export function getRegisterLoadMoreContinuation(input: {
  readonly sort?: {
    readonly column: "date" | "payee" | "category" | "memo" | "outflow" | "inflow";
    readonly direction: "ascending" | "descending";
  };
  readonly cursor: { readonly date: string; readonly id: string } | null;
  readonly loadedCount: number;
}): RegisterLoadMoreContinuation {
  if (
    input.cursor &&
    (input.sort?.column ?? "date") === "date" &&
    (input.sort?.direction ?? "descending") === "descending"
  ) {
    return { before: input.cursor };
  }

  return { offset: input.loadedCount };
}

export type RegisterPaginationState = {
  totalItems: number;
  pageSize: number;
  totalPages: number;
  currentPage: number;
  visibleStart: number;
  visibleEnd: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

export function getRegisterPaginationState(
  totalItems: number,
  requestedPage: number,
  pageSize = REGISTER_DEFAULT_PAGE_SIZE,
): RegisterPaginationState {
  const safeTotalItems = Math.max(0, Math.trunc(totalItems));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const totalPages = Math.max(1, Math.ceil(safeTotalItems / safePageSize));
  const currentPage = clampInteger(requestedPage, 1, totalPages);
  const visibleStart = safeTotalItems === 0 ? 0 : (currentPage - 1) * safePageSize + 1;
  const visibleEnd = Math.min(safeTotalItems, currentPage * safePageSize);

  return {
    totalItems: safeTotalItems,
    pageSize: safePageSize,
    totalPages,
    currentPage,
    visibleStart,
    visibleEnd,
    hasPreviousPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
  };
}

export function paginateRegisterItems<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize = REGISTER_DEFAULT_PAGE_SIZE,
): T[] {
  const pagination = getRegisterPaginationState(items.length, requestedPage, pageSize);
  const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
  return items.slice(startIndex, startIndex + pagination.pageSize);
}
