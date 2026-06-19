import { useCallback, useEffect, useMemo, useState } from "react";
import { mockAccountRegisterService } from "./mockAccountRegisterService";
import type {
  AccountRegisterView,
  NewRegisterTransactionInput,
  RegisterTransactionView,
} from "./accountRegisterTypes";

interface UpdateRegisterTransactionInput {
  id: string;
  date: string;
  payee: string;
  category: string;
  memo?: string;
  inflow: number;
  outflow: number;
}

interface UseAccountRegisterState {
  data: AccountRegisterView | null;
  isLoading: boolean;
  error: string | null;
  selectedTransaction: RegisterTransactionView | null;
  selectedTransactionId: string | null;
  selectTransaction: (transactionId: string) => void;
  addTransaction: (input: NewRegisterTransactionInput) => void;
  updateTransaction: (input: UpdateRegisterTransactionInput) => void;
  toggleCleared: (transactionId: string) => void;
  addMockAttachment: (transactionId: string) => void;
}

function recalculateRegister(data: AccountRegisterView): AccountRegisterView {
  let runningBalance = 0;

  const chronological = [...data.transactions].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const runningById = new Map<string, number>();

  for (const transaction of chronological) {
    runningBalance += transaction.inflow - transaction.outflow;
    runningById.set(transaction.id, runningBalance);
  }

  const transactions = data.transactions.map((transaction) => ({
    ...transaction,
    attachmentCount: transaction.attachmentCount ?? 0,
    runningBalance: runningById.get(transaction.id) ?? transaction.runningBalance,
  }));

  const clearedBalance = transactions
    .filter((transaction) => transaction.cleared || transaction.reconciled)
    .reduce((sum, transaction) => sum + transaction.inflow - transaction.outflow, 0);

  const workingBalance = transactions.reduce(
    (sum, transaction) => sum + transaction.inflow - transaction.outflow,
    0,
  );

  return {
    ...data,
    clearedBalance,
    unclearedBalance: workingBalance - clearedBalance,
    workingBalance,
    transactions,
  };
}

export function useAccountRegister(accountId: string): UseAccountRegisterState {
  const [data, setData] = useState<AccountRegisterView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRegister() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await mockAccountRegisterService.getAccountRegisterView({
          accountId,
        });

        if (!isMounted) {
          return;
        }

        setData(recalculateRegister(result));
        setSelectedTransactionId(result.transactions[0]?.id ?? null);
        setIsLoading(false);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : "Failed to load account register.",
        );
        setIsLoading(false);
      }
    }

    void loadRegister();

    return () => {
      isMounted = false;
    };
  }, [accountId]);

  const selectedTransaction = useMemo(() => {
    if (!data || !selectedTransactionId) {
      return null;
    }

    return (
      data.transactions.find((transaction) => transaction.id === selectedTransactionId) ??
      null
    );
  }, [data, selectedTransactionId]);

  const addTransaction = useCallback((input: NewRegisterTransactionInput) => {
    setData((current) => {
      if (!current) {
        return current;
      }

      const transaction: RegisterTransactionView = {
        id: `tx-${Date.now()}`,
        date: input.date,
        flag: null,
        attachmentCount: 0,
        payee: input.payee,
        category: input.category,
        memo: input.memo,
        inflow: input.inflow,
        outflow: input.outflow,
        runningBalance: current.workingBalance + input.inflow - input.outflow,
        cleared: false,
        reconciled: false,
      };

      const next = recalculateRegister({
        ...current,
        transactions: [transaction, ...current.transactions],
      });

      setSelectedTransactionId(transaction.id);
      return next;
    });
  }, []);

  const updateTransaction = useCallback((input: UpdateRegisterTransactionInput) => {
    setData((current) => {
      if (!current) {
        return current;
      }

      return recalculateRegister({
        ...current,
        transactions: current.transactions.map((transaction) => {
          if (transaction.id !== input.id) {
            return transaction;
          }

          return {
            ...transaction,
            date: input.date,
            payee: input.payee,
            category: input.category,
            memo: input.memo,
            inflow: input.inflow,
            outflow: input.outflow,
          };
        }),
      });
    });

    setSelectedTransactionId(input.id);
  }, []);

  const toggleCleared = useCallback((transactionId: string) => {
    setData((current) => {
      if (!current) {
        return current;
      }

      return recalculateRegister({
        ...current,
        transactions: current.transactions.map((transaction) => {
          if (transaction.id !== transactionId || transaction.reconciled) {
            return transaction;
          }

          return {
            ...transaction,
            cleared: !transaction.cleared,
          };
        }),
      });
    });
  }, []);

  const addMockAttachment = useCallback((transactionId: string) => {
    setData((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        transactions: current.transactions.map((transaction) => {
          if (transaction.id !== transactionId) {
            return transaction;
          }

          return {
            ...transaction,
            attachmentCount: transaction.attachmentCount + 1,
          };
        }),
      };
    });
  }, []);

  return {
    data,
    isLoading,
    error,
    selectedTransaction,
    selectedTransactionId,
    selectTransaction: setSelectedTransactionId,
    addTransaction,
    updateTransaction,
    toggleCleared,
    addMockAttachment,
  };
}
