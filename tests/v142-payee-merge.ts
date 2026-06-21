import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createAccountRegisterService } from "../apps/web/src/features/accounts/accountRegisterService.js";
import { createPayeeService, findPayeeIdByName, readPayees } from "../apps/web/src/features/accounts/payeeService.js";
import { createScheduledTransactionService } from "../apps/web/src/features/accounts/scheduledTransactionService.js";
import { createSqlitePayeePersistenceAdapter } from "../apps/web/src/features/persistence/sqlitePayeePersistenceAdapter.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";
import type { SqlitePayeeRecord } from "../apps/web/src/features/persistence/sqlitePayeePersistenceAdapter.js";

async function main() {
  await validateBrowserPayeeMergeLifecycle();
  await validateSqlitePayeeMergeLifecycle();
  validatePayeeManagerWiresMergeActions();

  console.log("v1.42 payee merge validation passed");
}

async function validateBrowserPayeeMergeLifecycle(): Promise<void> {
  const storage = createMemoryStorage();
  const payees = createPayeeService({ storage });
  const account = { id: "checking", name: "Checking", type: "on-budget" as const, startingBalance: 0, createdAt: "2026-06-21T00:00:00.000Z", closedAt: null };
  const registers = createAccountRegisterService({
    storage,
    recordPayee: async (payeeName: string) => {
      await payees.recordPayee(payeeName);
    },
    findPayeeIdByName: (payeeName: string) => findPayeeIdByName(storage, payeeName),
    readAccounts: () => [account],
    getAccountById: (accountId: string) => (accountId === account.id ? account : undefined),
  });
  const scheduled = createScheduledTransactionService({
    storage,
    recordPayee: async (payeeName: string) => {
      await payees.recordPayee(payeeName);
    },
    findPayeeIdByName: (payeeName: string) => findPayeeIdByName(storage, payeeName),
  });

  await payees.recordPayee("Woolies");
  await payees.recordPayee("Woolworths");

  const sourcePayeeId = findPayeeIdByName(storage, "Woolies");
  const targetPayeeId = findPayeeIdByName(storage, "Woolworths");
  assert.ok(sourcePayeeId, "source payee should exist before merge");
  assert.ok(targetPayeeId, "target payee should exist before merge");

  await registers.addTransaction({
    accountId: "checking",
    transaction: {
      date: "2026-06-21",
      flag: null,
      payee: "Woolies",
      payeeId: sourcePayeeId,
      category: "Groceries",
      memo: "shop",
      outflow: 4200,
      inflow: 0,
    },
  });
  await scheduled.create({
    accountId: "checking",
    flag: null,
    payee: "Woolies",
    payeeId: sourcePayeeId,
    category: "Groceries",
    memo: "weekly groceries",
    outflow: 5000,
    inflow: 0,
    nextDueDate: "2026-06-28",
    frequency: "weekly",
  });

  await payees.mergePayees({ sourcePayeeId, targetPayeeId });
  await registers.reassignPayeeReferences({
    accountId: "checking",
    sourcePayeeId,
    sourceName: "Woolies",
    targetPayeeId,
    targetName: "Woolworths",
  });
  await scheduled.reassignPayeeReferences({
    sourcePayeeId,
    sourceName: "Woolies",
    targetPayeeId,
    targetName: "Woolworths",
  });

  assert.equal(
    readPayees(storage).some((payee) => payee.id === sourcePayeeId && payee.isArchived),
    true,
    "merged source payee should be archived rather than deleted",
  );
  assert.equal(findPayeeIdByName(storage, "Woolies"), undefined, "merged source should be hidden from active lookup");
  assert.equal(findPayeeIdByName(storage, "Woolworths"), targetPayeeId, "target should remain active");

  const registerView = await registers.getAccountRegisterView({ accountId: "checking" });
  assert.equal(registerView.transactions[0]?.payee, "Woolworths", "register transaction should show target payee name");
  assert.equal(registerView.transactions[0]?.payeeId, targetPayeeId, "register transaction should point at target payee id");

  const scheduledTransactions = await scheduled.listByAccount("checking");
  assert.equal(scheduledTransactions[0]?.payee, "Woolworths", "scheduled transaction should show target payee name");
  assert.equal(scheduledTransactions[0]?.payeeId, targetPayeeId, "scheduled transaction should point at target payee id");
}

async function validateSqlitePayeeMergeLifecycle(): Promise<void> {
  const repository = new MemorySqlitePayeeRepository();
  const transactionPayeeUpdater = new MemoryTransactionPayeeUpdater();
  const adapter = createSqlitePayeePersistenceAdapter({
    repository,
    transactionPayeeUpdater,
    budgetId: "budget-1",
  });

  await adapter.recordPayee("Woolies");
  await adapter.recordPayee("Woolworths");

  const source = await repository.findByNormalizedName("budget-1", "woolies");
  const target = await repository.findByNormalizedName("budget-1", "woolworths");
  assert.ok(source, "SQLite source payee should exist before merge");
  assert.ok(target, "SQLite target payee should exist before merge");

  await adapter.mergePayees({ sourcePayeeId: source.id, targetPayeeId: target.id });

  assert.deepEqual(
    transactionPayeeUpdater.replacements,
    [[source.id, target.id]],
    "SQLite merge should reassign transaction payee ids when an updater is composed",
  );
  assert.equal(
    repository.records.some((payee) => payee.id === source.id && payee.isArchived),
    true,
    "SQLite source payee should be archived after merge",
  );
  assert.deepEqual(
    (await adapter.listPayees()).map((payee) => payee.name),
    ["Woolworths"],
    "SQLite active list should retain only the target payee after merge",
  );
}

function validatePayeeManagerWiresMergeActions(): void {
  const accountRegisterPage = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
  const payeePort = readFileSync("apps/web/src/features/accounts/payeePersistencePort.ts", "utf8");
  const accountRegisterPort = readFileSync("apps/web/src/features/accounts/accountRegisterPersistencePort.ts", "utf8");
  const scheduledPort = readFileSync("apps/web/src/features/accounts/scheduledTransactionPersistencePort.ts", "utf8");
  const releaseScripts = readFileSync("package.json", "utf8");

  assert.match(accountRegisterPage, /handleMergeSelectedPayee/, "payee manager should define merge handler");
  assert.match(accountRegisterPage, /mergePayees\(\{/, "payee manager should call mergePayees");
  assert.match(accountRegisterPage, /reassignPayeeReferences\(\{/, "payee manager should reassign register references");
  assert.match(payeePort, /mergePayees\(input: MergePayeesInput\)/, "payee persistence port should expose mergePayees");
  assert.match(accountRegisterPort, /reassignPayeeReferences/, "register port should expose payee reassignment");
  assert.match(scheduledPort, /reassignPayeeReferences/, "scheduled transaction port should expose payee reassignment");
  assert.match(releaseScripts, /test:v142/, "release scripts should include v1.42 validation");
}

function createMemoryStorage(): KeyValueStoragePort {
  const data = new Map<string, string>();

  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

class MemorySqlitePayeeRepository {
  records: SqlitePayeeRecord[] = [];

  async create(payee: SqlitePayeeRecord): Promise<void> {
    this.records.push({ ...payee });
  }

  async update(payee: SqlitePayeeRecord): Promise<void> {
    this.records = this.records.map((record) => (record.id === payee.id ? { ...payee } : record));
  }

  async archive(payeeId: string): Promise<void> {
    this.records = this.records.map((record) =>
      record.id === payeeId ? { ...record, isArchived: true, updatedAt: new Date() } : record,
    );
  }

  async delete(payeeId: string): Promise<void> {
    this.records = this.records.filter((record) => record.id !== payeeId);
  }

  async findByBudget(budgetId: string): Promise<SqlitePayeeRecord[]> {
    return this.records.filter((record) => record.budgetId === budgetId);
  }

  async findActiveByBudget(budgetId: string): Promise<SqlitePayeeRecord[]> {
    return this.records.filter((record) => record.budgetId === budgetId && !record.isArchived);
  }

  async findById(payeeId: string): Promise<SqlitePayeeRecord | null> {
    return this.records.find((record) => record.id === payeeId) ?? null;
  }

  async findByNormalizedName(budgetId: string, normalizedName: string): Promise<SqlitePayeeRecord | null> {
    return (
      this.records.find(
        (record) => record.budgetId === budgetId && record.normalizedName === normalizedName,
      ) ?? null
    );
  }
}

class MemoryTransactionPayeeUpdater {
  replacements: Array<[string, string]> = [];

  async replacePayee(fromPayeeId: string, toPayeeId: string): Promise<void> {
    this.replacements.push([fromPayeeId, toPayeeId]);
  }
}

main();
