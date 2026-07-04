import { useCallback, type MouseEvent } from "react";
import type {
  RegisterTransactionView,
  TransactionFlag,
} from "./accountRegisterTypes";

interface RegisterSelectionController {
  selectFromPointer: (
    transactionId: string,
    options?: {
      shiftKey?: boolean;
      metaKey?: boolean;
      ctrlKey?: boolean;
    },
  ) => void;
  selectSingle: (transactionId: string) => void;
  toggle: (transactionId: string) => void;
}

interface UseRegisterCommandsInput {
  registerSelection: RegisterSelectionController;
  setEditingTransactionId: (transactionId: string | null) => void;
  setShowEntryRow: (isVisible: boolean) => void;
  setAttachmentTransactionId: (transactionId: string | null) => void;
  toggleCleared: (transactionId: string) => Promise<void>;
  updateTransaction: (input: {
    id: string;
    date: string;
    flag?: TransactionFlag;
    payee: string;
    payeeId?: string;
    category: string;
    categoryId?: string;
    memo?: string;
    checkNumber?: string;
    inflow: number;
    outflow: number;
    splitLines?: RegisterTransactionView["splitLines"];
  }) => Promise<void>;
}

interface UseRegisterCommandsResult {
  selectTransaction: (
    transactionId: string,
    event?: MouseEvent<HTMLElement>,
  ) => void;
  toggleTransactionSelection: (transactionId: string) => void;
  editTransaction: (transactionId: string) => void;
  toggleClearedTransaction: (transactionId: string) => void;
  manageTransactionAttachments: (transactionId: string) => void;
  updateTransactionFlag: (
    transaction: RegisterTransactionView,
    flag: TransactionFlag,
  ) => void;
}

export function useRegisterCommands({
  registerSelection,
  setEditingTransactionId,
  setShowEntryRow,
  setAttachmentTransactionId,
  toggleCleared,
  updateTransaction,
}: UseRegisterCommandsInput): UseRegisterCommandsResult {
  const selectTransaction = useCallback(
    (transactionId: string, event?: MouseEvent<HTMLElement>) => {
      setEditingTransactionId(null);

      registerSelection.selectFromPointer(transactionId, {
        shiftKey: event?.shiftKey,
        metaKey: event?.metaKey,
        ctrlKey: event?.ctrlKey,
      });
    },
    [registerSelection, setEditingTransactionId],
  );

  const toggleTransactionSelection = useCallback(
    (transactionId: string) => {
      setEditingTransactionId(null);
      registerSelection.toggle(transactionId);
    },
    [registerSelection, setEditingTransactionId],
  );

  const editTransaction = useCallback(
    (transactionId: string) => {
      registerSelection.selectSingle(transactionId);
      setShowEntryRow(false);
      setEditingTransactionId(transactionId);
    },
    [registerSelection, setEditingTransactionId, setShowEntryRow],
  );

  const toggleClearedTransaction = useCallback(
    (transactionId: string) => {
      void toggleCleared(transactionId);
    },
    [toggleCleared],
  );

  const manageTransactionAttachments = useCallback(
    (transactionId: string) => {
      registerSelection.selectSingle(transactionId);
      setAttachmentTransactionId(transactionId);
    },
    [registerSelection, setAttachmentTransactionId],
  );

  const updateTransactionFlag = useCallback(
    (transaction: RegisterTransactionView, flag: TransactionFlag) => {
      if (transaction.flag === flag) {
        return;
      }

      void updateTransaction({
        id: transaction.id,
        date: transaction.date,
        flag,
        payee: transaction.payee,
        payeeId: transaction.payeeId,
        category: transaction.category,
        categoryId: transaction.categoryId,
        memo: transaction.memo,
        checkNumber: transaction.checkNumber,
        inflow: transaction.inflow,
        outflow: transaction.outflow,
        splitLines: transaction.splitLines,
      });
    },
    [updateTransaction],
  );

  return {
    selectTransaction,
    toggleTransactionSelection,
    editTransaction,
    toggleClearedTransaction,
    manageTransactionAttachments,
    updateTransactionFlag,
  };
}
