export interface ScheduledPayeeDraftState {
  payee: string;
  payeeId?: string;
  transferAccountId?: string;
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
): TState {
  if (!payeeId) return current;

  return {
    ...current,
    payee: selectedPayeeName ?? current.payee,
    payeeId,
    transferAccountId: undefined,
  };
}

export function applyScheduledTransferAccount<
  TState extends ScheduledPayeeDraftState,
>(current: TState, transferAccountId: string | undefined): TState {
  if (!transferAccountId) return current;

  return {
    ...current,
    transferAccountId,
    payeeId: undefined,
  };
}

