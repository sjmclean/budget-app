import { useEffect, useMemo, useState } from "react";
import { resolveActiveBudget } from "../../../features/budget/activeBudget";
import { getCurrentBudgetMonth } from "../../../features/budget/budgetMonthNavigation";
import {
  useBudgetMonthQuery,
  useMonthlyCategoryTransactionsQuery,
  useMonthlySpendingQuery,
} from "../../../features/persistence/reactiveQueries";
import { useBudgetRegistryStore } from "../../../stores/budgetRegistryStore";
import { useUIStore } from "../../../stores/uiStore";
import { calculateSpendingTotal, type SpendingCategoryRow } from "../services/spendingByCategoryReport";
import { buildBudgetVsActualRows, calculateBudgetVsActualTotals, type BudgetVsActualRow } from "../services/budgetVsActualReport";
import { formatCurrency, formatMonth } from "../services/reportFormatting";

export const getCurrentReportMonth = getCurrentBudgetMonth;

export function useReportsViewModel() {
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const activeBudget = resolveActiveBudget(budgets, selectedBudgetId);
  const currencyCode = activeBudget?.currency ?? "AUD";
  const [month, setMonth] = useState(() => getCurrentReportMonth());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const budgetId = activeBudget?.id ?? "__inactive__";

  const budgetQuery = useBudgetMonthQuery(
    { budgetId, month },
    Boolean(activeBudget),
  );
  const spendingQuery = useMonthlySpendingQuery(
    { budgetId, month },
    Boolean(activeBudget),
  );

  const baseSpendingRows = useMemo<SpendingCategoryRow[]>(
    () => (spendingQuery.data ?? []).map((row) => ({
      ...row,
      transactions: [...row.transactions],
    })),
    [spendingQuery.data],
  );

  useEffect(() => {
    if (!activeBudget) {
      setSelectedCategoryId(null);
      return;
    }
    setSelectedCategoryId((current) =>
      current && baseSpendingRows.some((row) => row.categoryId === current)
        ? current
        : baseSpendingRows[0]?.categoryId ?? null,
    );
  }, [activeBudget, baseSpendingRows]);

  const selectedTransactionsQuery = useMonthlyCategoryTransactionsQuery(
    {
      budgetId,
      month,
      categoryId: selectedCategoryId ?? "__inactive__",
    },
    Boolean(activeBudget && selectedCategoryId),
  );

  const spendingRows = useMemo<SpendingCategoryRow[]>(
    () => baseSpendingRows.map((row) =>
      row.categoryId === selectedCategoryId && selectedTransactionsQuery.data
        ? { ...row, transactions: [...selectedTransactionsQuery.data] }
        : row,
    ),
    [baseSpendingRows, selectedCategoryId, selectedTransactionsQuery.data],
  );

  const budgetVsActualRows = useMemo<BudgetVsActualRow[]>(
    () => budgetQuery.data ? buildBudgetVsActualRows(budgetQuery.data) : [],
    [budgetQuery.data],
  );

  const selectedSpendingRow = useMemo(
    () => spendingRows.find((row) => row.categoryId === selectedCategoryId) ?? spendingRows[0] ?? null,
    [spendingRows, selectedCategoryId],
  );
  const totalSpending = useMemo(() => calculateSpendingTotal(spendingRows), [spendingRows]);
  const budgetVsActualTotals = useMemo(() => calculateBudgetVsActualTotals(budgetVsActualRows), [budgetVsActualRows]);

  const isInitial = (status: string, data: unknown) =>
    data === undefined && (status === "idle" || status === "loading");
  const isLoading = Boolean(activeBudget) && (
    isInitial(budgetQuery.status, budgetQuery.data) ||
    isInitial(spendingQuery.status, spendingQuery.data)
  );
  const error = budgetQuery.error ?? spendingQuery.error ?? selectedTransactionsQuery.error;

  return {
    activeBudget,
    currencyCode,
    month,
    setMonth,
    formattedMonth: formatMonth(month),
    spendingRows,
    selectedSpendingRow,
    selectedCategoryId,
    setSelectedCategoryId,
    totalSpending,
    budgetVsActualRows,
    budgetVsActualTotals,
    isLoading,
    error,
    formatMoney: (amount: number) => formatCurrency(amount, currencyCode),
  };
}
