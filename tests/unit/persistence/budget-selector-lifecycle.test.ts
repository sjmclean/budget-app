import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { configureBudgetPersistenceProvider, resetBudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProviderFactory";
import { createBudgetRegistryEntry } from "../../../apps/web/src/features/budget/budgetRegistry";
import { createBudgetDatabaseOwnership } from "../../../apps/web/src/features/persistence/localFirst/budgetDatabaseOwnership";
import { releaseActiveBudgetPersistence } from "../../../apps/web/src/features/persistence/budgetDatabaseLifecycle";

const requireWeb = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const React = requireWeb("react");
const { MemoryRouter } = await import("react-router-dom");
const { act, create } = await import("react-test-renderer");

test("rendering and refreshing selector cards never invokes SQLite-backed queries", async () => {
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const calls: string[] = [];
  const lifecycle = createBudgetDatabaseOwnership(async () => { calls.push("close"); });
  let exclusiveCalls = 0;
  const refusal = new Error("exclusive boundary reached before provisioning");
  configureBudgetPersistenceProvider({
    metadata: { kind: "local-database", label: "test", description: "test", isProductionPersistence: false },
    keyValueStorage: storage,
    accountRegisterQueries: {
      releaseLocalDatabase: lifecycle.leave,
      async getBudgetStatus() { calls.push("status"); return { capabilities: { accountRegisters: true } }; },
      async listAccountNavigation() { calls.push("SQLite"); return []; },
      async runWithExclusiveLocalDatabase() { exclusiveCalls += 1; throw refusal; },
    },
  } as never);
  createBudgetRegistryEntry(storage, { name: "Budget A" });
  createBudgetRegistryEntry(storage, { name: "Budget B" });
  const { BudgetSelectorPage } = await import("../../../apps/web/src/pages/BudgetSelectorPage");
  const { useBudgetRegistryStore } = await import("../../../apps/web/src/stores/budgetRegistryStore");
  const { useUIStore } = await import("../../../apps/web/src/stores/uiStore");
  const { publishPersistenceChange } = await import("../../../apps/web/src/features/persistence/persistenceChangeBus");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // The repository's root tsx runner uses classic JSX; Vite uses automatic JSX.
  const previousReact = (globalThis as { React?: unknown }).React;
  (globalThis as { React?: unknown }).React = React;
  let rendered: ReturnType<typeof create> | undefined;
  try {
    await lifecycle.enter("A");
    await releaseActiveBudgetPersistence();
    useUIStore.getState().clearSelectedBudget();
    calls.length = 0;
    await act(async () => { rendered = create(React.createElement(MemoryRouter, null, React.createElement(BudgetSelectorPage))); });
    assert.match(JSON.stringify(rendered!.toJSON()), /Budget A/);
    assert.match(JSON.stringify(rendered!.toJSON()), /Budget B/);
    await act(async () => { publishPersistenceChange({ source: "local" } as never); useBudgetRegistryStore.getState().refreshBudgets(); });
    assert.deepEqual(calls, [], "neither initial effects nor refresh may scan SQLite");
    assert.equal(lifecycle.isReleased(), true);
    const store = useBudgetRegistryStore.getState();
    // Exercise each real store entrypoint. Refusing its common boundary must
    // prevent all parsing/provisioning, even with deliberately invalid input.
    for (const begin of [
      store.createBudgetWithSetup,
      store.importYnab4Budget,
      store.importActualBudget,
      store.importSqliteBackup,
    ]) {
      await assert.rejects(begin(undefined as never), refusal);
    }
    assert.equal(exclusiveCalls, 4);
    assert.equal(store.budgets.length, 2);
  } finally {
    if (rendered) await act(async () => { rendered!.unmount(); });
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { React?: unknown }).React = previousReact;
    resetBudgetPersistenceProvider();
  }
});


test("budget manager restores SQLite files as new budgets instead of replacing existing ones", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    "apps/web/src/pages/BudgetSelectorPage.tsx",
    "utf8",
  );

  assert.match(source, /<strong>Restore Budget<\/strong>/);
  assert.match(source, /<strong>Open Budget File<\/strong>/);
  assert.match(source, /await importSqliteBackup\(restoreFile\)/);
  assert.match(source, /Restore as New Budget/);
  assert.match(source, /fresh identity; existing budgets are not replaced/);
  assert.doesNotMatch(source, /restoreTargetBudgetId/);
  assert.doesNotMatch(
    source,
    /queries\.restoreBudget\(targetBudget\.id, restoreFile\)/,
  );
  assert.match(
    source,
    /accept="\.budget-sqlite,\.sqlite,\.sqlite3,application\/vnd\.sqlite3,application\/octet-stream"/,
  );

  const restoreCard = source.slice(
    source.indexOf("<strong>Restore Budget</strong>") - 300,
    source.indexOf("<strong>Restore Budget</strong>") + 300,
  );
  const openCard = source.slice(
    source.indexOf("<strong>Open Budget File</strong>") - 300,
    source.indexOf("<strong>Open Budget File</strong>") + 300,
  );
  assert.doesNotMatch(restoreCard, /disabled/);
  assert.doesNotMatch(openCard, /disabled/);
});
