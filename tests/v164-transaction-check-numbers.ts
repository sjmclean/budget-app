import assert from "node:assert/strict";
import { createDatabase } from "../packages/database/src/db.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { createAccountRegisterService } from "../apps/web/src/features/accounts/accountRegisterService.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import { resetDatabase } from "./reset.js";

function memoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    listKeys() {
      return [...values.keys()].sort();
    },
  };
}

async function testSqliteTransactionsPreserveCheckNumber() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const accountRepo = new SqliteAccountRepository(db);
  const transactionRepo = new SqliteTransactionRepository(db);

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);

  const checking = createAccount(
    budget.id,
    "Checking",
    AccountType.Checking,
    BudgetParticipation.OnBudget,
    0,
  );
  await accountRepo.create(checking);

  const transaction = createTransaction({
    budgetId: budget.id,
    accountId: checking.id,
    date: "2026-06-23",
    amount: -12500,
    memo: "Council rates",
    checkNumber: " 1007 ",
  });

  await transactionRepo.create(transaction);
  const saved = await transactionRepo.getById(transaction.id);

  assert.equal(saved?.checkNumber, "1007");

  await transactionRepo.update({ ...transaction, checkNumber: "1008", updatedAt: new Date() });
  const updated = await transactionRepo.getById(transaction.id);

  assert.equal(updated?.checkNumber, "1008");
}

async function testBrowserRegisterPreservesCheckNumber() {
  const accountId = "checking";
  const storage = memoryStorage();
  const service = createAccountRegisterService({
    storage,
    async recordPayee() {},
    findPayeeIdByName() {
      return undefined;
    },
    readAccounts() {
      return [
        {
          id: accountId,
          name: "Checking",
          type: "on-budget",
          startingBalance: 0,
          createdAt: "2026-06-23T00:00:00.000Z",
          closedAt: null,
        },
      ];
    },
    getAccountById(id) {
      if (id !== accountId) return undefined;
      return {
        id: accountId,
        name: "Checking",
        type: "on-budget",
        startingBalance: 0,
        createdAt: "2026-06-23T00:00:00.000Z",
        closedAt: null,
      };
    },
  });

  const afterAdd = await service.addTransaction({
    accountId,
    transaction: {
      date: "2026-06-23",
      payee: "Water Authority",
      category: "Bills",
      memo: "Cheque payment",
      checkNumber: "2001",
      outflow: 88,
      inflow: 0,
    },
  });

  assert.equal(afterAdd.transactions[0].checkNumber, "2001");

  const reloaded = await service.getAccountRegisterView({ accountId });
  assert.equal(reloaded.transactions[0].checkNumber, "2001");

  const afterEdit = await service.updateTransaction({
    accountId,
    transaction: {
      id: reloaded.transactions[0].id,
      date: reloaded.transactions[0].date,
      payee: reloaded.transactions[0].payee,
      category: reloaded.transactions[0].category,
      memo: reloaded.transactions[0].memo,
      checkNumber: "2002",
      outflow: reloaded.transactions[0].outflow,
      inflow: reloaded.transactions[0].inflow,
    },
  });

  assert.equal(afterEdit.transactions[0].checkNumber, "2002");
}

await testSqliteTransactionsPreserveCheckNumber();
await testBrowserRegisterPreservesCheckNumber();

console.log("v1.64 transaction check-number preservation tests passed");
