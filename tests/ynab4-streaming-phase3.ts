import assert from "node:assert/strict";
import { createYnab4SourceReader } from "../packages/ynab4-importer/src/source/index.js";
import {
  buildYnab4LauncherImportPlan,
  buildYnab4LauncherImportPlanFromReader,
} from "../apps/web/src/features/budget/ynab4LauncherImport.js";
import { DEFAULT_BUDGET_PREFERENCES } from "../apps/web/src/features/budget/budgetPreferences.js";
import type { BudgetSummary } from "../apps/web/src/features/budget/budgetRegistry.js";

const data = {
  accounts: [
    { entityId: "account-checking", name: "Checking", accountType: "Checking", onBudget: true },
    { entityId: "account-savings", name: "Savings", accountType: "Savings", onBudget: true },
  ],
  masterCategories: [{
    entityId: "group-living",
    name: "Living",
    type: "OUTFLOW",
    subCategories: [
      { entityId: "category-food", name: "Food", sortableIndex: 0 },
      { entityId: "category-rent", name: "Rent", sortableIndex: 1 },
    ],
  }],
  payees: [
    { entityId: "payee-shop", name: "Café 🦘" },
    { entityId: "payee-transfer", name: "Transfer: Savings", targetAccountId: "account-savings" },
  ],
  monthlyBudgets: [],
  transactions: [
    {
      entityId: "transaction-food",
      accountId: "account-checking",
      categoryId: "category-food",
      payeeId: "payee-shop",
      date: "2026-07-01",
      amount: -25.5,
      memo: "Unicode 🧾",
      flag: "Red",
      cleared: "cleared",
    },
    {
      entityId: "transaction-split",
      accountId: "account-checking",
      categoryId: "Category/__Split__",
      date: "2026-07-02",
      amount: -30,
      subTransactions: [
        { entityId: "split-food", categoryId: "category-food", amount: -10 },
        { entityId: "split-rent", categoryId: "category-rent", amount: -20 },
      ],
    },
    {
      entityId: "transfer-out",
      accountId: "account-checking",
      targetAccountId: "account-savings",
      payeeId: "payee-transfer",
      date: "2026-07-03",
      amount: -100,
      transferTransactionId: "transfer-in",
    },
    {
      entityId: "transfer-in",
      accountId: "account-savings",
      targetAccountId: "account-checking",
      date: "2026-07-03",
      amount: 100,
      transferTransactionId: "transfer-out",
    },
    {
      entityId: "deleted",
      accountId: "account-checking",
      date: "2026-07-04",
      amount: -999,
      isTombstone: true,
    },
  ],
  scheduledTransactions: [{
    entityId: "scheduled-rent",
    accountId: "account-checking",
    categoryId: "category-rent",
    nextDueDate: "2026-08-01",
    amount: -1000,
    frequency: "Monthly",
    flag: "Blue",
  }],
};

const now = new Date("2026-07-27T00:00:00.000Z");
const budget: BudgetSummary = {
  id: "budget-streaming-equivalence",
  name: "Streaming equivalence",
  currency: "AUD",
  preferences: { ...DEFAULT_BUDGET_PREFERENCES },
  lastOpenedLabel: "Never",
  packagePath: "equivalence.budget",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
const source = JSON.stringify(data);
const legacy = buildYnab4LauncherImportPlan(
  budget,
  JSON.parse(source) as Record<string, unknown>,
  now,
);

for (const batchSize of [1, 2, 3, 500]) {
  const streamed = await buildYnab4LauncherImportPlanFromReader(
    createYnab4SourceReader(source, { chunkSize: 7 }),
    budget,
    now,
    { batchSize },
  );
  assert.deepEqual(streamed, legacy, `canonical plan differs at batch size ${batchSize}`);
}

// Mapping failure does not return a partial canonical plan and the reader can
// still be closed safely by the caller.
const invalid = JSON.stringify({
  ...data,
  transactions: [{
    entityId: "bad",
    accountId: "missing-account",
    categoryId: "category-food",
    date: "2026-07-01",
    amount: -1,
  }],
});
const invalidReader = createYnab4SourceReader(invalid, { chunkSize: 3 });
await assert.rejects(
  () => buildYnab4LauncherImportPlanFromReader(
    invalidReader,
    budget,
    now,
    { batchSize: 1 },
  ),
  /unresolved account reference/,
);
await invalidReader.close();

console.log("YNAB4 streaming Phase 3 canonical-plan equivalence tests passed");
