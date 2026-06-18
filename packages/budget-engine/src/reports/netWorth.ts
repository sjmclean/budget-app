import { Account } from "../../../types/src/Account.js";
import { BudgetParticipation } from "../../../types/src/BudgetParticipation.js";
import { NetWorthReport } from "../../../types/src/Reports.js";
import { Transaction } from "../../../types/src/Transaction.js";
import { calculateAccountBalance } from "../calculations/calculateAccountBalance.js";

export function netWorth(
  accounts: Account[],
  transactions: Transaction[],
): NetWorthReport {
  const totalOnBudget = accounts
    .filter((account) => account.participation === BudgetParticipation.OnBudget)
    .reduce(
      (total, account) =>
        total +
        calculateAccountBalance(
          account,
          transactions.filter(
            (transaction) => transaction.accountId === account.id,
          ),
        ),
      0,
    );
  const totalOffBudget = accounts
    .filter(
      (account) => account.participation === BudgetParticipation.OffBudget,
    )
    .reduce(
      (total, account) =>
        total +
        calculateAccountBalance(
          account,
          transactions.filter(
            (transaction) => transaction.accountId === account.id,
          ),
        ),
      0,
    );
  return {
    totalOnBudget,
    totalOffBudget,
    netWorth: totalOnBudget + totalOffBudget,
  };
}
