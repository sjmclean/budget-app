import assert from "node:assert/strict";
import test from "node:test";

import type { BudgetMonthView } from "../../../apps/web/src/features/budget/budgetViewTypes.js";
import { flushPersistenceChanges, subscribePersistenceChanges } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import { createBudgetCategoryCommands } from "../../../apps/web/src/features/persistence/localFirst/engine/budgetCategoryCommands.js";
import type { CommittedCommandHandlerResult } from "../../../apps/web/src/features/persistence/localFirst/engine/commandContext.js";
import { LocalBudgetCommandExecutor } from "../../../apps/web/src/features/persistence/localFirst/engine/localBudgetCommandExecutor.js";
import { LocalBudgetMutationContext } from "../../../apps/web/src/features/persistence/localFirst/engine/mutationContext.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";

const budgetId = "budget-a";
const month = "2026-09";

function budgetView(): BudgetMonthView {
  return {
    budgetId, budgetName: "Budget", monthLabel: "September", currencyCode: "AUD",
    readyToAssign: 0, totalAssigned: 0, totalActivity: 0, totalAvailable: 0,
    categoryGroups: [{
      id: "group-a", name: "Bills", previousAvailable: 0, assigned: 0,
      activity: 0, available: 0, note: "", categories: [
        { id: "category-a", name: "Rent", previousAvailable: 0, assigned: 0, activity: 0, available: 0, isOverspent: false, isArchived: false, note: "" },
        { id: "category-b", name: "Power", previousAvailable: 0, assigned: 0, activity: 0, available: 0, isOverspent: false, isArchived: false, note: "" },
      ],
    }],
  };
}

function harness(options: { failMutate?: boolean; failMerge?: boolean } = {}) {
  let view = budgetView();
  const committed: LocalBudgetMutation[] = [];
  let mergeCalls = 0;
  let historyCalls = 0;
  const storage = new Map<string, string>();
  const mutations = new LocalBudgetMutationContext({
    storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } },
    deviceId: "device-a", currentSyncEpoch: () => "epoch-a", currentBaseCursor: () => 3,
  });
  const database = {
    async readEntity<T>() { return structuredClone(view) as T; },
    async listCategoryGoals() { return []; },
    async mutate(mutation: LocalBudgetMutation) {
      if (options.failMutate) throw new Error("worker rollback");
      committed.push(mutation);
      view = structuredClone(mutation.payload as BudgetMonthView);
      return {};
    },
    async mutateBatch(batch: readonly LocalBudgetMutation[]) {
      committed.push(...batch);
      return {};
    },
    async mergeCategories(input: {
      mutation: LocalBudgetMutation;
      budgetMonthMutation?: LocalBudgetMutation;
    }) {
      mergeCalls += 1;
      if (options.failMerge) throw new Error("atomic merge rollback");
      committed.push(
        input.mutation,
        ...(input.budgetMonthMutation ? [input.budgetMonthMutation] : []),
      );
      if (input.budgetMonthMutation) {
        view = structuredClone(input.budgetMonthMutation.payload as BudgetMonthView);
      }
      return {};
    },
    async replaceBudgetMonthHistoryState(input: { replacement: BudgetMonthView; mutation: LocalBudgetMutation }) {
      historyCalls += 1;
      committed.push(input.mutation);
      view = structuredClone(input.replacement);
      return {};
    },
  } as unknown as LocalBudgetDatabaseClient;
  const commands = createBudgetCategoryCommands({
    requireDatabase: async () => database,
    createMutation: mutations.createMutation.bind(mutations),
  });
  return {
    committed, commands,
    mergeCalls: () => mergeCalls, historyCalls: () => historyCalls,
  };
}

async function execute<T>(
  operation: () => Promise<CommittedCommandHandlerResult<T>>,
) {
  let publications = 0;
  const unsubscribe = subscribePersistenceChanges(() => { publications += 1; });
  try {
    const result = await new LocalBudgetCommandExecutor().execute("budget:test", { execute: operation });
    flushPersistenceChanges();
    return { result, publications };
  } finally {
    unsubscribe();
  }
}

test("assignment batch result contains exactly the worker-committed mutation IDs and preserves roll-forward scope", async () => {
  const state = harness();
  const { result, publications } = await execute(() => state.commands.setCategoryAssignedValues({
    budgetId, month, assignments: [
      { categoryId: "category-a", assigned: 100 },
      { categoryId: "category-b", assigned: 200 },
    ],
  }));
  assert.deepEqual(result.mutationIds, state.committed.map(({ mutationId }) => mutationId));
  assert.equal(state.committed.length, 2);
  assert.equal(result.change.months, undefined, "assignment invalidation must cover roll-forward months");
  assert.deepEqual(result.change.categoryIds, ["category-a", "category-b"]);
  assert.equal(publications, 1);
});

test("category creation resolves with committed SQLite state after publication", async () => {
  const state = harness();
  let publications = 0;
  const unsubscribe = subscribePersistenceChanges(() => { publications += 1; });
  try {
    const execution = await new LocalBudgetCommandExecutor().execute(
      "budget:create-category",
      { execute: () => state.commands.mutateCategory(budgetId, {
          operation: "create",
          month,
          categoryId: "category-created",
          groupId: "group-a",
          groupName: "Bills",
          name: "Created",
        }) },
    );
    flushPersistenceChanges();
    assert.equal(state.committed.length, 1, "the canonical entity and outbox mutation committed");
    assert.equal(publications, 1, "the committed category change was published");
    assert.equal(
      execution.result.categoryGroups[0]?.categories.some(({ id }) => id === "category-created"),
      true,
      "the command result is the authoritative post-commit view",
    );
  } finally {
    unsubscribe();
  }
});

test("metadata, overspending, merge, and history commands retain their worker and scope semantics", async () => {
  const metadata = harness();
  const renamed = await execute(() => metadata.commands.mutateCategory(budgetId, {
    operation: "rename", month, categoryId: "category-a", name: "Housing",
  }));
  assert.deepEqual(renamed.result.mutationIds, metadata.committed.map(({ mutationId }) => mutationId));
  assert.equal(renamed.publications, 1);

  const policy = harness();
  const overspending = await execute(() => policy.commands.mutateCategory(budgetId, {
    operation: "overspending", month, categoryId: "category-a", overspendingHandling: "carry-category",
  }));
  assert.equal(overspending.result.change.months, undefined);
  assert.deepEqual(overspending.result.change.categoryIds, ["category-a"]);

  const merge = harness();
  const merged = await execute(() => merge.commands.mutateCategory(budgetId, {
    operation: "merge", month, categoryId: "category-a", targetCategoryId: "category-b",
  }));
  assert.equal(merge.mergeCalls(), 1, "category relinking uses the atomic worker merge primitive");
  assert.deepEqual(new Set(merged.result.mutationIds), new Set(merge.committed.map(({ mutationId }) => mutationId)));
  assert.equal(merge.committed.length, 2);
  const [mergeMutation, budgetMonthMutation] = merge.committed;
  assert.ok(mergeMutation?.operationGroupId, "merge replication must have an operation group id");
  assert.equal(
    budgetMonthMutation?.operationGroupId,
    mergeMutation.operationGroupId,
    "both merge mutations must share one replication operation group",
  );
  assert.deepEqual(
    budgetMonthMutation?.operationGroup,
    mergeMutation.operationGroup,
    "both merge mutations must carry the same operation description",
  );
  assert.deepEqual(
    mergeMutation.operationGroup?.members.map(({ domain, entityId, operation }) => ({
      domain,
      entityId,
      operation,
    })),
    [
      { domain: "categories", entityId: "category-a", operation: "delete" },
      { domain: "budgetMonths", entityId: month, operation: "upsert" },
    ],
  );

  const history = harness();
  const replacement = { ...budgetView(), readyToAssign: 123 };
  const replaced = await execute(() => history.commands.replaceBudgetMonthHistoryState({
    budgetId, month, expected: budgetView(), replacement,
  }));
  assert.equal(history.historyCalls(), 1);
  assert.deepEqual(replaced.result.change.months, [month]);
});

test("atomic category merge failure records no partial commit and publishes nothing", async () => {
  const state = harness({ failMerge: true });
  let publications = 0;
  const unsubscribe = subscribePersistenceChanges(() => { publications += 1; });
  await assert.rejects(() => new LocalBudgetCommandExecutor().execute(
    "budget:merge-failed",
    { execute: () => state.commands.mutateCategory(budgetId, {
        operation: "merge", month, categoryId: "category-a", targetCategoryId: "category-b",
      }) },
  ), /atomic merge rollback/);
  flushPersistenceChanges();
  unsubscribe();
  assert.equal(state.committed.length, 0, "failed atomic worker merge must commit no outbox mutation");
  assert.equal(publications, 0);
});

test("worker failure returns no result and publishes nothing", async () => {
  const state = harness({ failMutate: true });
  let publications = 0;
  const unsubscribe = subscribePersistenceChanges(() => { publications += 1; });
  await assert.rejects(() => new LocalBudgetCommandExecutor().execute(
    "budget:failed",
    { execute: () => state.commands.mutateCategory(budgetId, {
        operation: "rename", month, categoryId: "category-a", name: "Housing",
      }) },
  ), /worker rollback/);
  flushPersistenceChanges();
  unsubscribe();
  assert.equal(publications, 0);
});
