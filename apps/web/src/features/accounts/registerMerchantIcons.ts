import type { PayeeView } from "./payeeService";
import type { RegisterTransactionView } from "./accountRegisterTypes";

export function resolveRegisterPayee(
  payeesById: ReadonlyMap<string, PayeeView>,
  transaction: Pick<RegisterTransactionView, "payee" | "payeeId" | "transferAccountId" | "transferId">,
): PayeeView | undefined {
  if (transaction.transferId || transaction.transferAccountId || !transaction.payee.trim()) return undefined;
  const payeeId = transaction.payeeId?.trim();
  return payeeId ? payeesById.get(payeeId) : undefined;
}
