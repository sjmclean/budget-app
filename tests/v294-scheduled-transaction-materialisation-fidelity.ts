import assert from "node:assert/strict";
import type { BudgetPersistenceProvider } from "../apps/web/src/features/persistence/budgetPersistenceProvider.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import {
  createScheduledTransactionService,
  type ScheduledTransactionView,
} from "../apps/web/src/features/accounts/scheduledTransactionService.ts";
import { generateDueScheduledTransactions } from "../apps/web/src/features/accounts/scheduledTransactionGenerationService.ts";
import type {
  AccountRegisterView,
  NewRegisterTransactionInput,
} from "../apps/web/src/features/accounts/accountRegisterTypes.ts";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

async function testScheduledCategoryIdRoundTripsIntoRegisterInput() {
  const service = createScheduledTransactionService({
    storage: createMemoryStorage(),
    recordPayee: async () => undefined,
    findPayeeIdByName: () => undefined,
  });

  const created = await service.create({
    accountId: "mobile-account",
    tagIds: ["tag-mobile"],
    nextDueDate: "2026-07-11",
    frequency: "monthly",
    payee: "Belong",
    category: "Phone & Mobiles",
    categoryId: "phone-and-mobiles",
    memo: "Abigail Mobile",
    outflow: 25,
    inflow: 0,
  });

  assert.equal(created.length, 1);
  assert.equal(created[0]?.categoryId, "phone-and-mobiles");
  assert.deepEqual(created[0]?.tagIds, ["tag-mobile"]);

  const registerInput = service.toRegisterInput(created[0]!);
  assert.equal(registerInput.category, "Phone & Mobiles");
  assert.equal(registerInput.categoryId, "phone-and-mobiles");
  assert.deepEqual(registerInput.tagIds, ["tag-mobile"]);
}

async function testConcurrentGenerationCreatesOneOccurrence() {
  const schedule: ScheduledTransactionView = {
    id: "schedule-belong-abigail",
    accountId: "mobile-account",
    tagIds: ["tag-mobile"],
    nextDueDate: "2026-07-11",
    frequency: "monthly",
    payee: "Belong",
    category: "Phone & Mobiles",
    categoryId: "phone-and-mobiles",
    memo: "Abigail Mobile",
    outflow: 25,
    inflow: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };

  let activeSchedule: ScheduledTransactionView | null = schedule;
  const transactions: AccountRegisterView["transactions"] = [];
  let addCount = 0;

  const gateway = {
    accounts: {
      async listAccounts() {
        return [{
          id: "mobile-account",
          name: "Mobile Account",
          type: "on-budget",
          category: "cash",
          onBudget: true,
          balance: -50,
          clearedBalance: 0,
          unclearedBalance: -50,
          createdAt: "2026-07-01T00:00:00.000Z",
        }];
      },
    },
    accountRegisters: {
      async getAccountRegisterView() {
        await delay(5);
        return createRegisterView(transactions);
      },
      async addTransaction(input: { accountId: string; transaction: NewRegisterTransactionInput }) {
        addCount += 1;
        await delay(10);
        transactions.push({
          id: `generated-${addCount}`,
          date: input.transaction.date,
          tagIds: input.transaction.tagIds,
          attachmentCount: 0,
          payee: input.transaction.payee,
          payeeId: input.transaction.payeeId,
          category: input.transaction.category,
          categoryId: input.transaction.categoryId,
          memo: input.transaction.memo,
          inflow: input.transaction.inflow,
          outflow: input.transaction.outflow,
          runningBalance: -25,
          cleared: false,
          reconciled: false,
          generatedFromSchedule: input.transaction.generatedFromSchedule,
          scheduledTransactionId: input.transaction.scheduledTransactionId,
          scheduledOccurrenceDate: input.transaction.scheduledOccurrenceDate,
        });
        return createRegisterView(transactions);
      },
    },
    scheduledTransactions: {
      async listByAccount() {
        return activeSchedule ? [{ ...activeSchedule }] : [];
      },
      async advanceAfterEnter() {
        activeSchedule = null;
        return [];
      },
      toRegisterInput(transaction: ScheduledTransactionView) {
        return {
          date: transaction.nextDueDate,
          tagIds: transaction.tagIds,
          payee: transaction.payee,
          payeeId: transaction.payeeId,
          category: transaction.category,
          categoryId: transaction.categoryId,
          memo: transaction.memo,
          outflow: transaction.outflow,
          inflow: transaction.inflow,
          splitLines: transaction.splitLines,
        };
      },
    },
  } as unknown as BudgetPersistenceProvider;

  const [first, second] = await Promise.all([
    generateDueScheduledTransactions(gateway, { today: "2026-07-11" }),
    generateDueScheduledTransactions(gateway, { today: "2026-07-11" }),
  ]);

  assert.strictEqual(first, second, "Concurrent callers should share one in-flight run.");
  assert.equal(addCount, 1, "Only one register insertion is allowed per scheduled occurrence.");
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0]?.categoryId, "phone-and-mobiles");
  assert.deepEqual(transactions[0]?.tagIds, ["tag-mobile"]);
  assert.equal(transactions[0]?.scheduledTransactionId, schedule.id);
  assert.equal(transactions[0]?.scheduledOccurrenceDate, "2026-07-11");
  const cached = await generateDueScheduledTransactions(gateway, {
    today: "2026-07-11",
  });
  assert.strictEqual(
    cached,
    first,
    "Repeated account loads should reuse the completed maintenance pass.",
  );
  assert.equal(addCount, 1);
}

function createRegisterView(
  transactions: AccountRegisterView["transactions"],
): AccountRegisterView {
  return {
    accountId: "mobile-account",
    accountName: "Mobile Account",
    accountType: "On budget",
    currencyCode: "AUD",
    clearedBalance: 0,
    unclearedBalance: -25 * transactions.length,
    workingBalance: -25 * transactions.length,
    transactions: transactions.map((transaction) => ({ ...transaction })),
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

await testScheduledCategoryIdRoundTripsIntoRegisterInput();
await testConcurrentGenerationCreatesOneOccurrence();

console.log("v2.94 scheduled transaction materialisation fidelity checks passed");
