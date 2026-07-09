import { useCallback, useMemo, useState } from "react";
import {
  clearRegisterSelection as buildClearedRegisterSelection,
  emptyRegisterSelectionState,
  focusRegisterTransaction,
  isRegisterTransactionSelected,
  pruneRegisterSelection,
  selectRegisterTransactions,
  selectRegisterTransactionRange,
  selectSingleRegisterTransaction,
  toggleRegisterTransactionSelection,
  type RegisterSelectionState,
} from "./registerSelection";

export interface RegisterSelectionPointerOptions {
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export interface RegisterSelectionController {
  state: RegisterSelectionState;
  selectedIds: string[];
  selectedCount: number;
  anchorId: string | null;
  focusedId: string | null;
  hasSelection: boolean;
  isSelected: (transactionId: string) => boolean;
  selectSingle: (transactionId: string) => void;
  selectAll: (transactionIds: string[]) => void;
  toggle: (transactionId: string) => void;
  selectRange: (transactionId: string) => void;
  selectFromPointer: (
    transactionId: string,
    options?: RegisterSelectionPointerOptions,
  ) => void;
  focus: (transactionId: string | null) => void;
  clear: () => void;
  prune: (availableTransactionIds: string[]) => void;
}

export function useRegisterSelection(
  orderedTransactionIds: string[],
): RegisterSelectionController {
  const [state, setState] = useState(emptyRegisterSelectionState);

  const selectedIds = state.selectedIds;
  const selectedCount = selectedIds.length;

  const selectSingle = useCallback((transactionId: string) => {
    setState(selectSingleRegisterTransaction(transactionId));
  }, []);

  const selectAll = useCallback((transactionIds: string[]) => {
    setState(selectRegisterTransactions(transactionIds));
  }, []);

  const toggle = useCallback((transactionId: string) => {
    setState((currentState) =>
      toggleRegisterTransactionSelection(currentState, transactionId),
    );
  }, []);

  const selectRange = useCallback(
    (transactionId: string) => {
      setState((currentState) =>
        selectRegisterTransactionRange(
          currentState,
          orderedTransactionIds,
          transactionId,
        ),
      );
    },
    [orderedTransactionIds],
  );

  const selectFromPointer = useCallback(
    (transactionId: string, options: RegisterSelectionPointerOptions = {}) => {
      if (options.shiftKey) {
        setState((currentState) =>
          selectRegisterTransactionRange(
            currentState,
            orderedTransactionIds,
            transactionId,
          ),
        );
        return;
      }

      if (options.metaKey || options.ctrlKey || selectedCount > 0) {
        setState((currentState) =>
          toggleRegisterTransactionSelection(currentState, transactionId),
        );
        return;
      }

      setState(selectSingleRegisterTransaction(transactionId));
    },
    [orderedTransactionIds, selectedCount],
  );

  const focus = useCallback((transactionId: string | null) => {
    setState((currentState) => focusRegisterTransaction(currentState, transactionId));
  }, []);

  const clear = useCallback(() => {
    setState(buildClearedRegisterSelection());
  }, []);

  const prune = useCallback((availableTransactionIds: string[]) => {
    setState((currentState) =>
      pruneRegisterSelection(currentState, availableTransactionIds),
    );
  }, []);

  return useMemo(
    () => ({
      state,
      selectedIds,
      selectedCount,
      anchorId: state.anchorId,
      focusedId: state.focusedId,
      hasSelection: selectedCount > 0,
      isSelected: (transactionId: string) =>
        isRegisterTransactionSelected(state, transactionId),
      selectSingle,
      selectAll,
      toggle,
      selectRange,
      selectFromPointer,
      focus,
      clear,
      prune,
    }),
    [
      clear,
      focus,
      prune,
      selectFromPointer,
      selectRange,
      selectAll,
      selectSingle,
      selectedCount,
      selectedIds,
      state,
      toggle,
    ],
  );
}
