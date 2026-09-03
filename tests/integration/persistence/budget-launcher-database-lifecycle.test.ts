import assert from "node:assert/strict";
import test from "node:test";
import { configureBudgetPersistenceProvider, resetBudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProviderFactory";
import { createBudgetDatabaseOwnership } from "../../../apps/web/src/features/persistence/localFirst/budgetDatabaseOwnership";
import { releaseActiveBudgetPersistence } from "../../../apps/web/src/features/persistence/budgetDatabaseLifecycle";
import { emptyDomainCounts } from "../../../apps/web/src/features/persistence/localFirst/contracts";
import { defaultNewBudgetSetup } from "../../../apps/web/src/features/budget/newBudget/budgetTemplates";

// Exercise the real store, staged importers, worker client and baseline publisher.
// Only the worker transport and HTTP relay are fakes; no real OPFS/browser is
// claimed. The fake pool rejects any overlapping owner deterministically.
test("switch followed immediately by real blank, YNAB4 and Actual workflows; rollback and cancellation recover", async () => {
  const originalWorker = globalThis.Worker;
  const originalFetch = globalThis.fetch;
  let owner: object | string | null = null;
  let failImport = false;
  let cancelImport: (() => void) | undefined;
  const events: string[] = [];
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    listKeys: () => [...values.keys()],
  };
  class BudgetWorker {
    onmessage: ((event: unknown) => void) | null = null;
    onerror = null;
    manifest = { budgetId: "", syncEpoch: "epoch", schemaVersion: 1, localRevision: 0, durable: true, physicalFilename: "", counts: emptyDomainCounts() };
    ids = new Map<string, Set<string>>();
    postMessage(request: Record<string, any>) {
      void Promise.resolve().then(() => {
        let result: unknown = null;
        switch (request.type) {
          case "beginStagedImport":
            if (owner !== null) throw Object.assign(new Error("second pool owner"), { code: "SQLITE_DATABASE_BUSY" });
            owner = this;
            events.push("stage");
            this.manifest.budgetId = request.budgetId;
            this.manifest.physicalFilename = `/budget-physical-${request.budgetId}-fixture.sqlite3`;
            result = this.manifest;
            cancelImport?.();
            break;
          case "importRegisterBatch":
          case "importEntityBatch": {
            if (failImport) throw new Error("injected staging failure");
            const groups: Record<string, { id: string }[]> = request.batch ?? {};
            for (const row of request.entities ?? []) (groups[row.domain] ??= []).push({ id: row.entityId });
            for (const [domain, rows] of Object.entries(groups)) {
              const ids = this.ids.get(domain) ?? new Set<string>();
              rows.forEach((row) => ids.add(row.id));
              this.ids.set(domain, ids);
              (this.manifest.counts as Record<string, number>)[domain] = ids.size;
            }
            break;
          }
          case "commitStagedImport":
            assert.deepEqual(this.manifest.counts, request.expectedCounts);
            events.push("commit");
            result = { manifest: this.manifest, supersededPhysicalFilename: null };
            break;
          case "rollbackStagedImport": events.push("rollback"); break;
          case "manifest": result = this.manifest; break;
          case "getSyncState": result = { syncEpoch: "epoch", pulledCursor: 0, baselineHash: null }; break;
          case "prepareBaselineExport": result = { totalBytes: 1 }; break;
          case "readBaselineExportChunk": result = new Uint8Array([1]); break;
          case "finishBaselineExport": case "setSyncState": break;
          case "close":
            assert.equal(request.releaseOwnership, true);
            if (owner === this) owner = null;
            events.push("close");
            break;
          default: throw new Error(`Unexpected worker request ${request.type}`);
        }
        this.onmessage?.({ data: { requestId: request.requestId, ok: true, result } });
      }).catch((error) => this.onmessage?.({ data: { requestId: request.requestId, ok: false, error: { code: error.code ?? "TEST_FAILURE", message: error.message } } }));
    }
    terminate() { assert.notEqual(owner, this); events.push("terminate"); }
  }
  globalThis.Worker = BudgetWorker as unknown as typeof Worker;
  const baselines = new Map<string, Record<string, unknown>>();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://test.invalid");
    const budgetId = url.searchParams.get("budgetId")!;
    let result: unknown = {};
    if (url.pathname.endsWith("/bootstrap")) result = { budgetId, syncEpoch: "epoch", schemaVersion: 1, protocolVersion: 1, latestCursor: 0, baseline: null };
    else if (url.pathname.endsWith("/epoch/reset")) result = { syncEpoch: "epoch" };
    else if (url.pathname.endsWith("/baselines")) {
      const { manifest } = JSON.parse(String(init?.body));
      baselines.set(budgetId, manifest);
      result = { baselineId: "baseline", chunkCount: manifest.chunkCount };
    } else if (url.pathname.endsWith("/commit")) result = baselines.get(budgetId);
    else if (url.pathname.includes("/chunks/")) events.push("upload");
    else if (!url.pathname.endsWith("/budget") && !url.pathname.endsWith("/provision")) throw new Error(`Unexpected relay ${url.pathname}`);
    return new Response(JSON.stringify(result), { status: 200 });
  };
  const lifecycle = createBudgetDatabaseOwnership(async () => { if (owner === "A") { events.push("release:A"); owner = null; } });
  configureBudgetPersistenceProvider({
    metadata: { kind: "local-database", label: "test", description: "test", isProductionPersistence: false },
    keyValueStorage: storage,
    accountRegisterQueries: { releaseLocalDatabase: lifecycle.leave, runWithExclusiveLocalDatabase: lifecycle.exclusive },
  } as never);
  try {
    const { useBudgetRegistryStore } = await import("../../../apps/web/src/stores/budgetRegistryStore");
    const store = useBudgetRegistryStore.getState();
    const blank = () => store.createBudgetWithSetup({ ...defaultNewBudgetSetup, name: "New blank", categoryGroups: [] });
    const ynab = (signal?: AbortSignal) => store.importYnab4Budget({
      discovery: { isYnab4Package: true, budgetDataPath: "Budget.yfull", packageRoot: "Fixture", counts: {} },
      preview: { canContinue: true, mode: "new-budget", budgetName: "YNAB fixture", warnings: [], progressSteps: [] },
      entries: [{ path: "Budget.yfull", text: JSON.stringify({ accounts: [{ entityId: "checking", accountName: "Checking", accountType: "Checking", onBudget: true }], payees: [], masterCategories: [], monthlyBudgets: [], transactions: [], scheduledTransactions: [] }) }],
      useLocalFirstSqlite: true, signal,
    } as never);
    const actual = () => store.importActualBudget({ preview: {
      format: "actual-budget", sourceBudgetName: "Actual fixture", metadata: { currency: "AUD" }, issues: [], entityCounts: [], transferCount: 0,
      accounts: [{ id: "checking", name: "Checking", type: "checking", closed: false, offBudget: false }],
      categoryGroups: [], categories: [], payees: [], budgetMonths: [],
      transactions: [{ id: "t", accountId: "checking", accountName: "Checking", date: "2026-01-01", amount: 100, payeeId: null, payeeName: null, categoryId: null, categoryName: null, memo: null, cleared: true, transferId: null, isTransfer: false }],
    } } as never);
    for (const [name, begin] of [["blank", blank], ["YNAB4", ynab], ["Actual", actual]] as const) {
      await lifecycle.enter("A");
      owner = "A";
      events.length = 0;
      const leaving = releaseActiveBudgetPersistence();
      const creating = begin();
      await leaving;
      const result = await creating;
      assert.ok(result, name);
      assert.equal(owner, null, name);
      assert.equal(events[0], "release:A", name);
      assert.ok(events.includes("stage") && events.includes("commit") && events.includes("upload"), name);
      assert.deepEqual(events.slice(-2), ["close", "terminate"], name);
    }
    const beforeFailure = useBudgetRegistryStore.getState().budgets.length;
    events.length = 0;
    failImport = true;
    await assert.rejects(blank(), /injected staging failure/);
    assert.ok(events.includes("rollback"));
    assert.equal(owner, null);
    assert.equal(useBudgetRegistryStore.getState().budgets.length, beforeFailure);
    failImport = false;
    await blank();
    const controller = new AbortController();
    cancelImport = () => controller.abort();
    await assert.rejects(ynab(controller.signal), /abort/i);
    assert.equal(owner, null);
    cancelImport = undefined;
    await actual();
  } finally {
    globalThis.Worker = originalWorker;
    globalThis.fetch = originalFetch;
    resetBudgetPersistenceProvider();
  }
});
