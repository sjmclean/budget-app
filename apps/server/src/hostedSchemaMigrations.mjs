import { createHash } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ensureScopedSchema } from "./replicationStore.mjs";

export const HOSTED_SCHEMA_VERSION = 4;

const REQUIRED_BASELINE = {
  budget_engine_generations: ["budget_id", "generation_id", "state", "activated_at"],
  budget_import_sessions: [
    "generation_id", "budget_id", "budget_name", "currency", "state",
    "account_count", "transaction_count", "transfer_link_count",
  ],
  budget_import_accounts: [
    "generation_id", "id", "name", "type", "participation",
    "opening_balance", "closed_at",
  ],
  budget_import_payees: [
    "generation_id", "id", "name", "is_archived", "note",
    "default_category_id", "default_category_name", "import_rules_json",
  ],
  budget_import_categories: [
    "generation_id", "id", "name", "group_id", "group_name", "sort_order",
  ],
  budget_import_transactions: [
    "generation_id", "id", "account_id", "date", "amount",
    "cleared_status", "transfer_transaction_id", "is_uncategorized",
  ],
  budget_import_transaction_splits: [
    "generation_id", "transaction_id", "id", "amount", "sort_order",
  ],
  budget_import_transaction_tags: [
    "generation_id", "id", "name", "colour", "sort_order",
  ],
  budget_import_transaction_tag_assignments: [
    "generation_id", "transaction_id", "tag_id",
  ],
  budget_import_scheduled_transactions: [
    "generation_id", "id", "account_id", "next_due_date", "frequency",
    "recurrence_interval", "recurrence_unit", "recurrence_anchor_date",
  ],
  budget_import_scheduled_transaction_splits: [
    "generation_id", "scheduled_transaction_id", "id", "sort_order",
  ],
  budget_import_scheduled_transaction_tags: [
    "generation_id", "scheduled_transaction_id", "tag_id",
  ],
  budget_import_month_views: ["generation_id", "month", "view_json", "updated_at"],
};

export const DEFAULT_HOSTED_SCHEMA_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: "baseline-hosted-sqlite-generation-schema",
    description:
      "Verify and baseline the hosted generation, ledger, tag, schedule, and budget-month schema.",
    up(database) {
      if (tableExists(database, "budget_engine_generations")) {
        validateHostedSchemaBaseline(database);
      }
    },
  },
  {
    version: 2,
    name: "multi-user-authentication-and-budget-memberships",
    description:
      "Add password-authenticated users, revocable sessions, and budget-scoped roles.",
    up(database) {
      database.exec(`
        CREATE TABLE hosted_users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          email_normalized TEXT NOT NULL UNIQUE,
          password_salt TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          disabled_at TEXT
        );
        CREATE TABLE hosted_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES hosted_users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          revoked_at TEXT
        );
        CREATE INDEX hosted_sessions_user_expiry
          ON hosted_sessions(user_id, expires_at);
        CREATE TABLE hosted_budget_memberships (
          budget_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES hosted_users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'owner')),
          created_at TEXT NOT NULL,
          PRIMARY KEY (budget_id, user_id)
        );
        CREATE INDEX hosted_budget_memberships_user
          ON hosted_budget_memberships(user_id, budget_id);
      `);
    },
  },
  {
    version: 3,
    name: "budget-scoped-replication",
    description:
      "Replace the unsafe global replication stream with isolated per-budget generations.",
    up(database) {
      const columns = database.prepare(
        "PRAGMA table_info(replication_generations)",
      ).all();
      if (columns.some(({ name }) => name === "budget_id")) {
        ensureScopedSchema(database);
        return;
      }
      for (const table of [
        "replication_generations",
        "replication_operations",
        "replication_checkpoints",
        "replication_blobs",
      ]) {
        const exists = database.prepare(`
          SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
        `).get(table);
        if (exists) {
          database.exec(`ALTER TABLE ${table} RENAME TO legacy_global_${table}`);
        }
      }
      ensureScopedSchema(database);
    },
  },
  {
    version: 4,
    name: "remove-retired-hosted-budget-engine-schema",
    description:
      "Remove the retired hosted import and budget-domain tables after the local-first SQLite cutover.",
    up(database) {
      database.exec(`
        DROP TABLE IF EXISTS budget_import_scheduled_transaction_tags;
        DROP TABLE IF EXISTS budget_import_scheduled_transaction_splits;
        DROP TABLE IF EXISTS budget_import_scheduled_transactions;
        DROP TABLE IF EXISTS budget_import_transaction_tag_assignments;
        DROP TABLE IF EXISTS budget_import_transaction_tags;
        DROP TABLE IF EXISTS budget_import_transaction_splits;
        DROP TABLE IF EXISTS budget_import_transactions;
        DROP TABLE IF EXISTS budget_import_month_views;
        DROP TABLE IF EXISTS budget_import_account_aggregates;
        DROP TABLE IF EXISTS budget_import_categories;
        DROP TABLE IF EXISTS budget_import_payees;
        DROP TABLE IF EXISTS budget_import_accounts;
        DROP TABLE IF EXISTS budget_import_sessions;
        DROP TABLE IF EXISTS budget_engine_generations;
      `);
    },
  },
]);

export function readHostedSchemaVersion(database) {
  const journalExists = Boolean(database.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'hosted_schema_migrations'
  `).get());
  return journalExists
    ? database.prepare(
        "SELECT COALESCE(MAX(version), 0) AS version FROM hosted_schema_migrations",
      ).get().version
    : 0;
}

export async function prepareHostedSchemaMigrationBackup(database, options = {}) {
  const migrations = validateMigrationManifest(
    options.migrations ?? DEFAULT_HOSTED_SCHEMA_MIGRATIONS,
  );
  const latestApplied = readHostedSchemaVersion(database);
  const latestSupported = migrations.at(-1)?.version ?? 0;
  if (latestApplied > latestSupported) {
    throw migrationError(
      "HOSTED_SCHEMA_TOO_NEW",
      `Hosted database schema version ${latestApplied} is newer than this application supports (${latestSupported}).`,
    );
  }
  if (
    latestApplied === latestSupported ||
    options.backupBeforeMigration === false ||
    !options.databasePath ||
    options.databasePath === ":memory:"
  ) {
    return null;
  }
  const applicationTableCount = database.prepare(`
    SELECT COUNT(*) AS count FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).get().count;
  if (applicationTableCount === 0) return null;
  return createPreMigrationBackup(database, {
    databasePath: options.databasePath,
    backupDirectory: options.backupDirectory,
    targetVersion: latestSupported,
    now: options.now,
    backup: options.backup,
  });
}

export async function runHostedSchemaMigrations(database, options = {}) {
  const migrations = validateMigrationManifest(
    options.migrations ?? DEFAULT_HOSTED_SCHEMA_MIGRATIONS,
  );
  initializeMigrationJournal(database);
  const applied = readAppliedMigrations(database);
  const latestSupported = migrations.at(-1)?.version ?? 0;
  const latestApplied = Math.max(0, ...applied.keys());

  if (latestApplied > latestSupported) {
    throw migrationError(
      "HOSTED_SCHEMA_TOO_NEW",
      `Hosted database schema version ${latestApplied} is newer than this application supports (${latestSupported}).`,
    );
  }

  for (const migration of migrations) {
    const existing = applied.get(migration.version);
    if (!existing) continue;
    const checksum = migrationChecksum(migration);
    if (existing.name !== migration.name || existing.checksum !== checksum) {
      throw migrationError(
        "HOSTED_MIGRATION_HISTORY_MISMATCH",
        `Applied migration ${migration.version} does not match the application manifest.`,
      );
    }
  }

  const pending = migrations.filter(({ version }) => !applied.has(version));
  if (pending.length === 0) {
    return {
      previousVersion: latestApplied,
      currentVersion: latestApplied,
      applied: [],
      backupPath: null,
    };
  }

  let backupPath = null;
  if (shouldBackUp(database, options)) {
    backupPath = await createPreMigrationBackup(database, {
      databasePath: options.databasePath,
      backupDirectory: options.backupDirectory,
      targetVersion: pending.at(-1).version,
      now: options.now,
      backup: options.backup,
    });
  }

  const appliedNow = [];
  for (const migration of pending) {
    const apply = database.transaction(() => {
      migration.up(database);
      database.prepare(`
        INSERT INTO hosted_schema_migrations (
          version, name, checksum, applied_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        migrationChecksum(migration),
        (options.now?.() ?? new Date()).toISOString(),
      );
    });
    try {
      apply();
      appliedNow.push(migration.version);
    } catch (cause) {
      throw migrationError(
        "HOSTED_MIGRATION_FAILED",
        `Hosted schema migration ${migration.version} (${migration.name}) failed.`,
        cause,
      );
    }
  }

  return {
    previousVersion: latestApplied,
    currentVersion: pending.at(-1).version,
    applied: appliedNow,
    backupPath,
  };
}

export function validateHostedSchemaBaseline(database) {
  for (const [table, requiredColumns] of Object.entries(REQUIRED_BASELINE)) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.length === 0) {
      throw migrationError(
        "HOSTED_SCHEMA_BASELINE_INVALID",
        `Required hosted table ${table} is missing.`,
      );
    }
    const names = new Set(columns.map(({ name }) => name));
    const missing = requiredColumns.filter((column) => !names.has(column));
    if (missing.length > 0) {
      throw migrationError(
        "HOSTED_SCHEMA_BASELINE_INVALID",
        `Hosted table ${table} is missing columns: ${missing.join(", ")}.`,
      );
    }
  }
}

function initializeMigrationJournal(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS hosted_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function readAppliedMigrations(database) {
  return new Map(
    database.prepare(`
      SELECT version, name, checksum, applied_at
      FROM hosted_schema_migrations ORDER BY version
    `).all().map((row) => [row.version, row]),
  );
}

function validateMigrationManifest(migrations) {
  if (!Array.isArray(migrations)) {
    throw migrationError("INVALID_HOSTED_MIGRATION_MANIFEST",
      "Hosted schema migration manifest must be an array.");
  }
  let previous = 0;
  return migrations.map((migration) => {
    if (
      !Number.isSafeInteger(migration?.version) ||
      migration.version !== previous + 1 ||
      typeof migration.name !== "string" ||
      migration.name.trim() === "" ||
      typeof migration.up !== "function"
    ) {
      throw migrationError(
        "INVALID_HOSTED_MIGRATION_MANIFEST",
        "Hosted schema migrations must be consecutively numbered and named.",
      );
    }
    previous = migration.version;
    return migration;
  });
}

function migrationChecksum(migration) {
  return createHash("sha256")
    .update(`${migration.version}\n${migration.name}\n${migration.description ?? ""}`)
    .digest("hex");
}

function shouldBackUp(database, options) {
  if (options.backupBeforeMigration === false) return false;
  if (typeof options.backup === "function") return true;
  if (!options.databasePath || options.databasePath === ":memory:") return false;
  return [
    "budget_engine_generations",
    "local_first_sync_epochs",
    "hosted_users",
    "hosted_budget_memberships",
    "replication_generations",
  ].some((table) => tableExists(database, table) &&
    Boolean(database.prepare(`SELECT EXISTS(SELECT 1 FROM ${table} LIMIT 1) AS populated`)
      .get()?.populated));
}

function tableExists(database, table) {
  return Boolean(database.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table));
}

async function createPreMigrationBackup(database, options) {
  const now = options.now?.() ?? new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const directory = options.backupDirectory ??
    join(dirname(options.databasePath), "migration-backups");
  await mkdir(directory, { recursive: true });
  const destination = join(
    directory,
    `shared-budget.pre-migration-v${options.targetVersion}.${stamp}.sqlite`,
  );
  const temporaryDestination = `${destination}.partial`;
  if (options.backup) {
    await options.backup(destination);
    return destination;
  }
  try {
    await database.backup(temporaryDestination);
    await rename(temporaryDestination, destination);
  } catch (cause) {
    await rm(temporaryDestination, { force: true }).catch(() => undefined);
    throw migrationError(
      "HOSTED_MIGRATION_BACKUP_FAILED",
      `Unable to create the required pre-migration backup at ${destination}.`,
      cause,
    );
  }
  return destination;
}

function migrationError(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), {
    code,
  });
}
