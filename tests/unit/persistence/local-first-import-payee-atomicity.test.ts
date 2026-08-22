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

type CapturedImportBatch = {
  readonly payeeWrites: readonly {
    readonly payee: LocalPayeeRecord;
    readonly mutation: LocalBudgetMutation;
  }[];
  readonly writes: readonly {
    readonly transaction: LocalTransactionRecord;
    readonly mutation: LocalBudgetMutation;
  }[];
  readonly options: {
    readonly requireAbsentTransactionIds?: readonly string[];
    readonly verifyWrittenTransactions?: boolean;
  };
};

function createHarness() {
  const batches: CapturedImportBatch[] = [];

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

    async getTransaction() {
      return null;
    },

    async writeImportBatch(
      payeeWrites: CapturedImportBatch["payeeWrites"],
      writes: CapturedImportBatch["writes"],
      options: CapturedImportBatch["options"] = {},
    ) {
      batches.push({
        payeeWrites: [...payeeWrites],
        writes: [...writes],
        options: {
          ...options,
          requireAbsentTransactionIds: options.requireAbsentTransactionIds
            ? [...options.requireAbsentTransactionIds]
            : undefined,
        },
      });

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
    batches,
  };
}

test("import batch creates one staged payee write shared by multiple imported transactions", async () => {
  const { client, batches } = createHarness();

  const payeeId = "new-payee-1";

  await client.commitImportBatch({
    budgetId: BUDGET_ID,
    accountId: "checking",
    payeeCreations: [
      {
        id: payeeId,
        name: "Northern Motor Group",
      },
    ],
    additions: [
      {
        id: "import-transaction-1",
        budgetId: BUDGET_ID,
        accountId: "checking",
        date: "2026-08-20",
        amount: -76_104,
        payeeId,
        payeeName: "Northern Motor Group",
      },
      {
        id: "import-transaction-2",
        budgetId: BUDGET_ID,
        accountId: "checking",
        date: "2026-08-21",
        amount: -12_500,
        payeeId,
        payeeName: "Northern Motor Group",
      },
    ],
    updates: [],
    provenanceAssignments: [
      {
        transactionId: "import-transaction-1",
        fileType: "qif",
        identity: "identity-1",
        occurrence: 1,
        importedAt: "2026-08-22T00:00:00.000Z",
      },
      {
        transactionId: "import-transaction-2",
        fileType: "qif",
        identity: "identity-2",
        occurrence: 1,
        importedAt: "2026-08-22T00:00:00.000Z",
      },
    ],
  });

  assert.equal(batches.length, 1);

  const batch = batches[0];

  assert.equal(
    batch.payeeWrites.length,
    1,
    "the shared new payee must be staged exactly once",
  );

  assert.equal(batch.payeeWrites[0].payee.id, payeeId);
  assert.equal(
    batch.payeeWrites[0].payee.name,
    "Northern Motor Group",
  );

  assert.equal(
    batch.payeeWrites[0].mutation.domain,
    "payees",
  );
  assert.equal(
    batch.payeeWrites[0].mutation.entityId,
    payeeId,
  );
  assert.equal(
    batch.payeeWrites[0].mutation.operation,
    "upsert",
  );

  assert.equal(batch.writes.length, 2);

  for (const write of batch.writes) {
    assert.equal(write.transaction.payeeId, payeeId);
    assert.equal(
      write.transaction.payeeName,
      "Northern Motor Group",
    );
    assert.equal(
      write.transaction.importProvenance.length,
      1,
      "each imported transaction must carry physical provenance into the atomic batch",
    );
  }

  assert.deepEqual(
    [...(batch.options.requireAbsentTransactionIds ?? [])].sort(),
    [
      "import-transaction-1",
      "import-transaction-2",
    ],
  );

  assert.equal(
    batch.options.verifyWrittenTransactions,
    true,
    "import persistence must request physical transaction verification",
  );
});

test("staged payee and transaction writes are submitted through one import batch call", async () => {
  const { client, batches } = createHarness();

  await client.commitImportBatch({
    budgetId: BUDGET_ID,
    accountId: "checking",
    payeeCreations: [
      {
        id: "atomic-payee",
        name: "Atomic Payee",
      },
    ],
    additions: [
      {
        id: "atomic-transaction",
        budgetId: BUDGET_ID,
        accountId: "checking",
        date: "2026-08-22",
        amount: -5_000,
        payeeId: "atomic-payee",
        payeeName: "Atomic Payee",
      },
    ],
    updates: [],
    provenanceAssignments: [
      {
        transactionId: "atomic-transaction",
        fileType: "qif",
        identity: "atomic-identity",
        occurrence: 1,
        importedAt: "2026-08-22T00:00:00.000Z",
      },
    ],
  });

  assert.equal(
    batches.length,
    1,
    "payee and transaction persistence must not be split into separate database calls",
  );

  assert.equal(batches[0].payeeWrites.length, 1);
  assert.equal(batches[0].writes.length, 1);
});
