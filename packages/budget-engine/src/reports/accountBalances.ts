import { Account } from "../../../types/src/Account.js";
import { AccountBalanceRow } from "../../../types/src/Reports.js";
import { Transaction } from "../../../types/src/Transaction.js";
import { calculateAccountBalance } from "../calculations/calculateAccountBalance.js";

export function accountBalances(accounts: Account[], transactions: Transaction[]): AccountBalanceRow[] {
  return accounts.map((account) => ({ accountId: account.id, accountName: account.name, balance: calculateAccountBalance(account, transactions.filter((transaction) => transaction.accountId === account.id)) }));
}
