import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { RegisterTransactionView } from "./accountRegisterTypes";
import { isUncategorisedRegisterTransaction } from "./registerUncategorised";
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
  developerPerformanceMode: boolean;
  performanceTimingsRef: MutableRefObject<RegisterPerformanceTimings>;
}

export function useRegisterViewModel({
  transactions,
  searchDraft,
  committedSearch,
  categoryFilter,
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

  const registerPagination = getRegisterPaginationState(
    categoryFilteredRegisterTransactions.length,
    registerPage,
    REGISTER_DEFAULT_PAGE_SIZE,
  );

  useEffect(() => {
    setRegisterPage(registerPagination.currentPage);
  }, [registerPagination.currentPage]);

  useEffect(() => {
    setRegisterPage(1);
  }, [committedSearch, categoryFilter]);

  const visibleTransactions = useMemo(
    () =>
      measureRegisterPerformance(
        developerPerformanceMode,
        performanceTimingsRef.current,
        "visible pagination",
        () =>
          paginateRegisterItems(
            categoryFilteredRegisterTransactions,
            registerPagination.currentPage,
            registerPagination.pageSize,
          ),
      ),
    [
      categoryFilteredRegisterTransactions,
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
    registerPagination,
    visibleTransactions,
    visibleTransactionIds,
  };
}
