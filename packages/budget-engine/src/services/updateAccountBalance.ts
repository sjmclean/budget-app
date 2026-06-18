import { Account } from "../../../types/src/Account.js";

export function updateAccountBalance(
  account: Account,
  amount: number,
): Account {
  return {
    ...account,
    currentBalance: account.currentBalance + amount,
  };
}
