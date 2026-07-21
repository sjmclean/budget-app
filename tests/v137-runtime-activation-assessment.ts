import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDatabase } from "../packages/database/src/index.js";
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
import { browserLocalStoragePersistenceGateway } from "../apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.js";
import { getAppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGatewayFactory.js";
import { createSqlitePersistenceGateway } from "../apps/web/src/features/persistence/sqlitePersistenceGateway.js";
import {
  createSqliteAccountPersistenceAdapter,
  DEFAULT_SQLITE_BUDGET_ID,
} from "../apps/web/src/features/persistence/sqliteAccountPersistenceAdapter.js";
import { createSqlitePayeePersistenceAdapter } from "../apps/web/src/features/persistence/sqlitePayeePersistenceAdapter.js";
import { createSqliteAccountRegisterPersistenceAdapter } from "../apps/web/src/features/persistence/sqliteAccountRegisterPersistenceAdapter.js";

const tempDir = mkdtempSync(join(tmpdir(), "budget-app-v137-"));
let nextId = 1;

const db = createDatabase(join(tempDir, "runtime-activation-assessment.sqlite"));

try {
  await validateRuntimeActivationAssessment();
  console.log("v1.37 runtime activation assessment checks OK");
} finally {
  db.$client.close();
  rmSync(tempDir, { recursive: true, force: true });
}

async function validateRuntimeActivationAssessment(): Promise<void> {
  const budgetRepository = new SqliteBudgetRepository(db);
  const accountRepository = new SqliteAccountRepository(db);
  const payeeRepository = new SqlitePayeeRepository(db);
  const transactionRepository = new SqliteTransactionRepository(db);
  const categoryGroupRepository = new SqliteCategoryGroupRepository(db);
  const categoryRepository = new SqliteCategoryRepository(db);

  await budgetRepository.create({
    ...createBudget("Household Budget", "AUD"),
    id: DEFAULT_SQLITE_BUDGET_ID,
  });

  const categoryGroup = createCategoryGroup(DEFAULT_SQLITE_BUDGET_ID, "Everyday");
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

  const sqliteGateway = createSqlitePersistenceGateway({
    accounts: createSqliteAccountPersistenceAdapter({
      repository: accountRepository,
      budgetId: DEFAULT_SQLITE_BUDGET_ID,
    }),
    payees: createSqlitePayeePersistenceAdapter({
      repository: payeeRepository,
      budgetId: DEFAULT_SQLITE_BUDGET_ID,
      now: () => new Date("2026-06-21T12:00:00.000Z"),
    }),
    accountRegisters: createSqliteAccountRegisterPersistenceAdapter({
      accountRepository,
      payeeRepository,
      transactionRepository,
      registerApplicationService,
      now: () => new Date("2026-06-21T12:00:00.000Z"),
      createId: createDeterministicId,
    }),
    budgetView: browserLocalStoragePersistenceGateway.budgetView,
    categories: browserLocalStoragePersistenceGateway.categories,
    scheduledTransactions: browserLocalStoragePersistenceGateway.scheduledTransactions,
  });

  const selectedGateway = getAppPersistenceGateway("sqlite-adapter", sqliteGateway);

  assert.strictEqual(
    selectedGateway,
    sqliteGateway,
    "explicit SQLite runtime selection should return the composed SQLite gateway",
  );
  assert.equal(selectedGateway.metadata.kind, "sqlite-adapter", "selected gateway should report SQLite adapter kind");
  assert.equal(
    selectedGateway.metadata.isProductionPersistence,
    false,
    "v1.37 assessment must not mark the mixed gateway as production persistence",
  );

  assert.strictEqual(
    selectedGateway.budgetView,
    browserLocalStoragePersistenceGateway.budgetView,
    "budget view remains browser-backed in the v1.37 mixed gateway",
  );
  assert.strictEqual(
    selectedGateway.categories,
    browserLocalStoragePersistenceGateway.categories,
    "categories remain browser-backed in the v1.37 mixed gateway",
  );
  assert.strictEqual(
    selectedGateway.scheduledTransactions,
    browserLocalStoragePersistenceGateway.scheduledTransactions,
    "scheduled transactions remain browser-backed in the v1.37 mixed gateway",
  );

  let accounts = await selectedGateway.accounts.createAccount({
    name: "Everyday Account",
    type: "on-budget",
    startingBalance: 100000,
  });
  accounts = await selectedGateway.accounts.createAccount({
    name: "Savings Account",
    type: "on-budget",
    startingBalance: 50000,
  });

  const everyday = accounts.find((account) => account.id === "everyday-account");
  const savings = accounts.find((account) => account.id === "savings-account");
  assert.ok(everyday, "SQLite gateway should create the everyday account through the account adapter");
  assert.ok(savings, "SQLite gateway should create the savings account through the account adapter");

  await selectedGateway.payees.recordPayee("Corner Store");

  let everydayRegister = await selectedGateway.accountRegisters.addTransaction({
    accountId: everyday.id,
    transaction: {
      date: "2026-06-21",
      payee: "Corner Store",
      category: "Groceries",
      categoryId: groceries.id,
      memo: "Weekly shop",
      inflow: 0,
      outflow: 12345,
    },
  });

  assert.equal(everydayRegister.transactions.length, 1, "standard transaction should be visible through selected gateway");
  assert.equal(everydayRegister.transactions[0]?.id, "tx-1", "standard transaction should use SQLite register id source");
  assert.equal(everydayRegister.transactions[0]?.payee, "Corner Store", "standard transaction should resolve payee name from SQLite");
  assert.equal(everydayRegister.transactions[0]?.category, "Groceries", "standard transaction should resolve category name from SQLite");
  assert.equal(everydayRegister.transactions[0]?.outflow, 12345, "standard transaction should expose outflow");
  assert.equal(everydayRegister.workingBalance, 87655, "standard transaction should affect SQLite register balance");

  everydayRegister = await selectedGateway.accountRegisters.addTransaction({
    accountId: everyday.id,
    transaction: {
      date: "2026-06-22",
      payee: "Transfer: Savings Account",
      category: "Transfer",
      memo: "Move to savings",
      inflow: 0,
      outflow: 10000,
    },
  });

  assert.equal(everydayRegister.transactions.length, 2, "transfer should add a second source register row");
  assert.equal(everydayRegister.transactions[0]?.payee, "Transfer: Savings Account", "latest source row should be transfer payee");
  assert.equal(everydayRegister.transactions[0]?.outflow, 10000, "source transfer should be an outflow");
  assert.equal(everydayRegister.workingBalance, 77655, "source balance should include standard and transfer transactions");

  const savingsRegister = await selectedGateway.accountRegisters.getAccountRegisterView({
    accountId: savings.id,
  });

  assert.equal(savingsRegister.transactions.length, 1, "target register should receive transfer counterpart");
  assert.equal(savingsRegister.transactions[0]?.payee, "Transfer: Everyday Account", "target transfer should name source account");
  assert.equal(savingsRegister.transactions[0]?.inflow, 10000, "target transfer should be an inflow");
  assert.equal(savingsRegister.workingBalance, 60000, "target balance should include transfer counterpart");

  const persistedTransactions = await transactionRepository.findByAccount(everyday.id);
  assert.equal(
    persistedTransactions.length,
    2,
    "selected gateway register mutations should persist to SQLite transaction repository",
  );
}

function createDeterministicId(): string {
  return `tx-${nextId++}`;
}
