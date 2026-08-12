import { createKeyValueBudgetActivityPersistence } from "../apps/web/src/features/persistence/keyValueBudgetActivityPersistence.js";
import { InMemoryKeyValueStorage } from "./support/persistence/inMemoryBudgetPersistence.js";
import { replaceScheduledTransactionEntities } from "../apps/web/src/features/accounts/entities/scheduledTransactionEntity.js";
import { seedTransactionRegisters } from "./helpers/transactionEntityFixtures.js";
import { replaceAccountEntities } from "../apps/web/src/features/accounts/entities/accountEntity.js";


const storage = new InMemoryKeyValueStorage();

const budgetActivityPersistence =
  createKeyValueBudgetActivityPersistence(storage);

(globalThis as typeof globalThis & { window: object }).window = {};

replaceAccountEntities(storage, [
    {
      id: "checking",
      name: "Checking",
      type: "on-budget",
      startingBalance: 0,
      createdAt: "2026-06-20T00:00:00.000Z",
      closedAt: null,
    },
    {
      id: "tracking-house",
      name: "House",
      type: "tracking",
      startingBalance: 0,
      createdAt: "2026-06-20T00:00:00.000Z",
      closedAt: null,
    },
  ]);

seedTransactionRegisters(storage, {
    checking: {
      accountType: "on-budget",
      transactions: [
        {
          id: "tx-groceries",
          date: "2026-06-20",
          category: "Groceries",
          categoryId: "cat-groceries",
          inflow: 0,
          outflow: 4500,
          splitLines: [
            {
              id: "split-fuel",
              category: "Fuel",
              categoryId: "cat-fuel",
              inflow: 0,
              outflow: 1200,
            },
            {
              id: "split-groceries",
              category: "Groceries",
              categoryId: "cat-groceries",
              inflow: 0,
              outflow: 3300,
            },
          ],
        },
      ],
    },
    "tracking-house": {
      accountType: "tracking",
      transactions: [
        {
          id: "tx-tracking",
          date: "2026-06-20",
          category: "House Value",
          categoryId: "cat-house-value",
          inflow: 0,
          outflow: 1,
        },
      ],
    },
  });

replaceScheduledTransactionEntities(storage, [
  { id: "scheduled-groceries", accountId: "checking", tagIds: [], nextDueDate: "2026-07-01", frequency: "monthly", recurrenceInterval: 1, recurrenceUnit: "month", recurrenceAnchorDate: "2026-07-01", endCondition: "never", occurrencesCompleted: 0, weekendPolicy: "same-day", payee: "Market", category: "Groceries", categoryId: "cat-groceries", memo: "", outflow: 10, inflow: 0, createdAt: "2026-06-20T00:00:00.000Z", updatedAt: "2026-06-20T00:00:00.000Z" },
  { id: "scheduled-fuel", accountId: "checking", tagIds: [], nextDueDate: "2026-07-02", frequency: "monthly", recurrenceInterval: 1, recurrenceUnit: "month", recurrenceAnchorDate: "2026-07-02", endCondition: "never", occurrencesCompleted: 0, weekendPolicy: "same-day", payee: "Servo", category: "Fuel", categoryId: "cat-fuel", memo: "", outflow: 10, inflow: 0, createdAt: "2026-06-20T00:00:00.000Z", updatedAt: "2026-06-20T00:00:00.000Z" },
]);

const listed = await budgetActivityPersistence.listRegisterTransactionsForBudgetActivity();
if (listed.length !== 1) {
  throw new Error(`Expected tracking accounts to be excluded from budget activity, got ${listed.length}`);
}
if (listed[0].accountId !== "checking") {
  throw new Error(`Expected checking transaction to be listed, got ${listed[0].accountId}`);
}

const groceryCounts = await budgetActivityPersistence.countCategoryReferences({
  id: "cat-groceries",
  name: "Groceries",
});

if (groceryCounts.registerTransactionCount !== 1) {
  throw new Error(`Expected 1 grocery register transaction, got ${groceryCounts.registerTransactionCount}`);
}
if (groceryCounts.registerSplitLineCount !== 1) {
  throw new Error(`Expected 1 grocery split line, got ${groceryCounts.registerSplitLineCount}`);
}
if (groceryCounts.scheduledTransactionCount !== 1) {
  throw new Error(`Expected 1 grocery scheduled transaction, got ${groceryCounts.scheduledTransactionCount}`);
}

await budgetActivityPersistence.rewriteCategoryReferences({
  sourceCategory: { id: "cat-groceries", name: "Groceries" },
  targetCategory: { id: "cat-household", name: "Household" },
});

const rewrittenCounts = await budgetActivityPersistence.countCategoryReferences({
  id: "cat-household",
  name: "Household",
});

if (rewrittenCounts.registerTransactionCount !== 1) {
  throw new Error("Expected rewritten register transaction category reference");
}
if (rewrittenCounts.registerSplitLineCount !== 1) {
  throw new Error("Expected rewritten register split category reference");
}
if (rewrittenCounts.scheduledTransactionCount !== 1) {
  throw new Error("Expected rewritten scheduled transaction category reference");
}

await budgetActivityPersistence.renameRegisterCategoryReferences({
  previousName: "Fuel",
  nextName: "Car Fuel",
});

const renamedCounts = await budgetActivityPersistence.countCategoryReferences({
  id: "cat-fuel",
  name: "Car Fuel",
});

if (renamedCounts.registerSplitLineCount !== 1) {
  throw new Error("Expected register split category name rename to preserve categoryId reference");
}
if (renamedCounts.scheduledTransactionCount !== 1) {
  throw new Error("Expected scheduled Fuel category reference to remain unchanged by register-only rename");
}

console.log("v1.27 budget activity persistence port checks OK");
