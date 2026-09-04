import assert from "node:assert/strict";
import { closeSync, mkdtempSync, openSync, readFileSync, readSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";
import test from "node:test";
import Database from "better-sqlite3";
import ts from "typescript";
import { createRestorePointStore, RESTORE_POINT_CHUNK_BYTES } from "../../../apps/web/src/features/budget/restorePointStore";
import { memoryRestorePointFiles, collectRestorePointBytes } from "../../helpers/restorePointFiles";
import { emptyDomainCounts } from "../../../apps/web/src/features/persistence/localFirst/contracts";
import { compareGranularity } from "../../helpers/restorePointGranularity";

// Execute the shipped capture function with real SQLite locking/serialization.
// OPFS handles are an adapter, not a claim of browser-engine coverage.
const source = readFileSync(new URL("../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("worker.ts", source, ts.ScriptTarget.Latest, true);
const declaration = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "captureRestorePoint");
assert.ok(declaration);
const captureSource = ts.transpile(declaration.getText(parsed).replace(
  'await import("../../budget/restorePointStore")', "({ createRestorePointStore: testRestorePointStore })",
), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext });

const prepareDeclaration = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "prepareRestorePoint");
assert.ok(prepareDeclaration);
const prepareSource = ts.transpile(prepareDeclaration.getText(parsed).replace(
  'await import("../../budget/restorePointStore")', "({ createRestorePointStore: testRestorePointStore })",
), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext });

for (const mode of ["opfs", "opfs-sahpool", "wal"] as const) {
  test(`${mode}: a 30,001-transaction SQLite snapshot is complete and excludes concurrent writers`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "restore-worker-"));
    const filename = join(directory, "active.sqlite3");
    const database = new Database(filename);
    database.pragma("page_size = 8192");
    database.pragma(`journal_mode = ${mode === "wal" ? "WAL" : "DELETE"}`);
    database.exec("CREATE TABLE transactions(id INTEGER PRIMARY KEY, memo TEXT)");
    database.transaction(() => {
      const insert = database.prepare("INSERT INTO transactions VALUES (?, ?)");
      for (let id = 1; id <= 30_001; id++) insert.run(id, `Imported transaction ${id}`.padEnd(1100, "x"));
    })();
    const other = new Database(filename, { timeout: 0 });
    const readHandle = openSync(filename, "r");
    const memory = memoryRestorePointFiles();
    const store = createRestorePointStore(memory.forBudget);
    const events: string[] = [];
    const writerIsBlocked = () => assert.throws(() => other.prepare("INSERT INTO transactions VALUES (40000, 'racing write')").run(), { code: "SQLITE_BUSY" });
    const exportBytes = () => { writerIsBlocked(); return new Uint8Array(database.serialize()); };
    const context = {
      database: { pointer: 1 }, stagedImport: null, replacement: null, restoreCandidate: null,
      baselineExportBytes: null, activeFilename: "/active.sqlite3",
      persistentBackend: mode === "wal" ? "opfs" : mode,
      sqliteRuntime: { capi: { sqlite3_js_db_export: exportBytes } },
      sahPool: { exportFile: async () => exportBytes() },
      execute: (sql: string) => { events.push(sql); database.exec(sql); },
      resultRows: (sql: string) => database.prepare(sql).all(),
      currentManifest: () => ({ budgetId: "large-budget", syncEpoch: "epoch", localRevision: 1,
        counts: { ...emptyDomainCounts(), transactions: 30_001 } }),
      testRestorePointStore: () => store,
      workerError: (code: string, message: string) => Object.assign(new Error(message), { code }),
      navigator: { storage: { getDirectory: async () => ({
        getFileHandle: async () => ({ getFile: async () => new File([readFileSync(filename)], "active.sqlite3") }),
      }) } },
      readBaselineExportChunk: async (offset: number, length: number) => {
        writerIsBlocked();
        // Model production's bounded File.slice read, not a full read per chunk.
        const content = new Uint8Array(length);
        assert.equal(readSync(readHandle, content, 0, length, offset), length);
        return content;
      },
      Uint8Array, Date, Promise,
    };
    try {
      const capture = runInNewContext(`${captureSource}\ncaptureRestorePoint`, context);
      const captureStart = performance.now();
      const point = await capture({ budgetName: "Large import", reason: "initial-import", mutationCount: 0 });
      const initialCaptureMs = performance.now() - captureStart;
      assert.equal(point.counts.transactions, 30_001);
      assert.ok(point.totalBytes > 32 * 1024 * 1024, "realistic many-chunk database");
      const image = await store.read("large-budget", point.id, collectRestorePointBytes);
      const expected = database.serialize();
      if (mode === "wal") expected[18] = expected[19] = 1;
      assert.deepEqual(image, expected);
      const snapshot = new Database(image);
      try {
        assert.equal(snapshot.prepare("SELECT COUNT(*) AS count FROM transactions").get().count, 30_001);
        assert.equal(snapshot.pragma("quick_check", { simple: true }), "ok");
      } finally { snapshot.close(); }
      assert.deepEqual(events, ["BEGIN IMMEDIATE", "ROLLBACK"]);
      database.prepare("UPDATE transactions SET memo=? WHERE id=?").run("Small edited transaction".padEnd(1100, "y"), 15000);
      const editCaptureStart = performance.now();
      const second = await capture({ budgetName: "Large import", reason: "timed", mutationCount: 1 });
      const editCaptureMs = performance.now() - editCaptureStart;
      assert.ok(second.newBytesStored < point.totalBytes / 10, "localized changes add materially less than a full image");
      assert.ok(second.newBytesStored > 0);
      assert.ok(second.newChunkCount < second.chunks.length);
      const identical = await capture({ budgetName: "Large import", reason: "manual", mutationCount: 1 });
      assert.equal(identical.newBytesStored, 0);
      assert.equal(identical.newChunkCount, 0);
      const restoreStart = performance.now();
      const changedImage = await store.read("large-budget", second.id, collectRestorePointBytes);
      const restoreMs = performance.now() - restoreStart;
      const changedExpected = database.serialize();
      if (mode === "wal") changedExpected[18] = changedExpected[19] = 1;
      assert.deepEqual(changedImage, changedExpected);
      const comparison = await compareGranularity(image, changedImage);
      const selected = comparison.rows.find((row) => row.chunkSize === RESTORE_POINT_CHUNK_BYTES)!;
      const baseline = comparison.rows.find((row) => row.chunkSize === 256 * 1024)!;
      assert.equal(second.newBytesStored, selected.newBytesStored);
      assert.ok(selected.newBytesStored <= baseline.newBytesStored / 2, "same edit materially improves over 256 KiB baseline");
      assert.equal(point.chunks.length, Math.ceil(point.totalBytes / RESTORE_POINT_CHUNK_BYTES));
      assert.ok(point.chunks.length > 500, "exercise higher catalogue/reference counts");
      await store.collectGarbage("large-budget");
      assert.deepEqual(await store.read("large-budget", point.id, collectRestorePointBytes), image);
      console.log(JSON.stringify({ mode, comparison, actualManifestBytes: Buffer.byteLength(JSON.stringify(second)), initialCaptureMs, editCaptureMs, restoreMs, identicalNewBytes: identical.newBytesStored }));
      other.prepare("INSERT INTO transactions VALUES (40000, 'after capture')").run();
    } finally {
      closeSync(readHandle);
      other.close();
      database.close();
      assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + "\\") || resolve(directory).startsWith(resolve(tmpdir()) + "/"));
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const fault of ["none", "last-chunk", "database-hash"] as const) {
  test(`shipped prepareRestorePoint streams into staging and verifies before promotion (${fault})`, async () => {
    const db = new Database(":memory:");
    db.pragma("page_size=8192");
    db.exec("CREATE TABLE fixture (id INTEGER PRIMARY KEY, content BLOB)");
    db.prepare("INSERT INTO fixture VALUES (1, zeroblob(?))").run(2 * 1024 * 1024);
    const original = db.serialize();
    const memory = memoryRestorePointFiles();
    const store = createRestorePointStore(memory.forBudget);
    const counts = emptyDomainCounts();
    const point = await store.capture({ budgetId: "A", budgetName: "A", reason: "manual",
      createdAt: new Date().toISOString(), syncEpoch: "old", localRevision: 1, mutationCount: 1, counts },
      original.length, async (offset, length) => original.subarray(offset, offset + length));
    const entries = memory.budget("A").entries;
    if (fault === "last-chunk") entries.delete(`chunks/${point.chunks.at(-1)!.hash}.bin`);
    if (fault === "database-hash") entries.set(`manifests/${point.id}.json`, new File([
      JSON.stringify({ ...point, databaseHash: "0".repeat(64) }),
    ], "manifest"));
    const events: string[] = [];
    const appended: Uint8Array[] = [];
    let received = 0;
    const promotion = { manifest: { budgetId: "A", syncEpoch: "old", counts, physicalFilename: "candidate" }, supersededPhysicalFilename: "original" };
    const context = {
      database: {}, activeBudgetId: "A", activeSyncEpoch: "old", stagedImport: null, replacement: null, restoreCandidate: null,
      testRestorePointStore: () => store,
      workerError: (code: string, message: string) => Object.assign(new Error(message), { code }),
      beginBaselineReplacement: async (input: { totalBytes: number }) => {
        assert.equal(input.totalBytes, original.length); events.push("begin-stage");
      },
      appendBaselineReplacement: async (offset: number, chunk: Uint8Array) => {
        assert.equal(offset, received);
        assert.ok(chunk.length <= RESTORE_POINT_CHUNK_BYTES);
        assert.equal(chunk.byteOffset, 0);
        assert.equal(chunk.buffer.byteLength, chunk.length);
        appended.push(chunk); received += chunk.length;
      },
      commitBaselineReplacement: async () => {
        assert.deepEqual(Buffer.concat(appended), original);
        events.push("commit-candidate"); return promotion;
      },
      resultRows: () => [{ quick_check: "ok" }], REQUIRED_BUDGET_DOMAINS: Object.keys(counts),
      execute: (sql: string) => { events.push(sql); },
      writeMetadata: (key: string, value: string) => { events.push(`${key}:${value}`); },
      currentManifest: () => ({ ...promotion.manifest, syncEpoch: "fresh" }),
      abortBaselineReplacement: async () => { events.push("abort-stage"); },
      abortPreparedRestorePoint: async () => { events.push("abort-candidate"); },
    };
    try {
      const prepare = runInNewContext(`${prepareSource}\nprepareRestorePoint`, context);
      const input = { requestId: "test", budgetId: "A", pointId: point.id, syncEpoch: "fresh", deviceId: "device" };
      if (fault === "none") {
        const result = await prepare(input);
        assert.equal(result.manifest.syncEpoch, "fresh");
        assert.ok(events.includes("commit-candidate"));
        assert.ok(events.includes("syncEpoch:fresh"));
      } else {
        await assert.rejects(prepare(input));
        assert.equal(events.includes("commit-candidate"), false);
        assert.equal(events.includes("syncEpoch:fresh"), false);
        assert.deepEqual(events.slice(-2), ["abort-stage", "abort-candidate"]);
      }
    } finally { db.close(); }
  });
}
