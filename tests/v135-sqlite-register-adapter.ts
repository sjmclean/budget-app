import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDatabase } from "../packages/database/src/index.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createCategory } from "../packages/budget-engine/src/services/createCategory.js";
import { createCategoryGroup } from "../packages/budget-engine/src/services/createCategoryGroup.js";
import { AccountRegisterApplicationService } from "../packages/application/src/AccountRegisterApplicationService.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteCategoryGroupRepository } from "../packages/repository/src/SqliteCategoryGroupRepository.js";
import { SqliteCategoryRepository } from "../packages/repository/src/SqliteCategoryRepository.js";
import { SqlitePayeeRepository } from "../packages/repository/src/SqlitePayeeRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { createSqliteAccountRegisterPersistenceAdapter } from "../apps/web/src/features/persistence/sqliteAccountRegisterPersistenceAdapter.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { ClearedStatus } from "../packages/types/src/ClearedStatus.js";

const tempDir = mkdtempSync(join(tmpdir(), "budget-app-v135-"));
let nextId = 1;

const db = createDatabase(join(tempDir, "sqlite-register-adapter.sqlite"));

try {
  await validateSqliteRegisterAdapterFoundation();
  console.log("v1.35 SQLite register adapter foundation checks OK");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

async function validateSqliteRegisterAdapterFoundation(): Promise<void> {
  const budgetRepository = new SqliteBudgetRepository(db);
  const accountRepository = new SqliteAccountRepository(db);
  const payeeRepository = new SqlitePayeeRepository(db);
  const transactionRepository = new SqliteTransactionRepository(db);
  const categoryGroupRepository = new SqliteCategoryGroupRepository(db);
  const categoryRepository = new SqliteCategoryRepository(db);

  const budget = createBudget("Household Budget", "AUD");
  await budgetRepository.create(budget);

  const account = createAccount({
    budgetId: budget.id,
    name: "Everyday Account",
    type: AccountType.Checking,
    participation: BudgetParticipation.OnBudget,
    openingBalance: 100000,
  });
  await accountRepository.create(account);

  const categoryGroup = createCategoryGroup(budget.id, "Food");
  await categoryGroupRepository.create(categoryGroup);

  const groceries = createCategory(categoryGroup.id, "Groceries");
  await categoryRepository.create(groceries);

  const registerApplicationService = new AccountRegisterApplicationService(
    accountRepository,
    transactionRepository,
    payeeRepository,
    categoryGroupRepository,
    categoryRepository,
  );

  const adapter = createSqliteAccountRegisterPersistenceAdapter({
    accountRepository,
    payeeRepository,
    transactionRepository,
    registerApplicationService,
    now: () => new Date("2026-06-21T10:00:00.000Z"),
    createId: createDeterministicId,
  });

  let register = await adapter.getAccountRegisterView({ accountId: account.id });
  assertEqual(register.workingBalance, 100000, "empty register should start at account opening balance");
  assertEqual(register.transactions.length, 0, "empty register should have no transactions");

  register = await adapter.addTransaction({
    accountId: account.id,
    transaction: {
      date: "2026-06-21",
      payee: "  Local   Grocer  ",
      category: "Groceries",
      categoryId: groceries.id,
      memo: "Weekly shop",
      inflow: 0,
      outflow: 12500,
    },
  });

  assertEqual(register.transactions.length, 1, "added transaction should appear in register");
  assertEqual(register.transactions[0]?.id, "tx-1", "adapter should persist generated transaction id");
  assertEqual(register.transactions[0]?.payee, "Local Grocer", "adapter should create and resolve payee name");
  assertEqual(register.transactions[0]?.category, "Groceries", "adapter should resolve category name");
  assertEqual(register.transactions[0]?.outflow, 12500, "outflow should round-trip from signed SQLite amount");
  assertEqual(register.workingBalance, 87500, "working balance should include persisted transaction");

  const createdPayee = await payeeRepository.findByNormalizedName(budget.id, "local grocer");
  assertExists(createdPayee, "adapter should create missing payee records");

  const persistedTransaction = await transactionRepository.getById("tx-1");
  assertExists(persistedTransaction, "transaction should be written through SQLite repository");
  assertEqual(persistedTransaction.amount, -12500, "outflow should be stored as negative amount");
  assertEqual(persistedTransaction.payeeId, createdPayee.id, "transaction should store payee id");

  register = await adapter.toggleCleared({ accountId: account.id, transactionId: "tx-1" });
  assertEqual(register.transactions[0]?.cleared, true, "toggleCleared should mark transaction cleared");
  assertEqual(register.clearedBalance, 87500, "cleared balance should include cleared transaction");

  const clearedTransaction = await transactionRepository.getById("tx-1");
  assertExists(clearedTransaction, "cleared transaction should still exist");
  assertEqual(clearedTransaction.clearedStatus, ClearedStatus.Cleared, "cleared status should persist");

  register = await adapter.updateTransaction({
    accountId: account.id,
    transaction: {
      id: "tx-1",
      date: "2026-06-22",
      payee: "Local Grocer",
      payeeId: createdPayee.id,
      category: "Groceries",
      categoryId: groceries.id,
      memo: "Adjusted shop",
      inflow: 0,
      outflow: 10000,
    },
  });

  assertEqual(register.transactions[0]?.date, "2026-06-22", "updated date should round-trip");
  assertEqual(register.transactions[0]?.memo, "Adjusted shop", "updated memo should round-trip");
  assertEqual(register.transactions[0]?.outflow, 10000, "updated amount should round-trip");
  assertEqual(register.workingBalance, 90000, "working balance should recalculate after update");

  register = await adapter.deleteTransaction({ accountId: account.id, transactionId: "tx-1" });
  assertEqual(register.transactions.length, 0, "soft-deleted transaction should disappear from register view");
  assertEqual(register.workingBalance, 100000, "working balance should ignore soft-deleted transaction");

  const deletedTransaction = await transactionRepository.getById("tx-1");
  assertExists(deletedTransaction, "delete should use repository soft delete, not hard delete");
  assertEqual(deletedTransaction.isDeleted, true, "transaction should be marked deleted");
}

function createDeterministicId(): string {
  return `tx-${nextId++}`;
}

function assertExists<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
