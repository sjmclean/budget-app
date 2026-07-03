import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  readBudgetRegistry,
  updateBudgetRegistryEntry,
  writeBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry";
import {
  DEFAULT_BUDGET_PREFERENCES,
  normaliseBudgetPreferences,
} from "../apps/web/src/features/budget/budgetPreferences";
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

function testBudgetPreferencesDefaultToNormalCreditCardBehaviour() {
  assert.deepEqual(DEFAULT_BUDGET_PREFERENCES, {
    creditCardBehaviour: "normal",
  });

  assert.deepEqual(normaliseBudgetPreferences(undefined), {
    creditCardBehaviour: "normal",
  });

  assert.deepEqual(normaliseBudgetPreferences({ creditCardBehaviour: "payment-funding" }), {
    creditCardBehaviour: "payment-funding",
  });

  assert.deepEqual(normaliseBudgetPreferences({ creditCardBehaviour: "ynab-mode" }), {
    creditCardBehaviour: "normal",
  });
}

function testBudgetRegistryPersistsAndNormalisesPreferences() {
  const storage = new MemoryStorage();
  const budget = createBudgetRegistryEntry(storage, {
    name: "Credit Card Test",
    preferences: {
      creditCardBehaviour: "payment-funding",
    },
    now: new Date("2026-07-02T00:00:00.000Z"),
  });

  assert.equal(budget.preferences.creditCardBehaviour, "payment-funding");

  const persisted = readBudgetRegistry(storage).find((entry) => entry.id === budget.id);
  assert.equal(persisted?.preferences.creditCardBehaviour, "payment-funding");

  const updated = updateBudgetRegistryEntry(storage, budget.id, {
    preferences: {
      creditCardBehaviour: "normal",
    },
    now: new Date("2026-07-03T00:00:00.000Z"),
  });

  assert.equal(updated?.preferences.creditCardBehaviour, "normal");
}

function testLegacyBudgetsReceiveDefaultPreferences() {
  const storage = new MemoryStorage();
  storage.setItem(
    BUDGET_REGISTRY_STORAGE_KEY,
    JSON.stringify([
      {
        id: "legacy-budget",
        name: "Legacy Budget",
        currency: "AUD",
        lastOpenedLabel: "Yesterday",
        packagePath: "~/Budgets/Legacy.budget",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]),
  );

  const budgets = readBudgetRegistry(storage);
  assert.equal(budgets[0]?.preferences.creditCardBehaviour, "normal");

  const rewritten = writeBudgetRegistry(storage, budgets);
  assert.equal(rewritten[0]?.preferences.creditCardBehaviour, "normal");
  assert.match(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY) ?? "", /"preferences"/);
}

function testNewBudgetSetupUsesDefaultBudgetPreferences() {
  const storage = new MemoryStorage();
  const budget = createBudgetFromSetup(storage, {
    ...defaultNewBudgetSetup,
    name: "Fresh Budget",
  }, new Date("2026-07-02T00:00:00.000Z"));

  assert.equal(budget.preferences.creditCardBehaviour, "normal");

  const persisted = readBudgetRegistry(storage).find((entry) => entry.id === budget.id);
  assert.equal(persisted?.preferences.creditCardBehaviour, "normal");
}

function testReleaseWiring() {
  const registrySource = readFileSync("apps/web/src/features/budget/budgetRegistry.ts", "utf8");
  const preferencesSource = readFileSync("apps/web/src/features/budget/budgetPreferences.ts", "utf8");
  const packageJson = readFileSync("package.json", "utf8");

  assert.match(registrySource, /preferences: BudgetPreferences/, "Budget summaries should carry budget preferences");
  assert.match(preferencesSource, /creditCardBehaviour/, "Budget preferences should define credit-card behaviour");
  assert.match(packageJson, /test:v2500/, "Release scripts should include v2.50.0 checks");
}

function run() {
  testBudgetPreferencesDefaultToNormalCreditCardBehaviour();
  testBudgetRegistryPersistsAndNormalisesPreferences();
  testLegacyBudgetsReceiveDefaultPreferences();
  testNewBudgetSetupUsesDefaultBudgetPreferences();
  testReleaseWiring();
  console.log("v2.50.0 budget preferences foundation checks passed");
}

run();
