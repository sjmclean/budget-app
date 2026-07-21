import { createDatabase } from "../../../packages/database/src/db.js";
import { createTransfer } from "../../../packages/budget-engine/src/services/createTransfer.js";
import { SqliteAccountRepository } from "../../../packages/repository/src/SqliteAccountRepository.js";
import { SqliteBudgetRepository } from "../../../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteCategoryGroupRepository } from "../../../packages/repository/src/SqliteCategoryGroupRepository.js";
import { SqliteCategoryRepository } from "../../../packages/repository/src/SqliteCategoryRepository.js";
import { SqlitePayeeRepository } from "../../../packages/repository/src/SqlitePayeeRepository.js";
import { SqliteTransactionRepository } from "../../../packages/repository/src/SqliteTransactionRepository.js";
import type { Account } from "../../../packages/types/src/Account.js";
import type { AccountType } from "../../../packages/types/src/AccountType.js";
import type { Budget } from "../../../packages/types/src/Budget.js";
import type { BudgetParticipation } from "../../../packages/types/src/BudgetParticipation.js";
import type { Category } from "../../../packages/types/src/Category.js";
import type { CategoryGroup } from "../../../packages/types/src/CategoryGroup.js";
import type { Payee } from "../../../packages/types/src/Payee.js";
import type { Transaction } from "../../../packages/types/src/Transaction.js";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { resetDatabase } from "../../reset.js";
import {
  buildAccount,
  buildBudget,
  buildCategory,
  buildCategoryGroup,
  buildPayee,
  buildTransaction,
  DEFAULT_TEST_DATE,
} from "../builders/domainBuilders.js";

export interface AccountOptions {
  name?: string;
  type?: AccountType;
  participation?: BudgetParticipation;
  openingBalance?: number;
}

export interface TransactionOptions {
  account: Account;
  payee?: Payee | null;
  category?: Category | null;
  date?: string;
  amount?: number;
  memo?: string | null;
  checkNumber?: string | null;
}

export class SqliteBudgetScenario {
  readonly db;
  readonly budgets;
  readonly accounts;
  readonly categoryGroups;
  readonly categories;
  readonly payees;
  readonly transactions;

  private disposed = false;

  private constructor(
    readonly databasePath: string,
    private readonly ownedDirectory: string | null,
  ) {
    resetDatabase(databasePath);
    this.db = createDatabase(databasePath);
    this.budgets = new SqliteBudgetRepository(this.db);
    this.accounts = new SqliteAccountRepository(this.db);
    this.categoryGroups = new SqliteCategoryGroupRepository(this.db);
    this.categories = new SqliteCategoryRepository(this.db);
    this.payees = new SqlitePayeeRepository(this.db);
    this.transactions = new SqliteTransactionRepository(this.db);
  }

  static create(databasePath?: string) {
    if (databasePath) {
      mkdirSync(dirname(databasePath), { recursive: true });
      return new SqliteBudgetScenario(databasePath, null);
    }

    const root = join(tmpdir(), "budget-app-tests-");
    const directory = mkdtempSync(root);
    return new SqliteBudgetScenario(join(directory, `${randomUUID()}.budget`), directory);
  }

  cleanup(): void {
    if (this.disposed) return;
    this.disposed = true;

    const client = (this.db as { $client?: { close?: () => void } }).$client;
    client?.close?.();

    if (this.ownedDirectory) {
      rmSync(this.ownedDirectory, { recursive: true, force: true });
    }
  }

  dispose(): void {
    this.cleanup();
  }

  async budget(name = "Household Budget"): Promise<Budget> {
    const budget = buildBudget(name);
    await this.budgets.create(budget);
    return budget;
  }

  async account(budget: Budget, options: AccountOptions = {}): Promise<Account> {
    const account = buildAccount(budget.id, options);
    await this.accounts.create(account);
    return account;
  }

  async categoryGroup(budget: Budget, name = "Everyday", sortOrder = 0): Promise<CategoryGroup> {
    const group = buildCategoryGroup(budget.id, name, sortOrder);
    await this.categoryGroups.create(group);
    return group;
  }

  async category(group: CategoryGroup, name = "Groceries", sortOrder = 0): Promise<Category> {
    const category = buildCategory(group.id, name, sortOrder);
    await this.categories.create(category);
    return category;
  }

  async payee(budget: Budget, name = "Woolworths"): Promise<Payee> {
    const payee = buildPayee(budget.id, name);
    await this.payees.create(payee);
    return payee;
  }

  async transaction(budget: Budget, options: TransactionOptions): Promise<Transaction> {
    const transaction = buildTransaction(
      { budgetId: budget.id, accountId: options.account.id },
      {
        payeeId: options.payee?.id ?? null,
        categoryId: options.category?.id ?? null,
        date: options.date ?? DEFAULT_TEST_DATE,
        amount: options.amount ?? -1_500,
        memo: options.memo,
        checkNumber: options.checkNumber,
      },
    );
    await this.transactions.create(transaction);
    return transaction;
  }

  async transfer(
    budget: Budget,
    fromAccount: Account,
    toAccount: Account,
    amount = 25_000,
    date = DEFAULT_TEST_DATE,
  ) {
    const transfer = createTransfer({
      budgetId: budget.id,
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      date,
      amount,
    });
    await this.transactions.create(transfer.outflow);
    await this.transactions.create(transfer.inflow);
    return transfer;
  }
}

export async function withSqliteBudgetScenario<T>(
  run: (scenario: SqliteBudgetScenario) => T | Promise<T>,
  databasePath?: string,
): Promise<T> {
  const scenario = SqliteBudgetScenario.create(databasePath);
  try {
    return await run(scenario);
  } finally {
    scenario.cleanup();
  }
}
