import assert from "node:assert/strict";
import test from "node:test";
import type { CategoryGoal } from "../../../packages/types/src/CategoryGoal.js";
import { createCategoryGoalHistoryService } from "../../../apps/web/src/features/goals/categoryGoalHistory.js";
import { ApplicationHistoryService, type ApplicationHistoryContext } from "../../../apps/web/src/features/history/applicationHistory.js";
import {
  createCategoryGoalCommand,
  deleteCategoryGoalCommand,
  updateCategoryGoalCommand,
} from "../../../apps/web/src/features/history/commands/management/categoryGoalCommands.js";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.js";

const budgetA = "budget-a";
const budgetB = "budget-b";

function goal(overrides: Partial<CategoryGoal> = {}): CategoryGoal {
  return {
    id: "goal-1", budgetId: budgetA, categoryId: "category-1",
    type: "monthly-funding", targetAmount: 12.35, targetMonth: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function same(left: CategoryGoal | null, right: CategoryGoal | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function harness() {
  const states = new Map<string, CategoryGoal>();
  const categoryGoals = {
    async getCategoryGoal(input: { budgetId: string; categoryId: string }) {
      return structuredClone(states.get(`${input.budgetId}:${input.categoryId}`) ?? null);
    },
    async listCategoryGoals(input: { budgetId: string }) {
      return [...states.values()]
        .filter(({ budgetId }) => budgetId === input.budgetId)
        .map((value) => structuredClone(value));
    },
    async createCategoryGoal() { throw new Error("ordinary create path must not be used"); },
    async updateCategoryGoal() { throw new Error("ordinary update path must not be used"); },
    async deleteCategoryGoal() { throw new Error("ordinary delete path must not be used"); },
    async replaceCategoryGoalHistoryState(input: {
      budgetId: string; categoryId: string;
      expected: CategoryGoal | null; replacement: CategoryGoal | null;
    }) {
      const key = `${input.budgetId}:${input.categoryId}`;
      const current = states.get(key) ?? null;
      if (!same(current, input.expected)) throw new Error("history conflict");
      if (input.replacement) states.set(key, structuredClone(input.replacement));
      else states.delete(key);
      return structuredClone(input.replacement);
    },
  };
  const persistence = { categoryGoals } as unknown as BudgetPersistenceProvider;
  const history = new ApplicationHistoryService<ApplicationHistoryContext>({
    getContext: (budgetId) => ({ budgetId, persistence }),
  });
  return { history, service: createCategoryGoalHistoryService(history), states };
}

test("create Goal undo/redo restores exact stable identity and timestamps", async () => {
  const { service, history, states } = harness();
  const exact = goal();
  assert.equal((await service.createCategoryGoal(exact)).performed, true);
  assert.deepEqual(states.get(`${budgetA}:category-1`), exact);
  await history.undo(budgetA);
  assert.equal(states.has(`${budgetA}:category-1`), false);
  await history.redo(budgetA);
  assert.deepEqual(states.get(`${budgetA}:category-1`), exact);
});

test("update Goal captures durable before and round-trips exact configuration", async () => {
  const { service, history, states } = harness();
  const before = goal();
  const after = goal({
    type: "target-balance-by-date", targetAmount: 99.99, targetMonth: "2027-06",
    updatedAt: "2026-08-02T00:00:00.000Z",
  });
  states.set(`${budgetA}:category-1`, before);
  await service.updateCategoryGoal(after);
  assert.deepEqual(states.get(`${budgetA}:category-1`), after);
  await history.undo(budgetA);
  assert.deepEqual(states.get(`${budgetA}:category-1`), before);
  await history.redo(budgetA);
  assert.deepEqual(states.get(`${budgetA}:category-1`), after);
  assert.equal(states.get(`${budgetA}:category-1`)?.id, before.id);
});

test("delete Goal undo/redo preserves exact identity and timestamps", async () => {
  const { service, history, states } = harness();
  const exact = goal();
  states.set(`${budgetA}:category-1`, exact);
  await service.deleteCategoryGoal({ budgetId: budgetA, categoryId: "category-1" });
  assert.equal(states.has(`${budgetA}:category-1`), false);
  await history.undo(budgetA);
  assert.deepEqual(states.get(`${budgetA}:category-1`), exact);
  await history.redo(budgetA);
  assert.equal(states.has(`${budgetA}:category-1`), false);
});

test("create then update unwinds and replays in exact command order", async () => {
  const { service, history, states } = harness();
  const created = goal();
  const updated = goal({ type: "target-balance", targetAmount: 45.67, updatedAt: "later" });
  await service.createCategoryGoal(created);
  await service.updateCategoryGoal(updated);
  assert.deepEqual(states.get(`${budgetA}:category-1`), updated);
  await history.undo(budgetA); assert.deepEqual(states.get(`${budgetA}:category-1`), created);
  await history.undo(budgetA); assert.equal(states.has(`${budgetA}:category-1`), false);
  await history.redo(budgetA); assert.deepEqual(states.get(`${budgetA}:category-1`), created);
  await history.redo(budgetA); assert.deepEqual(states.get(`${budgetA}:category-1`), updated);
});

test("execute, undo, and redo conflicts preserve durable state and stack position", async () => {
  const { history, states } = harness();
  states.set(`${budgetA}:category-1`, goal());
  const failedExecute = await history.execute(budgetA, createCategoryGoalCommand(goal({ id: "other" })));
  assert.equal(failedExecute.performed, false);
  assert.equal(history.getSnapshot(budgetA).undoDepth, 0);

  const after = goal({ targetAmount: 20, updatedAt: "later" });
  await history.execute(budgetA, updateCategoryGoalCommand(after));
  states.set(`${budgetA}:category-1`, goal({ targetAmount: 30, updatedAt: "external" }));
  const failedUndo = await history.undo(budgetA);
  assert.equal(failedUndo.performed, false);
  assert.equal(history.getSnapshot(budgetA).undoDepth, 1);
  assert.equal(history.getSnapshot(budgetA).redoDepth, 0);
  assert.equal(states.get(`${budgetA}:category-1`)?.targetAmount, 30);

  states.set(`${budgetA}:category-1`, after);
  await history.undo(budgetA);
  states.set(`${budgetA}:category-1`, goal({ targetAmount: 31, updatedAt: "external-redo" }));
  const failedRedo = await history.redo(budgetA);
  assert.equal(failedRedo.performed, false);
  assert.equal(history.getSnapshot(budgetA).undoDepth, 0);
  assert.equal(history.getSnapshot(budgetA).redoDepth, 1);
  assert.equal(states.get(`${budgetA}:category-1`)?.targetAmount, 31);
});

test("Goal commands are isolated by budget and use the shared budget history stack", async () => {
  const { history, states } = harness();
  const wrongScope = await history.execute(budgetB, createCategoryGoalCommand(goal()));
  assert.equal(wrongScope.performed, false);
  assert.equal(states.size, 0);
  assert.equal(history.getSnapshot(budgetB).undoDepth, 0);
  assert.equal(history.getSnapshot(budgetA).undoDepth, 0);

  states.set(`${budgetA}:category-1`, goal());
  await history.execute(budgetA, deleteCategoryGoalCommand({ budgetId: budgetA, categoryId: "category-1" }));
  assert.equal(history.getSnapshot(budgetA).undoLabel, "Delete goal");
  assert.equal(history.getSnapshot(budgetB).undoDepth, 0);
});
