import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  flushPersistenceChanges,
  publishPersistenceChange,
  subscribeToPersistenceInterest,
} from "../../../apps/web/src/features/persistence/persistenceChangeBus";
import { resolveBudgetWorkspaceData } from "../../../apps/web/src/features/budget/useBudgetWorkspace";
import type { BudgetMonthView } from "../../../apps/web/src/features/budget/budgetViewTypes";

test("post-command budget readback can carry the persistence event that precedes its async continuation", () => {
  let observedRevision = 0;
  const unsubscribe = subscribeToPersistenceInterest(
    {
      budgetId: "budget-1",
      month: "2026-09",
      domains: ["budget", "categories", "transactions", "goals"],
    },
    () => { observedRevision += 1; },
  );

  publishPersistenceChange({
    source: "local",
    scope: {
      budgetId: "budget-1",
      domains: ["categories", "budget"],
      months: ["2026-09"],
    },
  });
  flushPersistenceChanges();
  unsubscribe();

  assert.equal(observedRevision, 1);
  const staleAuthoritative = { marker: "before" } as unknown as BudgetMonthView;
  const committedReadback = { marker: "after" } as unknown as BudgetMonthView;
  assert.equal(
    resolveBudgetWorkspaceData(
      { data: committedReadback, persistenceVersion: observedRevision },
      staleAuthoritative,
      1,
    ),
    committedReadback,
    "a readback stamped by the just-published event must not lose to the stale query it invalidated",
  );
});

test("workspace wires the synchronous scoped persistence clock into edited readbacks", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../../apps/web/src/features/budget/useBudgetWorkspace.ts", import.meta.url)),
    "utf8",
  );
  assert.match(source, /subscribeToPersistenceInterest/);
  assert.match(source, /persistenceVersionRef\.current\.revision \+= 1/);
  assert.match(
    source,
    /persistenceVersion:\s*Math\.max\([\s\S]*budgetView\.dataVersion[\s\S]*persistenceVersionRef\.current\.revision/,
  );
});
