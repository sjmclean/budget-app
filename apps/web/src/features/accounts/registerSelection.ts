export interface RegisterSelectionState {
  selectedIds: string[];
  anchorId: string | null;
  focusedId: string | null;
}

export const emptyRegisterSelectionState: RegisterSelectionState = {
  selectedIds: [],
  anchorId: null,
  focusedId: null,
};

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

export function isRegisterTransactionSelected(
  state: RegisterSelectionState,
  transactionId: string,
): boolean {
  return state.selectedIds.includes(transactionId);
}

export function focusRegisterTransaction(
  state: RegisterSelectionState,
  transactionId: string | null,
): RegisterSelectionState {
  return {
    ...state,
    focusedId: transactionId,
  };
}

export function selectSingleRegisterTransaction(
  transactionId: string,
): RegisterSelectionState {
  return {
    selectedIds: [transactionId],
    anchorId: transactionId,
    focusedId: transactionId,
  };
}

export function selectRegisterTransactions(
  transactionIds: string[],
): RegisterSelectionState {
  const selectedIds = uniqueIds(transactionIds);
  const focusedId = selectedIds.at(-1) ?? null;

  return {
    selectedIds,
    anchorId: selectedIds[0] ?? null,
    focusedId,
  };
}

export function toggleRegisterTransactionSelection(
  state: RegisterSelectionState,
  transactionId: string,
): RegisterSelectionState {
  const isSelected = isRegisterTransactionSelected(state, transactionId);
  const selectedIds = isSelected
    ? state.selectedIds.filter((selectedId) => selectedId !== transactionId)
    : [...state.selectedIds, transactionId];

  return {
    selectedIds,
    anchorId: transactionId,
    focusedId: transactionId,
  };
}

export function selectRegisterTransactionRange(
  state: RegisterSelectionState,
  orderedTransactionIds: string[],
  transactionId: string,
): RegisterSelectionState {
  const anchorId = state.anchorId ?? state.selectedIds.at(-1) ?? transactionId;
  const anchorIndex = orderedTransactionIds.indexOf(anchorId);
  const targetIndex = orderedTransactionIds.indexOf(transactionId);

  if (anchorIndex === -1 || targetIndex === -1) {
    return selectSingleRegisterTransaction(transactionId);
  }

  const startIndex = Math.min(anchorIndex, targetIndex);
  const endIndex = Math.max(anchorIndex, targetIndex);
  const rangeIds = orderedTransactionIds.slice(startIndex, endIndex + 1);

  return {
    selectedIds: uniqueIds([...state.selectedIds, ...rangeIds]),
    anchorId,
    focusedId: transactionId,
  };
}

export function clearRegisterSelection(): RegisterSelectionState {
  return emptyRegisterSelectionState;
}

export function pruneRegisterSelection(
  state: RegisterSelectionState,
  availableTransactionIds: string[],
): RegisterSelectionState {
  const availableIdSet = new Set(availableTransactionIds);
  const selectedIds = state.selectedIds.filter((transactionId) =>
    availableIdSet.has(transactionId),
  );
  const anchorId =
    state.anchorId && availableIdSet.has(state.anchorId)
      ? state.anchorId
      : selectedIds.at(-1) ?? null;
  const focusedId =
    state.focusedId && availableIdSet.has(state.focusedId)
      ? state.focusedId
      : selectedIds.at(-1) ?? null;

  const selectionUnchanged =
    selectedIds.length === state.selectedIds.length &&
    selectedIds.every(
      (selectedId, index) => selectedId === state.selectedIds[index],
    ) &&
    anchorId === state.anchorId &&
    focusedId === state.focusedId;

  return selectionUnchanged
    ? state
    : {
        selectedIds,
        anchorId,
        focusedId,
      };
}
