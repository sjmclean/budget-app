import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  flushPersistenceChanges,
  getPersistenceChangeRevision,
  publishPersistenceChange,
  subscribeToPersistenceInterest,
} from "../../../apps/web/src/features/persistence/persistenceChangeBus";
import { resolveBudgetWorkspaceData } from "../../../apps/web/src/features/budget/useBudgetWorkspace";
import type { BudgetMonthView } from "../../../apps/web/src/features/budget/budgetViewTypes";
import { useBudgetView } from "../../../apps/web/src/features/budget/useBudgetView";
import { configureBudgetPersistenceProvider, resetBudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProviderFactory";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider";

const webRequire = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { createElement } = webRequire("react");
const { act, create } = webRequire("react-test-renderer");
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("command N beats equal-version stale query; relevant authoritative N+1 beats command N", () => {
  const before = getPersistenceChangeRevision();
  const observed: number[] = [];
  const unsubscribeFirst = subscribeToPersistenceInterest(
    {
      budgetId: "budget-1",
      month: "2026-09",
      domains: ["budget", "categories", "transactions", "goals"],
    },
    (_event, revision) => { observed.push(revision); },
  );
  const unsubscribeSecond = subscribeToPersistenceInterest(
    { budgetId: "budget-1", domains: ["categories"] },
    (_event, revision) => { observed.push(revision); },
  );

  const committedRevision = publishPersistenceChange({
    source: "local",
    scope: {
      budgetId: "budget-1",
      domains: ["categories", "budget"],
      months: ["2026-09"],
    },
  });
  assert.equal(committedRevision, before + 1, "publication advances the shared clock synchronously");
  flushPersistenceChanges();
  unsubscribeFirst();
  unsubscribeSecond();

  assert.deepEqual(observed, [committedRevision, committedRevision]);
  const staleAuthoritative = { marker: "before" } as unknown as BudgetMonthView;
  const committedReadback = { marker: "after" } as unknown as BudgetMonthView;
  assert.equal(
    resolveBudgetWorkspaceData(
      { data: committedReadback, persistenceVersion: committedRevision },
      staleAuthoritative,
      committedRevision,
    ),
    committedReadback,
    "a readback stamped by the just-published event must not lose to the stale query it invalidated",
  );
  const refreshedAuthoritative = { marker: "refreshed" } as unknown as BudgetMonthView;
  assert.equal(
    resolveBudgetWorkspaceData(
      { data: committedReadback, persistenceVersion: committedRevision },
      refreshedAuthoritative,
      committedRevision + 1,
    ),
    refreshedAuthoritative,
  );
});

test("unrelated publication does not advance a workspace interest or relabel command N", () => {
  const observed: number[] = [];
  const unsubscribe = subscribeToPersistenceInterest(
    { budgetId: "budget-a", month: "2026-09", domains: ["categories", "budget"] },
    (_event, revision) => { observed.push(revision); },
  );
  const commandRevision = publishPersistenceChange({ source: "local", scope: {
    budgetId: "budget-a", domains: ["categories", "budget"], months: ["2026-09"],
  } });
  const unrelatedRevision = publishPersistenceChange({ source: "local", scope: {
    budgetId: "budget-b", domains: ["categories"], months: ["2026-09"],
  } });
  flushPersistenceChanges();
  unsubscribe();
  assert.equal(unrelatedRevision, commandRevision + 1);
  assert.deepEqual(observed, [commandRevision]);
  const command = { marker: "A" } as unknown as BudgetMonthView;
  const authoritative = { marker: "B" } as unknown as BudgetMonthView;
  assert.equal(resolveBudgetWorkspaceData({ data: command, persistenceVersion: commandRevision }, authoritative, commandRevision), command);
  assert.equal(resolveBudgetWorkspaceData({ data: command, persistenceVersion: commandRevision }, authoritative, unrelatedRevision), authoritative);
});

test("same-budget unrelated coalesced publication retains the last relevant revision", () => {
  const observed: number[] = [];
  const unsubscribe = subscribeToPersistenceInterest(
    { budgetId: "budget-a", month: "2026-09", domains: ["categories"] },
    (_event, revision) => { observed.push(revision); },
  );
  const relevant = publishPersistenceChange({ source: "local", scope: {
    budgetId: "budget-a", domains: ["categories"], months: ["2026-09"],
  } });
  publishPersistenceChange({ source: "local", scope: {
    budgetId: "budget-a", domains: ["payees"], months: ["2026-10"],
  } });
  flushPersistenceChanges();
  unsubscribe();
  assert.deepEqual(observed, [relevant]);
});

test("workspace uses exact readback revisions and never samples a later global revision", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../../apps/web/src/features/budget/useBudgetWorkspace.ts", import.meta.url)),
    "utf8",
  );
  assert.match(source, /nextData\.publicationRevision \?\? fallbackVersion/);
  assert.doesNotMatch(source, /getPersistenceChangeRevision/);
  assert.doesNotMatch(source, /subscribeToPersistenceInterest/);
  assert.doesNotMatch(source, /persistenceVersionRef/);
});

test("older in-flight budget query cannot replace the newer revision's result", async () => {
  publishPersistenceChange({ source: "local", scope: { budgetId: "unrelated", domains: ["budget"] } });
  flushPersistenceChanges();
  const requests: { resolve: (view: BudgetMonthView) => void }[] = [];
  configureBudgetPersistenceProvider({ categories: {
    getBudgetMonthView: () => new Promise<BudgetMonthView>((resolve) => { requests.push({ resolve }); }),
  } } as unknown as BudgetPersistenceProvider);
  let latest: ReturnType<typeof useBudgetView> | null = null;
  function Consumer() { latest = useBudgetView("budget-query", "2026-09"); return null; }
  let root: { unmount(): void } | null = null;
  try {
    await act(async () => { root = create(createElement(Consumer)); });
    assert.equal(requests.length, 1);
    assert.equal(latest?.dataVersion, 0, "an unrelated earlier publication is not this new interest's revision");
    const revision = publishPersistenceChange({ source: "local", scope: {
      budgetId: "budget-query", domains: ["budget"], months: ["2026-09"],
    } });
    await act(async () => { flushPersistenceChanges(); });
    assert.equal(requests.length, 2);
    const newer = { marker: "newer" } as unknown as BudgetMonthView;
    await act(async () => { requests[1]!.resolve(newer); });
    assert.equal(latest?.data, newer);
    assert.equal(latest?.dataVersion, revision);
    await act(async () => { requests[0]!.resolve({ marker: "stale" } as unknown as BudgetMonthView); });
    assert.equal(latest?.data, newer);
    assert.equal(latest?.dataVersion, revision);
  } finally {
    if (root) await act(async () => root!.unmount());
    resetBudgetPersistenceProvider();
  }
});
