import { randomUUID } from "crypto";
import { Account } from "../../../types/src/Account.js";
import { Transaction } from "../../../types/src/Transaction.js";
import { Reconciliation } from "../../../types/src/Reconciliation.js";
import { calculateClearedBalance } from "../calculations/calculateClearedBalance.js";

export function createReconciliation(
  budgetId: string,
  account: Account,
  transactions: Transaction[],
  statementDate: string,
  statementBalance: number,
): Reconciliation {
  const clearedBalance = calculateClearedBalance(account, transactions);
  return {
    id: randomUUID(),
    budgetId,
    accountId: account.id,
    statementDate,
    statementBalance,
    clearedBalance,
    difference: statementBalance - clearedBalance,
    createdAt: new Date(),
  };
}
