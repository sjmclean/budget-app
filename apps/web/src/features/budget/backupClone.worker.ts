/// <reference lib="webworker" />

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { LOCAL_BUDGET_SCHEMA_VERSION } from "../persistence/localFirst/contracts";

type SqliteDatabase = {
  pointer: unknown;
  exec(options: string | {
    sql: string;
    bind?: readonly unknown[];
    returnValue?: "resultRows";
    rowMode?: "object";
  }): unknown;
  checkRc(resultCode: number): void;
  close(): void;
};

interface CloneRequest {
  readonly type: "clone";
  readonly requestId: string;
  readonly bytes: Uint8Array;
  readonly targetBudgetId: string;
  readonly targetSyncEpoch: string;
  readonly deviceId: string;
}

interface CloneSuccessResponse {
  readonly requestId: string;
  readonly ok: true;
  readonly sourceBudgetId: string;
  readonly bytes: Uint8Array;
}

interface CloneFailureResponse {
  readonly requestId: string;
  readonly ok: false;
  readonly error: string;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function resultRows<T>(database: SqliteDatabase, sql: string, bind: readonly unknown[] = []): T[] {
  return database.exec({
    sql,
    bind,
    returnValue: "resultRows",
    rowMode: "object",
  }) as T[];
}

function execute(database: SqliteDatabase, sql: string, bind: readonly unknown[] = []): void {
  database.exec({ sql, bind });
}

function tableExists(database: SqliteDatabase, tableName: string): boolean {
  return resultRows<{ found: number }>(
    database,
    "SELECT 1 AS found FROM sqlite_schema WHERE type = 'table' AND name = ? LIMIT 1",
    [tableName],
  ).length > 0;
}

function assertQuickCheck(database: SqliteDatabase): void {
  const rows = resultRows<Record<string, unknown>>(database, "PRAGMA quick_check");
  if (rows.length !== 1 || Object.values(rows[0] ?? {})[0] !== "ok") {
    throw new Error("The selected SQLite backup failed its integrity check.");
  }
}

function replaceBudgetIdentity(value: unknown, sourceBudgetId: string, targetBudgetId: string): unknown {
  if (value === sourceBudgetId) return targetBudgetId;
  if (Array.isArray(value)) {
    return value.map((entry) => replaceBudgetIdentity(entry, sourceBudgetId, targetBudgetId));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        replaceBudgetIdentity(entry, sourceBudgetId, targetBudgetId),
      ]),
    );
  }
  return value;
}

function rewriteJsonColumns(
  database: SqliteDatabase,
  tableNames: readonly string[],
  sourceBudgetId: string,
  targetBudgetId: string,
): void {
  for (const tableName of tableNames) {
    if (tableName === "local_budget_outbox" || tableName === "local_budget_sync_conflicts") continue;

    const schema = resultRows<{ sql: string | null }>(
      database,
      "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ? LIMIT 1",
      [tableName],
    )[0]?.sql ?? "";
    const columns = resultRows<{ name: string }>(
      database,
      `PRAGMA table_info(${quoteIdentifier(tableName)})`,
    );
    const jsonColumns = columns
      .map(({ name }) => name)
      .filter((name) => name.endsWith("_json"));

    if (jsonColumns.length === 0) continue;
    if (/\bWITHOUT\s+ROWID\b/i.test(schema)) {
      throw new Error(`Backup table ${tableName} cannot be safely re-keyed.`);
    }

    for (const columnName of jsonColumns) {
      const rows = resultRows<{ rowId: number; jsonValue: string }>(
        database,
        `SELECT rowid AS rowId, ${quoteIdentifier(columnName)} AS jsonValue
         FROM ${quoteIdentifier(tableName)}
         WHERE ${quoteIdentifier(columnName)} IS NOT NULL`,
      );

      for (const row of rows) {
        if (typeof row.jsonValue !== "string" || !row.jsonValue.includes(sourceBudgetId)) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(row.jsonValue);
        } catch {
          throw new Error(`Backup table ${tableName}.${columnName} contains invalid JSON.`);
        }
        const rewritten = JSON.stringify(
          replaceBudgetIdentity(parsed, sourceBudgetId, targetBudgetId),
        );
        execute(
          database,
          `UPDATE ${quoteIdentifier(tableName)}
           SET ${quoteIdentifier(columnName)} = ?
           WHERE rowid = ?`,
          [rewritten, row.rowId],
        );
      }
    }
  }
}

function rekeyBackup(
  database: SqliteDatabase,
  targetBudgetId: string,
  targetSyncEpoch: string,
  deviceId: string,
): string {
  if (!tableExists(database, "local_budget_metadata")) {
    throw new Error("This SQLite file is not a Budget App backup.");
  }

  const metadataRows = resultRows<{ key: string; value: string }>(
    database,
    "SELECT key, value FROM local_budget_metadata",
  );
  const metadata = new Map(metadataRows.map(({ key, value }) => [key, value]));
  const sourceBudgetId = metadata.get("budgetId")?.trim() ?? "";
  const schemaVersion = Number(metadata.get("schemaVersion") ?? "NaN");

  if (!sourceBudgetId) {
    throw new Error("The backup does not contain a valid budget identity.");
  }
  if (schemaVersion !== LOCAL_BUDGET_SCHEMA_VERSION) {
    throw new Error(
      `This backup uses SQLite budget schema ${Number.isFinite(schemaVersion) ? schemaVersion : "unknown"}; ` +
      `Budget App currently requires schema ${LOCAL_BUDGET_SCHEMA_VERSION}.`,
    );
  }
  if (sourceBudgetId === targetBudgetId) {
    throw new Error("The restored budget must use a new identity.");
  }

  const tableNames = resultRows<{ name: string }>(
    database,
    `SELECT name FROM sqlite_schema
     WHERE type = 'table' AND name LIKE 'local_%'
     ORDER BY name`,
  ).map(({ name }) => name);

  execute(database, "PRAGMA foreign_keys = OFF");
  execute(database, "BEGIN IMMEDIATE");
  try {
    for (const tableName of tableNames) {
      const columns = resultRows<{ name: string }>(
        database,
        `PRAGMA table_info(${quoteIdentifier(tableName)})`,
      );
      if (columns.some(({ name }) => name === "budget_id")) {
        execute(
          database,
          `UPDATE ${quoteIdentifier(tableName)} SET budget_id = ? WHERE budget_id = ?`,
          [targetBudgetId, sourceBudgetId],
        );
      }
    }

    rewriteJsonColumns(database, tableNames, sourceBudgetId, targetBudgetId);

    if (tableExists(database, "local_budget_outbox")) {
      execute(database, "DELETE FROM local_budget_outbox");
    }
    if (tableExists(database, "local_budget_sync_conflicts")) {
      execute(database, "DELETE FROM local_budget_sync_conflicts");
    }
    if (tableExists(database, "local_budget_projection_cache")) {
      execute(database, "DELETE FROM local_budget_projection_cache");
    }
    if (tableExists(database, "local_budget_projection_dirty")) {
      execute(database, "DELETE FROM local_budget_projection_dirty");
    }

    execute(database, "DELETE FROM local_budget_metadata WHERE key IN ('baselineHash')");
    const metadataUpdates: readonly [string, string][] = [
      ["budgetId", targetBudgetId],
      ["syncEpoch", targetSyncEpoch],
      ["schemaVersion", String(LOCAL_BUDGET_SCHEMA_VERSION)],
      ["deviceId", deviceId],
      ["localRevision", "0"],
      ["pulledCursor", "0"],
    ];
    for (const [key, value] of metadataUpdates) {
      execute(
        database,
        `INSERT INTO local_budget_metadata(key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value],
      );
    }

    for (const tableName of tableNames) {
      const columns = resultRows<{ name: string }>(
        database,
        `PRAGMA table_info(${quoteIdentifier(tableName)})`,
      );
      if (!columns.some(({ name }) => name === "budget_id")) continue;
      const remaining = resultRows<{ count: number }>(
        database,
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)} WHERE budget_id = ?`,
        [sourceBudgetId],
      )[0]?.count ?? 0;
      if (remaining !== 0) {
        throw new Error(`Backup table ${tableName} still contains the original budget identity.`);
      }
    }

    execute(database, "COMMIT");
  } catch (error) {
    execute(database, "ROLLBACK");
    throw error;
  } finally {
    execute(database, "PRAGMA foreign_keys = ON");
  }

  const foreignKeyViolations = resultRows<Record<string, unknown>>(database, "PRAGMA foreign_key_check");
  if (foreignKeyViolations.length > 0) {
    throw new Error("The cloned backup failed foreign-key validation.");
  }
  assertQuickCheck(database);
  return sourceBudgetId;
}

self.onmessage = async (event: MessageEvent<CloneRequest>) => {
  const request = event.data;
  if (!request || request.type !== "clone") return;

  let database: SqliteDatabase | null = null;
  try {
    if (!(request.bytes instanceof Uint8Array) || request.bytes.byteLength < 16) {
      throw new Error("The selected file is too small to be a SQLite budget backup.");
    }
    const header = new TextDecoder().decode(request.bytes.subarray(0, 16));
    if (header !== "SQLite format 3\u0000") {
      throw new Error("The selected file is not a SQLite budget backup.");
    }

    const sqlite3 = await sqlite3InitModule();
    const allocation = sqlite3.wasm.allocFromTypedArray(request.bytes);
    database = new sqlite3.oo1.DB() as unknown as SqliteDatabase;
    const resultCode = sqlite3.capi.sqlite3_deserialize(
      database.pointer,
      "main",
      allocation,
      request.bytes.byteLength,
      request.bytes.byteLength,
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
        sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
    );
    database.checkRc(resultCode);
    assertQuickCheck(database);

    const sourceBudgetId = rekeyBackup(
      database,
      request.targetBudgetId,
      request.targetSyncEpoch,
      request.deviceId,
    );
    const clonedBytes = sqlite3.capi.sqlite3_js_db_export(database.pointer);
    database.close();
    database = null;

    const response: CloneSuccessResponse = {
      requestId: request.requestId,
      ok: true,
      sourceBudgetId,
      bytes: clonedBytes,
    };
    self.postMessage(response, [clonedBytes.buffer as ArrayBuffer]);
  } catch (error) {
    try {
      database?.close();
    } catch {
      // Best-effort cleanup of the in-memory clone only.
    }
    const response: CloneFailureResponse = {
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : "The backup could not be cloned.",
    };
    self.postMessage(response);
  }
};
