import assert from "node:assert/strict";
import { after, test } from "node:test";

import { createLocalFirstAccountRegisterQueryClient } from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";
import type {
  LocalBudgetMutation,
  LocalBudgetOperationGroup,
  LocalFirstStoredConflict,
} from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import type { LocalTransactionRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

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

function createTransferPair(): [LocalTransactionRecord, LocalTransactionRecord] {
  const source: LocalTransactionRecord = {
    id: "transfer-source",
    budgetId: BUDGET_ID,
    accountId: "checking",
    date: "2026-08-13",
    amount: -10_000,
    memo: "Original transfer",
    checkNumber: null,
    clearedStatus: "uncleared",
    payeeId: null,
    payeeName: null,
    rawPayeeName: null,
    categoryId: null,
    categoryName: "Transfer",
    transferAccountId: "savings",
    transferTransactionId: "transfer-target",
    generatedFromSchedule: false,
    scheduledTransactionId: null,
    scheduledOccurrenceDate: null,
    splitLines: [],
    tagIds: [],
    updatedAt: "2026-08-13T00:00:00.000Z",
  };

  const target: LocalTransactionRecord = {
    ...source,
    id: "transfer-target",
    accountId: "savings",
    amount: 10_000,
    transferAccountId: "checking",
    transferTransactionId: "transfer-source",
  };

  return [source, target];
}

function createHarness() {
  const [source, target] = createTransferPair();
  const transactions = new Map<string, LocalTransactionRecord>([
    [source.id, source],
    [target.id, target],
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
      return transactions.get(transactionId) ?? null;
    },

    async writeTransaction(transaction: LocalTransactionRecord) {
      transactions.set(transaction.id, transaction);
    },

    async writeTransactionBatch(
      writes: readonly { readonly transaction: LocalTransactionRecord }[],
    ) {
      for (const write of writes) {
        transactions.set(write.transaction.id, write.transaction);
      }
    },

    async deleteTransaction(transactionId: string) {
      transactions.delete(transactionId);
    },

    async deleteTransactionBatch(
      deletes: readonly { readonly transactionId: string }[],
    ) {
      for (const entry of deletes) {
        transactions.delete(entry.transactionId);
      }
    },
  } as unknown as LocalBudgetDatabaseClient;

  const client = createLocalFirstAccountRegisterQueryClient(
    {} as Parameters<typeof createLocalFirstAccountRegisterQueryClient>[0],
    {
      databaseFactory: () => database,
      storage: createStorage(),
      tabSyncCoordinator: {
        async run<T>(_budgetId: string, operation: () => Promise<T>) {
          return operation();
        },
        close() {},
      },
    },
  );

  return {
    client,
    transactions,
  };
}

test("editing a linked transfer updates both legs and preserves reciprocal linkage", async () => {
  const { client, transactions } = createHarness();

  await client.updateTransaction("transfer-source", {
    budgetId: BUDGET_ID,
    accountId: "checking",
    date: "2026-08-14",
    amount: -12_500,
    memo: "Updated transfer",
  });

  const source = transactions.get("transfer-source");
  const target = transactions.get("transfer-target");

  assert.ok(source);
  assert.ok(target);

  assert.equal(source.accountId, "checking");
  assert.equal(source.transferAccountId, "savings");
  assert.equal(source.transferTransactionId, "transfer-target");
  assert.equal(source.amount, -12_500);
  assert.equal(source.date, "2026-08-14");
  assert.equal(source.memo, "Updated transfer");

  assert.equal(target.accountId, "savings");
  assert.equal(target.transferAccountId, "checking");
  assert.equal(target.transferTransactionId, "transfer-source");
  assert.equal(target.amount, 12_500);
  assert.equal(target.date, "2026-08-14");
  assert.equal(target.memo, "Updated transfer");
});

test("clearing one transfer leg leaves the counterpart clearing state unchanged", async () => {
  const { client, transactions } = createHarness();

  await client.toggleTransactionCleared("transfer-source", {
    budgetId: BUDGET_ID,
    accountId: "checking",
  });

  assert.equal(
    transactions.get("transfer-source")?.clearedStatus,
    "cleared",
  );
  assert.equal(
    transactions.get("transfer-target")?.clearedStatus,
    "uncleared",
  );
});

test("moving one transfer leg updates the reciprocal account relationship", async () => {
  const { client, transactions } = createHarness();

  await client.moveTransactions({
    budgetId: BUDGET_ID,
    sourceAccountId: "checking",
    targetAccountId: "joint",
    transactionIds: ["transfer-source"],
  });

  const source = transactions.get("transfer-source");
  const target = transactions.get("transfer-target");

  assert.ok(source);
  assert.ok(target);

  assert.equal(source.accountId, "joint");
  assert.equal(source.transferAccountId, "savings");
  assert.equal(source.transferTransactionId, "transfer-target");

  assert.equal(target.accountId, "savings");
  assert.equal(target.transferAccountId, "joint");
  assert.equal(target.transferTransactionId, "transfer-source");
});

test("moving a transfer leg into the counterpart account is refused without changing either leg", async () => {
  const { client, transactions } = createHarness();

  const sourceBefore = transactions.get("transfer-source");
  const targetBefore = transactions.get("transfer-target");

  await assert.rejects(
    client.moveTransactions({
      budgetId: BUDGET_ID,
      sourceAccountId: "checking",
      targetAccountId: "savings",
      transactionIds: ["transfer-source"],
    }),
    /transfer|same account|other side/i,
  );

  assert.deepEqual(transactions.get("transfer-source"), sourceBefore);
  assert.deepEqual(transactions.get("transfer-target"), targetBefore);
});

test("deleting either transfer leg removes both legs", async () => {
  const { client, transactions } = createHarness();

  await client.deleteTransaction("transfer-source", {
    budgetId: BUDGET_ID,
    accountId: "checking",
  });

  assert.equal(transactions.has("transfer-source"), false);
  assert.equal(transactions.has("transfer-target"), false);
});

test("editing a transfer with a missing counterpart is refused without changing the source", async () => {
  const { client, transactions } = createHarness();

  transactions.delete("transfer-target");
  const sourceBefore = transactions.get("transfer-source");

  await assert.rejects(
    client.updateTransaction("transfer-source", {
      budgetId: BUDGET_ID,
      accountId: "checking",
      date: "2026-08-14",
      amount: -12_500,
      memo: "Should not persist",
    }),
    /other side|missing|link/i,
  );

  assert.deepEqual(transactions.get("transfer-source"), sourceBefore);
  assert.equal(transactions.has("transfer-target"), false);
});

test("moving a transfer with broken reciprocal linkage is refused without changing either row", async () => {
  const { client, transactions } = createHarness();

  const target = transactions.get("transfer-target");
  assert.ok(target);

  transactions.set("transfer-target", {
    ...target,
    transferTransactionId: "wrong-source",
  });

  const sourceBefore = transactions.get("transfer-source");
  const targetBefore = transactions.get("transfer-target");

  await assert.rejects(
    client.moveTransactions({
      budgetId: BUDGET_ID,
      sourceAccountId: "checking",
      targetAccountId: "joint",
      transactionIds: ["transfer-source"],
    }),
    /other side|missing|link/i,
  );

  assert.deepEqual(transactions.get("transfer-source"), sourceBefore);
  assert.deepEqual(transactions.get("transfer-target"), targetBefore);
});

test("deleting a transfer with a missing counterpart is refused without deleting the surviving leg", async () => {
  const { client, transactions } = createHarness();

  transactions.delete("transfer-target");
  const sourceBefore = transactions.get("transfer-source");

  await assert.rejects(
    client.deleteTransaction("transfer-source", {
      budgetId: BUDGET_ID,
      accountId: "checking",
    }),
    /other side|missing|link/i,
  );

  assert.deepEqual(transactions.get("transfer-source"), sourceBefore);
  assert.equal(transactions.has("transfer-target"), false);
});

test("adding a top-level transfer creates an equal-and-opposite reciprocal pair", async () => {
  const { client, transactions } = createHarness();

  const beforeIds = new Set(transactions.keys());

  await client.addTransaction({
    id: "new-transfer-source",
    budgetId: BUDGET_ID,
    accountId: "checking",
    date: "2026-08-15",
    amount: -7_500,
    memo: "New transfer",
    transferAccountId: "savings",
  });

  const added = [...transactions.values()]
    .filter((transaction) => !beforeIds.has(transaction.id));

  assert.equal(added.length, 2);

  const source = transactions.get("new-transfer-source");
  assert.ok(source);
  assert.equal(source.accountId, "checking");
  assert.equal(source.amount, -7_500);
  assert.equal(source.transferAccountId, "savings");
  assert.ok(source.transferTransactionId);

  const counterpart = transactions.get(source.transferTransactionId);
  assert.ok(counterpart);

  assert.equal(counterpart.accountId, "savings");
  assert.equal(counterpart.amount, 7_500);
  assert.equal(counterpart.date, source.date);
  assert.equal(counterpart.memo, source.memo);
  assert.equal(counterpart.transferAccountId, "checking");
  assert.equal(counterpart.transferTransactionId, source.id);
});

test("batch-adding a top-level transfer creates both reciprocal legs", async () => {
  const { client, transactions } = createHarness();

  const beforeIds = new Set(transactions.keys());

  await client.commitTransactionBatch({
    budgetId: BUDGET_ID,
    accountId: "checking",
    additions: [
      {
        id: "batch-transfer-source",
        budgetId: BUDGET_ID,
        accountId: "checking",
        date: "2026-08-16",
        amount: -4_250,
        memo: "Batch transfer",
        transferAccountId: "savings",
      },
    ],
    updates: [],
  });

  const added = [...transactions.values()]
    .filter((transaction) => !beforeIds.has(transaction.id));

  assert.equal(added.length, 2);

  const source = transactions.get("batch-transfer-source");
  assert.ok(source);
  assert.equal(source.transferAccountId, "savings");
  assert.ok(source.transferTransactionId);

  const counterpart = transactions.get(source.transferTransactionId);
  assert.ok(counterpart);

  assert.equal(counterpart.accountId, "savings");
  assert.equal(counterpart.amount, 4_250);
  assert.equal(counterpart.transferAccountId, "checking");
  assert.equal(counterpart.transferTransactionId, source.id);
});

test("batch-updating a linked transfer updates both legs consistently", async () => {
  const { client, transactions } = createHarness();

  await client.commitTransactionBatch({
    budgetId: BUDGET_ID,
    accountId: "checking",
    additions: [],
    updates: [
      {
        id: "transfer-source",
        budgetId: BUDGET_ID,
        accountId: "checking",
        date: "2026-08-17",
        amount: -15_000,
        memo: "Batch updated transfer",
      },
    ],
  });

  const source = transactions.get("transfer-source");
  const target = transactions.get("transfer-target");

  assert.ok(source);
  assert.ok(target);

  assert.equal(source.amount, -15_000);
  assert.equal(source.date, "2026-08-17");
  assert.equal(source.memo, "Batch updated transfer");
  assert.equal(source.transferAccountId, "savings");
  assert.equal(source.transferTransactionId, "transfer-target");

  assert.equal(target.amount, 15_000);
  assert.equal(target.date, "2026-08-17");
  assert.equal(target.memo, "Batch updated transfer");
  assert.equal(target.transferAccountId, "checking");
  assert.equal(target.transferTransactionId, "transfer-source");
});

test("ordinary editing cannot retarget an existing transfer to another account", async () => {
  const { client, transactions } = createHarness();

  const sourceBefore = transactions.get("transfer-source");
  const targetBefore = transactions.get("transfer-target");

  await assert.rejects(
    client.updateTransaction("transfer-source", {
      budgetId: BUDGET_ID,
      accountId: "checking",
      date: "2026-08-13",
      amount: -10_000,
      memo: "Should not retarget",
      transferAccountId: "joint",
    }),
    /transfer|account|move/i,
  );

  assert.deepEqual(transactions.get("transfer-source"), sourceBefore);
  assert.deepEqual(transactions.get("transfer-target"), targetBefore);
});

test("editing an ordinary transaction into a transfer creates a reciprocal counterpart", async () => {
  const { client, transactions } = createHarness();

  transactions.set("ordinary", {
    id: "ordinary",
    budgetId: BUDGET_ID,
    accountId: "checking",
    date: "2026-08-18",
    amount: -2_500,
    memo: "Ordinary transaction",
    checkNumber: null,
    clearedStatus: "cleared",
    payeeId: null,
    payeeName: null,
    rawPayeeName: null,
    categoryId: "groceries",
    categoryName: "Groceries",
    transferAccountId: null,
    transferTransactionId: null,
    generatedFromSchedule: false,
    scheduledTransactionId: null,
    scheduledOccurrenceDate: null,
    splitLines: [],
    tagIds: [],
    updatedAt: "2026-08-18T00:00:00.000Z",
  });

  const beforeIds = new Set(transactions.keys());

  await client.updateTransaction("ordinary", {
    budgetId: BUDGET_ID,
    accountId: "checking",
    date: "2026-08-18",
    amount: -2_500,
    memo: "Now a transfer",
    transferAccountId: "savings",
  });

  const addedIds = [...transactions.keys()]
    .filter((id) => !beforeIds.has(id));

  assert.equal(addedIds.length, 1);

  const source = transactions.get("ordinary");
  assert.ok(source);
  assert.equal(source.categoryId, null);
  assert.equal(source.categoryName, "Transfer");
  assert.equal(source.transferAccountId, "savings");
  assert.ok(source.transferTransactionId);

  const counterpart = transactions.get(source.transferTransactionId);
  assert.ok(counterpart);
  assert.equal(counterpart.id, addedIds[0]);
  assert.equal(counterpart.accountId, "savings");
  assert.equal(counterpart.amount, 2_500);
  assert.equal(counterpart.transferAccountId, "checking");
  assert.equal(counterpart.transferTransactionId, "ordinary");

  // Clearing belongs to each account leg independently.
  assert.equal(source.clearedStatus, "cleared");
  assert.equal(counterpart.clearedStatus, "uncleared");
});

test("editing a reconciled transaction is refused without changing it", async () => {
  const { client, transactions } = createHarness();

  const source = transactions.get("transfer-source");
  assert.ok(source);

  const reconciled = {
    ...source,
    transferAccountId: null,
    transferTransactionId: null,
    clearedStatus: "reconciled",
  };
  transactions.set("reconciled-edit", {
    ...reconciled,
    id: "reconciled-edit",
  });

  const before = transactions.get("reconciled-edit");

  await assert.rejects(
    client.updateTransaction("reconciled-edit", {
      budgetId: BUDGET_ID,
      accountId: "checking",
      date: "2026-08-20",
      amount: -20_000,
      memo: "Must not persist",
    }),
    /reconcil|locked/i,
  );

  assert.deepEqual(transactions.get("reconciled-edit"), before);
});

test("cleared toggle cannot unreconcile a reconciled transaction", async () => {
  const { client, transactions } = createHarness();

  const source = transactions.get("transfer-source");
  assert.ok(source);

  transactions.set("reconciled-toggle", {
    ...source,
    id: "reconciled-toggle",
    transferAccountId: null,
    transferTransactionId: null,
    clearedStatus: "reconciled",
  });

  const before = transactions.get("reconciled-toggle");

  await assert.rejects(
    client.toggleTransactionCleared("reconciled-toggle", {
      budgetId: BUDGET_ID,
      accountId: "checking",
    }),
    /reconcil|locked/i,
  );

  assert.deepEqual(transactions.get("reconciled-toggle"), before);
});

test("deleting a reconciled transaction is refused without deleting it", async () => {
  const { client, transactions } = createHarness();

  const source = transactions.get("transfer-source");
  assert.ok(source);

  transactions.set("reconciled-delete", {
    ...source,
    id: "reconciled-delete",
    transferAccountId: null,
    transferTransactionId: null,
    clearedStatus: "reconciled",
  });

  const before = transactions.get("reconciled-delete");

  await assert.rejects(
    client.deleteTransaction("reconciled-delete", {
      budgetId: BUDGET_ID,
      accountId: "checking",
    }),
    /reconcil|locked/i,
  );

  assert.deepEqual(transactions.get("reconciled-delete"), before);
});

test("moving a reconciled transaction is refused without changing it", async () => {
  const { client, transactions } = createHarness();

  const source = transactions.get("transfer-source");
  assert.ok(source);

  transactions.set("reconciled-move", {
    ...source,
    id: "reconciled-move",
    transferAccountId: null,
    transferTransactionId: null,
    clearedStatus: "reconciled",
  });

  const before = transactions.get("reconciled-move");

  await assert.rejects(
    client.moveTransactions({
      budgetId: BUDGET_ID,
      sourceAccountId: "checking",
      targetAccountId: "joint",
      transactionIds: ["reconciled-move"],
    }),
    /reconcil|locked/i,
  );

  assert.deepEqual(transactions.get("reconciled-move"), before);
});

test("batch update cannot modify a reconciled transaction", async () => {
  const { client, transactions } = createHarness();

  const source = transactions.get("transfer-source");
  assert.ok(source);

  transactions.set("reconciled-batch", {
    ...source,
    id: "reconciled-batch",
    transferAccountId: null,
    transferTransactionId: null,
    clearedStatus: "reconciled",
  });

  const before = transactions.get("reconciled-batch");

  await assert.rejects(
    client.commitTransactionBatch({
      budgetId: BUDGET_ID,
      accountId: "checking",
      additions: [],
      updates: [
        {
          id: "reconciled-batch",
          budgetId: BUDGET_ID,
          accountId: "checking",
          date: "2026-08-21",
          amount: -30_000,
          memo: "Must not batch update",
        },
      ],
    }),
    /reconcil|locked/i,
  );

  assert.deepEqual(transactions.get("reconciled-batch"), before);
});

test("a transfer operation cannot modify a reconciled counterpart", async () => {
  const { client, transactions } = createHarness();

  const counterpart = transactions.get("transfer-target");
  assert.ok(counterpart);

  transactions.set("transfer-target", {
    ...counterpart,
    clearedStatus: "reconciled",
  });

  const sourceBefore = transactions.get("transfer-source");
  const targetBefore = transactions.get("transfer-target");

  await assert.rejects(
    client.updateTransaction("transfer-source", {
      budgetId: BUDGET_ID,
      accountId: "checking",
      date: "2026-08-22",
      amount: -12_000,
      memo: "Must not rewrite reconciled counterpart",
    }),
    /reconcil|locked/i,
  );

  assert.deepEqual(transactions.get("transfer-source"), sourceBefore);
  assert.deepEqual(transactions.get("transfer-target"), targetBefore);
});

test("deleting an unreconciled transfer is refused when its counterpart is reconciled", async () => {
  const { client, transactions } = createHarness();

  const counterpart = transactions.get("transfer-target");
  assert.ok(counterpart);

  transactions.set("transfer-target", {
    ...counterpart,
    clearedStatus: "reconciled",
  });

  const sourceBefore = transactions.get("transfer-source");
  const targetBefore = transactions.get("transfer-target");

  await assert.rejects(
    client.deleteTransaction("transfer-source", {
      budgetId: BUDGET_ID,
      accountId: "checking",
    }),
    /reconcil|locked/i,
  );

  assert.deepEqual(transactions.get("transfer-source"), sourceBefore);
  assert.deepEqual(transactions.get("transfer-target"), targetBefore);
});


function groupedTransferConflictFixtures() {
  const [source, target] = createTransferPair();
  const operationGroupId = "original-transfer-operation";
  const operationGroup: LocalBudgetOperationGroup = {
    members: [source, target].map((transaction) => ({
      domain: "transactions",
      entityId: transaction.id,
      operation: "upsert",
      payload: transaction,
    })),
  };

  function localMutation(
    transaction: LocalTransactionRecord,
    mutationId: string,
    deviceSequence: number,
  ): LocalBudgetMutation {
    return {
      mutationId,
      operationGroupId,
      operationGroup,
      budgetId: BUDGET_ID,
      syncEpoch: SYNC_EPOCH,
      deviceId: "test-device",
      deviceSequence,
      baseCursor: 0,
      domain: "transactions",
      entityId: transaction.id,
      operation: "upsert",
      payload: transaction,
      createdAt: "2026-08-13T01:00:00.000Z",
    };
  }

  function remoteMutation(
    transaction: LocalTransactionRecord,
    mutationId: string,
    deviceSequence: number,
  ): LocalBudgetMutation {
    return {
      mutationId,
      budgetId: BUDGET_ID,
      syncEpoch: SYNC_EPOCH,
      deviceId: "remote-device",
      deviceSequence,
      baseCursor: 0,
      domain: "transactions",
      entityId: transaction.id,
      operation: "upsert",
      payload: {
        ...transaction,
        memo: "Remote winner",
      },
      createdAt: "2026-08-13T02:00:00.000Z",
    };
  }

  function conflict(
    transaction: LocalTransactionRecord,
    losingMutation: LocalBudgetMutation,
    conflictId: string,
    cursor: number,
  ): LocalFirstStoredConflict {
    return {
      conflictId,
      budgetId: BUDGET_ID,
      syncEpoch: SYNC_EPOCH,
      entityKey: `transactions:${transaction.id}`,
      detectedAt: "2026-08-13T02:00:00.000Z",
      losingMutation,
      winningMutation: remoteMutation(
        transaction,
        `remote-${transaction.id}`,
        cursor,
      ),
      winningCursor: cursor,
      status: "unresolved",
      resolvedAt: null,
    };
  }

  const sourceMutation = localMutation(source, "local-source", 1);
  const targetMutation = localMutation(target, "local-target", 2);

  return {
    source,
    target,
    operationGroupId,
    operationGroup,
    sourceConflict: conflict(
      source,
      sourceMutation,
      "conflict-source",
      10,
    ),
    targetConflict: conflict(
      target,
      targetMutation,
      "conflict-target",
      11,
    ),
  };
}

function createConflictReplayHarness(
  conflicts: readonly LocalFirstStoredConflict[],
) {
  const batches: {
    readonly transaction: LocalTransactionRecord;
    readonly mutation: LocalBudgetMutation;
    readonly resolveConflictId?: string;
  }[][] = [];

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

    async readOutbox() {
      return [];
    },

    async listSyncConflicts(
      status?: "unresolved" | "resolved-local" | "resolved-remote",
    ) {
      return status
        ? conflicts.filter((conflict) => conflict.status === status)
        : conflicts;
    },

    async writeTransactionBatch(
      writes: readonly {
        readonly transaction: LocalTransactionRecord;
        readonly mutation: LocalBudgetMutation;
        readonly resolveConflictId?: string;
      }[],
    ) {
      batches.push([...writes]);
      return {};
    },
  } as unknown as LocalBudgetDatabaseClient;

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.includes("/api/local-first/bootstrap?")) {
      throw new Error("offline bootstrap test");
    }

    if (
      url.includes("/api/local-first/mutations?") &&
      method === "GET"
    ) {
      return new Response(
        JSON.stringify({
          mutations: [],
          latestCursor: 0,
          hasMore: false,
          baseCursor: 0,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    throw new Error(`Unexpected relay request: ${method} ${url}`);
  };

  try {
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
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("keep-local replays both transfer legs when only one leg conflicted", async () => {
  const fixture = groupedTransferConflictFixtures();
  const { client, batches } = createConflictReplayHarness([
    fixture.sourceConflict,
  ]);

  await client.resolveSyncConflict(
    BUDGET_ID,
    fixture.sourceConflict.conflictId,
    "keep-local",
  );

  assert.equal(batches.length, 1);

  const batch = batches[0];
  assert.equal(batch.length, 2);

  const sourceWrite = batch.find(
    (write) => write.transaction.id === fixture.source.id,
  );
  const targetWrite = batch.find(
    (write) => write.transaction.id === fixture.target.id,
  );

  assert.ok(sourceWrite);
  assert.ok(targetWrite);

  assert.equal(
    sourceWrite.resolveConflictId,
    fixture.sourceConflict.conflictId,
  );
  assert.equal(targetWrite.resolveConflictId, undefined);

  assert.equal(sourceWrite.transaction.amount, -10_000);
  assert.equal(targetWrite.transaction.amount, 10_000);
  assert.equal(
    sourceWrite.transaction.transferTransactionId,
    fixture.target.id,
  );
  assert.equal(
    targetWrite.transaction.transferTransactionId,
    fixture.source.id,
  );

  const replayGroupId = sourceWrite.mutation.operationGroupId;
  assert.ok(replayGroupId);
  assert.notEqual(replayGroupId, fixture.operationGroupId);
  assert.equal(
    targetWrite.mutation.operationGroupId,
    replayGroupId,
  );

  assert.deepEqual(
    sourceWrite.mutation.operationGroup,
    fixture.operationGroup,
  );
  assert.deepEqual(
    targetWrite.mutation.operationGroup,
    fixture.operationGroup,
  );
});

test("keep-local resolves both conflicted transfer legs in one replay batch", async () => {
  const fixture = groupedTransferConflictFixtures();
  const { client, batches } = createConflictReplayHarness([
    fixture.sourceConflict,
    fixture.targetConflict,
  ]);

  await client.resolveSyncConflict(
    BUDGET_ID,
    fixture.sourceConflict.conflictId,
    "keep-local",
  );

  assert.equal(batches.length, 1);

  const batch = batches[0];
  assert.equal(batch.length, 2);

  const sourceWrite = batch.find(
    (write) => write.transaction.id === fixture.source.id,
  );
  const targetWrite = batch.find(
    (write) => write.transaction.id === fixture.target.id,
  );

  assert.ok(sourceWrite);
  assert.ok(targetWrite);

  assert.equal(
    sourceWrite.resolveConflictId,
    fixture.sourceConflict.conflictId,
  );
  assert.equal(
    targetWrite.resolveConflictId,
    fixture.targetConflict.conflictId,
  );

  assert.ok(sourceWrite.mutation.operationGroupId);
  assert.equal(
    targetWrite.mutation.operationGroupId,
    sourceWrite.mutation.operationGroupId,
  );
  assert.deepEqual(
    sourceWrite.mutation.operationGroup,
    fixture.operationGroup,
  );
  assert.deepEqual(
    targetWrite.mutation.operationGroup,
    fixture.operationGroup,
  );
});
