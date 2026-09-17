import assert from "node:assert/strict";
import test from "node:test";
import type { CategoryGoal } from "../../../packages/types/src/CategoryGoal.js";
import {
  flushPersistenceChanges,
  subscribePersistenceChanges,
} from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import { createCategoryGoalCommands } from "../../../apps/web/src/features/persistence/localFirst/engine/categoryGoalCommands.js";
import { LocalBudgetCommandContext } from "../../../apps/web/src/features/persistence/localFirst/engine/commandContext.js";
import { createDomainCommandHandler } from "../../../apps/web/src/features/persistence/localFirst/engine/domainCommandHandlers.js";
import { LocalBudgetCommandExecutor } from "../../../apps/web/src/features/persistence/localFirst/engine/localBudgetCommandExecutor.js";
import { LocalBudgetMutationContext } from "../../../apps/web/src/features/persistence/localFirst/engine/mutationContext.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";

const budgetId = "budget-a";
const categoryId = "category-a";
const goal: CategoryGoal = {
  id: "goal-a",
  budgetId,
  categoryId,
  type: "monthly-funding",
  targetAmount: 100,
  targetMonth: null,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
};

function harness(options: { missingDelete?: boolean; noOpHistory?: boolean } = {}) {
  const committed: LocalBudgetMutation[] = [];
  const storage = new Map<string, string>();
  const mutations = new LocalBudgetMutationContext({
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
    },
    deviceId: "device-a",
    currentSyncEpoch: () => "epoch-a",
    currentBaseCursor: () => 3,
  });
  const context = new LocalBudgetCommandContext(mutations);
  const database = {
    async writeCategoryGoal(
      _mode: "create" | "update",
      value: CategoryGoal,
      mutation: LocalBudgetMutation,
    ) {
      committed.push(mutation);
      return value;
    },
    async deleteCategoryGoal(
      _budgetId: string,
      _categoryId: string,
      mutation: LocalBudgetMutation,
    ) {
      if (options.missingDelete) return null;
      committed.push(mutation);
      return goal;
    },
    async replaceCategoryGoalHistoryState(input: {
      expected: CategoryGoal | null;
      replacement: CategoryGoal | null;
      mutation: LocalBudgetMutation;
    }) {
      if (!options.noOpHistory) committed.push(input.mutation);
      return input.replacement;
    },
  } as unknown as LocalBudgetDatabaseClient;
  const commands = createCategoryGoalCommands({
    requireDatabase: async () => database,
    createMutation: mutations.createMutation.bind(mutations),
    discardFailedMutation: mutations.discardFailedMutation.bind(mutations),
    recordCommittedChange: context.recordCommittedChange.bind(context),
  });
  return { committed, commands, context };
}

async function execute<T>(
  context: LocalBudgetCommandContext,
  operation: () => Promise<T>,
) {
  let publications = 0;
  const unsubscribe = subscribePersistenceChanges(() => {
    publications += 1;
  });
  try {
    const result = await new LocalBudgetCommandExecutor().execute(
      "goal:test",
      createDomainCommandHandler({ budgetId, context, operation }),
    );
    flushPersistenceChanges();
    return { result, publications };
  } finally {
    unsubscribe();
  }
}

test("Category Goal create result contains exactly the committed worker mutation", async () => {
  const state = harness();
  const { result, publications } = await execute(
    state.context,
    () => state.commands.createCategoryGoal(goal),
  );

  assert.deepEqual(
    result.mutationIds,
    state.committed.map(({ mutationId }) => mutationId),
  );
  assert.equal(state.committed.length, 1);
  assert.deepEqual(result.change.domains, ["budget", "goals"]);
  assert.deepEqual(result.change.categoryIds, [categoryId]);
  assert.equal(publications, 1);
});

test("missing Goal delete excludes its uncommitted mutation from a successful result", async () => {
  const state = harness({ missingDelete: true });
  const { result, publications } = await execute(
    state.context,
    () => state.commands.deleteCategoryGoal({ budgetId, categoryId }),
  );

  assert.equal(result.result, null);
  assert.deepEqual(result.mutationIds, []);
  assert.deepEqual(state.committed, []);
  assert.equal(publications, 0);
});

test("no-op Goal history replacement verifies state without reporting a phantom mutation", async () => {
  const state = harness({ noOpHistory: true });
  const { result, publications } = await execute(
    state.context,
    () => state.commands.replaceCategoryGoalHistoryState({
      budgetId,
      categoryId,
      expected: goal,
      replacement: goal,
    }),
  );

  assert.deepEqual(result.mutationIds, []);
  assert.deepEqual(state.committed, []);
  assert.equal(publications, 0);
});
