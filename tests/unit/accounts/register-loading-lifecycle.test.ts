import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AccountRegisterView } from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";
import type { PayeeView } from "../../../apps/web/src/features/accounts/payeeService.js";
import { getRegisterTransactions } from "../../../apps/web/src/features/accounts/registerTransactionData.js";
import { useRegisterViewModel } from "../../../apps/web/src/features/accounts/useRegisterViewModel.js";
import { usePayeeManagerWorkflow } from "../../../apps/web/src/features/accounts/usePayeeManagerWorkflow.js";
import { DEFAULT_REGISTER_SORT } from "../../../apps/web/src/features/accounts/registerSorting.js";
import { getRegisterMonthKey } from "../../../apps/web/src/features/accounts/registerMonthSelection.js";
import { useRegisterMerchantIconsPreference } from "../../../apps/web/src/features/settings/useRegisterMerchantIconsPreference.js";
import { useDateFormatPreference } from "../../../apps/web/src/features/settings/useDateFormatPreference.js";
import { useDeveloperPerformanceMode } from "../../../apps/web/src/features/settings/useDeveloperPerformanceMode.js";
import { notifySettingsPreferencesChanged } from "../../../apps/web/src/features/settings/dateFormatting.js";
import { readSettingsPreferences, writeSettingsPreferences } from "../../../apps/web/src/features/settings/settingsPreferences.js";
import { configureBudgetPersistenceProvider, resetBudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProviderFactory.js";

// Resolve the same React instance as the production web hooks.
const webRequire = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { createElement, StrictMode, useEffect, useMemo, useRef, useState } = webRequire("react");
const { act, create } = webRequire("react-test-renderer");

test("pending register data, preference notifications and payee loads settle under Strict Mode", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  const events = new EventTarget();
  const listeners = new Map<string, Set<EventListener>>();
  const listenerCount = () => [...listeners.values()].reduce((total, set) => total + set.size, 0);
  let writes = 0;
  let notifications = 0;
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes++; values.set(key, value); },
    removeItem: (key: string) => { writes++; values.delete(key); },
    listKeys: () => [...values.keys()],
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    addEventListener(type: string, listener: EventListener) {
      const set = listeners.get(type) ?? new Set<EventListener>();
      set.add(listener); listeners.set(type, set); events.addEventListener(type, listener);
    },
    removeEventListener(type: string, listener: EventListener) { listeners.get(type)?.delete(listener); events.removeEventListener(type, listener); },
    dispatchEvent(event: Event) { notifications++; return events.dispatchEvent(event); },
  } });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  configureBudgetPersistenceProvider({ keyValueStorage: storage, metadata: { label: "Lifecycle test" } } as never);

  let listPayeesCalls = 0;
  let listArchivedCalls = 0;
  let renders = 0;
  let monthEffects = 0;
  let lastEnabled = false;
  let root: ReturnType<typeof create>;
  const payee: PayeeView = {
    id: "canonical-payee", name: "Test Merchant", iconRef: "builtin:v1:shopping",
    createdAt: "2026-09-03T00:00:00.000Z", lastUsedAt: "2026-09-03T00:00:00.000Z", useCount: 1,
  };
  const payeesPersistence = {
    listPayees: async () => { listPayeesCalls++; return [payee]; },
    listArchivedPayees: async () => { listArchivedCalls++; return []; },
  };
  const noOp = async () => {};

  function Probe({ data = null }: { data?: Pick<AccountRegisterView, "transactions"> | null }) {
    // A bounded failure, rather than hanging the suite, if the original cycle returns.
    assert.ok(++renders < 40, "register loading caused an unbounded render loop");
    const enabled = useRegisterMerchantIconsPreference();
    useDateFormatPreference();
    useDeveloperPerformanceMode();
    lastEnabled = enabled;
    const transactions = getRegisterTransactions(data);
    const timings = useRef({});
    const view = useRegisterViewModel({
      transactions, searchDraft: "", committedSearch: null, categoryFilter: "all",
      categoriesEnabled: true, sort: DEFAULT_REGISTER_SORT,
      developerPerformanceMode: false, performanceTimingsRef: timings,
    });
    const workflow = usePayeeManagerWorkflow({
      payeesPersistence: payeesPersistence as never,
      scheduledTransactionsPersistence: { renamePayeeReferences: noOp, reassignPayeeReferences: noOp },
      registerTransactions: transactions, renamePayeeReferences: noOp, reassignPayeeReferences: noOp,
      developerPerformanceMode: false, performanceTimingsRef: timings,
    });
    const map = useMemo(() => enabled
      ? new Map(workflow.allManagedPayees.map(p => [p.id, p])) : new Map(),
    [workflow.allManagedPayees, enabled]);
    const months = useMemo(() => [...new Set(view.visibleTransactions.map(t => getRegisterMonthKey(t.date)))], [view.visibleTransactions]);
    const [, setMonthIds] = useState({});
    // Exercise the page's state-writing month-selection edge with the real
    // loading input and view-model hooks; data deliberately stays pending.
    useEffect(() => {
      monthEffects++;
      const ids: Record<string, string[]> = {};
      for (const transaction of view.sortedRegisterTransactions) {
        const month = getRegisterMonthKey(transaction.date);
        if (month) (ids[month] ??= []).push(transaction.id);
      }
      setMonthIds(ids);
    }, [view.sortedRegisterTransactions, months]);
    return createElement("output", null, `${enabled}:${map.size}`);
  }

  async function toggle(enabled: boolean) {
    const current = readSettingsPreferences(storage);
    writeSettingsPreferences(storage, { ...current, general: { ...current.general, showMerchantIconsInRegister: enabled } });
    const writesAfterUserAction = writes;
    const notificationsBefore = notifications;
    await act(async () => { notifySettingsPreferencesChanged(); });
    assert.equal(notifications, notificationsBefore + 1);
    assert.equal(writes, writesAfterUserAction, "listeners must not write preferences back");
    assert.equal(lastEnabled, enabled);
  }

  try {
    await act(async () => { root = create(createElement(StrictMode, null, createElement(Probe))); });
    assert.equal(lastEnabled, false);
    assert.equal(listenerCount(), 6, "three preference hooks each subscribe to two events exactly once");
    assert.equal(writes, 0, "mount and reads are read-only");
    assert.equal(listPayeesCalls, 2, "Strict Mode performs two bounded mount reads");
    assert.equal(listArchivedCalls, 2);
    assert.equal(monthEffects, 2, "loading month synchronization must settle after Strict Mode replay");
    await toggle(true);
    await toggle(false);
    await act(async () => { notifySettingsPreferencesChanged(); events.dispatchEvent(new Event("storage")); });
    assert.equal(listPayeesCalls, 2, "toggling must not restart payee reads");
    assert.equal(monthEffects, 2, "toggling must not invalidate empty transaction data");
    const loaded = { transactions: [] };
    await act(async () => { root.update(createElement(StrictMode, null, createElement(Probe, { data: loaded }))); });
    assert.equal(monthEffects, 3, "arrival of real data invalidates once");
    assert.equal(getRegisterTransactions(loaded), loaded.transactions);
    await toggle(true);
    await act(async () => { root.unmount(); });
    assert.equal(listenerCount(), 0);
    renders = 0;
    await act(async () => { root = create(createElement(StrictMode, null, createElement(Probe))); });
    assert.equal(lastEnabled, true, "remount reads the persisted ON preference");
    assert.equal(listPayeesCalls, 4);
    await act(async () => { root.unmount(); });
    assert.equal(listenerCount(), 0);
    const afterUnmount = renders;
    await act(async () => { notifySettingsPreferencesChanged(); });
    assert.equal(renders, afterUnmount);
    assert.match(readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8"), /const registerTransactions = getRegisterTransactions\(data\)/);
  } finally {
    resetBudgetPersistenceProvider();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    if (previousAct) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousAct); else Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
});
