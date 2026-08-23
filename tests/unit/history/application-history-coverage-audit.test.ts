import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { ApplicationHistoryService } from "../../../apps/web/src/features/history/applicationHistory.ts";
import type { UndoableCommand } from "../../../apps/web/src/features/history/undoRedo.ts";

type Context = { budgetId: string };

function action(state: string[], label: string): UndoableCommand<Context> {
  return {
    id: label,
    label,
    async execute() { state.push(label); },
    async undo() { assert.equal(state.pop(), label); },
    async redo() { state.push(label); },
  };
}

test("mixed-domain actions retain one per-budget stack across navigation and redo in forward order", async () => {
  const state: string[] = [];
  const service = new ApplicationHistoryService<Context>({ getContext: (budgetId) => ({ budgetId }) });
  const labels = [
    "Assign money",
    "Add transaction",
    "Edit transaction",
    "Enter scheduled transaction",
    "Rename category",
    "Add attachment",
    "Rename payee",
    "Import 2 transactions",
  ];
  for (const label of labels) await service.execute("budget-a", action(state, label));

  // Route, account, month, dialog, pagination, filter/search/sort and component
  // lifecycle changes do not call the service and therefore cannot alter it.
  assert.equal(service.getSnapshot("budget-a").undoLabel, labels.at(-1));
  assert.equal(service.getSnapshot("budget-a").undoDepth, labels.length);
  assert.equal(service.getSnapshot("budget-b").undoDepth, 0);
  for (const label of [...labels].reverse()) {
    assert.equal(service.getSnapshot("budget-a").undoLabel, label);
    assert.equal((await service.undo("budget-a")).performed, true);
  }
  assert.deepEqual(state, []);
  for (const label of labels) {
    assert.equal(service.getSnapshot("budget-a").redoLabel, label);
    assert.equal((await service.redo("budget-a")).performed, true);
  }
  assert.deepEqual(state, labels);
});

test("new ordinary and compound actions invalidate redo and failed boundaries retain history", async () => {
  const state: string[] = [];
  const service = new ApplicationHistoryService<Context>({ getContext: (budgetId) => ({ budgetId }) });
  await service.execute("budget-a", action(state, "Action A"));
  await service.execute("budget-a", action(state, "Action B"));
  await service.undo("budget-a");
  await service.execute("budget-a", action(state, "Import 3 transactions"));
  assert.equal(service.getSnapshot("budget-a").canRedo, false);

  const depthBeforeFailedRestore = service.getSnapshot("budget-a").undoDepth;
  await assert.rejects(async () => { throw new Error("restore failed"); });
  assert.equal(service.getSnapshot("budget-a").undoDepth, depthBeforeFailedRestore);
  service.clear("budget-a");
  assert.equal(service.getSnapshot("budget-a").undoDepth, 0);
  await service.execute("budget-a", action(state, "Action after reset"));
  service.destroy("budget-a");
  assert.equal(service.getSnapshot("budget-a").undoDepth, 0);
});

test("production exposes one application history architecture and no Budget compatibility layer", () => {
  const root = new URL("../../../apps/web/src/", import.meta.url);
  const index = readFileSync(new URL("features/history/index.ts", root), "utf8");
  const workspace = readFileSync(new URL("features/budget/useBudgetWorkspace.ts", root), "utf8");
  const importDialog = readFileSync(new URL("features/accounts/components/TransactionImportDialog.tsx", root), "utf8");
  assert.equal(existsSync(new URL("features/budget/budgetUndoRedo.ts", root)), false);
  assert.equal(existsSync(new URL("features/history/useUndoRedo.ts", root)), false);
  assert.doesNotMatch(index, /useUndoRedo/);
  assert.doesNotMatch(workspace, /categoriesPersistence\.setCategoryOverspendingHandling/);
  assert.match(workspace, /categoryHistory\.setCategoryOverspendingHandling/);
  assert.match(importDialog, /commitTransactionBatch: onCommitRegisterChanges/);
  assert.doesNotMatch(importDialog, /onImportTransactions|onUpdateMatchedTransactionDates/);
});
