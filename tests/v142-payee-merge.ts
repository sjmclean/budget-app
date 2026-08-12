import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createAccountRegisterService } from "../apps/web/src/features/accounts/accountRegisterService.js";
import { createPayeeService, findPayeeIdByName, readPayees } from "../apps/web/src/features/accounts/payeeService.js";
import { createScheduledTransactionEntityHarness } from "./support/scheduledTransactionEntityHarness.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

async function main() {
  await validateBrowserPayeeMergeLifecycle();
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
  const scheduled =
    createScheduledTransactionEntityHarness(storage);

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

function validatePayeeManagerWiresMergeActions(): void {
  const payeeManagementPage = readFileSync("apps/web/src/pages/PayeeManagementPage.tsx", "utf8");
  const localWorker = readFileSync("apps/web/src/features/persistence/localFirst/localBudget.worker.ts", "utf8");
  const payeePort = readFileSync("apps/web/src/features/accounts/payeePersistencePort.ts", "utf8");
  const accountRegisterPort = readFileSync("apps/web/src/features/accounts/accountRegisterPersistencePort.ts", "utf8");
  const scheduledPort = readFileSync("apps/web/src/features/accounts/scheduledTransactionPersistencePort.ts", "utf8");
  const releaseScripts = readFileSync("package.json", "utf8");

  assert.match(payeeManagementPage, /mergePayeesIntoTarget/, "payee manager should define explicit merge handler");
  assert.match(payeeManagementPage, /mergePayees\(activeBudgetId!/, "payee manager should call mergePayees");
  assert.match(localWorker, /UPDATE local_scheduled_transactions SET payload_json/, "local merge should atomically reassign scheduled references");
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
