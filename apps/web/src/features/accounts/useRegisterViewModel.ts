import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { RegisterTransactionView } from "./accountRegisterTypes";
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
  developerPerformanceMode: boolean;
  performanceTimingsRef: MutableRefObject<RegisterPerformanceTimings>;
}

export function useRegisterViewModel({
  transactions,
  searchDraft,
  committedSearch,
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

  const registerPagination = getRegisterPaginationState(
    searchedRegisterTransactions.length,
    registerPage,
    REGISTER_DEFAULT_PAGE_SIZE,
  );

  useEffect(() => {
    setRegisterPage(registerPagination.currentPage);
  }, [registerPagination.currentPage]);

  useEffect(() => {
    setRegisterPage(1);
  }, [committedSearch]);

  const visibleTransactions = useMemo(
    () =>
      measureRegisterPerformance(
        developerPerformanceMode,
        performanceTimingsRef.current,
        "visible pagination",
        () =>
          paginateRegisterItems(
            searchedRegisterTransactions,
            registerPagination.currentPage,
            registerPagination.pageSize,
          ),
      ),
    [
      searchedRegisterTransactions,
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
    registerPagination,
    visibleTransactions,
    visibleTransactionIds,
  };
}
