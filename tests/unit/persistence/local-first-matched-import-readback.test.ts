import assert from "node:assert/strict";
import { after, test } from "node:test";

import { createLocalFirstAccountRegisterQueryClient } from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import type {
  LocalPayeeRecord,
  LocalTransactionRecord,
} from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";

const BUDGET_ID = "budget-1";
const ACCOUNT_ID = "checking";
const TRANSACTION_ID = "matched-transaction-1";
const SYNC_EPOCH = "sync-epoch-1";

const originalFetch = globalThis.fetch;

globalThis.fetch = async () => {
  throw new Error("offline test");
};

after(() => {
  globalThis.fetch = originalFetch;
});

function createStorage() {
  const values = new Map<string, string>([
    ["budget-app.local-first.device-id", "test-device"],
    [`budget-app.local-first.sync-epoch.${BUDGET_ID}`, SYNC_EPOCH],
  ]);

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function existingMatchedTransaction(): LocalTransactionRecord {
  return {
    id: TRANSACTION_ID,
    budgetId: BUDGET_ID,
    accountId: ACCOUNT_ID,
    date: "2026-08-14",
    amount: -76_104,
    memo: null,
    checkNumber: null,
    clearedStatus: "uncleared",
    payeeId: "payee-northern-motor-group",
    payeeName: "Northern Motor Group",
    rawPayeeName: null,
    categoryId: "category-car",
    categoryName: "Car",
    transferAccountId: null,
    transferTransactionId: null,
    generatedFromSchedule: false,
    scheduledTransactionId: null,
    scheduledOccurrenceDate: null,
    splitLines: [],
    tagIds: [],
    importProvenance: [],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
}

type ImportBatchWrite = {
  readonly transaction: LocalTransactionRecord;
  readonly mutation: LocalBudgetMutation;
};

function createHarness() {
  const persistedTransactions = new Map<string, LocalTransactionRecord>([
    [TRANSACTION_ID, existingMatchedTransaction()],
  ]);

  const database = {
    async open() {
      return {};
    },

    async close() {},

    async getSyncState() {
      return {
        syncEpoch: SYNC_EPOCH,
        pulledCursor: 0,
        baselineHash: "test-baseline",
      };
    },

    async getTransaction(_budgetId: string, transactionId: string) {
      return persistedTransactions.get(transactionId) ?? null;
    },

    async writeImportBatch(
      _payeeWrites: readonly {
        readonly payee: LocalPayeeRecord;
        readonly mutation: LocalBudgetMutation;
      }[],
      writes: readonly ImportBatchWrite[],
      _options: {
        readonly requireAbsentTransactionIds?: readonly string[];
        readonly verifyWrittenTransactions?: boolean;
      } = {},
    ) {
      for (const write of writes) {
        persistedTransactions.set(
          write.transaction.id,
          structuredClone(write.transaction),
        );
      }

      return {};
    },
  } as unknown as LocalBudgetDatabaseClient;

  const client = createLocalFirstAccountRegisterQueryClient(
    {} as Parameters<
      typeof createLocalFirstAccountRegisterQueryClient
    >[0],
    {
      databaseFactory: () => database,
      storage: createStorage(),
      tabSyncCoordinator: {
        async run<T>(
          _budgetId: string,
          operation: () => Promise<T>,
        ) {
          return operation();
        },
        close() {},
      },
    },
  );

  return {
    client,
    async readPersistedTransaction(transactionId: string) {
      return database.getTransaction(BUDGET_ID, transactionId);
    },
  };
}

test("matched import persists raw bank payee and provenance on the existing transaction", async () => {
  const { client, readPersistedTransaction } = createHarness();

  await client.commitImportBatch({
    budgetId: BUDGET_ID,
    accountId: ACCOUNT_ID,
    additions: [],
    updates: [
      {
        id: TRANSACTION_ID,
        budgetId: BUDGET_ID,
        accountId: ACCOUNT_ID,
        date: "2026-08-14",
        amount: -76_104,
        payeeId: "payee-northern-motor-group",
        payeeName: "Northern Motor Group",
        rawPayee: "NORTHERN MOTOR GRP EPPING VIC",
        categoryId: "category-car",
        categoryName: "Car",
      },
    ],
    provenanceAssignments: [
      {
        transactionId: TRANSACTION_ID,
        fileType: "qif",
        identity: "qif-matched-identity-1",
        occurrence: 1,
        importedAt: "2026-08-22T00:00:00.000Z",
      },
    ],
    payeeCreations: [],
  });

  const persisted = await readPersistedTransaction(TRANSACTION_ID);

  assert.ok(persisted);

  assert.equal(
    persisted.id,
    TRANSACTION_ID,
    "the matched import must update the existing register transaction",
  );

  assert.equal(
    persisted.payeeName,
    "Northern Motor Group",
    "matched import must preserve the user-facing canonical payee",
  );

  assert.equal(
    persisted.rawPayeeName,
    "NORTHERN MOTOR GRP EPPING VIC",
    "matched import must persist the bank-provided raw payee",
  );

  assert.deepEqual(
    persisted.importProvenance,
    [
      {
        fileType: "qif",
        identity: "qif-matched-identity-1",
        occurrence: 1,
        importedAt: "2026-08-22T00:00:00.000Z",
      },
    ],
    "matched import provenance must persist on the same transaction as the raw bank payee",
  );
});
