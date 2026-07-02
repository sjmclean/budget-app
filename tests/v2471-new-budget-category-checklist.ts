import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createBudgetFromSetup } from "../apps/web/src/features/budget/newBudget/createBudgetFromSetup";
import { defaultNewBudgetSetup } from "../apps/web/src/features/budget/newBudget/budgetTemplates";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";

class MemoryStorage implements KeyValueStoragePort {
  private records = new Map<string, string>();

  getItem(key: string): string | null {
    return this.records.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.records.set(key, value);
  }

  removeItem(key: string): void {
    this.records.delete(key);
  }

  keys(): string[] {
    return [...this.records.keys()].sort();
  }
}

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function testOnlyOneVisibleNewBudgetActionOnSelectorList() {
  const selectorSource = readSource("apps/web/src/pages/BudgetSelectorPage.tsx");
  const newBudgetButtonCount = (selectorSource.match(/\+ New budget…/g) ?? []).length;
  assert.equal(newBudgetButtonCount, 1, "Expected only one New Budget button on the selector page");
}

function testTemplateCardsWereReplacedByCategoryChecklist() {
  const wizardSource = readSource("apps/web/src/features/budget/newBudget/NewBudgetWizard.tsx");
  assert.match(wizardSource, /new-budget-category-list/, "Expected category checklist UI");
  assert.match(wizardSource, /Add category/, "Expected add category action");
  assert.doesNotMatch(wizardSource, /new-budget-template-card/, "Expected template card UI to be removed");
  assert.doesNotMatch(wizardSource, /Starter Budget/, "Expected abstract Starter Budget template choice to be removed from the UI");
}

function testSelectedAndCustomCategoriesArePersisted() {
  const storage = new MemoryStorage();
  const categoryGroups = defaultNewBudgetSetup.categoryGroups.map((group, groupIndex) => ({
    ...group,
    selected: groupIndex === 0,
    categories: [
      ...group.categories.map((category, categoryIndex) => ({
        ...category,
        selected: groupIndex === 0 && categoryIndex === 0,
      })),
      ...(groupIndex === 0
        ? [{ id: "streaming", name: "Streaming", selected: true, custom: true }]
        : []),
    ],
  }));

  createBudgetFromSetup(storage, {
    ...defaultNewBudgetSetup,
    name: "Checklist Budget",
    categoryGroups,
  }, new Date("2026-07-02T00:00:00.000Z"));

  const budgetView = JSON.parse(storage.getItem("budget-app.budget-view.v1.checklist-budget.2026-07") ?? "null");
  assert.equal(budgetView.categoryGroups.length, 1);
  assert.deepEqual(
    budgetView.categoryGroups[0].categories.map((category: { name: string }) => category.name),
    [categoryGroups[0].categories[0].name, "Streaming"],
  );
}

function run() {
  testOnlyOneVisibleNewBudgetActionOnSelectorList();
  testTemplateCardsWereReplacedByCategoryChecklist();
  testSelectedAndCustomCategoriesArePersisted();
  console.log("v2.47.1 new budget category checklist checks passed");
}

run();
