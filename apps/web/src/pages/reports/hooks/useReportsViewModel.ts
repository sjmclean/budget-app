import { useEffect, useMemo, useState } from "react";
import { resolveActiveBudget } from "../../../features/budget/activeBudget";
import { getCurrentBudgetMonth } from "../../../features/budget/budgetMonthNavigation";
import { getBudgetPersistenceProvider } from "../../../features/persistence/budgetPersistenceProviderFactory";
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
  const [spendingRows, setSpendingRows] = useState<SpendingCategoryRow[]>([]);
  const [budgetVsActualRows, setBudgetVsActualRows] = useState<BudgetVsActualRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      if (!activeBudget) {
        setSpendingRows([]);
        setBudgetVsActualRows([]);
        setSelectedCategoryId(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const gateway = getBudgetPersistenceProvider();
        const budgetView = await gateway.budgetView.getBudgetMonthView({
          budgetId: activeBudget.id,
          month,
        });
        const queries = gateway.accountRegisterQueries;
        if (!queries) {
          throw new Error("Reports require the local-first SQLite analytics runtime.");
        }
        const status = await queries.getBudgetStatus(activeBudget.id);
        if (!status.capabilities.analytics) {
          throw new Error("Reports analytics are unavailable for this SQLite budget.");
        }
        const nextRows: SpendingCategoryRow[] = (await queries.getMonthlySpending(
          activeBudget.id,
          month,
        )).map((row) => ({ ...row, transactions: [...row.transactions] }));
        const nextBudgetVsActualRows = buildBudgetVsActualRows(budgetView);

        if (!cancelled) {
          setSpendingRows(nextRows);
          setBudgetVsActualRows(nextBudgetVsActualRows);
          setSelectedCategoryId((current) =>
            current && nextRows.some((row) => row.categoryId === current) ? current : nextRows[0]?.categoryId ?? null,
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setSpendingRows([]);
          setBudgetVsActualRows([]);
          setSelectedCategoryId(null);
          setError(loadError instanceof Error ? loadError.message : "Unable to load reports.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [activeBudget, month]);

  useEffect(() => {
    let cancelled = false;
    if (!activeBudget || !selectedCategoryId) return;
    const gateway = getBudgetPersistenceProvider();
    if (!gateway.accountRegisterQueries) {
      setError("Report transaction details require the local-first SQLite analytics runtime.");
      return;
    }

    void gateway.accountRegisterQueries.getBudgetStatus(activeBudget.id)
      .then((status) => {
        if (!status.capabilities.analytics) return null;
        return gateway.accountRegisterQueries!.getMonthlyCategoryTransactions(
          activeBudget.id,
          month,
          selectedCategoryId,
        );
      })
      .then((transactions) => {
        if (!transactions || cancelled) return;
        setSpendingRows((rows) => rows.map((row) =>
          row.categoryId === selectedCategoryId
            ? { ...row, transactions: [...transactions] }
            : row,
        ));
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error
            ? loadError.message
            : "Unable to load report transactions.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeBudget, month, selectedCategoryId]);

  const selectedSpendingRow = useMemo(
    () => spendingRows.find((row) => row.categoryId === selectedCategoryId) ?? spendingRows[0] ?? null,
    [spendingRows, selectedCategoryId],
  );
  const totalSpending = useMemo(() => calculateSpendingTotal(spendingRows), [spendingRows]);
  const budgetVsActualTotals = useMemo(() => calculateBudgetVsActualTotals(budgetVsActualRows), [budgetVsActualRows]);

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
