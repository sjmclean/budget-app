import { Account } from "../../types/src/Account.js";
import { CategoryMonth } from "../../types/src/CategoryMonth.js";
import { InflowDestination } from "../../types/src/InflowDestination.js";
import { Transaction } from "../../types/src/Transaction.js";
import { TransactionType } from "../../types/src/TransactionType.js";
import { createTransaction } from "../../budget-engine/src/services/createTransaction.js";
import { createTransfer } from "../../budget-engine/src/services/createTransfer.js";
import { updateAccountBalance } from "../../budget-engine/src/services/updateAccountBalance.js";
import { applyActivityToCategoryMonth } from "../../budget-engine/src/services/applyActivityToCategoryMonth.js";
import { addIncomeToBudgetMonth } from "../../budget-engine/src/services/addIncomeToBudgetMonth.js";
import { AccountRepository } from "../../repository/src/AccountRepository.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";
import { BudgetMonthRepository } from "../../repository/src/BudgetMonthRepository.js";
import { CategoryMonthRepository } from "../../repository/src/CategoryMonthRepository.js";
import { BudgetApplicationService } from "./BudgetApplicationService.js";

export interface PostSpendingInput {
  budgetId: string;
  month: string;
  accountId: string;
  payeeId?: string | null;
  categoryId: string;
  date: string;
  amount: number;
  memo?: string | null;
}

export interface PostIncomeInput {
  budgetId: string;
  month: string;
  accountId: string;
  payeeId?: string | null;
  date: string;
  amount: number;
  destination: InflowDestination;
  categoryId?: string | null;
  memo?: string | null;
}

export interface PostTransferInput {
  budgetId: string;
  fromAccountId: string;
  toAccountId: string;
  date: string;
  amount: number;
  memo?: string | null;
}

export class TransactionApplicationService {
  constructor(
    private accountRepo: AccountRepository,
    private transactionRepo: TransactionRepository,
    private budgetMonthRepo: BudgetMonthRepository,
    private categoryMonthRepo: CategoryMonthRepository,
    private budgetService: BudgetApplicationService
  ) {}

  private async requireAccount(accountId: string): Promise<Account> {
    const account = await this.accountRepo.getById(accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);
    return account;
  }

  private async updateCategoryMonthActivity(budgetId: string, month: string, categoryId: string, activity: number): Promise<CategoryMonth> {
    const budgetMonth = await this.budgetService.createMonth(budgetId, month);
    const categoryMonth = await this.budgetService.createCategoryMonth(budgetMonth.id, categoryId);
    const updated = applyActivityToCategoryMonth(categoryMonth, activity);
    await this.categoryMonthRepo.update(updated);
    return updated;
  }

  async postSpending(input: PostSpendingInput): Promise<{ transaction: Transaction; account: Account; categoryMonth: CategoryMonth }> {
    if (input.amount >= 0) {
      throw new Error("Spending amount must be negative");
    }

    const account = await this.requireAccount(input.accountId);

    const transaction = createTransaction({
      budgetId: input.budgetId,
      accountId: input.accountId,
      payeeId: input.payeeId ?? null,
      categoryId: input.categoryId,
      date: input.date,
      amount: input.amount,
      memo: input.memo ?? null
    });

    await this.transactionRepo.create(transaction);

    const updatedAccount = updateAccountBalance(account, input.amount);
    await this.accountRepo.update(updatedAccount);

    const categoryMonth = await this.updateCategoryMonthActivity(input.budgetId, input.month, input.categoryId, input.amount);

    return {
      transaction,
      account: updatedAccount,
      categoryMonth
    };
  }

  async postIncome(input: PostIncomeInput): Promise<{ transaction: Transaction; account: Account }> {
    if (input.amount <= 0) {
      throw new Error("Income amount must be positive");
    }

    const account = await this.requireAccount(input.accountId);

    const transaction = createTransaction({
      budgetId: input.budgetId,
      accountId: input.accountId,
      payeeId: input.payeeId ?? null,
      categoryId: input.destination === InflowDestination.Category ? input.categoryId ?? null : null,
      date: input.date,
      amount: input.amount,
      memo: input.memo ?? null,
      type: TransactionType.Income
    });

    await this.transactionRepo.create(transaction);

    const updatedAccount = updateAccountBalance(account, input.amount);
    await this.accountRepo.update(updatedAccount);

    const budgetMonth = await this.budgetService.createMonth(input.budgetId, input.month);

    if (input.destination === InflowDestination.ReadyToBudget || input.destination === InflowDestination.BufferFund) {
      const updatedBudgetMonth = addIncomeToBudgetMonth(budgetMonth, input.amount);
      await this.budgetMonthRepo.update(updatedBudgetMonth);
    }

    if (input.destination === InflowDestination.Category && input.categoryId) {
      await this.updateCategoryMonthActivity(input.budgetId, input.month, input.categoryId, input.amount);
    }

    return {
      transaction,
      account: updatedAccount
    };
  }

  async postTransfer(input: PostTransferInput): Promise<{ outflow: Transaction; inflow: Transaction; fromAccount: Account; toAccount: Account }> {
    const fromAccount = await this.requireAccount(input.fromAccountId);
    const toAccount = await this.requireAccount(input.toAccountId);

    const transfer = createTransfer({
      budgetId: input.budgetId,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      date: input.date,
      amount: input.amount,
      memo: input.memo ?? null
    });

    await this.transactionRepo.create(transfer.outflow);
    await this.transactionRepo.create(transfer.inflow);

    const updatedFrom = updateAccountBalance(fromAccount, -input.amount);
    const updatedTo = updateAccountBalance(toAccount, input.amount);

    await this.accountRepo.update(updatedFrom);
    await this.accountRepo.update(updatedTo);

    return {
      outflow: transfer.outflow,
      inflow: transfer.inflow,
      fromAccount: updatedFrom,
      toAccount: updatedTo
    };
  }
}
