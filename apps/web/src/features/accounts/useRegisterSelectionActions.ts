import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { SelectionAction } from "../../components/ui/SelectionBar";
import { confirmDialog } from "../ui/appDialogService";
import type { RegisterTransactionView } from "./accountRegisterTypes";

interface UseRegisterSelectionActionsInput {
  selectedTransactionIds: string[];
  selectedTransactions: RegisterTransactionView[];
  toggleCleared: (transactionId: string) => Promise<void>;
  deleteTransaction: (transactionId: string) => Promise<void>;
  clearSelection: () => void;
  editTransaction: (transactionId: string | null) => void;
}

interface UseRegisterSelectionActionsResult {
  actions: SelectionAction[];
  hasSelection: boolean;
  selectedCount: number;
}

export function useRegisterSelectionActions({
  selectedTransactionIds,
  selectedTransactions,
  toggleCleared,
  deleteTransaction,
  clearSelection,
  editTransaction,
}: UseRegisterSelectionActionsInput): UseRegisterSelectionActionsResult {
  const selectedCount = selectedTransactionIds.length;
  const selectedTransactionId = selectedTransactionIds[0] ?? null;
  const hasSelection = selectedCount > 0;
  const areAllSelectedTransactionsCleared =
    selectedTransactions.length > 0 &&
    selectedTransactions.every((transaction) => transaction.cleared);

  const setSelectedTransactionsCleared = useCallback(
    async (cleared: boolean) => {
      for (const transaction of selectedTransactions) {
        if (transaction.cleared !== cleared) {
          await toggleCleared(transaction.id);
        }
      }
    },
    [selectedTransactions, toggleCleared],
  );

  const toggleSelectedCleared = useCallback(async () => {
    await setSelectedTransactionsCleared(!areAllSelectedTransactionsCleared);
  }, [areAllSelectedTransactionsCleared, setSelectedTransactionsCleared]);

  const deleteSelectedTransactions = useCallback(async () => {
    if (selectedCount === 0) {
      return;
    }

    const confirmed = await confirmDialog({
      message:
        selectedCount === 1
          ? "Delete this transaction? This cannot be undone yet."
          : `Delete ${selectedCount} selected transactions? This cannot be undone yet.`,
      confirmLabel:
        selectedCount === 1 ? "Delete transaction" : "Delete transactions",
      tone: "danger",
    });

    if (!confirmed) {
      return;
    }

    for (const transactionId of selectedTransactionIds) {
      await deleteTransaction(transactionId);
    }

    clearSelection();
    editTransaction(null);
  }, [
    clearSelection,
    deleteTransaction,
    editTransaction,
    selectedCount,
    selectedTransactionIds,
  ]);

  const actions = useMemo<SelectionAction[]>(() => {
    const nextActions: SelectionAction[] = [];

    if (selectedCount === 1 && selectedTransactionId) {
      nextActions.push({
        id: "edit",
        label: "Edit",
        icon: Pencil,
        onClick: () => {
          editTransaction(selectedTransactionId);
        },
      });
    }

    nextActions.push({
      id: "cleared",
      label: "Cleared",
      icon: CheckCircle2,
      variant: "success",
      pressed: areAllSelectedTransactionsCleared,
      title: areAllSelectedTransactionsCleared
        ? "Mark selected transactions uncleared"
        : "Mark selected transactions cleared",
      onClick: () => {
        void toggleSelectedCleared();
      },
    });

    nextActions.push({
      id: "delete",
      label: "Delete",
      icon: Trash2,
      variant: "danger",
      onClick: () => {
        void deleteSelectedTransactions();
      },
    });

    return nextActions;
  }, [
    areAllSelectedTransactionsCleared,
    deleteSelectedTransactions,
    editTransaction,
    selectedCount,
    selectedTransactionId,
    toggleSelectedCleared,
  ]);

  return {
    actions,
    hasSelection,
    selectedCount,
  };

}
