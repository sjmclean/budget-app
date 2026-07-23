import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createBudgetRegistryEntry,
} from "../apps/web/src/features/budget/budgetRegistry.js";
import { SELECTED_BUDGET_STORAGE_KEY } from "../apps/web/src/features/budget/budgetDataScope.js";
import { browserLocalStoragePersistenceGateway } from "../apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";
import {
  configureBudgetPersistenceProvider,
  resetBudgetPersistenceProvider,
} from "../apps/web/src/features/persistence/budgetPersistenceProviderFactory.js";
import { getActiveKeyValueStorage } from "../apps/web/src/features/persistence/activeKeyValueStorage.js";

function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStoragePort {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: key => void values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

const browserValues = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => browserValues.get(key) ?? null,
      setItem: (key: string, value: string) => void browserValues.set(key, value),
      removeItem: (key: string) => void browserValues.delete(key),
    },
  },
});

const sharedStorage = createMemoryStorage();
const sharedBudget = createBudgetRegistryEntry(sharedStorage, {
  name: "Shared imported budget",
  now: new Date("2026-07-23T00:00:00.000Z"),
});
sharedStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, sharedBudget.id);

browserValues.set(
  "budget-app.budget-registry.v1",
  JSON.stringify([{ id: "browser-budget", name: "Wrong browser budget" }]),
);
browserValues.set(SELECTED_BUDGET_STORAGE_KEY, "browser-budget");

configureBudgetPersistenceProvider({
  ...browserLocalStoragePersistenceGateway,
  metadata: {
    ...browserLocalStoragePersistenceGateway.metadata,
    kind: "shared-server",
    label: "Shared test provider",
  },
  keyValueStorage: sharedStorage,
});

try {
  assert.equal(
    getActiveKeyValueStorage(),
    sharedStorage,
    "generic persistence consumers must use the configured provider storage",
  );

  const { useBudgetRegistryStore } = await import(
    "../apps/web/src/stores/budgetRegistryStore.js"
  );
  const { useUIStore } = await import("../apps/web/src/stores/uiStore.js");

  assert.deepEqual(
    useBudgetRegistryStore.getState().budgets.map(budget => budget.id),
    [sharedBudget.id],
    "the launcher registry must come from shared storage, not browser localStorage",
  );
  assert.equal(
    useUIStore.getState().selectedBudgetId,
    sharedBudget.id,
    "active-budget selection must come from the same provider as budget data",
  );

  const created = useBudgetRegistryStore.getState().createBudget({
    name: "Second shared budget",
    now: new Date("2026-07-23T01:00:00.000Z"),
  });
  assert.match(
    sharedStorage.getItem("budget-app.budget-registry.v1") ?? "",
    new RegExp(created.id),
    "registry mutations must be written to shared storage",
  );
  assert.doesNotMatch(
    browserValues.get("budget-app.budget-registry.v1") ?? "",
    new RegExp(created.id),
    "registry mutations must not leak into browser storage in shared mode",
  );

  useUIStore.getState().selectBudget(created.id);
  assert.equal(
    sharedStorage.getItem(SELECTED_BUDGET_STORAGE_KEY),
    created.id,
  );
  assert.equal(
    browserValues.get(SELECTED_BUDGET_STORAGE_KEY),
    "browser-budget",
    "shared selection must not overwrite the stale browser selection",
  );

  const mainSource = readFileSync("apps/web/src/main.tsx", "utf8");
  assert.match(
    mainSource,
    /const \{ App \} = await import\("\.\/App"\)/,
    "application modules must load after runtime persistence configuration",
  );

  for (const path of [
    "apps/web/src/stores/budgetRegistryStore.ts",
    "apps/web/src/stores/uiStore.ts",
    "apps/web/src/pages/BudgetSelectorPage.tsx",
    "apps/web/src/pages/AccountRegisterPage.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(
      source,
      /browserLocalStorageKeyValueStorage/,
      `${path} must not bypass runtime persistence`,
    );
  }

  const settingsSource = readFileSync("apps/web/src/pages/SettingsPage.tsx", "utf8");
  assert.match(settingsSource, /createBudgetDataExportPackage\(getActiveKeyValueStorage\(\)/);
  assert.match(settingsSource, /restoreBudgetDataPackage\(getActiveKeyValueStorage\(\)/);
  assert.match(settingsSource, /resetCurrentBudget\(getActiveKeyValueStorage\(\)/);

  console.log("v1.56 shared runtime persistence routing validation passed");
} finally {
  resetBudgetPersistenceProvider();
  Reflect.deleteProperty(globalThis, "window");
}
