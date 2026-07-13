import assert from "node:assert/strict";
import { BrowserPersistentAccountRegisterService } from "../apps/web/src/features/accounts/accountRegisterService";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

const storage = createMemoryStorage();
let releasePayeeWrites!: () => void;
const payeeWritesReleased = new Promise<void>((resolve) => {
  releasePayeeWrites = resolve;
});
let waitingPayeeWrites = 0;

function createService() {
  return new BrowserPersistentAccountRegisterService({
    storage,
    async recordPayee() {
      waitingPayeeWrites += 1;
      if (waitingPayeeWrites === 2) {
        releasePayeeWrites();
      }
      await payeeWritesReleased;
    },
    findPayeeIdByName: () => undefined,
    readAccounts: () => [
      {
        id: "checking",
        name: "Checking",
        type: "on-budget" as const,
        startingBalance: 0,
      },
    ],
    getAccountById: (accountId) =>
      accountId === "checking"
        ? {
            id: "checking",
            name: "Checking",
            type: "on-budget" as const,
            startingBalance: 0,
          }
        : undefined,
  });
}

const transaction = {
  date: "2026-07-13",
  tagIds: ["tag-bills"],
  payee: "Electricity Co",
  category: "Electricity",
  categoryId: "electricity",
  memo: "Scheduled bill",
  outflow: 120,
  inflow: 0,
  generatedFromSchedule: true,
  scheduledTransactionId: "schedule-electricity",
  scheduledOccurrenceDate: "2026-07-13",
};

const firstService = createService();
const secondService = createService();

await Promise.all([
  firstService.addTransaction({ accountId: "checking", transaction }),
  secondService.addTransaction({ accountId: "checking", transaction }),
]);

const register = await firstService.getAccountRegisterView({ accountId: "checking" });
const occurrences = register.transactions.filter(
  (candidate) =>
    candidate.scheduledTransactionId === transaction.scheduledTransactionId &&
    candidate.scheduledOccurrenceDate === transaction.scheduledOccurrenceDate,
);

assert.equal(occurrences.length, 1, "one scheduled occurrence must be persisted once");
assert.equal(
  occurrences[0]?.id,
  "scheduled:checking:schedule-electricity:2026-07-13",
  "scheduled occurrences should use a deterministic transaction ID",
);
assert.deepEqual(occurrences[0]?.tagIds, ["tag-bills"]);
assert.equal(occurrences[0]?.categoryId, "electricity");

await firstService.addTransaction({ accountId: "checking", transaction });
const afterRetry = await firstService.getAccountRegisterView({ accountId: "checking" });
assert.equal(
  afterRetry.transactions.filter(
    (candidate) =>
      candidate.scheduledTransactionId === transaction.scheduledTransactionId &&
      candidate.scheduledOccurrenceDate === transaction.scheduledOccurrenceDate,
  ).length,
  1,
  "retrying the same scheduled occurrence must remain idempotent",
);

console.log("v2.94.1 scheduled occurrence idempotency checks passed");
