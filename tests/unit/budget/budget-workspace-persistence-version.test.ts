import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  flushPersistenceChanges,
  getPersistenceChangeRevision,
  publishPersistenceChange,
  subscribeToPersistenceInterest,
} from "../../../apps/web/src/features/persistence/persistenceChangeBus";
import { resolveBudgetWorkspaceData } from "../../../apps/web/src/features/budget/useBudgetWorkspace";
import type { BudgetMonthView } from "../../../apps/web/src/features/budget/budgetViewTypes";

test("post-command budget readback and every subscriber share one persistence revision", () => {
  const before = getPersistenceChangeRevision();
  const observed: number[] = [];
  const unsubscribeFirst = subscribeToPersistenceInterest(
    {
      budgetId: "budget-1",
      month: "2026-09",
      domains: ["budget", "categories", "transactions", "goals"],
    },
    () => { observed.push(getPersistenceChangeRevision()); },
  );
  const unsubscribeSecond = subscribeToPersistenceInterest(
    { budgetId: "budget-1", domains: ["categories"] },
    () => { observed.push(getPersistenceChangeRevision()); },
  );

  publishPersistenceChange({
    source: "local",
    scope: {
      budgetId: "budget-1",
      domains: ["categories", "budget"],
      months: ["2026-09"],
    },
  });
  const committedRevision = getPersistenceChangeRevision();
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

test("workspace wires the synchronous scoped persistence clock into edited readbacks", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../../apps/web/src/features/budget/useBudgetWorkspace.ts", import.meta.url)),
    "utf8",
  );
  assert.match(source, /getPersistenceChangeRevision/);
  assert.doesNotMatch(source, /subscribeToPersistenceInterest/);
  assert.doesNotMatch(source, /persistenceVersionRef/);
  assert.match(
    source,
    /persistenceVersion:\s*Math\.max\([\s\S]*budgetView\.dataVersion[\s\S]*getPersistenceChangeRevision\(\)/,
  );
});
