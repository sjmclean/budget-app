import { resolve } from "node:path";

export function readServerRuntimeConfig({ env = process.env, serverPackageDir, repositoryRoot }) {
  const port = parsePort(env.PORT ?? "3000");
  const host = readNonEmpty(env.HOST ?? "0.0.0.0", "HOST");
  const dataDir = resolve(env.BUDGET_APP_DATA_DIR ?? `${serverPackageDir}/data`);
  const databasePath = resolve(env.BUDGET_APP_DATABASE_PATH ?? `${dataDir}/shared-budget.sqlite`);
  const webDist = resolve(env.BUDGET_APP_WEB_DIST ?? `${repositoryRoot}/apps/web/dist`);
  const replicationBlobDir = resolve(
    env.BUDGET_APP_REPLICATION_BLOB_DIR ?? `${dataDir}/replication-blobs`,
  );
  const shutdownTimeoutMs = parsePositiveInteger(
    env.BUDGET_APP_SHUTDOWN_TIMEOUT_MS ?? "10000",
    "BUDGET_APP_SHUTDOWN_TIMEOUT_MS",
  );
  const exposePaths = parseBoolean(env.BUDGET_APP_EXPOSE_PATHS ?? "false", "BUDGET_APP_EXPOSE_PATHS");
  const migrationBackupDir = resolve(
    env.BUDGET_APP_MIGRATION_BACKUP_DIR ?? `${dataDir}/migration-backups`,
  );
  const backupBeforeMigration = parseBoolean(
    env.BUDGET_APP_BACKUP_BEFORE_MIGRATION ?? "true",
    "BUDGET_APP_BACKUP_BEFORE_MIGRATION",
  );
  const operationalBackupDir = resolve(
    env.BUDGET_APP_OPERATIONAL_BACKUP_DIR ?? `${dataDir}/operational-backups`,
  );
  const operationalBackupIntervalMs = parsePositiveInteger(
    env.BUDGET_APP_OPERATIONAL_BACKUP_INTERVAL_MS ?? "21600000",
    "BUDGET_APP_OPERATIONAL_BACKUP_INTERVAL_MS",
  );
  const operationalBackupRetention = parsePositiveInteger(
    env.BUDGET_APP_OPERATIONAL_BACKUP_RETENTION ?? "3",
    "BUDGET_APP_OPERATIONAL_BACKUP_RETENTION",
  );
  const operationalBackupMaximumBytes = parsePositiveInteger(
    env.BUDGET_APP_OPERATIONAL_BACKUP_MAXIMUM_BYTES ?? String(10 * 1024 ** 3),
    "BUDGET_APP_OPERATIONAL_BACKUP_MAXIMUM_BYTES",
  );
  const operationalBackupMinimumFreeBytes = parsePositiveInteger(
    env.BUDGET_APP_OPERATIONAL_BACKUP_MINIMUM_FREE_BYTES ?? String(2 * 1024 ** 3),
    "BUDGET_APP_OPERATIONAL_BACKUP_MINIMUM_FREE_BYTES",
  );
  const operationalBackupRecentMaximumAgeMs = parsePositiveInteger(
    env.BUDGET_APP_OPERATIONAL_BACKUP_RECENT_MAXIMUM_AGE_MS ?? "3600000",
    "BUDGET_APP_OPERATIONAL_BACKUP_RECENT_MAXIMUM_AGE_MS",
  );
  const abandonedImportMaximumAgeMs = parsePositiveInteger(
    env.BUDGET_APP_ABANDONED_IMPORT_MAXIMUM_AGE_MS ?? "86400000",
    "BUDGET_APP_ABANDONED_IMPORT_MAXIMUM_AGE_MS",
  );

  return {
    port,
    host,
    dataDir,
    databasePath,
    webDist,
    replicationBlobDir,
    shutdownTimeoutMs,
    exposePaths,
    migrationBackupDir,
    backupBeforeMigration,
    operationalBackupDir,
    operationalBackupIntervalMs,
    operationalBackupRetention,
    operationalBackupMaximumBytes,
    operationalBackupMinimumFreeBytes,
    operationalBackupRecentMaximumAgeMs,
    abandonedImportMaximumAgeMs,
  };
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseBoolean(value, name) {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`${name} must be true or false.`);
}

function readNonEmpty(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must not be empty.`);
  }
  return value.trim();
}
