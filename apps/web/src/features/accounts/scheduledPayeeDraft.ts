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

  return category
    ? {
        ...next,
        category: category.name,
        categoryId: category.id,
        incomeBudgetMonthOffset: undefined,
        inflowClassification: undefined,
      }
    : next;
}

export function applyScheduledTransferAccount<
  TState extends ScheduledPayeeDraftState,
>(current: TState, transferAccountId: string | undefined): TState {
  if (!transferAccountId) return current;

  return {
    ...current,
    transferAccountId,
    payeeId: undefined,
    category: "",
    categoryId: undefined,
    incomeBudgetMonthOffset: undefined,
    inflowClassification: undefined,
    splitLines: [],
  };
}
