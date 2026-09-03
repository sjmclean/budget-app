import type { AccountRegisterView, RegisterTransactionView } from "./accountRegisterTypes";

const EMPTY_REGISTER_TRANSACTIONS: RegisterTransactionView[] = [];

/** Keep loading-state inputs stable for the register's derived-data effects. */
export function getRegisterTransactions(
  data: Pick<AccountRegisterView, "transactions"> | null | undefined,
): RegisterTransactionView[] {
  return data?.transactions ?? EMPTY_REGISTER_TRANSACTIONS;
}
