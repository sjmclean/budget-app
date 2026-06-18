/**
 * Account safety service.
 *
 * Accounts are dangerous to delete or close because they are referenced by transactions,
 * transfers, scheduled transactions, balances, and future sync metadata. The UI should
 * ask this service before destructive account actions so it can present clear warnings
 * instead of discovering broken references after the fact.
 */
import { AccountRepository } from "../../repository/src/AccountRepository.js";
import { ScheduledTransactionRepository } from "../../repository/src/ScheduledTransactionRepository.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";
import { Account } from "../../types/src/Account.js";
import { ClearedStatus } from "../../types/src/ClearedStatus.js";

export interface AccountSafetyReport {
  accountId: string;
  canClose: boolean;
  transactionCount: number;
  unclearedCount: number;
  transferCount: number;
  scheduledCount: number;
  reasons: string[];
}

export class AccountSafetyApplicationService {
  constructor(
    private accountRepo: AccountRepository,
    private transactionRepo: TransactionRepository,
    private scheduledRepo?: ScheduledTransactionRepository,
    private transferPayeeRenamer?: { updateTransferPayeeNamesForAccount(accountId: string, payeeName: string): Promise<void> }
  ) {}

  async inspectCloseSafety(accountId: string): Promise<AccountSafetyReport> {
    const transactions = await this.transactionRepo.findByAccount(accountId);
    const unclearedCount = transactions.filter((tx) => tx.clearedStatus !== ClearedStatus.Reconciled).length;
    const transferCount = transactions.filter((tx) => tx.transferAccountId === accountId || tx.type === "Transfer").length;
    let scheduledCount = 0;
    if (this.scheduledRepo?.findActiveByBudget) {
      const account = await this.accountRepo.getById(accountId);
      if (account) {
        const scheduled = await this.scheduledRepo.findActiveByBudget(account.budgetId);
        scheduledCount = scheduled.filter((item) => item.accountId === accountId || item.transferAccountId === accountId).length;
      }
    }
    const reasons: string[] = [];
    if (transactions.length > 0) reasons.push("Account has transactions");
    if (unclearedCount > 0) reasons.push("Account has unreconciled transactions");
    if (transferCount > 0) reasons.push("Account is used by transfers");
    if (scheduledCount > 0) reasons.push("Account is used by scheduled transactions");
    return { accountId, canClose: reasons.length === 0, transactionCount: transactions.length, unclearedCount, transferCount, scheduledCount, reasons };
  }

  async assertCanDelete(accountId: string): Promise<void> {
    const report = await this.inspectCloseSafety(accountId);
    if (!report.canClose) throw new Error(`Account cannot be deleted safely: ${report.reasons.join("; ")}`);
  }

  async renameAccountAndTransferPayees(account: Account, newName: string): Promise<Account> {
    const updated = { ...account, name: newName };
    await this.accountRepo.update(updated);
    if (this.transferPayeeRenamer?.updateTransferPayeeNamesForAccount) {
      await this.transferPayeeRenamer.updateTransferPayeeNamesForAccount(account.id, `Transfer : ${newName}`);
    }
    return updated;
  }
}
