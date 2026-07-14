import { useEffect, useMemo, useState } from "react";
import { resolveActiveBudget } from "../../../features/budget/activeBudget";
import { getCurrentBudgetMonth } from "../../../features/budget/budgetMonthNavigation";
import { getAppPersistenceGateway } from "../../../features/persistence/appPersistenceGatewayFactory";
import { useBudgetRegistryStore } from "../../../stores/budgetRegistryStore";
import { useUIStore } from "../../../stores/uiStore";
import { calculateSpendingTotal, buildSpendingByCategoryRows, type SpendingCategoryRow } from "../services/spendingByCategoryReport";
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
        const gateway = getAppPersistenceGateway();
        const accounts = await gateway.accounts.listAccounts();
        const registers = await Promise.all(
          accounts.map((account) => gateway.accountRegisters.getAccountRegisterView({ accountId: account.id })),
        );
        const categoryOptions = await gateway.categories.getCategoryOptions({
          budgetId: activeBudget.id,
          month,
        });
        const budgetView = await gateway.budgetView.getBudgetMonthView({
          budgetId: activeBudget.id,
          month,
        });
        const transactions = registers.flatMap((register) => register.transactions);
        const nextRows = buildSpendingByCategoryRows(categoryOptions, transactions, month);
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
