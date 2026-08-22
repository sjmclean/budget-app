import assert from "node:assert/strict";
import { after, test } from "node:test";

import { createLocalFirstAccountRegisterQueryClient } from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import type {
  LocalPayeeRecord,
  LocalTransactionRecord,
} from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";

const BUDGET_ID = "budget-split-readback";
const ACCOUNT_ID = "checking";
const TRANSACTION_ID = "imported-split-transaction";
const SYNC_EPOCH = "sync-epoch-split";

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

type ImportBatchWrite = {
  readonly transaction: LocalTransactionRecord;
  readonly mutation: LocalBudgetMutation;
};

function createHarness() {
  const persistedTransactions = new Map<string, LocalTransactionRecord>();

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
      options: {
        readonly requireAbsentTransactionIds?: readonly string[];
        readonly verifyWrittenTransactions?: boolean;
      } = {},
    ) {
      assert.deepEqual(
        options.requireAbsentTransactionIds,
        [TRANSACTION_ID],
        "a new imported split must retain new-transaction absence protection",
      );

      assert.equal(
        options.verifyWrittenTransactions,
        true,
        "dedicated import commits must request persisted transaction verification",
      );

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

test("new imported split survives the local-first import adapter with exact allocation and provenance", async () => {
  const { client, readPersistedTransaction } = createHarness();

  await client.commitImportBatch({
    budgetId: BUDGET_ID,
    accountId: ACCOUNT_ID,
    additions: [
      {
        id: TRANSACTION_ID,
        budgetId: BUDGET_ID,
        accountId: ACCOUNT_ID,
        date: "2026-08-20",
        amount: -15_000,
        payeeName: "Woolworths",
        rawPayee: "WOOLWORTHS 1234",
        categoryName: "Split",
        memo: "Bank purchase",
        splitLines: [
          {
            id: "split-groceries",
            categoryId: "groceries",
            categoryName: "Groceries",
            memo: "Food",
            amount: -10_000,
          },
          {
            id: "split-household",
            categoryId: "household",
            categoryName: "Household",
            memo: "Cleaning",
            amount: -3_000,
          },
          {
            id: "split-medical",
            categoryId: "medical",
            categoryName: "Medical",
            memo: "Pharmacy",
            amount: -2_000,
          },
        ],
      },
    ],
    updates: [],
    provenanceAssignments: [
      {
        transactionId: TRANSACTION_ID,
        fileType: "csv",
        identity: "csv-split-identity-1",
        occurrence: 1,
        importedAt: "2026-08-22T00:00:00.000Z",
      },
    ],
    payeeCreations: [],
  });

  const persisted = await readPersistedTransaction(TRANSACTION_ID);

  assert.ok(persisted);

  assert.equal(persisted.id, TRANSACTION_ID);
  assert.equal(persisted.accountId, ACCOUNT_ID);
  assert.equal(persisted.date, "2026-08-20");

  assert.equal(
    persisted.amount,
    -15_000,
    "the parent transaction must retain the exact imported bank amount",
  );

  assert.equal(persisted.payeeName, "Woolworths");
  assert.equal(persisted.rawPayeeName, "WOOLWORTHS 1234");

  assert.equal(
    persisted.categoryName,
    "Split",
    "the persisted parent must remain explicitly identified as a split",
  );
  assert.equal(
    persisted.categoryId,
    null,
    "a split parent must not acquire a category ID",
  );

  assert.equal(
    persisted.transferAccountId,
    null,
    "a category split must not become a parent transfer",
  );

  assert.deepEqual(
    persisted.splitLines,
    [
      {
        id: "split-groceries",
        categoryId: "groceries",
        categoryName: "Groceries",
        transferAccountId: null,
        transferTransactionId: null,
        memo: "Food",
        amount: -10_000,
      },
      {
        id: "split-household",
        categoryId: "household",
        categoryName: "Household",
        transferAccountId: null,
        transferTransactionId: null,
        memo: "Cleaning",
        amount: -3_000,
      },
      {
        id: "split-medical",
        categoryId: "medical",
        categoryName: "Medical",
        transferAccountId: null,
        transferTransactionId: null,
        memo: "Pharmacy",
        amount: -2_000,
      },
    ],
    "the reviewed split allocation must survive the local-first adapter exactly",
  );

  assert.equal(
    persisted.splitLines.reduce(
      (total, line) => total + line.amount,
      0,
    ),
    persisted.amount,
    "persisted split children must still balance exactly to the parent amount",
  );

  assert.deepEqual(
    persisted.importProvenance,
    [
      {
        fileType: "csv",
        identity: "csv-split-identity-1",
        occurrence: 1,
        importedAt: "2026-08-22T00:00:00.000Z",
      },
    ],
    "import provenance must persist on the same transaction as its split allocation",
  );
});
