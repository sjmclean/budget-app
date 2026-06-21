import { Account } from "../../types/src/Account.js";
import { AccountType } from "../../types/src/AccountType.js";
import { BudgetParticipation } from "../../types/src/BudgetParticipation.js";
import { ClearedStatus } from "../../types/src/ClearedStatus.js";
import { Transaction } from "../../types/src/Transaction.js";
import { AccountRepository } from "../../repository/src/AccountRepository.js";
import { CategoryGroupRepository } from "../../repository/src/CategoryGroupRepository.js";
import { CategoryRepository } from "../../repository/src/CategoryRepository.js";
import { PayeeRepository } from "../../repository/src/PayeeRepository.js";
import { TransactionAttachmentRepository } from "../../repository/src/TransactionAttachmentRepository.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";

export type RegisterTransactionFlag = "red" | "orange" | "yellow" | "green" | "blue" | "purple" | null;

export interface RegisterTransactionView {
  id: string;
  date: string;
  flag: RegisterTransactionFlag;
  attachmentCount: number;
  payee: string;
  category: string;
  memo?: string;
  inflow: number;
  outflow: number;
  runningBalance: number;
  cleared: boolean;
  reconciled: boolean;
  transferAccountId?: string;
}

export interface AccountRegisterView {
  accountId: string;
  accountName: string;
  accountType: "On budget" | "Credit card" | "Tracking";
  currencyCode: string;
  clearedBalance: number;
  unclearedBalance: number;
  workingBalance: number;
  transactions: RegisterTransactionView[];
}

export interface GetAccountRegisterViewInput {
  accountId: string;
  currencyCode?: string;
}

/**
 * Builds the read model needed by the account register UI from real repositories.
 *
 * This service deliberately returns UI-shaped data, but it has no React/browser dependency.
 * Platform adapters can expose this through Tauri, Node tests, or a future mobile bridge.
 */
export class AccountRegisterApplicationService {
  constructor(
    private accountRepo: AccountRepository,
    private transactionRepo: TransactionRepository,
    private payeeRepo: PayeeRepository,
    private categoryGroupRepo: CategoryGroupRepository,
    private categoryRepo: CategoryRepository,
    private attachmentRepo?: TransactionAttachmentRepository
  ) {}

  async getAccountRegisterView(input: GetAccountRegisterViewInput): Promise<AccountRegisterView> {
    const account = await this.accountRepo.getById(input.accountId);

    if (!account) {
      throw new Error(`Account not found: ${input.accountId}`);
    }

    const [allPayees, allAccounts, categoryNameById, attachmentCountByTransactionId] = await Promise.all([
      this.payeeRepo.findByBudget(account.budgetId),
      this.accountRepo.findByBudget(account.budgetId),
      this.loadCategoryNameById(account.budgetId),
      this.loadAttachmentCounts(account.budgetId)
    ]);

    const payeeNameById = new Map(allPayees.map((payee) => [payee.id, payee.name]));
    const accountNameById = new Map(allAccounts.map((account) => [account.id, account.name]));

    const transactions = (await this.transactionRepo.findByAccount(account.id))
      .filter((transaction) => !transaction.isDeleted)
      .sort(compareTransactionsChronologically);

    let runningBalance = account.openingBalance;
    const runningBalanceById = new Map<string, number>();

    for (const transaction of transactions) {
      runningBalance += transaction.amount;
      runningBalanceById.set(transaction.id, runningBalance);
    }

    const registerTransactions = transactions
      .slice()
      .sort(compareTransactionsForRegisterDisplay)
      .map((transaction) => toRegisterTransactionView({
        transaction,
        payeeName: transaction.payeeId ? payeeNameById.get(transaction.payeeId) : undefined,
        transferAccountName: transaction.transferAccountId ? accountNameById.get(transaction.transferAccountId) : undefined,
        categoryName: transaction.categoryId ? categoryNameById.get(transaction.categoryId) : undefined,
        attachmentCount: attachmentCountByTransactionId.get(transaction.id) ?? 0,
        runningBalance: runningBalanceById.get(transaction.id) ?? account.openingBalance
      }));

    const clearedBalance = transactions
      .filter((transaction) => transaction.clearedStatus === ClearedStatus.Cleared || transaction.clearedStatus === ClearedStatus.Reconciled)
      .reduce((sum, transaction) => sum + transaction.amount, account.openingBalance);

    const workingBalance = transactions.reduce((sum, transaction) => sum + transaction.amount, account.openingBalance);

    return {
      accountId: account.id,
      accountName: account.name,
      accountType: toRegisterAccountType(account),
      currencyCode: input.currencyCode ?? "AUD",
      clearedBalance,
      unclearedBalance: workingBalance - clearedBalance,
      workingBalance,
      transactions: registerTransactions
    };
  }

  private async loadCategoryNameById(budgetId: string): Promise<Map<string, string>> {
    const groups = await this.categoryGroupRepo.findByBudget(budgetId);
    const categoryLists = await Promise.all(groups.map((group) => this.categoryRepo.findByGroup(group.id)));
    const categories = categoryLists.flat();
    return new Map(categories.map((category) => [category.id, category.name]));
  }

  private async loadAttachmentCounts(budgetId: string): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    if (!this.attachmentRepo) {
      return counts;
    }

    const attachments = await this.attachmentRepo.findByBudget(budgetId);

    for (const attachment of attachments) {
      counts.set(attachment.transactionId, (counts.get(attachment.transactionId) ?? 0) + 1);
    }

    return counts;
  }
}

function toRegisterTransactionView(input: {
  transaction: Transaction;
  payeeName?: string;
  transferAccountName?: string;
  categoryName?: string;
  attachmentCount: number;
  runningBalance: number;
}): RegisterTransactionView {
  const amount = input.transaction.amount;

  return {
    id: input.transaction.id,
    date: input.transaction.date,
    flag: null,
    attachmentCount: input.attachmentCount,
    payee: input.transaction.transferAccountId
      ? `Transfer: ${input.transferAccountName ?? "Account"}`
      : input.payeeName ?? "",
    category: input.transaction.transferAccountId ? "Transfer" : input.categoryName ?? "",
    memo: input.transaction.memo ?? undefined,
    inflow: amount > 0 ? amount : 0,
    outflow: amount < 0 ? Math.abs(amount) : 0,
    runningBalance: input.runningBalance,
    cleared: input.transaction.clearedStatus === ClearedStatus.Cleared,
    reconciled: input.transaction.clearedStatus === ClearedStatus.Reconciled,
    transferAccountId: input.transaction.transferAccountId ?? undefined
  };
}

function toRegisterAccountType(account: Account): "On budget" | "Credit card" | "Tracking" {
  if (account.type === AccountType.CreditCard) {
    return "Credit card";
  }

  if (account.participation === BudgetParticipation.OffBudget) {
    return "Tracking";
  }

  return "On budget";
}

function compareTransactionsChronologically(a: Transaction, b: Transaction): number {
  const dateCompare = a.date.localeCompare(b.date);
  if (dateCompare !== 0) return dateCompare;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function compareTransactionsForRegisterDisplay(a: Transaction, b: Transaction): number {
  const dateCompare = b.date.localeCompare(a.date);
  if (dateCompare !== 0) return dateCompare;
  return b.createdAt.getTime() - a.createdAt.getTime();
}
