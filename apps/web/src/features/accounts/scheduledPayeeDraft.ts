export interface ScheduledPayeeDraftState {
  payee: string;
  payeeId?: string;
  transferAccountId?: string;
  category?: string;
  categoryId?: string;
  incomeBudgetMonthOffset?: 0 | 1;
  inflowClassification?: "income" | "category-inflow";
  splitLines?: readonly unknown[];
}

export interface ScheduledPayeeDefaultCategory {
  id: string;
  name: string;
  isArchived?: boolean;
}

export function applyScheduledPayeeText<
  TState extends ScheduledPayeeDraftState,
>(current: TState, payee: string): TState {
  return {
    ...current,
    payee,
    payeeId: undefined,
    transferAccountId: undefined,
  };
}

export function applyScheduledSavedPayee<
  TState extends ScheduledPayeeDraftState,
>(
  current: TState,
  payeeId: string | undefined,
  selectedPayeeName: string | undefined,
  defaultCategoryId?: string,
  defaultCategoryName?: string,
  categoryOptions: readonly ScheduledPayeeDefaultCategory[] = [],
): TState {
  if (!payeeId) return current;

  const next = {
    ...current,
    payee: selectedPayeeName ?? current.payee,
    payeeId,
    transferAccountId: undefined,
  };

  if (current.splitLines?.length || !defaultCategoryId || !defaultCategoryName) {
    return next;
  }

  const category = categoryOptions.find(
    (option) =>
      option.id === defaultCategoryId &&
      option.name === defaultCategoryName &&
      option.isArchived !== true,
  );

  if (!category) return next;

  const {
    incomeBudgetMonthOffset: _incomeBudgetMonthOffset,
    inflowClassification: _inflowClassification,
    ...withoutIncomeIntent
  } = next;

  return {
    ...withoutIncomeIntent,
    category: category.name,
    categoryId: category.id,
  } as TState;
}

export function applyScheduledTransferAccount<
  TState extends ScheduledPayeeDraftState,
>(current: TState, transferAccountId: string | undefined): TState {
  if (!transferAccountId) return current;

  const {
    categoryId: _categoryId,
    incomeBudgetMonthOffset: _incomeBudgetMonthOffset,
    inflowClassification: _inflowClassification,
    splitLines: _splitLines,
    ...withoutCategoryMetadata
  } = current;

  return {
    ...withoutCategoryMetadata,
    transferAccountId,
    payeeId: undefined,
    ...("category" in current ? { category: "" } : {}),
    ...("splitLines" in current ? { splitLines: [] } : {}),
  } as TState;
}
