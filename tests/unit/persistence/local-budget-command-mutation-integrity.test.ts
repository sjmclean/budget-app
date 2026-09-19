import assert from "node:assert/strict";
import test from "node:test";

import { flushPersistenceChanges, subscribePersistenceChanges } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import { LocalBudgetCommandExecutor } from "../../../apps/web/src/features/persistence/localFirst/engine/localBudgetCommandExecutor.js";
import { LocalBudgetMutationContext } from "../../../apps/web/src/features/persistence/localFirst/engine/mutationContext.js";
import { createTransactionCommands } from "../../../apps/web/src/features/persistence/localFirst/engine/transactionCommands.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import type { LocalTransactionRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

const budgetId = "budget-a";
const sequenceKey = "budget-app.local-first.device-sequence.device-a";

function transaction(overrides: Partial<LocalTransactionRecord>): LocalTransactionRecord {
  return {
    id: "tx-a", budgetId, accountId: "checking", date: "2026-09-17", amount: -100,
    memo: null, checkNumber: null, clearedStatus: "uncleared", payeeId: null,
    payeeName: null, rawPayeeName: null, categoryId: null, categoryName: null,
    transferAccountId: null, transferTransactionId: null, generatedFromSchedule: false,
    scheduledTransactionId: null, scheduledOccurrenceDate: null, splitLines: [], tagIds: [],
    importProvenance: [], updatedAt: "2026-09-17T00:00:00.000Z", ...overrides,
  };
}

async function executeMove(records: readonly LocalTransactionRecord[]) {
  const stored = new Map(records.map((record) => [record.id, record]));
  const committed: LocalBudgetMutation[] = [];
  const values = new Map<string, string>();
  const mutations = new LocalBudgetMutationContext({
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    },
    deviceId: "device-a",
    currentSyncEpoch: () => "epoch-a",
    currentBaseCursor: () => 4,
  });
  const database = {
    async getTransaction(_budgetId: string, transactionId: string) {
      return stored.get(transactionId) ?? null;
    },
    async writeTransactionBatch(writes: readonly { transaction: LocalTransactionRecord; mutation: LocalBudgetMutation }[]) {
      committed.push(...writes.map(({ mutation }) => mutation));
      for (const { transaction: record } of writes) stored.set(record.id, record);
      return {};
    },
  } as unknown as LocalBudgetDatabaseClient;
  const commands = createTransactionCommands({
    requireDatabase: async () => database,
    createMutation: mutations.createMutation.bind(mutations),
  });
  let publications = 0;
  const unsubscribe = subscribePersistenceChanges(() => { publications += 1; });
  const result = await new LocalBudgetCommandExecutor().execute("move:test", { execute: () => commands.moveTransactions({
      budgetId, sourceAccountId: "checking", targetAccountId: "joint",
      transactionIds: [records[0]!.id],
    }),
  });
  flushPersistenceChanges();
  unsubscribe();
  return { committed, result, publications, sequence: Number(values.get(sequenceKey)) };
}

test("ordinary move reports exactly the mutation committed by the worker", async () => {
  const { committed, result, publications, sequence } = await executeMove([transaction({})]);
  assert.equal(committed.length, 1);
  assert.deepEqual(result.mutationIds, committed.map(({ mutationId }) => mutationId));
  assert.equal(sequence, 1, "a successful one-record move allocates one device sequence");
  assert.equal(publications, 1);
});

test("linked-transfer move reports exactly both grouped worker mutations", async () => {
  const source = transaction({
    id: "transfer-source", transferAccountId: "savings", transferTransactionId: "transfer-target",
  });
  const counterpart = transaction({
    id: "transfer-target", accountId: "savings", amount: 100,
    transferAccountId: "checking", transferTransactionId: "transfer-source",
  });
  const { committed, result, publications, sequence } = await executeMove([source, counterpart]);
  assert.equal(committed.length, 2);
  assert.deepEqual(new Set(result.mutationIds), new Set(committed.map(({ mutationId }) => mutationId)));
  assert.equal(sequence, 2, "a successful two-record move allocates two device sequences");
  assert.equal(publications, 1, "one logical executor completion publishes once");
});
