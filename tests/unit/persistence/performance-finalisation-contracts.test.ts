import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

test("startup shares one cached authentication status request", () => {
  const main = read("../../../apps/web/src/main.tsx");
  const gate = read("../../../apps/web/src/features/auth/AuthGate.tsx");
  const client = read("../../../apps/web/src/features/auth/authStatusClient.ts");
  assert.match(main, /loadAuthStatus\(\)/);
  assert.match(gate, /getCachedAuthStatus\(\)/);
  assert.match(gate, /loadAuthStatus\(\)/);
  assert.equal((main.match(/\/api\/auth\/status/g) ?? []).length, 0);
  assert.equal((gate.match(/\/api\/auth\/status/g) ?? []).length, 0);
  assert.equal((client.match(/\/api\/auth\/status/g) ?? []).length, 1);
  assert.match(main, /const session = await loadAuthStatus\(\);/);
  assert.doesNotMatch(main, /loadAuthStatus\(\)\.catch/);
});

test("ordinary budget status is local and background sync owns relay bootstrap", () => {
  const client = read("../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts");
  const statusStart = client.indexOf("async getBudgetStatus(budgetId)");
  const statusEnd = client.indexOf("async getAccountRegisterBootstrap", statusStart);
  const status = client.slice(statusStart, statusEnd);
  assert.match(status, /requireDatabase\(budgetId\)/);
  assert.match(status, /getSyncState\(\)/);
  assert.doesNotMatch(status, /relay\.getBootstrap/);

  const service = read("../../../apps/web/src/features/persistence/replicationService.ts");
  const branchStart = service.indexOf('provider.syncArchitecture === "local-first-relay"');
  const branchEnd = service.indexOf("if (!provider.operationJournal", branchStart);
  const branch = service.slice(branchStart, branchEnd);
  assert.doesNotMatch(branch, /await checkHealth\(\);[\s\S]*synchroniseLocalBudget/);
  assert.doesNotMatch(branch, /getBudgetStatus\(budgetId\)/);
  assert.match(branch, /synchroniseLocalBudget\(budgetId\)/);
  assert.match(branch, /publishedMetadata\.get\(budgetId\) !== metadataSignature/);
  assert.match(branch, /publishedMetadata\.set\(budgetId, metadataSignature\)/);
});


test("local-first benchmark uses the production convergence loop with persisted SQLite state", () => {
  const client = read("../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts");
  const benchmark = read("../../../tools/performance/local-first-sync-benchmark.ts");
  assert.match(client, /export async function convergeLocalFirstMutations/);
  assert.match(client, /await convergeLocalFirstMutations\(\{/);
  assert.match(benchmark, /from "better-sqlite3"/);
  assert.match(benchmark, /convergeLocalFirstMutations\(\{/);
  assert.match(benchmark, /CREATE TABLE local_budget_outbox/);
  assert.match(benchmark, /CREATE TABLE remote_applied/);
});


test("Account Register bundle budget measures the route static graph rather than one emitted file", () => {
  const analyzer = read("../../../tools/performance/analyze-vite-build.ts");
  assert.match(analyzer, /accountRegisterStaticChunkKeys = collectStaticGraph/);
  assert.match(analyzer, /filter\(\(key\) => !initialChunkKeys\.has\(key\)\)/);
  assert.match(analyzer, /accountRegisterJavaScriptBytes: sumBytes\(accountRegisterJavaScript\)/);
});


test("startup overlaps extended merchant catalogue loading with persistence initialization", () => {
  const main = read("../../../apps/web/src/main.tsx");
  const preloadStart = main.indexOf("const extendedMerchantCataloguePromise = import(");
  const persistenceInitialize = main.indexOf("await persistenceProvider.initialize?.()");
  const preloadAwait = main.indexOf("await extendedMerchantCataloguePromise");
  const appImport = main.indexOf('const { App } = await import("./App")');

  assert.ok(preloadStart >= 0);
  assert.ok(persistenceInitialize > preloadStart);
  assert.ok(preloadAwait > persistenceInitialize);
  assert.ok(appImport > preloadAwait);
});


test("Register defers archived payee loading until Payee Manager opens", () => {
  const workflow = read("../../../apps/web/src/features/accounts/usePayeeManagerWorkflow.ts");
  const initialLoad = workflow.slice(
    workflow.indexOf("useEffect(() => {"),
    workflow.indexOf("useEffect(() => {", workflow.indexOf("useEffect(() => {") + 1),
  );

  assert.match(initialLoad, /payeesPersistence\.listPayees\(\)/);
  assert.doesNotMatch(initialLoad, /listArchivedPayees\(\)/);
  assert.match(
    workflow,
    /if \(!isPayeeManagerOpen \|\| archivedPayeesLoaded\)[\s\S]*?listArchivedPayees\(\)/,
  );
});


test("Actual backend import exposes diagnostic-only stage timings", () => {
  const importer = read("../../../apps/web/src/features/budget/actualBudgetLauncherImport.ts");

  assert.match(importer, /onPerformanceSample\?:/);
  for (const stage of [
    "map",
    "provision",
    "begin-staged-import",
    "entities",
    "transactions",
    "budget-months",
    "commit",
    "publish-baseline",
    "restore-point",
    "finalize-storage",
    "total",
  ]) {
    assert.match(importer, new RegExp(`recordActualImportPerformance\\(input, "${stage}"`));
  }

  const recordStart = importer.indexOf("function createActualImportRecord(");
  const recordEnd = importer.indexOf("\nexport function createActualBudgetLauncherImport(", recordStart);
  const recordBody = importer.slice(recordStart, recordEnd);
  assert.doesNotMatch(recordBody, /onPerformanceSample|elapsedMs|PerformanceSample/);
});
