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
import { TransactionType } from "../packages/types/src/TransactionType.js";

const tempDir = mkdtempSync(join(tmpdir(), "budget-app-v136-"));
let nextId = 1;

const db = createDatabase(join(tempDir, "sqlite-register-transfer-validation.sqlite"));

try {
  await validateSqliteRegisterTransferWorkflow();
  console.log("v1.36 SQLite register transfer validation checks OK");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

async function validateSqliteRegisterTransferWorkflow(): Promise<void> {
  const budgetRepository = new SqliteBudgetRepository(db);
  const accountRepository = new SqliteAccountRepository(db);
  const payeeRepository = new SqlitePayeeRepository(db);
  const transactionRepository = new SqliteTransactionRepository(db);
  const categoryGroupRepository = new SqliteCategoryGroupRepository(db);
  const categoryRepository = new SqliteCategoryRepository(db);

  const budget = createBudget("Household Budget", "AUD");
  await budgetRepository.create(budget);

  const everyday = createAccount({
    budgetId: budget.id,
    name: "Everyday Account",
    type: AccountType.Checking,
    participation: BudgetParticipation.OnBudget,
    openingBalance: 100000,
  });
  const savings = createAccount({
    budgetId: budget.id,
    name: "Savings Account",
    type: AccountType.Savings,
    participation: BudgetParticipation.OnBudget,
    openingBalance: 50000,
  });

  await accountRepository.create(everyday);
  await accountRepository.create(savings);

  const categoryGroup = createCategoryGroup(budget.id, "Holding");
  await categoryGroupRepository.create(categoryGroup);
  await categoryRepository.create(createCategory(categoryGroup.id, "Buffer"));

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

  let everydayRegister = await adapter.addTransaction({
    accountId: everyday.id,
    transaction: {
      date: "2026-06-21",
      payee: "Transfer: Savings Account",
      category: "Transfer",
      memo: "Move to savings",
      inflow: 0,
      outflow: 25000,
    },
  });

  assertEqual(everydayRegister.transactions.length, 1, "source register should show transfer outflow");
  assertEqual(everydayRegister.transactions[0]?.id, "tx-1", "source transfer should use generated source id");
  assertEqual(everydayRegister.transactions[0]?.payee, "Transfer: Savings Account", "source payee should name target account");
  assertEqual(everydayRegister.transactions[0]?.category, "Transfer", "source category should be Transfer");
  assertEqual(everydayRegister.transactions[0]?.outflow, 25000, "source transfer should be an outflow");
  assertEqual(everydayRegister.transactions[0]?.transferAccountId, savings.id, "source transfer should reference target account");
  assertEqual(everydayRegister.workingBalance, 75000, "source working balance should include transfer outflow");

  let savingsRegister = await adapter.getAccountRegisterView({ accountId: savings.id });
  assertEqual(savingsRegister.transactions.length, 1, "target register should show transfer inflow");
  assertEqual(savingsRegister.transactions[0]?.id, "tx-2", "target transfer should use generated target id");
  assertEqual(savingsRegister.transactions[0]?.payee, "Transfer: Everyday Account", "target payee should name source account");
  assertEqual(savingsRegister.transactions[0]?.category, "Transfer", "target category should be Transfer");
  assertEqual(savingsRegister.transactions[0]?.inflow, 25000, "target transfer should be an inflow");
  assertEqual(savingsRegister.transactions[0]?.transferAccountId, everyday.id, "target transfer should reference source account");
  assertEqual(savingsRegister.workingBalance, 75000, "target working balance should include transfer inflow");

  const sourceTransaction = await transactionRepository.getById("tx-1");
  const targetTransaction = await transactionRepository.getById("tx-2");
  assertExists(sourceTransaction, "source transfer should persist");
  assertExists(targetTransaction, "target transfer should persist");
  assertEqual(sourceTransaction.type, TransactionType.Transfer, "source transaction should be transfer type");
  assertEqual(targetTransaction.type, TransactionType.Transfer, "target transaction should be transfer type");
  assertEqual(sourceTransaction.amount, -25000, "source transfer should store negative amount");
  assertEqual(targetTransaction.amount, 25000, "target transfer should store positive amount");
  assertEqual(sourceTransaction.payeeId, null, "source transfer should not use payee rows");
  assertEqual(targetTransaction.payeeId, null, "target transfer should not use payee rows");

  everydayRegister = await adapter.toggleCleared({ accountId: everyday.id, transactionId: "tx-1" });
  assertEqual(everydayRegister.transactions[0]?.cleared, true, "source toggle should mark transfer cleared");

  savingsRegister = await adapter.getAccountRegisterView({ accountId: savings.id });
  assertEqual(savingsRegister.transactions[0]?.cleared, true, "target transfer should mirror cleared status");

  const clearedTarget = await transactionRepository.getById("tx-2");
  assertExists(clearedTarget, "target transfer should still exist after clear toggle");
  assertEqual(clearedTarget.clearedStatus, ClearedStatus.Cleared, "target cleared status should persist");

  everydayRegister = await adapter.updateTransaction({
    accountId: everyday.id,
    transaction: {
      id: "tx-1",
      date: "2026-06-22",
      payee: "Transfer: Savings Account",
      category: "Transfer",
      memo: "Adjusted savings transfer",
      inflow: 0,
      outflow: 10000,
    },
  });
  assertEqual(everydayRegister.transactions[0]?.date, "2026-06-22", "source transfer date should update");
  assertEqual(everydayRegister.transactions[0]?.memo, "Adjusted savings transfer", "source memo should update");
  assertEqual(everydayRegister.transactions[0]?.outflow, 10000, "source transfer amount should update");
  assertEqual(everydayRegister.workingBalance, 90000, "source balance should recalculate after transfer update");

  savingsRegister = await adapter.getAccountRegisterView({ accountId: savings.id });
  assertEqual(savingsRegister.transactions[0]?.date, "2026-06-22", "target transfer date should update");
  assertEqual(savingsRegister.transactions[0]?.memo, "Adjusted savings transfer", "target memo should update");
  assertEqual(savingsRegister.transactions[0]?.inflow, 10000, "target transfer amount should update");
  assertEqual(savingsRegister.workingBalance, 60000, "target balance should recalculate after transfer update");

  everydayRegister = await adapter.deleteTransaction({ accountId: everyday.id, transactionId: "tx-1" });
  assertEqual(everydayRegister.transactions.length, 0, "source transfer delete should remove source read-model row");
  assertEqual(everydayRegister.workingBalance, 100000, "source balance should ignore deleted transfer");

  savingsRegister = await adapter.getAccountRegisterView({ accountId: savings.id });
  assertEqual(savingsRegister.transactions.length, 0, "source transfer delete should remove target read-model row");
  assertEqual(savingsRegister.workingBalance, 50000, "target balance should ignore deleted transfer");

  const deletedSource = await transactionRepository.getById("tx-1");
  const deletedTarget = await transactionRepository.getById("tx-2");
  assertExists(deletedSource, "source transfer should be soft-deleted, not hard-deleted");
  assertExists(deletedTarget, "target transfer should be soft-deleted, not hard-deleted");
  assertEqual(deletedSource.isDeleted, true, "source transfer should be marked deleted");
  assertEqual(deletedTarget.isDeleted, true, "target transfer should be marked deleted");
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
