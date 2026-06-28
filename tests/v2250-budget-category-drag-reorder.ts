import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";

function createMemoryStorage(): KeyValueStoragePort {
  const data = new Map<string, string>();

  return {
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
    listKeys() {
      return [...data.keys()].sort();
    },
  };
}

function createBudgetActivityStub() {
  return {
    async listRegisterTransactionsForBudgetActivity() {
      return [];
    },
    async countCategoryReferences() {
      return {
        registerTransactionCount: 0,
        registerSplitLineCount: 0,
        scheduledTransactionCount: 0,
      };
    },
    async rewriteCategoryReferences() {},
    async renameRegisterCategoryReferences() {},
  };
}

async function testCategoryOrderCanMoveToDropPosition() {
  const service = createBudgetViewService({
    budgetActivity: createBudgetActivityStub(),
    storage: createMemoryStorage(),
  });

  const initial = await service.getBudgetMonthView({
    budgetId: "drag-reorder",
    month: "2026-06",
  });

  const group = initial.categoryGroups.find((item) => item.categories.length >= 3);
  assert.ok(group, "Expected a starter budget group with at least three categories.");

  const [first, second, third] = group.categories;

  const movedAfter = await service.moveCategoryToPosition({
    budgetId: initial.budgetId,
    month: "2026-06",
    categoryId: first.id,
    targetCategoryId: third.id,
    placement: "after",
  });

  const movedAfterGroup = movedAfter.categoryGroups.find((item) => item.id === group.id);
  assert.deepEqual(
    movedAfterGroup?.categories.slice(0, 3).map((category) => category.id),
    [second.id, third.id, first.id],
    "Dragging a category after another category should persist the new within-group order.",
  );

  const movedBefore = await service.moveCategoryToPosition({
    budgetId: initial.budgetId,
    month: "2026-06",
    categoryId: first.id,
    targetCategoryId: second.id,
    placement: "before",
  });

  const movedBeforeGroup = movedBefore.categoryGroups.find((item) => item.id === group.id);
  assert.deepEqual(
    movedBeforeGroup?.categories.slice(0, 3).map((category) => category.id),
    [first.id, second.id, third.id],
    "Dragging a category before another category should persist the restored within-group order.",
  );
}

function testBudgetPageWiresDragHandles() {
  const budgetPageSource = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
  const globalsSource = readFileSync("apps/web/src/styles/globals.css", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(
    budgetPageSource,
    /type BudgetCategoryDropPosition = "before" \| "after"/,
    "Budget page should model before/after category drop positions.",
  );
  assert.match(
    budgetPageSource,
    /draggable/,
    "Budget category drag handle should be draggable.",
  );
  assert.match(
    budgetPageSource,
    /Drag to reorder within this category group/,
    "Budget category drag handle should expose a clear user-facing tooltip.",
  );
  assert.match(
    budgetPageSource,
    /moveCategoryToPosition\(/,
    "Budget page should persist drag drops through the category persistence port.",
  );
  assert.match(
    budgetPageSource,
    /categoryDragState\.groupId === targetGroupId/,
    "v2.25.0 should constrain drag reorder to categories in the same group.",
  );

  assert.match(
    globalsSource,
    /budget-workspace-row-drop-before::before/,
    "Budget drag reorder should show a before-row drop indicator.",
  );
  assert.match(
    globalsSource,
    /budget-workspace-row-drop-after::after/,
    "Budget drag reorder should show an after-row drop indicator.",
  );
  assert.match(
    globalsSource,
    /budget-workspace-row-dragging/,
    "Budget drag reorder should style the dragged row.",
  );

  assert.equal(
    packageJson.scripts["test:v2250:budget-category-drag-reorder"],
    "tsx tests/v2250-budget-category-drag-reorder.ts",
    "package.json should expose the v2.25.0 drag reorder test.",
  );
  assert.equal(
    packageJson.scripts["test:v2250"],
    "pnpm test:v2250:budget-category-drag-reorder",
    "package.json should expose the v2.25.0 aggregate test.",
  );
}

async function run() {
  testBudgetPageWiresDragHandles();
  await testCategoryOrderCanMoveToDropPosition();
  console.log("v2.25.0 budget category drag reorder checks passed");
}

run();
