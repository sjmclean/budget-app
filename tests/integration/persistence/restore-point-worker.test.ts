import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";
import test from "node:test";
import Database from "better-sqlite3";
import ts from "typescript";
import { createRestorePointStore, type RestorePointFiles } from "../../../apps/web/src/features/budget/restorePointStore";
import { emptyDomainCounts } from "../../../apps/web/src/features/persistence/localFirst/contracts";

// Execute the shipped capture function with real SQLite locking/serialization.
// OPFS handles are an adapter, not a claim of browser-engine coverage.
const source = readFileSync(new URL("../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("worker.ts", source, ts.ScriptTarget.Latest, true);
const declaration = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "captureRestorePoint");
assert.ok(declaration);
const captureSource = ts.transpile(declaration.getText(parsed).replace(
  'await import("../../budget/restorePointStore")', "({ createRestorePointStore: testRestorePointStore })",
), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext });

for (const mode of ["opfs", "opfs-sahpool", "wal"] as const) {
  test(`${mode}: a 30,001-transaction SQLite snapshot is complete and excludes concurrent writers`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "restore-worker-"));
    const filename = join(directory, "active.sqlite3");
    const database = new Database(filename);
    database.pragma(`journal_mode = ${mode === "wal" ? "WAL" : "DELETE"}`);
    database.exec("CREATE TABLE transactions(id INTEGER PRIMARY KEY, memo TEXT)");
    database.transaction(() => {
      const insert = database.prepare("INSERT INTO transactions VALUES (?, ?)");
      for (let id = 1; id <= 30_001; id++) insert.run(id, `Imported transaction ${id}`);
    })();
    const other = new Database(filename, { timeout: 0 });
    const files = new Map<string, File>();
    const port: RestorePointFiles = {
      names: async () => [...files.keys()],
      read: async (name) => { const file = files.get(name); if (!file) throw new Error("missing"); return file; },
      write: async (name, chunks) => {
        const parts: Uint8Array<ArrayBuffer>[] = [];
        for await (const chunk of chunks) parts.push(Uint8Array.from(chunk));
        files.set(name, new File(parts, name));
      },
      remove: async (name) => { files.delete(name); },
    };
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
      testRestorePointStore: () => createRestorePointStore(port),
      workerError: (code: string, message: string) => Object.assign(new Error(message), { code }),
      navigator: { storage: { getDirectory: async () => ({
        getFileHandle: async () => ({ getFile: async () => new File([readFileSync(filename)], "active.sqlite3") }),
      }) } },
      readBaselineExportChunk: async (offset: number, length: number) => {
        writerIsBlocked();
        return new Uint8Array(readFileSync(filename).subarray(offset, offset + length));
      },
      Uint8Array, Date, Promise,
    };
    try {
      const capture = runInNewContext(`${captureSource}\ncaptureRestorePoint`, context);
      const point = await capture({ budgetName: "Large import", reason: "initial-import", mutationCount: 0 });
      assert.equal(point.counts.transactions, 30_001);
      const stored = await createRestorePointStore(port).read("large-budget", point.id);
      const snapshot = new Database(Buffer.from(await stored.file.arrayBuffer()));
      try {
        assert.equal(snapshot.prepare("SELECT COUNT(*) AS count FROM transactions").get().count, 30_001);
        assert.equal(snapshot.pragma("quick_check", { simple: true }), "ok");
      } finally { snapshot.close(); }
      assert.deepEqual(events, ["BEGIN IMMEDIATE", "ROLLBACK"]);
      other.prepare("INSERT INTO transactions VALUES (40000, 'after capture')").run();
    } finally {
      other.close();
      database.close();
      assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + "\\") || resolve(directory).startsWith(resolve(tmpdir()) + "/"));
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
