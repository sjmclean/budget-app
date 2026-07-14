import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { RegisterTransactionView } from "./accountRegisterTypes";
import { isUncategorisedRegisterTransaction } from "./registerUncategorised";
import {
  sortRegisterTransactions,
  type RegisterSortState,
} from "./registerSorting";
import {
  REGISTER_DEFAULT_PAGE_SIZE,
  getRegisterPaginationState,
  paginateRegisterItems,
} from "./registerPagination";
import {
  buildRegisterSearchSuggestions,
  transactionMatchesSearch,
  type RegisterSearchCommit,
} from "./registerSearch";
import {
  measureRegisterPerformance,
  type RegisterPerformanceTimings,
} from "../performance/registerPerformanceInstrumentation";

interface UseRegisterViewModelInput {
  transactions: readonly RegisterTransactionView[];
  searchDraft: string;
  committedSearch: RegisterSearchCommit | null;
  categoryFilter: "all" | "uncategorised";
  sort: RegisterSortState;
  developerPerformanceMode: boolean;
  performanceTimingsRef: MutableRefObject<RegisterPerformanceTimings>;
}

export function useRegisterViewModel({
  transactions,
  searchDraft,
  committedSearch,
  categoryFilter,
  sort,
  developerPerformanceMode,
  performanceTimingsRef,
}: UseRegisterViewModelInput) {
  const [registerPage, setRegisterPage] = useState(1);

  const registerSearchSuggestions = useMemo(
    () => buildRegisterSearchSuggestions(transactions, searchDraft),
    [transactions, searchDraft],
  );

  const searchedRegisterTransactions = useMemo(
    () =>
      committedSearch
        ? transactions.filter((transaction) =>
            transactionMatchesSearch(transaction, committedSearch),
          )
        : transactions,
    [transactions, committedSearch],
  );

  const categoryFilteredRegisterTransactions = useMemo(
    () =>
      categoryFilter === "uncategorised"
        ? searchedRegisterTransactions.filter(isUncategorisedRegisterTransaction)
        : searchedRegisterTransactions,
    [categoryFilter, searchedRegisterTransactions],
  );

  const sortedRegisterTransactions = useMemo(
    () => sortRegisterTransactions(categoryFilteredRegisterTransactions, sort),
    [categoryFilteredRegisterTransactions, sort],
  );

  const registerPagination = getRegisterPaginationState(
    sortedRegisterTransactions.length,
    registerPage,
    REGISTER_DEFAULT_PAGE_SIZE,
  );

  useEffect(() => {
    setRegisterPage(registerPagination.currentPage);
  }, [registerPagination.currentPage]);

  useEffect(() => {
    setRegisterPage(1);
  }, [committedSearch, categoryFilter, sort]);

  const visibleTransactions = useMemo(
    () =>
      measureRegisterPerformance(
        developerPerformanceMode,
        performanceTimingsRef.current,
        "visible pagination",
        () =>
          paginateRegisterItems(
            sortedRegisterTransactions,
            registerPagination.currentPage,
            registerPagination.pageSize,
          ),
      ),
    [
      sortedRegisterTransactions,
      registerPagination.currentPage,
      registerPagination.pageSize,
      developerPerformanceMode,
      performanceTimingsRef,
    ],
  );

  const visibleTransactionIds = useMemo(
    () => visibleTransactions.map((transaction) => transaction.id),
    [visibleTransactions],
  );

  return {
    setRegisterPage,
    registerSearchSuggestions,
    searchedRegisterTransactions,
    categoryFilteredRegisterTransactions,
    sortedRegisterTransactions,
    registerPagination,
    visibleTransactions,
    visibleTransactionIds,
  };
}
