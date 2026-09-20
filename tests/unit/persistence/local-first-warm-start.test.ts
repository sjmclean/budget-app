import { readFileSync } from "node:fs";
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


const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("ordinary local-first reads do not launch relay convergence", () => {
  const source = read("../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts");
  const start = source.indexOf("async function syncThenDatabase");
  const end = source.indexOf("const mutation =", start);
  const helper = source.slice(start, end);
  assert.match(helper, /return requireDatabase\(budgetId\)/);
  assert.doesNotMatch(helper, /synchronise\(budgetId\)/);
});

test("hidden tabs release physical database ownership before suspension", () => {
  const source = read("../../../apps/web/src/features/persistence/persistenceProviderLifecycle.ts");
  const hiddenBranch = source.slice(
    source.indexOf('document.visibilityState === "hidden"'),
    source.indexOf("reactivateVisibleBudget();"),
  );
  assert.match(hiddenBranch, /flushPendingWrites\(\)/);
  assert.match(hiddenBranch, /releaseActiveBudgetPersistence\(\)/);
});

test("local-first replication scopes to the held tab lease instead of shared selection storage", () => {
  const source = read("../../../apps/web/src/features/persistence/replicationService.ts");
  const localFirstBranch = source.slice(
    source.indexOf('provider.syncArchitecture === "local-first-relay"'),
    source.indexOf("if (!provider.operationJournal"),
  );
  assert.match(localFirstBranch, /getLocalFirstDatabaseTabOwnershipBudgetId\(\)/);
  assert.doesNotMatch(localFirstBranch, /getActiveBudgetIdFromStorage\(provider\.keyValueStorage\)/);
});


test("local-first timed restore points use the held tab lease as active budget", () => {
  const source = read("../../../apps/web/src/main.tsx");
  const restoreLifecycle = source.slice(
    source.indexOf("startRestorePointLifecycle"),
    source.indexOf("startReplicationBackgroundService"),
  );
  assert.match(restoreLifecycle, /getLocalFirstDatabaseTabOwnershipBudgetId\(\)/);
  assert.match(restoreLifecycle, /syncArchitecture === "local-first-relay"/);
});
