import assert from "node:assert/strict";
import test from "node:test";
import { hasPublishedLocalBudgetDatabase } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import { hasPendingRestoreJournal } from "../../../apps/web/src/features/persistence/localFirst/restorePointReplacement.js";

function storage(values: Record<string, string>) {
  return { getItem: (key: string) => values[key] ?? null };
}

test("warm startup requires a published physical generation pointer", () => {
  assert.equal(hasPublishedLocalBudgetDatabase(storage({}), "budget-a"), false);
  assert.equal(hasPublishedLocalBudgetDatabase(storage({
    "budget-app.local-first.database-file.budget-a": "/budget-physical-budget-a.sqlite3",
  }), "budget-a"), true);
});

test("pending restore journals block ordinary warm-open bypass", () => {
  assert.equal(hasPendingRestoreJournal(storage({}), "budget-a"), false);
  assert.equal(hasPendingRestoreJournal(storage({
    "budget-app.sqlite-restore.pending.budget-a": "{\"version\":1}",
  }), "budget-a"), true);
  assert.equal(hasPendingRestoreJournal(storage({
    "budget-app.sqlite-restore.pending.budget-a": "",
  }), "budget-a"), false);
});
