import assert from "node:assert/strict";
import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import { createCategoryGroupSettings } from "../packages/budget-engine/src/services/createCategoryGroupSettings.ts";

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

async function testCategoryAndGroupNotesPersist() {
  const service = createBudgetViewService({
    budgetActivity: createBudgetActivityStub(),
    storage: createMemoryStorage(),
  });

  const initial = await service.getBudgetMonthView({
    budgetId: "budget-notes",
    month: "2026-06",
  });

  const group = initial.categoryGroups[0];
  const category = group.categories[0];

  await service.updateCategoryGroupNote({
    budgetId: initial.budgetId,
    month: "2026-06",
    groupId: group.id,
    note: "Header note from YNAB4",
  });

  const withCategoryNote = await service.updateCategoryNote({
    budgetId: initial.budgetId,
    month: "2026-06",
    categoryId: category.id,
    note: "Category note from YNAB4",
  });

  const updatedGroup = withCategoryNote.categoryGroups.find((item) => item.id === group.id);
  const updatedCategory = updatedGroup?.categories.find((item) => item.id === category.id);

  assert.equal(updatedGroup?.note, "Header note from YNAB4");
  assert.equal(updatedCategory?.note, "Category note from YNAB4");

  const reloaded = await service.getBudgetMonthView({
    budgetId: initial.budgetId,
    month: "2026-06",
  });
  const reloadedGroup = reloaded.categoryGroups.find((item) => item.id === group.id);
  const reloadedCategory = reloadedGroup?.categories.find((item) => item.id === category.id);

  assert.equal(reloadedGroup?.note, "Header note from YNAB4");
  assert.equal(reloadedCategory?.note, "Category note from YNAB4");
}

function testCategoryGroupSettingsFactory() {
  const item = createCategoryGroupSettings("group-id");

  assert.equal(item.categoryGroupId, "group-id");
  assert.equal(item.notes, null);
  assert.equal(item.hidden, false);
  assert.equal(item.pinned, false);
  assert.ok(item.id);
  assert.ok(item.createdAt instanceof Date);
  assert.ok(item.updatedAt instanceof Date);
}

async function run() {
  testCategoryGroupSettingsFactory();
  await testCategoryAndGroupNotesPersist();
  console.log("v1.63 category notes tests passed");
}

run();
