export const TRANSACTION_EDITABLE_FIELDS = [
  "date",
  "payee",
  "category",
  "memo",
  "checkNumber",
  "outflow",
  "inflow",
] as const;

export type TransactionEditableField =
  (typeof TRANSACTION_EDITABLE_FIELDS)[number];

export interface TransactionEditIntent {
  readonly field: TransactionEditableField;
}

export interface TransactionFieldEditBehaviour {
  readonly autoFocus: boolean;
  readonly selectOnInitialFocus: boolean;
  readonly openOnFocus: boolean;
}

export function getTransactionFieldEditBehaviour(
  intent: TransactionEditIntent | null,
  field: TransactionEditableField,
): TransactionFieldEditBehaviour {
  const active = intent?.field === field;

  return {
    autoFocus: active,
    selectOnInitialFocus: active,
    openOnFocus:
      active &&
      (field === "payee" || field === "category"),
  };
}
