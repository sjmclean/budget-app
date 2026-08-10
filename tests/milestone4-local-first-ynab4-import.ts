import assert from "node:assert/strict";
import { createLocalFirstYnab4ImportClient } from "../apps/web/src/features/persistence/localFirst/localFirstYnab4ImportClient";
import type { BudgetDomainCounts } from "../apps/web/src/features/persistence/localFirst/contracts";
import type { LocalBudgetDatabaseClient } from "../apps/web/src/features/persistence/localFirst/localBudgetClient";

const counts: BudgetDomainCounts = {
  accounts: 0, transactions: 0, payees: 0, categories: 0,
  budgetMonths: 0, scheduledTransactions: 0, transactionTags: 0,
};
let begun = false;
let committed: BudgetDomainCounts | null = null;
let rolledBack = false;
const manifest = () => ({
  budgetId: "budget-1", syncEpoch: "epoch-1", schemaVersion: 1,
  localRevision: 0, durable: true, counts: { ...counts },
});
const database = {
  async beginStagedImport() { begun = true; return manifest(); },
  async importRegisterBatch(batch: {
    accounts?: readonly unknown[]; transactions?: readonly unknown[];
    payees?: readonly unknown[]; categories?: readonly unknown[];
  }) {
    counts.accounts += batch.accounts?.length ?? 0;
    counts.transactions += batch.transactions?.length ?? 0;
    counts.payees += batch.payees?.length ?? 0;
    counts.categories += batch.categories?.length ?? 0;
    return manifest();
  },
  async importEntityBatch(rows: readonly { domain: keyof BudgetDomainCounts }[]) {
    for (const row of rows) counts[row.domain] += 1;
    return manifest();
  },
  async getManifest() { return manifest(); },
  async commitStagedImport(expected: BudgetDomainCounts) {
    committed = { ...expected };
    return manifest();
  },
  async rollbackStagedImport() { rolledBack = true; },
} as unknown as LocalBudgetDatabaseClient;

const client = createLocalFirstYnab4ImportClient({
  database, syncEpoch: "epoch-1", deviceId: "device-1",
});
const session = await client.begin({
  budgetId: "budget-1", budgetName: "Large budget", currency: "AUD",
});
await session.persistReferenceData({
  accounts: [{ id: "account-1", name: "Everyday", type: "checking",
    participation: "on-budget", openingBalance: 0, closedAt: null }],
  payees: [{ id: "payee-1", name: "Shop" }],
  categories: [{ id: "category-1", name: "Food", groupId: "group-1",
    groupName: "Living", sortOrder: 0 }],
});
await session.persistTransactions([{
  id: "transaction-1", accountId: "account-1", payeeId: "payee-1",
  categoryId: "category-1", transferAccountId: null, transferTransactionId: null,
  splitLines: [], type: "standard", date: "2026-07-30", memo: null,
  checkNumber: null, amount: -1250, clearedStatus: "cleared",
  createdAt: 1, updatedAt: 1, tagIds: ["tag-1"],
}]);
await session.persistTransactionTags?.([{ id: "tag-1", payload: { name: "Blue" } }]);
await session.persistScheduledTransactions([{ id: "scheduled-1" } as never]);
await session.persistBudgetMonths([{ month: "2026-07", view: {} as never }]);
assert.equal((await session.validate()).valid, true);
await session.commit();
assert.equal(begun, true);
assert.deepEqual(committed, {
  accounts: 1, transactions: 1, payees: 1, categories: 1,
  budgetMonths: 1, scheduledTransactions: 1, transactionTags: 1,
});
assert.equal(rolledBack, false);

const cancelled = await client.begin({
  budgetId: "budget-1", budgetName: "Cancelled", currency: "AUD",
});
await cancelled.cancel();
assert.equal(rolledBack, true);
console.log("Milestone 4 local-first YNAB4 staged import contract passed.");
