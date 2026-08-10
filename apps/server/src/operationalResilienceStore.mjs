import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

const BACKUP_SUFFIX = ".sqlite";
const BACKUP_FORMAT = "budget-app.hosted-sqlite-operational-backup.v1";

export function openResilientHostedDatabase(Database, options) {
  const { databasePath, backupDirectory } = options;
  mkdirSync(dirname(databasePath), { recursive: true });
  mkdirSync(backupDirectory, { recursive: true });
  let database;
  try {
    database = new Database(databasePath);
    assertDatabaseReadable(database);
    return { database, startupRecovery: null };
  } catch (originalError) {
    try { database?.close(); } catch {}
    const backup = listVerifiedBackups(Database, backupDirectory)[0];
    if (!backup) throw originalError;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const preservedPath = `${databasePath}.corrupt-${timestamp}`;
    if (existsSync(databasePath)) renameSync(databasePath, preservedPath);
    rmSync(`${databasePath}-wal`, { force: true });
    rmSync(`${databasePath}-shm`, { force: true });
    copyFileSync(backup.path, databasePath);
    database = new Database(databasePath);
    assertDatabaseReadable(database);
    return {
      database,
      startupRecovery: {
        recovered: true,
        backupPath: backup.path,
        preservedCorruptPath: preservedPath,
        recoveredAt: new Date().toISOString(),
      },
    };
  }
}

export function createOperationalResilienceStore(database, options) {
  const {
    Database,
    databasePath,
    backupDirectory,
    retentionCount = 7,
    maximumRetainedBytes = 10 * 1024 ** 3,
    minimumFreeBytes = 2 * 1024 ** 3,
    recentBackupMaximumAgeMs = 60 * 60 * 1000,
    exposePaths = false,
    startupRecovery = null,
    capacityProvider = () => filesystemAvailableBytes(backupDirectory),
    now = () => new Date(),
  } = options;
  mkdirSync(backupDirectory, { recursive: true });
  cleanupBackupSidecars(backupDirectory);
  let runningBackup = null;
  let lastBackup = null;
  let lastError = null;

  async function createVerifiedBackup(reason = "scheduled") {
    if (runningBackup) return runningBackup;
    runningBackup = (async () => {
      cleanupBackupSidecars(backupDirectory);
      const createdAt = now();
      const recent = readNewestBackupDescriptor(backupDirectory);
      if (
        reason === "startup" &&
        recent &&
        createdAt.getTime() - new Date(recent.createdAt).getTime() <=
          recentBackupMaximumAgeMs
      ) {
        lastBackup = {
          ...recent,
          path: exposePaths ? recent.path : basename(recent.path),
          outcome: "reused",
        };
        lastError = null;
        return lastBackup;
      }
      const expectedBytes = statSync(databasePath).size;
      pruneBackups(
        backupDirectory,
        Math.max(1, retentionCount - 1),
        Math.max(0, maximumRetainedBytes - expectedBytes),
      );
      const availableBytes = capacityProvider();
      if (
        expectedBytes > maximumRetainedBytes ||
        availableBytes < expectedBytes + minimumFreeBytes
      ) {
        lastBackup = {
          outcome: "skipped",
          reason: expectedBytes > maximumRetainedBytes
            ? "database-exceeds-backup-byte-limit"
            : "insufficient-free-space",
          createdAt: createdAt.toISOString(),
          expectedBytes,
          availableBytes,
          minimumFreeBytes,
          maximumRetainedBytes,
        };
        lastError = null;
        return lastBackup;
      }
      const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
      const finalPath = join(
        backupDirectory,
        `hosted-${stamp}-${randomUUID().slice(0, 8)}${BACKUP_SUFFIX}`,
      );
      const temporaryPath = `${finalPath}.partial`;
      try {
        await database.backup(temporaryPath);
        const verified = verifyDatabaseFile(Database, temporaryPath);
        renameSync(temporaryPath, finalPath);
        const manifest = {
          format: BACKUP_FORMAT,
          createdAt: createdAt.toISOString(),
          reason,
          byteLength: statSync(finalPath).size,
          integrity: verified.integrity,
        };
        writeFileSync(`${finalPath}.json`, JSON.stringify(manifest, null, 2));
        cleanupBackupSidecars(backupDirectory);
        pruneBackups(backupDirectory, retentionCount, maximumRetainedBytes);
        lastBackup = {
          ...manifest,
          path: exposePaths ? finalPath : basename(finalPath),
          outcome: "created",
        };
        lastError = null;
        return lastBackup;
      } catch (error) {
        removeBackupTemporaryFiles(temporaryPath);
        lastError = error instanceof Error ? error.message : "Backup failed.";
        throw error;
      } finally {
        runningBackup = null;
      }
    })().finally(() => {
      runningBackup = null;
    });
    return runningBackup;
  }

  function diagnostics(budgetId) {
    const integrity = readIntegrity(database);
    const active = database.prepare(`
      SELECT sync_epoch AS syncEpoch, baseline_id AS baselineId,
        latest_cursor AS latestCursor, reset_at AS resetAt
      FROM local_first_sync_epochs
      WHERE budget_id = ?
    `).get(budgetId) ?? null;
    const abandoned = database.prepare(`
      SELECT COUNT(*) AS count
      FROM local_first_baselines
      WHERE budget_id = ? AND state = 'staging'
    `).get(budgetId)?.count ?? 0;
    return {
      budgetId,
      databaseIntegrity: integrity,
      activeSyncEpoch: active,
      availableBackupCount: listBackupFiles(backupDirectory).length,
      retainedBackupBytes: totalBackupBytes(backupDirectory),
      lastBackup,
      lastBackupError: lastError,
      abandonedBaselineCount: abandoned,
      startupRecovery: startupRecovery
        ? {
            ...startupRecovery,
            backupPath: exposePaths ? startupRecovery.backupPath : basename(startupRecovery.backupPath),
            preservedCorruptPath: exposePaths
              ? startupRecovery.preservedCorruptPath
              : basename(startupRecovery.preservedCorruptPath),
          }
        : null,
    };
  }

  return { createVerifiedBackup, diagnostics };
}

export function assertDatabaseIntegrity(database) {
  const result = readIntegrity(database);
  if (!result.ok) throw new Error(`SQLite integrity check failed: ${result.message}`);
  return result;
}

/**
 * Startup must not synchronously scan every page of a large hosted database
 * before the HTTP listener is opened. This validates the SQLite header,
 * schema catalogue and primary generation pointer using bounded reads.
 * Independently created backup files still receive a full quick_check.
 */
export function assertDatabaseReadable(database) {
  database.prepare("SELECT name FROM sqlite_schema ORDER BY name LIMIT 1").get();
  database.pragma("schema_version", { simple: true });
  return true;
}

function readIntegrity(database) {
  try {
    const rows = database.prepare("PRAGMA quick_check").all();
    const messages = rows.map((row) => String(Object.values(row)[0]));
    return {
      ok: messages.length === 1 && messages[0] === "ok",
      message: messages.join("; "),
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Integrity check failed.",
      checkedAt: new Date().toISOString(),
    };
  }
}

function verifyDatabaseFile(Database, path) {
  const candidate = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return { integrity: assertDatabaseIntegrity(candidate) };
  } finally {
    candidate.close();
  }
}

function listVerifiedBackups(Database, backupDirectory) {
  const verified = [];
  for (const path of listBackupFiles(backupDirectory)) {
    try {
      verifyDatabaseFile(Database, path);
      verified.push({ path, modifiedAt: statSync(path).mtimeMs });
    } catch {}
  }
  return verified.sort((left, right) => right.modifiedAt - left.modifiedAt);
}

function listBackupFiles(backupDirectory) {
  if (!existsSync(backupDirectory)) return [];
  return readdirSync(backupDirectory)
    .filter((name) => name.startsWith("hosted-") && name.endsWith(BACKUP_SUFFIX))
    .map((name) => join(backupDirectory, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
}

function pruneBackups(backupDirectory, retentionCount, maximumRetainedBytes = Infinity) {
  const backups = listBackupFiles(backupDirectory);
  let retainedBytes = backups.reduce((total, path) => total + statSync(path).size, 0);
  while (
    backups.length > retentionCount ||
    (backups.length > 1 && retainedBytes > maximumRetainedBytes)
  ) {
    const path = backups.pop();
    if (!path) break;
    const byteLength = statSync(path).size;
    rmSync(path, { force: true });
    rmSync(`${path}.json`, { force: true });
    retainedBytes -= byteLength;
  }
}

function readNewestBackupDescriptor(backupDirectory) {
  for (const path of listBackupFiles(backupDirectory)) {
    try {
      const manifest = JSON.parse(readFileSync(`${path}.json`, "utf8"));
      if (
        manifest.format === BACKUP_FORMAT &&
        manifest.integrity?.ok === true &&
        manifest.byteLength === statSync(path).size &&
        Number.isFinite(new Date(manifest.createdAt).getTime())
      ) {
        return { ...manifest, path };
      }
    } catch {}
  }
  return null;
}

function totalBackupBytes(backupDirectory) {
  return listBackupFiles(backupDirectory)
    .reduce((total, path) => total + statSync(path).size, 0);
}

function filesystemAvailableBytes(path) {
  const statistics = statfsSync(path);
  return Number(statistics.bavail) * Number(statistics.bsize);
}

function cleanupBackupSidecars(backupDirectory) {
  if (!existsSync(backupDirectory)) return 0;
  let removed = 0;
  for (const name of readdirSync(backupDirectory)) {
    if (!/\.partial(?:$|-(?:wal|shm|journal)$)/.test(name)) continue;
    rmSync(join(backupDirectory, name), { force: true });
    removed += 1;
  }
  return removed;
}

function removeBackupTemporaryFiles(temporaryPath) {
  for (const path of [
    temporaryPath,
    `${temporaryPath}-wal`,
    `${temporaryPath}-shm`,
    `${temporaryPath}-journal`,
  ]) {
    rmSync(path, { force: true });
  }
}
