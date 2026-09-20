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
  const releaseStart = source.indexOf("const releaseForSuspension");
  const releaseEnd = source.indexOf("const handlePageHide", releaseStart);
  const releaseHelper = source.slice(releaseStart, releaseEnd);
  const hiddenBranch = source.slice(
    source.indexOf('document.visibilityState === "hidden"'),
    source.indexOf("reactivateVisibleBudget();"),
  );
  assert.match(releaseHelper, /flushPendingWrites\(\)/);
  assert.match(releaseHelper, /releaseActiveBudgetPersistence\(\)/);
  assert.match(hiddenBranch, /releaseForSuspension\(\)/);
});

test("pagehide releases physical database ownership before browser suspension", () => {
  const source = read("../../../apps/web/src/features/persistence/persistenceProviderLifecycle.ts");
  const start = source.indexOf("const handlePageHide");
  const end = source.indexOf("const reactivateVisibleBudget", start);
  const handler = source.slice(start, end);
  assert.match(handler, /releaseForSuspension\(\)/);
});

test("exclusive physical lease scope is not a replication budget", () => {
  const source = read("../../../apps/web/src/features/persistence/localFirst/databaseTabCoordinator.ts");
  const start = source.indexOf("export function getLocalFirstDatabaseTabOwnershipBudgetId");
  const getter = source.slice(start, source.indexOf("\n}", start) + 2);
  assert.match(getter, /budgetIdFromLocalFirstDatabaseLeaseScope/);
});

test("active release does not close the local database twice after dropping its physical lease", () => {
  const source = read("../../../apps/web/src/features/persistence/budgetDatabaseLifecycle.ts");
  const start = source.indexOf("export async function releaseActiveBudgetPersistence");
  const end = source.indexOf("export async function activateBudgetPersistence", start);
  const release = source.slice(start, end);
  assert.match(release, /hasAnyLocalFirstDatabaseTabOwnership\(\)/);
  assert.match(release, /if \(!hadPhysicalLease\)/);
});

test("local-first replication scopes to the held tab lease instead of shared selection storage", () => {
  const source = read("../../../apps/web/src/features/persistence/replicationService.ts");
  const localFirstBranch = source.slice(
    source.indexOf('provider.syncArchitecture === "local-first-relay"'),
    source.indexOf("if (!provider.operationJournal"),
  );
  assert.match(localFirstBranch, /getLocalFirstDatabaseTabOwnershipBudgetId\(\)/);
  assert.match(localFirstBranch, /hasLocalFirstDatabaseTabOwnership\((?:selectedBudgetId|budgetId)\)/);
  assert.doesNotMatch(localFirstBranch, /getActiveBudgetIdFromStorage\(provider\.keyValueStorage\)/);
});


test("local-first timed restore points use the held tab lease as active budget", () => {
  const source = read("../../../apps/web/src/main.tsx");
  const restoreLifecycle = source.slice(
    source.indexOf("startRestorePointLifecycle({"),
    source.indexOf("startReplicationBackgroundService(persistenceProvider"),
  );
  assert.match(restoreLifecycle, /getLocalFirstDatabaseTabOwnershipBudgetId\(\)/);
  assert.match(restoreLifecycle, /syncArchitecture === "local-first-relay"/);
});


test("initial route startup can defer convergence without changing normal reactivation", () => {
  const lifecycle = read("../../../apps/web/src/features/persistence/budgetDatabaseLifecycle.ts");
  const router = read("../../../apps/web/src/app/router.tsx");
  assert.match(
    lifecycle,
    /options: \{ readonly deferBackgroundSync\?: boolean \} = \{\}/,
  );
  assert.match(
    lifecycle,
    /if \(!options\.deferBackgroundSync\)\s*\{\s*nudgeActiveBudgetReplication\(\);\s*\}/,
  );
  assert.match(
    router,
    /activateBudgetPersistence\(budgetId, \{\s*deferBackgroundSync: true,/,
  );
  assert.match(
    router,
    /prefetchAccountIdentityQuery\(\{ budgetId \}\)[\s\S]*nudgeActiveBudgetReplication\(\)/,
  );
});


test("suspension preserves active-budget intent so visible register reads can reacquire ownership", () => {
  const lifecycle = read("../../../apps/web/src/features/persistence/persistenceProviderLifecycle.ts");
  const databaseLifecycle = read("../../../apps/web/src/features/persistence/budgetDatabaseLifecycle.ts");
  const register = read("../../../apps/web/src/features/accounts/useAccountRegister.ts");

  assert.match(
    lifecycle,
    /releaseActiveBudgetPersistence\(\{ preserveActiveIntent: true \}\)/,
  );
  assert.match(
    databaseLifecycle,
    /export async function ensureActiveBudgetPersistenceReady/,
  );
  assert.match(
    databaseLifecycle,
    /intendedActiveBudgetId !== budgetId/,
  );
  assert.match(
    register,
    /await ensureActiveBudgetPersistenceReady\(budgetId\)/,
  );
  assert.doesNotMatch(
    register.slice(register.indexOf('provider.syncArchitecture === "local-first-relay"')),
    /getBudgetStatus\(budgetId\)[\s\S]*reloadSqliteRegister\(\)/,
  );
});

test("explicit workspace release still clears active-budget intent", () => {
  const databaseLifecycle = read("../../../apps/web/src/features/persistence/budgetDatabaseLifecycle.ts");
  assert.match(
    databaseLifecycle,
    /if \(!options\.preserveActiveIntent\) intendedActiveBudgetId = null/,
  );
});
