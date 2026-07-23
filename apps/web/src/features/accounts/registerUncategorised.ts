import type { RegisterTransactionView } from "./accountRegisterTypes";

export function isTransferRegisterTransaction(
  transaction: RegisterTransactionView,
): boolean {
  return Boolean(
    transaction.transferId ||
      transaction.transferAccountId ||
      transaction.transferTransactionId ||
      transaction.categoryId?.startsWith("transfer:") ||
      transaction.category.trim().toLowerCase().startsWith("transfer:"),
  );
}

export function isUncategorisedRegisterTransaction(
  transaction: RegisterTransactionView,
  accountType?: "On budget" | "Credit card" | "Tracking",
): boolean {
  if (accountType === "Tracking") {
    return false;
  }
  if (transaction.outflow <= 0) {
    return false;
  }

  if (isTransferRegisterTransaction(transaction)) {
    return false;
  }

  if ((transaction.splitLines ?? []).length > 0) {
    return false;
  }

  const category = transaction.category.trim();

  return (
    !transaction.categoryId ||
    category.length === 0 ||
    category.toLowerCase() === "uncategorised" ||
    category.toLowerCase() === "uncategorized"
  );
}
