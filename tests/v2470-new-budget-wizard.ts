import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createBudgetFromSetup } from "../apps/web/src/features/budget/newBudget/createBudgetFromSetup";
import { budgetTemplates, defaultNewBudgetSetup } from "../apps/web/src/features/budget/newBudget/budgetTemplates";
import { readBudgetRegistry } from "../apps/web/src/features/budget/budgetRegistry";
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

function testBudgetTemplatesAreExtensible() {
  assert.ok(budgetTemplates.some((template) => template.id === "blank"), "Expected a blank budget template");
  assert.ok(budgetTemplates.some((template) => template.id === "starter"), "Expected a starter budget template");
  assert.ok(budgetTemplates.some((template) => template.id === "simple"), "Expected a simple budget template");
  assert.ok(budgetTemplates.some((template) => template.id === "household"), "Expected a household budget template");
}

function testCreateBudgetFromSetupPersistsRegistryAndTemplateView() {
  const storage = new MemoryStorage();
  const budget = createBudgetFromSetup(storage, {
    ...defaultNewBudgetSetup,
    name: "Holiday Budget",
    currency: "NZD",
    dateFormat: "YYYY-MM-DD",
    numberFormat: "1 234,56",
    firstDayOfWeek: "sunday",
    templateId: "simple",
  }, new Date("2026-07-02T00:00:00.000Z"));

  const budgets = readBudgetRegistry(storage);
  const createdBudget = budgets.find((entry) => entry.id === budget.id);
  assert.ok(createdBudget, "Expected the created budget to be persisted in the registry");
  assert.equal(budget.id, "holiday-budget");
  assert.equal(createdBudget.currency, "NZD");
  assert.equal(createdBudget.dateFormat, "YYYY-MM-DD");
  assert.equal(createdBudget.numberFormat, "1 234,56");
  assert.equal(createdBudget.firstDayOfWeek, "sunday");

  const budgetView = JSON.parse(storage.getItem("budget-app.budget-view.v1.holiday-budget.2026-07") ?? "null");
  assert.equal(budgetView.budgetName, "Holiday Budget");
  assert.equal(budgetView.currencyCode, "NZD");
  assert.equal(budgetView.categoryGroups.length, 4);
  assert.equal(budgetView.categoryGroups[0].name, "Income");
}

function testWizardKeepsFastPathAndCustomPath() {
  const wizardSource = readSource("apps/web/src/features/budget/newBudget/NewBudgetWizard.tsx");
  assert.match(wizardSource, /Create budget/, "Expected a one-click create path after entering a name");
  assert.match(wizardSource, /Customise setup/, "Expected optional customisation rather than mandatory screens");
  assert.match(wizardSource, /Regional settings/, "Expected regional settings step");
  assert.match(wizardSource, /Choose categories/, "Expected category template step");

  const selectorSource = readSource("apps/web/src/pages/BudgetSelectorPage.tsx");
  assert.match(selectorSource, /Create Budget/, "Expected selector copy to use Create Budget terminology");
  assert.match(selectorSource, /NewBudgetWizard/, "Expected Budget Selector to render the new setup wizard");
  assert.doesNotMatch(selectorSource, /Create empty budget/, "Expected old empty-budget copy to be removed");
}

function run() {
  testBudgetTemplatesAreExtensible();
  testCreateBudgetFromSetupPersistsRegistryAndTemplateView();
  testWizardKeepsFastPathAndCustomPath();
  console.log("v2.47.0 new budget setup wizard checks passed");
}

run();
