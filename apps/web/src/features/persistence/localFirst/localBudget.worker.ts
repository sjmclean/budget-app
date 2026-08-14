/// <reference lib="webworker" />

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { createRuntimeUuid } from "../../ids/createRuntimeUuid";
import {
  LOCAL_BUDGET_SCHEMA_VERSION,
  REQUIRED_BUDGET_DOMAINS,
  type BudgetDomain,
  type BudgetDomainCounts,
  type LocalImportEntity,
  type LocalBudgetManifest,
  type LocalBudgetMutation,
  type LocalFirstMutationConflict,
  type LocalBudgetWorkerRequest,
  type LocalBudgetWorkerResponse,
} from "./contracts";
import {
  LOCAL_REGISTER_SCHEMA_SQL,
  type LocalRegisterImportBatch,
  type LocalTransactionAttachmentMutationPayload,
  type LocalTransactionAttachmentRecord,
  type LocalTransactionQuery,
  type LocalTransactionRecord,
} from "./registerSchema";
import {
  applyBudgetProjectionToSnapshot,
  diagnoseSqliteBudgetProjection,
  toMinorUnits,
  type LocalBudgetProjectionDiagnostic,
} from "./sqliteBudgetProjectionAdapter";
import type {
  BudgetActivityDrilldown,
  BudgetActivityDrilldownRow,
  BudgetMonthView,
} from "../../budget/budgetViewTypes";
import { parseRegisterAmountSearchCents } from "../../accounts/registerSearch";
import { readFinancialOverviewFlow } from "./financialOverviewFlow";

type SqliteDatabase = {
  pointer: unknown;
  exec(options: string | {
    sql: string;
    bind?: readonly unknown[];
    returnValue?: "resultRows";
    rowMode?: "object";
  }): unknown;
  close(): void;
};

let database: SqliteDatabase | null = null;
let sqliteRuntime: Awaited<ReturnType<typeof sqlite3InitModule>> | null = null;
let persistentBackend: "opfs" | "opfs-sahpool" | null = null;
let sahPool: Awaited<
  ReturnType<Awaited<ReturnType<typeof sqlite3InitModule>>["installOpfsSAHPoolVfs"]>
> | null = null;
let baselineExportBytes: Uint8Array | null = null;
let durable = false;
let activeBudgetId = "";
let activeSyncEpoch = "";
let activeFilename = "";
type StagedImportState = {
  readonly budgetId: string;
  readonly syncEpoch: string;
  readonly deviceId: string;
  readonly filename: string;
  readonly previousFilename: string;
};

let stagedImport: StagedImportState | null = null;
let replacement: {
  readonly budgetId: string;
  readonly syncEpoch: string;
  readonly deviceId: string;
  readonly totalBytes: number;
  readonly temporaryName: string;
  readonly writable: FileSystemWritableFileStream;
  receivedBytes: number;
} | null = null;

const BUDGET_PROJECTION_ENGINE_VERSION = 5;

function safeFilename(budgetId: string): string {
  return `/budget-${encodeURIComponent(budgetId).replaceAll("%", "_")}.sqlite3`;
}

function createPhysicalGenerationFilename(budgetId: string): string {
  const encodedBudgetId = encodeURIComponent(budgetId).replaceAll("%", "_");
  return `/budget-physical-${encodedBudgetId}-${createRuntimeUuid()}.sqlite3`;
}

function isAllowedPhysicalFilename(
  budgetId: string,
  filename: string,
): boolean {
  if (filename === safeFilename(budgetId)) return true;

  const encodedBudgetId = encodeURIComponent(budgetId).replaceAll("%", "_");
  return (
    filename.startsWith(`/budget-physical-${encodedBudgetId}-`) &&
    filename.endsWith(".sqlite3")
  );
}

function createStagedImportFilename(budgetId: string): string {
  const encodedBudgetId = encodeURIComponent(budgetId).replaceAll("%", "_");
  return `/budget-import-${encodedBudgetId}-${createRuntimeUuid()}.staging.sqlite3`;
}

function createStagedImportBackupFilename(budgetId: string): string {
  const encodedBudgetId = encodeURIComponent(budgetId).replaceAll("%", "_");
  return `/budget-import-${encodedBudgetId}-${createRuntimeUuid()}.backup.sqlite3`;
}

function resultRows<T>(sql: string, bind: readonly unknown[] = []): T[] {
  if (!database) throw workerError("DATABASE_NOT_OPEN", "The local budget is not open.");
  return database.exec({
    sql,
    bind,
    returnValue: "resultRows",
    rowMode: "object",
  }) as T[];
}

function execute(sql: string, bind: readonly unknown[] = []): void {
  if (!database) throw workerError("DATABASE_NOT_OPEN", "The local budget is not open.");
  database.exec({ sql, bind });
}

function attachmentEntityId(attachmentId: string): string {
  return `attachment:${attachmentId}`;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function assertAttachmentRecord(
  attachment: LocalTransactionAttachmentRecord,
  content?: Uint8Array,
): void {
  if (
    attachment.budgetId !== activeBudgetId ||
    !attachment.id ||
    !attachment.transactionId ||
    !attachment.fileName ||
    !Number.isSafeInteger(attachment.fileSize) ||
    attachment.fileSize < 0 ||
    attachment.fileSize > 5 * 1024 * 1024 ||
    !/^sha256:[a-f0-9]{64}$/i.test(attachment.contentHash)
  ) {
    throw workerError("INVALID_ATTACHMENT", "Attachment metadata is invalid.");
  }
  if (content && content.byteLength !== attachment.fileSize) {
    throw workerError("INVALID_ATTACHMENT", "Attachment content size does not match its metadata.");
  }
}

function upsertTransactionAttachment(
  attachment: LocalTransactionAttachmentRecord,
  content: Uint8Array,
): void {
  assertAttachmentRecord(attachment, content);
  const transactionExists = resultRows<{ found: number }>(
    `SELECT 1 AS found FROM local_transactions
     WHERE budget_id = ? AND id = ? LIMIT 1`,
    [attachment.budgetId, attachment.transactionId],
  ).length > 0;
  if (!transactionExists) {
    throw workerError("TRANSACTION_NOT_FOUND", "The attachment transaction was not found.");
  }
  execute(
    `INSERT INTO local_transaction_attachments(
       id, budget_id, transaction_id, file_name, file_size, mime_type,
       attached_at, content_hash, content
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       transaction_id = excluded.transaction_id,
       file_name = excluded.file_name,
       file_size = excluded.file_size,
       mime_type = excluded.mime_type,
       attached_at = excluded.attached_at,
       content_hash = excluded.content_hash,
       content = excluded.content`,
    [
      attachment.id, attachment.budgetId, attachment.transactionId,
      attachment.fileName, attachment.fileSize, attachment.mimeType,
      attachment.attachedAt, attachment.contentHash, content,
    ],
  );
}

function initialiseSchema(): void {
  execute(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS local_budget_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_budget_entities (
      domain TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (domain, entity_id)
    );
    CREATE INDEX IF NOT EXISTS local_budget_entities_domain
      ON local_budget_entities(domain, entity_id);
    CREATE TABLE IF NOT EXISTS local_budget_months (
      budget_id TEXT NOT NULL,
      month TEXT NOT NULL,
      view_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (budget_id, month)
    );
    CREATE TABLE IF NOT EXISTS local_budget_assignments (
      budget_id TEXT NOT NULL,
      month TEXT NOT NULL,
      category_id TEXT NOT NULL,
      assigned INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (budget_id, month, category_id)
    );
    CREATE INDEX IF NOT EXISTS local_budget_assignments_month
      ON local_budget_assignments(budget_id, month, category_id);
    CREATE TABLE IF NOT EXISTS local_budget_category_policies (
      budget_id TEXT NOT NULL,
      month TEXT NOT NULL,
      category_id TEXT NOT NULL,
      overspending_policy TEXT NOT NULL
        CHECK (overspending_policy IN ('reduce-next-month', 'carry-category')),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (budget_id, month, category_id)
    );
    CREATE INDEX IF NOT EXISTS local_budget_category_policies_lookup
      ON local_budget_category_policies(budget_id, category_id, month);
    CREATE TABLE IF NOT EXISTS local_budget_projection_cache (
      budget_id TEXT NOT NULL,
      month TEXT NOT NULL,
      engine_version INTEGER NOT NULL,
      projection_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (budget_id, month)
    );
    CREATE TABLE IF NOT EXISTS local_budget_projection_dirty (
      budget_id TEXT PRIMARY KEY,
      earliest_month TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS local_budget_projection_cache_version
      ON local_budget_projection_cache(budget_id, engine_version, month);
    CREATE TABLE IF NOT EXISTS local_scheduled_transactions (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS local_scheduled_transactions_account_due
      ON local_scheduled_transactions(budget_id, account_id, next_due_date, id);
    CREATE TABLE IF NOT EXISTS local_transaction_tag_definitions (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      name TEXT NOT NULL,
      colour TEXT,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS local_transaction_tag_definitions_name
      ON local_transaction_tag_definitions(budget_id, name, id);
    CREATE TABLE IF NOT EXISTS local_budget_outbox (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      mutation_id TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      device_sequence INTEGER NOT NULL,
      base_cursor INTEGER NOT NULL DEFAULT 0,
      domain TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      UNIQUE(device_id, device_sequence)
    );
    CREATE INDEX IF NOT EXISTS local_budget_outbox_pending
      ON local_budget_outbox(acknowledged, sequence);
    CREATE TABLE IF NOT EXISTS local_budget_sync_conflicts (
      conflict_id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      sync_epoch TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      losing_mutation_json TEXT NOT NULL,
      winning_mutation_json TEXT NOT NULL,
      winning_cursor INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'unresolved'
        CHECK(status IN ('unresolved', 'resolved-local', 'resolved-remote')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS local_budget_sync_conflicts_status
      ON local_budget_sync_conflicts(status, detected_at);
  `);
  const outboxColumns = new Set(
    resultRows<{ name: string }>("PRAGMA table_info(local_budget_outbox)")
      .map(({ name }) => name),
  );
  if (!outboxColumns.has("base_cursor")) {
    execute(
      "ALTER TABLE local_budget_outbox ADD COLUMN base_cursor INTEGER NOT NULL DEFAULT 0",
    );
  }
  execute(LOCAL_REGISTER_SCHEMA_SQL);
  const transactionColumns = new Set(
    resultRows<{ name: string }>("PRAGMA table_info(local_transactions)")
      .map(({ name }) => name),
  );
  if (!transactionColumns.has("generated_from_schedule")) {
    execute("ALTER TABLE local_transactions ADD COLUMN generated_from_schedule INTEGER NOT NULL DEFAULT 0");
  }
  if (!transactionColumns.has("scheduled_transaction_id")) {
    execute("ALTER TABLE local_transactions ADD COLUMN scheduled_transaction_id TEXT");
  }
  if (!transactionColumns.has("scheduled_occurrence_date")) {
    execute("ALTER TABLE local_transactions ADD COLUMN scheduled_occurrence_date TEXT");
  }
  if (!transactionColumns.has("raw_payee_name")) {
    execute("ALTER TABLE local_transactions ADD COLUMN raw_payee_name TEXT");
  }
  const payeeColumns = new Set(
    resultRows<{ name: string }>("PRAGMA table_info(local_payees)").map(({ name }) => name),
  );
  for (const [name, declaration] of [
    ["default_category_id", "TEXT"], ["default_category_name", "TEXT"],
    ["icon_ref", "TEXT"], ["created_at", "TEXT"], ["updated_at", "TEXT"],
  ] as const) {
    if (!payeeColumns.has(name)) execute(`ALTER TABLE local_payees ADD COLUMN ${name} ${declaration}`);
  }
  migrateLegacyGenericEntities();
  backfillBudgetProjectionFacts();
}

function migrateLegacyGenericEntities(): void {
  const rows = resultRows<{
    domain: BudgetDomain;
    entityId: string;
    payloadJson: string;
    updatedAt: string;
  }>(
    `SELECT domain, entity_id AS entityId, payload_json AS payloadJson,
       updated_at AS updatedAt
     FROM local_budget_entities
     WHERE domain IN ('budgetMonths', 'scheduledTransactions', 'transactionTags')`,
  );
  if (rows.length === 0) return;
  execute("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      writeNormalisedDomainEntity(
        row.domain,
        row.entityId,
        JSON.parse(row.payloadJson),
        row.updatedAt,
      );
    }
    execute(
      `DELETE FROM local_budget_entities
       WHERE domain IN ('budgetMonths', 'scheduledTransactions', 'transactionTags')`,
    );
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
}

function writeNormalisedDomainEntity(
  domain: BudgetDomain,
  entityId: string,
  payload: unknown,
  updatedAt: string,
): boolean {
  if (domain === "budgetMonths") {
    const assignment = payload as {
      kind?: string;
      month?: string;
      categoryId?: string;
      assigned?: number;
    };
    if (
      assignment.kind === "category-assignment" &&
      assignment.month &&
      assignment.categoryId &&
      Number.isFinite(assignment.assigned)
    ) {
      execute(
        `INSERT INTO local_budget_assignments(
           budget_id, month, category_id, assigned, updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(budget_id, month, category_id) DO UPDATE SET
           assigned = excluded.assigned, updated_at = excluded.updated_at`,
        [
          activeBudgetId,
          assignment.month,
          assignment.categoryId,
          assignment.assigned,
          updatedAt,
        ],
      );
      markBudgetProjectionDirty(assignment.month);
      return true;
    }
    const policy = payload as {
      kind?: string;
      startMonth?: string;
      categoryId?: string;
      policy?: "reduce-next-month" | "carry-category";
    };
    if (
      policy.kind === "category-overspending-policy" &&
      policy.startMonth &&
      policy.categoryId &&
      (policy.policy === "reduce-next-month" || policy.policy === "carry-category")
    ) {
      const futureMonths = resultRows<{ month: string }>(
        `SELECT month FROM local_budget_months
         WHERE budget_id = ? AND month >= ? ORDER BY month`,
        [activeBudgetId, policy.startMonth],
      );
      for (const { month } of futureMonths) {
        execute(
          `INSERT INTO local_budget_category_policies(
             budget_id, month, category_id, overspending_policy, updated_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(budget_id, month, category_id) DO UPDATE SET
             overspending_policy = excluded.overspending_policy,
             updated_at = excluded.updated_at`,
          [activeBudgetId, month, policy.categoryId, policy.policy, updatedAt],
        );
      }
      markBudgetProjectionDirty(policy.startMonth);
      return true;
    }
    execute(
      `INSERT INTO local_budget_months(budget_id, month, view_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(budget_id, month) DO UPDATE SET
         view_json = excluded.view_json, updated_at = excluded.updated_at`,
      [activeBudgetId, entityId, JSON.stringify(payload), updatedAt],
    );
    normaliseBudgetMonthProjectionFacts(entityId, payload, updatedAt);
    return true;
  }
  if (domain === "scheduledTransactions") {
    const schedule = payload as {
      id?: string;
      accountId?: string;
      nextDueDate?: string;
    };
    execute(
      `INSERT INTO local_scheduled_transactions(
         id, budget_id, account_id, next_due_date, payload_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         account_id = excluded.account_id,
         next_due_date = excluded.next_due_date,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
      [
        entityId,
        activeBudgetId,
        schedule.accountId ?? "",
        schedule.nextDueDate ?? "",
        JSON.stringify(payload),
        updatedAt,
      ],
    );
    return true;
  }
  if (domain === "transactionTags") {
    const tag = payload as { name?: string; colour?: string | null };
    execute(
      `INSERT INTO local_transaction_tag_definitions(
         id, budget_id, name, colour, payload_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, colour = excluded.colour,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
      [
        entityId,
        activeBudgetId,
        tag.name ?? "",
        tag.colour ?? null,
        JSON.stringify(payload),
        updatedAt,
      ],
    );
    return true;
  }
  return false;
}

function deleteNormalisedDomainEntity(
  domain: BudgetDomain,
  entityId: string,
): boolean {
  if (domain === "budgetMonths") {
    if (entityId.startsWith("assignment:")) {
      const [, month, categoryId] = entityId.split(":");
      execute(
        `DELETE FROM local_budget_assignments
         WHERE budget_id = ? AND month = ? AND category_id = ?`,
        [activeBudgetId, month, categoryId],
      );
      if (month) markBudgetProjectionDirty(month);
    } else {
      execute(
        "DELETE FROM local_budget_months WHERE budget_id = ? AND month = ?",
        [activeBudgetId, entityId],
      );
      markBudgetProjectionDirty(entityId);
      execute(
        "DELETE FROM local_budget_assignments WHERE budget_id = ? AND month = ?",
        [activeBudgetId, entityId],
      );
      execute(
        "DELETE FROM local_budget_category_policies WHERE budget_id = ? AND month = ?",
        [activeBudgetId, entityId],
      );
    }
    return true;
  }
  if (domain === "scheduledTransactions") {
    execute(
      "DELETE FROM local_scheduled_transactions WHERE budget_id = ? AND id = ?",
      [activeBudgetId, entityId],
    );
    return true;
  }
  if (domain === "transactionTags") {
    execute(
      "DELETE FROM local_transaction_tag_definitions WHERE budget_id = ? AND id = ?",
      [activeBudgetId, entityId],
    );
    return true;
  }
  return false;
}

function normaliseBudgetMonthProjectionFacts(
  month: string,
  payload: unknown,
  updatedAt: string,
  replace = true,
): void {
  const view = payload as Partial<BudgetMonthView>;
  if (!Array.isArray(view.categoryGroups)) return;
  if (replace) {
    execute(
      "DELETE FROM local_budget_assignments WHERE budget_id = ? AND month = ?",
      [activeBudgetId, month],
    );
    execute(
      "DELETE FROM local_budget_category_policies WHERE budget_id = ? AND month = ?",
      [activeBudgetId, month],
    );
  }
  for (const group of view.categoryGroups) {
    for (const category of group.categories ?? []) {
      if (!category.id || !Number.isFinite(category.assigned)) continue;
      execute(
        `INSERT INTO local_categories(
           id, budget_id, group_id, group_name, name, archived
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           group_id = excluded.group_id,
           group_name = excluded.group_name,
           name = excluded.name,
           archived = excluded.archived`,
        [
          category.id,
          activeBudgetId,
          group.id,
          group.name,
          category.name,
          category.isArchived ? 1 : 0,
        ],
      );
      execute(
        `${replace ? "INSERT" : "INSERT OR IGNORE"} INTO local_budget_assignments(
           budget_id, month, category_id, assigned, updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
        [activeBudgetId, month, category.id, category.assigned, updatedAt],
      );
      execute(
        `${replace ? "INSERT" : "INSERT OR IGNORE"} INTO local_budget_category_policies(
           budget_id, month, category_id, overspending_policy, updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
        [
          activeBudgetId,
          month,
          category.id,
          category.overspendingHandling === "carry-category"
            ? "carry-category"
            : "reduce-next-month",
          updatedAt,
        ],
      );
    }
  }
  markBudgetProjectionDirty(month);
}

function markBudgetProjectionDirty(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
  execute(
    `INSERT INTO local_budget_projection_dirty(budget_id, earliest_month, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(budget_id) DO UPDATE SET
       earliest_month = CASE
         WHEN excluded.earliest_month < earliest_month
         THEN excluded.earliest_month ELSE earliest_month END,
       updated_at = excluded.updated_at`,
    [activeBudgetId, month, new Date().toISOString()],
  );
  execute(
    "DELETE FROM local_budget_projection_cache WHERE budget_id = ? AND month >= ?",
    [activeBudgetId, month],
  );
}

function markAllBudgetProjectionsDirty(): void {
  const month = resultRows<{ month: string | null }>(
    `SELECT MIN(month) AS month FROM (
       SELECT month FROM local_budget_months WHERE budget_id = ?
       UNION ALL
       SELECT substr(date, 1, 7) AS month
       FROM local_transactions WHERE budget_id = ?
     )`,
    [activeBudgetId, activeBudgetId],
  )[0]?.month;
  if (month) markBudgetProjectionDirty(month);
}

function mergeBudgetCategoryProjectionFacts(
  sourceCategoryId: string,
  targetCategoryId: string,
): void {
  for (const row of resultRows<{ month: string; assigned: number; updatedAt: string }>(
    `SELECT month, assigned, updated_at AS updatedAt
     FROM local_budget_assignments
     WHERE budget_id = ? AND category_id = ?`,
    [activeBudgetId, sourceCategoryId],
  )) {
    execute(
      `INSERT INTO local_budget_assignments(
         budget_id, month, category_id, assigned, updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(budget_id, month, category_id) DO UPDATE SET
         assigned = local_budget_assignments.assigned + excluded.assigned,
         updated_at = excluded.updated_at`,
      [activeBudgetId, row.month, targetCategoryId, row.assigned, row.updatedAt],
    );
  }
  execute(
    "DELETE FROM local_budget_assignments WHERE budget_id = ? AND category_id = ?",
    [activeBudgetId, sourceCategoryId],
  );
  execute(
    `INSERT OR IGNORE INTO local_budget_category_policies(
       budget_id, month, category_id, overspending_policy, updated_at
     ) SELECT budget_id, month, ?, overspending_policy, updated_at
       FROM local_budget_category_policies
       WHERE budget_id = ? AND category_id = ?`,
    [targetCategoryId, activeBudgetId, sourceCategoryId],
  );
  execute(
    "DELETE FROM local_budget_category_policies WHERE budget_id = ? AND category_id = ?",
    [activeBudgetId, sourceCategoryId],
  );
  markAllBudgetProjectionsDirty();
}

function backfillBudgetProjectionFacts(): void {
  const rows = resultRows<{
    month: string;
    payload: string;
    updatedAt: string;
  }>(
    `SELECT month, view_json AS payload, updated_at AS updatedAt
     FROM local_budget_months
     WHERE budget_id = ? AND NOT EXISTS (
       SELECT 1 FROM local_budget_category_policies AS policy
       WHERE policy.budget_id = local_budget_months.budget_id
         AND policy.month = local_budget_months.month
     )
     ORDER BY month`,
    [activeBudgetId],
  );
  if (rows.length === 0) return;
  execute("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      normaliseBudgetMonthProjectionFacts(
        row.month,
        JSON.parse(row.payload),
        row.updatedAt,
        false,
      );
    }
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
}

function readBudgetMonthSnapshot(month: string): unknown | null {
  const row = resultRows<{ payload: string }>(
    `SELECT view_json AS payload FROM local_budget_months
     WHERE budget_id = ? AND month = ?`,
    [activeBudgetId, month],
  )[0];
  if (!row) return null;
  const view = JSON.parse(row.payload) as {
    categoryGroups?: {
      assigned: number;
      activity: number;
      available: number;
      categories: {
        id: string;
        previousAvailable: number;
        assigned: number;
        activity: number;
        available: number;
      }[];
    }[];
    totalAssigned?: number;
    totalActivity?: number;
    totalAvailable?: number;
  };
  const assignments = new Map(
    resultRows<{ categoryId: string; assigned: number }>(
      `SELECT category_id AS categoryId, assigned
       FROM local_budget_assignments
       WHERE budget_id = ? AND month = ?`,
      [activeBudgetId, month],
    ).map(({ categoryId, assigned }) => [categoryId, assigned]),
  );
  if (!view.categoryGroups || assignments.size === 0) return view;
  view.categoryGroups = view.categoryGroups.map((group) => {
    const categories = group.categories.map((category) => {
      const assigned = assignments.get(category.id) ?? category.assigned;
      return {
        ...category,
        assigned,
        available:
          category.previousAvailable + assigned + category.activity,
      };
    });
    return {
      ...group,
      categories,
      assigned: categories.reduce((sum, category) => sum + category.assigned, 0),
      activity: categories.reduce((sum, category) => sum + category.activity, 0),
      available: categories.reduce((sum, category) => sum + category.available, 0),
    };
  });
  view.totalAssigned = view.categoryGroups.reduce(
    (sum, group) => sum + group.assigned,
    0,
  );
  view.totalActivity = view.categoryGroups.reduce(
    (sum, group) => sum + group.activity,
    0,
  );
  view.totalAvailable = view.categoryGroups.reduce(
    (sum, group) => sum + group.available,
    0,
  );
  return view;
}

function readNormalisedDomainEntity(
  domain: BudgetDomain,
  entityId: string,
): { handled: boolean; value: unknown | null } {
  if (domain === "budgetMonths") {
    return { handled: true, value: readBudgetMonth(entityId) };
  }
  const table = domain === "scheduledTransactions"
    ? "local_scheduled_transactions"
    : domain === "transactionTags"
      ? "local_transaction_tag_definitions"
      : null;
  if (!table) return { handled: false, value: null };
  const row = resultRows<{ payload: string }>(
    `SELECT payload_json AS payload FROM ${table}
     WHERE budget_id = ? AND id = ?`,
    [activeBudgetId, entityId],
  )[0];
  return {
    handled: true,
    value: row ? JSON.parse(row.payload) : null,
  };
}

function listNormalisedDomainEntities(
  domain: BudgetDomain,
): { handled: boolean; values: unknown[] } {
  if (domain === "budgetMonths") {
    const months = resultRows<{ month: string }>(
      `SELECT month FROM local_budget_months
       WHERE budget_id = ? ORDER BY month`,
      [activeBudgetId],
    );
    return {
      handled: true,
      values: months.map(({ month }) => readBudgetMonth(month)),
    };
  }
  const table = domain === "scheduledTransactions"
    ? "local_scheduled_transactions"
    : domain === "transactionTags"
      ? "local_transaction_tag_definitions"
      : null;
  if (!table) return { handled: false, values: [] };
  return {
    handled: true,
    values: resultRows<{ payload: string }>(
      `SELECT payload_json AS payload FROM ${table}
       WHERE budget_id = ? ORDER BY id`,
      [activeBudgetId],
    ).map(({ payload }) => JSON.parse(payload)),
  };
}

function writeMetadata(key: string, value: string): void {
  execute(
    `INSERT INTO local_budget_metadata(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

function readMetadata(key: string): string | null {
  return resultRows<{ value: string }>(
    "SELECT value FROM local_budget_metadata WHERE key = ?",
    [key],
  )[0]?.value ?? null;
}

function currentManifest(): LocalBudgetManifest {
  const relationalCounts = {
    accounts: "SELECT COUNT(*) AS count FROM local_accounts WHERE budget_id = ?",
    transactions: "SELECT COUNT(*) AS count FROM local_transactions WHERE budget_id = ?",
    payees: "SELECT COUNT(*) AS count FROM local_payees WHERE budget_id = ?",
    categories: "SELECT COUNT(*) AS count FROM local_categories WHERE budget_id = ?",
    transactionTags:
      "SELECT COUNT(*) AS count FROM local_transaction_tag_definitions WHERE budget_id = ?",
    budgetMonths:
      "SELECT COUNT(*) AS count FROM local_budget_months WHERE budget_id = ?",
    scheduledTransactions:
      "SELECT COUNT(*) AS count FROM local_scheduled_transactions WHERE budget_id = ?",
  } as const;
  const counts = Object.fromEntries(REQUIRED_BUDGET_DOMAINS.map((domain) => {
    const relationalSql = relationalCounts[domain as keyof typeof relationalCounts];
    const count = relationalSql
      ? resultRows<{ count: number }>(relationalSql, [activeBudgetId])[0]?.count ?? 0
      : resultRows<{ count: number }>(
          "SELECT COUNT(*) AS count FROM local_budget_entities WHERE domain = ?",
          [domain],
        )[0]?.count ?? 0;
    return [domain, count];
  })) as unknown as BudgetDomainCounts;
  return {
    budgetId: activeBudgetId,
    syncEpoch: activeSyncEpoch,
    schemaVersion: LOCAL_BUDGET_SCHEMA_VERSION,
    localRevision: Number(readMetadata("localRevision") ?? "0"),
    durable,
    physicalFilename: activeFilename,
    counts,
  };
}

function applyMutation(
  mutation: LocalBudgetMutation,
  resolveConflictId?: string,
): LocalBudgetManifest {
  if (mutation.budgetId !== activeBudgetId || mutation.syncEpoch !== activeSyncEpoch) {
    throw workerError(
      "STALE_SYNC_EPOCH",
      "The mutation belongs to a different budget or sync epoch. Rebuild this device first.",
    );
  }
  execute("BEGIN IMMEDIATE");
  try {
    const revision = Number(readMetadata("localRevision") ?? "0") + 1;
    if (mutation.operation === "delete") {
      if (!deleteNormalisedDomainEntity(mutation.domain, mutation.entityId)) {
        execute(
          "DELETE FROM local_budget_entities WHERE domain = ? AND entity_id = ?",
          [mutation.domain, mutation.entityId],
        );
      }
    } else {
      if (!writeNormalisedDomainEntity(
        mutation.domain,
        mutation.entityId,
        mutation.payload,
        mutation.createdAt,
      )) {
        execute(
          `INSERT INTO local_budget_entities(
             domain, entity_id, payload_json, revision, updated_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(domain, entity_id) DO UPDATE SET
             payload_json = excluded.payload_json,
             revision = excluded.revision,
             updated_at = excluded.updated_at`,
          [
            mutation.domain,
            mutation.entityId,
            JSON.stringify(mutation.payload),
            revision,
            mutation.createdAt,
          ],
        );
      }
    }
    execute(
      `INSERT INTO local_budget_outbox(
         mutation_id, device_id, device_sequence, base_cursor, domain, entity_id,
         operation, payload_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mutation.mutationId,
        mutation.deviceId,
        mutation.deviceSequence,
        mutation.baseCursor,
        mutation.domain,
        mutation.entityId,
        mutation.operation,
        JSON.stringify(mutation.payload),
        mutation.createdAt,
      ],
    );
    writeMetadata("localRevision", String(revision));
    resolveLocalConflictInTransaction(resolveConflictId);
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function applyMutationBatch(
  mutations: readonly LocalBudgetMutation[],
): LocalBudgetManifest {
  for (const mutation of mutations) assertMutationScope(mutation);
  if (mutations.length === 0) return currentManifest();
  execute("BEGIN IMMEDIATE");
  try {
    let revision = Number(readMetadata("localRevision") ?? "0");
    for (const mutation of mutations) {
      revision += 1;
      if (mutation.operation === "delete") {
        if (!deleteNormalisedDomainEntity(mutation.domain, mutation.entityId)) {
          execute(
            "DELETE FROM local_budget_entities WHERE domain = ? AND entity_id = ?",
            [mutation.domain, mutation.entityId],
          );
        }
      } else if (!writeNormalisedDomainEntity(
        mutation.domain,
        mutation.entityId,
        mutation.payload,
        mutation.createdAt,
      )) {
        execute(
          `INSERT INTO local_budget_entities(
             domain, entity_id, payload_json, revision, updated_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(domain, entity_id) DO UPDATE SET
             payload_json = excluded.payload_json,
             revision = excluded.revision,
             updated_at = excluded.updated_at`,
          [
            mutation.domain,
            mutation.entityId,
            JSON.stringify(mutation.payload),
            revision,
            mutation.createdAt,
          ],
        );
      }
      insertOutbox(mutation);
    }
    writeMetadata("localRevision", String(revision));
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function applyRemoteMutations(
  envelopes: readonly {
    readonly cursor: number;
    readonly mutation: LocalBudgetMutation;
    readonly conflict?: LocalFirstMutationConflict;
  }[],
  throughCursor: number,
): LocalBudgetManifest {
  const currentCursor = readPulledCursor();
  if (
    !Number.isSafeInteger(throughCursor) ||
    throughCursor < currentCursor ||
    (envelopes.length > 0 &&
      envelopes[envelopes.length - 1]?.cursor !== throughCursor)
  ) {
    throw workerError(
      "INVALID_REMOTE_CURSOR",
      "Remote mutation cursor progression is invalid.",
    );
  }
  execute("BEGIN IMMEDIATE");
  try {
    let previousCursor = currentCursor;
    for (const envelope of envelopes) {
      if (
        !Number.isSafeInteger(envelope.cursor) ||
        envelope.cursor <= previousCursor
      ) {
        throw workerError(
          "INVALID_REMOTE_CURSOR",
          "Remote mutations must be applied in strict cursor order.",
        );
      }
      previousCursor = envelope.cursor;
      const mutation = envelope.mutation;
      assertMutationScope(mutation);
      const conflict = envelope.conflict;
      if (
        conflict &&
        conflict.losingMutation.deviceId === readMetadata("deviceId")
      ) {
        execute(
          `INSERT OR IGNORE INTO local_budget_sync_conflicts(
             conflict_id, budget_id, sync_epoch, entity_key, detected_at,
             losing_mutation_json, winning_mutation_json, winning_cursor,
             status, resolved_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unresolved', NULL)`,
          [
            conflict.conflictId,
            conflict.budgetId,
            conflict.syncEpoch,
            conflict.entityKey,
            conflict.detectedAt,
            JSON.stringify(conflict.losingMutation),
            JSON.stringify(conflict.winningMutation),
            conflict.winningCursor,
          ],
        );
      }
      if (
        mutation.domain === "transactions" &&
        mutation.entityId.startsWith("attachment:")
      ) {
        const payload = mutation.payload as LocalTransactionAttachmentMutationPayload;
        assertAttachmentRecord(payload.attachment);
        if (
          mutation.operation === "delete" ||
          payload.kind === "transaction-attachment-delete"
        ) {
          execute(
            "DELETE FROM local_transaction_attachments WHERE budget_id = ? AND id = ?",
            [activeBudgetId, payload.attachment.id],
          );
        } else {
          if (!payload.contentBase64) {
            throw workerError("INVALID_ATTACHMENT", "Replicated attachment content is missing.");
          }
          upsertTransactionAttachment(payload.attachment, decodeBase64(payload.contentBase64));
        }
      } else if (mutation.domain === "transactions") {
        const previousMonth = resultRows<{ month: string }>(
          "SELECT substr(date, 1, 7) AS month FROM local_transactions WHERE budget_id = ? AND id = ?",
          [activeBudgetId, mutation.entityId],
        )[0]?.month;
        if (mutation.operation === "delete") {
          execute(
            "DELETE FROM local_transactions WHERE budget_id = ? AND id = ?",
            [activeBudgetId, mutation.entityId],
          );
        } else {
          const transaction = mutation.payload as LocalTransactionRecord;
          upsertTransaction(transaction);
          const nextMonth = transaction.date.slice(0, 7);
          markBudgetProjectionDirty(
            previousMonth && previousMonth < nextMonth ? previousMonth : nextMonth,
          );
        }
        if (mutation.operation === "delete" && previousMonth) {
          markBudgetProjectionDirty(previousMonth);
        }
      } else if (mutation.domain === "payees") {
        if (mutation.operation === "delete") {
          const target = mutation.payload as {
            targetPayeeId?: string;
            targetPayeeName?: string;
            sourcePayeeIds?: readonly string[];
          };
          if (target.targetPayeeId) {
            const remoteSourceIds = target.sourcePayeeIds?.length
              ? target.sourcePayeeIds
              : [mutation.entityId];
            for (const sourcePayeeId of remoteSourceIds) {
            execute(
              `UPDATE local_transactions SET payee_id = ?, payee_name = ?
               WHERE budget_id = ? AND payee_id = ?`,
              [target.targetPayeeId, target.targetPayeeName ?? null, activeBudgetId, sourcePayeeId],
            );
            const schedules = resultRows<{ id: string; payloadJson: string }>(
              `SELECT id, payload_json AS payloadJson FROM local_scheduled_transactions
               WHERE budget_id = ? AND json_extract(payload_json, '$.payeeId') = ?`,
              [activeBudgetId, sourcePayeeId],
            );
            for (const schedule of schedules) {
              const schedulePayload = JSON.parse(schedule.payloadJson) as Record<string, unknown>;
              schedulePayload.payeeId = target.targetPayeeId;
              schedulePayload.payee = target.targetPayeeName ?? "";
              execute("UPDATE local_scheduled_transactions SET payload_json = ? WHERE id = ?",
                [JSON.stringify(schedulePayload), schedule.id]);
            }
            execute(`DELETE FROM local_payee_aliases WHERE budget_id = ? AND payee_id = ?
              AND normalized_value IN (SELECT normalized_value FROM local_payee_aliases
                WHERE budget_id = ? AND payee_id = ?)`,
              [activeBudgetId, sourcePayeeId, activeBudgetId, target.targetPayeeId]);
            execute("UPDATE local_payee_aliases SET payee_id = ? WHERE budget_id = ? AND payee_id = ?",
              [target.targetPayeeId, activeBudgetId, sourcePayeeId]);
            execute("UPDATE local_payee_recognition_rules SET payee_id = ? WHERE budget_id = ? AND payee_id = ?",
              [target.targetPayeeId, activeBudgetId, sourcePayeeId]);
            execute("DELETE FROM local_payees WHERE budget_id = ? AND id = ?", [activeBudgetId, sourcePayeeId]);
            }
          }
          if (!target.targetPayeeId) {
            execute("DELETE FROM local_payees WHERE budget_id = ? AND id = ?", [activeBudgetId, mutation.entityId]);
          }
        } else {
          const payee = mutation.payload as import("./registerSchema").LocalPayeeRecord;
          execute(
          `INSERT INTO local_payees(id, budget_id, name, note, archived,
             default_category_id, default_category_name, icon_ref, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, note = excluded.note, archived = excluded.archived,
             default_category_id = excluded.default_category_id,
             default_category_name = excluded.default_category_name,
             icon_ref = excluded.icon_ref, updated_at = excluded.updated_at`,
          [payee.id, payee.budgetId, payee.name, payee.note, payee.archived ? 1 : 0,
           payee.defaultCategoryId ?? null, payee.defaultCategoryName ?? null,
           payee.iconRef ?? null, payee.createdAt ?? mutation.createdAt,
           payee.updatedAt ?? mutation.createdAt],
        );
          execute("DELETE FROM local_payee_aliases WHERE budget_id = ? AND payee_id = ?", [payee.budgetId, payee.id]);
          for (const alias of payee.aliases ?? []) execute(
            `INSERT INTO local_payee_aliases(id,budget_id,payee_id,value,normalized_value,created_at)
             VALUES(?,?,?,?,?,?)`, [alias.id, payee.budgetId, payee.id, alias.value,
             normalisePayeeIdentity(alias.value), mutation.createdAt]);
          execute("DELETE FROM local_payee_recognition_rules WHERE budget_id = ? AND payee_id = ?", [payee.budgetId, payee.id]);
          for (const rule of payee.importRules ?? []) execute(
            `INSERT INTO local_payee_recognition_rules(id,budget_id,payee_id,match_type,pattern,
             normalized_pattern,default_category_id,default_category_name,priority,enabled,created_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [rule.id, payee.budgetId, payee.id, rule.matchType,
             rule.text, normalisePayeeIdentity(rule.text), rule.defaultCategoryId ?? null,
             rule.defaultCategoryName ?? null, rule.priority ?? 0, rule.enabled === false ? 0 : 1,
             mutation.createdAt, mutation.createdAt]);
          execute(
            "UPDATE local_transactions SET payee_name = ? WHERE budget_id = ? AND payee_id = ?",
            [payee.name, payee.budgetId, payee.id],
          );
        }
      } else if (mutation.domain === "categories" && mutation.operation === "delete") {
        const target = mutation.payload as {
          targetCategoryId?: string;
          targetCategoryName?: string;
        };
        if (target.targetCategoryId) {
          redirectMergedCategoryReferences(
            activeBudgetId,
            mutation.entityId,
            target.targetCategoryId,
            target.targetCategoryName ?? null,
          );
        }
        execute("DELETE FROM local_categories WHERE budget_id = ? AND id = ?", [
          activeBudgetId, mutation.entityId,
        ]);
        markAllBudgetProjectionsDirty();
      } else if (mutation.domain === "accounts") {
        if (mutation.operation === "delete") {
          assertAccountDeletable(activeBudgetId, mutation.entityId);
          execute("DELETE FROM local_accounts WHERE budget_id = ? AND id = ?", [
            activeBudgetId, mutation.entityId,
          ]);
        } else {
          const account = mutation.payload as import("./registerSchema").LocalAccountRecord;
          upsertAccount(account);
          reconcileCreditCardPaymentCategoryForAccount(account);
        }
        markAllBudgetProjectionsDirty();
      } else if (mutation.operation === "delete") {
        if (!deleteNormalisedDomainEntity(mutation.domain, mutation.entityId)) {
          execute(
            "DELETE FROM local_budget_entities WHERE domain = ? AND entity_id = ?",
            [mutation.domain, mutation.entityId],
          );
        }
      } else {
        if (!writeNormalisedDomainEntity(
          mutation.domain,
          mutation.entityId,
          mutation.payload,
          mutation.createdAt,
        )) {
          execute(
            `INSERT INTO local_budget_entities(
               domain, entity_id, payload_json, revision, updated_at
             ) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(domain, entity_id) DO UPDATE SET
               payload_json = excluded.payload_json,
               revision = excluded.revision,
               updated_at = excluded.updated_at`,
            [
              mutation.domain,
              mutation.entityId,
              JSON.stringify(mutation.payload),
              Number(readMetadata("localRevision") ?? "0") + 1,
              mutation.createdAt,
            ],
          );
        }
      }
    }
    if (envelopes.length > 0) {
      writeMetadata(
        "localRevision",
        String(Number(readMetadata("localRevision") ?? "0") + envelopes.length),
      );
    }
    writeMetadata("pulledCursor", String(throughCursor));
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function readPulledCursor(): number {
  const value = Number(readMetadata("pulledCursor") ?? "0");
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function currentSyncState() {
  return {
    budgetId: activeBudgetId,
    syncEpoch: activeSyncEpoch,
    baselineHash: readMetadata("baselineHash"),
    pulledCursor: readPulledCursor(),
  };
}

function setSyncState(baselineHash: string, pulledCursor: number) {
  if (!/^sha256:[a-f0-9]{64}$/.test(baselineHash)) {
    throw workerError("INVALID_BASELINE_HASH", "Baseline hash is invalid.");
  }
  if (!Number.isSafeInteger(pulledCursor) || pulledCursor < 0) {
    throw workerError("INVALID_REMOTE_CURSOR", "Pulled cursor is invalid.");
  }
  execute("BEGIN IMMEDIATE");
  try {
    writeMetadata("baselineHash", baselineHash);
    writeMetadata("pulledCursor", String(pulledCursor));
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentSyncState();
}

function listSyncConflicts(
  status: "unresolved" | "resolved-local" | "resolved-remote" | undefined,
  limit: number,
) {
  const boundedLimit = Math.max(1, Math.min(500, limit));
  const rows = status
    ? resultRows<{
        conflictId: string;
        budgetId: string;
        syncEpoch: string;
        entityKey: string;
        detectedAt: string;
        losingMutationJson: string;
        winningMutationJson: string;
        winningCursor: number;
        status: "unresolved" | "resolved-local" | "resolved-remote";
        resolvedAt: string | null;
      }>(
        `SELECT conflict_id AS conflictId, budget_id AS budgetId,
           sync_epoch AS syncEpoch, entity_key AS entityKey,
           detected_at AS detectedAt,
           losing_mutation_json AS losingMutationJson,
           winning_mutation_json AS winningMutationJson,
           winning_cursor AS winningCursor, status,
           resolved_at AS resolvedAt
         FROM local_budget_sync_conflicts
         WHERE status = ? ORDER BY detected_at DESC LIMIT ?`,
        [status, boundedLimit],
      )
    : resultRows<{
        conflictId: string;
        budgetId: string;
        syncEpoch: string;
        entityKey: string;
        detectedAt: string;
        losingMutationJson: string;
        winningMutationJson: string;
        winningCursor: number;
        status: "unresolved" | "resolved-local" | "resolved-remote";
        resolvedAt: string | null;
      }>(
        `SELECT conflict_id AS conflictId, budget_id AS budgetId,
           sync_epoch AS syncEpoch, entity_key AS entityKey,
           detected_at AS detectedAt,
           losing_mutation_json AS losingMutationJson,
           winning_mutation_json AS winningMutationJson,
           winning_cursor AS winningCursor, status,
           resolved_at AS resolvedAt
         FROM local_budget_sync_conflicts
         ORDER BY detected_at DESC LIMIT ?`,
        [boundedLimit],
      );
  return rows.map(({ losingMutationJson, winningMutationJson, ...row }) => ({
    ...row,
    losingMutation: JSON.parse(losingMutationJson),
    winningMutation: JSON.parse(winningMutationJson),
  }));
}

function resolveSyncConflict(
  conflictId: string,
  resolution: "keep-local" | "accept-remote",
) {
  const status = resolution === "keep-local"
    ? "resolved-local"
    : "resolved-remote";
  const resolvedAt = new Date().toISOString();
  execute(
    `UPDATE local_budget_sync_conflicts
     SET status = ?, resolved_at = ?
     WHERE conflict_id = ? AND status = 'unresolved'`,
    [status, resolvedAt, conflictId],
  );
  const conflict = listSyncConflicts(undefined, 500)
    .find((value) => value.conflictId === conflictId);
  if (!conflict) {
    throw workerError("SYNC_CONFLICT_NOT_FOUND", "Sync conflict was not found.");
  }
  return conflict;
}

function resolveLocalConflictInTransaction(
  conflictId: string | undefined,
): void {
  if (!conflictId) return;

  const resolvedAt = new Date().toISOString();
  execute(
    `UPDATE local_budget_sync_conflicts
     SET status = 'resolved-local', resolved_at = ?
     WHERE conflict_id = ? AND status = 'unresolved'`,
    [resolvedAt, conflictId],
  );

  const row = resultRows<{ status: string }>(
    `SELECT status
     FROM local_budget_sync_conflicts
     WHERE conflict_id = ?`,
    [conflictId],
  )[0];

  if (!row) {
    throw workerError(
      "SYNC_CONFLICT_NOT_FOUND",
      "Sync conflict was not found.",
    );
  }

  if (row.status !== "resolved-local") {
    throw workerError(
      "SYNC_CONFLICT_ALREADY_RESOLVED",
      "Sync conflict can no longer be kept locally.",
    );
  }
}

function insertOutbox(mutation: LocalBudgetMutation): void {
  execute(
    `INSERT INTO local_budget_outbox(
       mutation_id, device_id, device_sequence, base_cursor, domain, entity_id,
       operation, payload_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mutation.mutationId,
      mutation.deviceId,
      mutation.deviceSequence,
      mutation.baseCursor,
      mutation.domain,
      mutation.entityId,
      mutation.operation,
      JSON.stringify(mutation.payload),
      mutation.createdAt,
    ],
  );
}

function assertMutationScope(mutation: LocalBudgetMutation): void {
  if (mutation.budgetId !== activeBudgetId || mutation.syncEpoch !== activeSyncEpoch) {
    throw workerError(
      "STALE_SYNC_EPOCH",
      "The mutation belongs to a different budget or sync epoch. Rebuild this device first.",
    );
  }
}

function upsertTransaction(transaction: LocalTransactionRecord): void {
  execute(
    `INSERT INTO local_transactions(
       id, budget_id, account_id, date, amount, memo, check_number,
       cleared_status, payee_id, payee_name, raw_payee_name, category_id, category_name,
       transfer_account_id, transfer_transaction_id, generated_from_schedule,
       scheduled_transaction_id, scheduled_occurrence_date, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_id = excluded.account_id,
       date = excluded.date,
       amount = excluded.amount,
       memo = excluded.memo,
       check_number = excluded.check_number,
       cleared_status = excluded.cleared_status,
       payee_id = excluded.payee_id,
       payee_name = excluded.payee_name,
       raw_payee_name = excluded.raw_payee_name,
       category_id = excluded.category_id,
       category_name = excluded.category_name,
       transfer_account_id = excluded.transfer_account_id,
       transfer_transaction_id = excluded.transfer_transaction_id,
       generated_from_schedule = excluded.generated_from_schedule,
       scheduled_transaction_id = excluded.scheduled_transaction_id,
       scheduled_occurrence_date = excluded.scheduled_occurrence_date,
       updated_at = excluded.updated_at`,
    [
      transaction.id,
      transaction.budgetId,
      transaction.accountId,
      transaction.date,
      transaction.amount,
      transaction.memo,
      transaction.checkNumber,
      transaction.clearedStatus,
      transaction.payeeId,
      transaction.payeeName,
      transaction.rawPayeeName,
      transaction.categoryId,
      transaction.categoryName,
      transaction.transferAccountId,
      transaction.transferTransactionId,
      transaction.generatedFromSchedule ? 1 : 0,
      transaction.scheduledTransactionId,
      transaction.scheduledOccurrenceDate,
      transaction.updatedAt,
    ],
  );
  execute("DELETE FROM local_transaction_splits WHERE transaction_id = ?", [transaction.id]);
  execute("DELETE FROM local_transaction_tags WHERE transaction_id = ?", [transaction.id]);
  for (const split of transaction.splitLines) {
    execute(
      `INSERT INTO local_transaction_splits(
         transaction_id, id, category_id, category_name, transfer_account_id,
         transfer_transaction_id, memo, amount
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transaction.id,
        split.id,
        split.categoryId,
        split.categoryName,
        split.transferAccountId,
        split.transferTransactionId,
        split.memo,
        split.amount,
      ],
    );
  }
  for (const tagId of transaction.tagIds) {
    execute(
      "INSERT INTO local_transaction_tags(transaction_id, tag_id) VALUES (?, ?)",
      [transaction.id, tagId],
    );
  }
}

function assertActiveStagedImport(): NonNullable<typeof stagedImport> {
  const stage = stagedImport;
  if (
    !stage ||
    !database ||
    activeFilename !== stage.filename ||
    activeBudgetId !== stage.budgetId ||
    activeSyncEpoch !== stage.syncEpoch
  ) {
    throw workerError(
      "STAGED_IMPORT_MISSING",
      "Import batches may only be written to the active staged local import.",
    );
  }
  return stage;
}

function importRegisterBatch(batch: LocalRegisterImportBatch): LocalBudgetManifest {
  assertActiveStagedImport();
  execute("BEGIN IMMEDIATE");
  try {
    for (const account of batch.accounts ?? []) {
      if (account.budgetId !== activeBudgetId) throw workerError("BUDGET_SCOPE_MISMATCH", "Account belongs to another budget.");
      execute(
        `INSERT INTO local_accounts(
           id, budget_id, name, type, participation, opening_balance,
           currency_code, created_at, closed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, type = excluded.type,
           participation = excluded.participation,
           opening_balance = excluded.opening_balance,
           currency_code = excluded.currency_code,
           closed_at = excluded.closed_at`,
        [
          account.id, account.budgetId, account.name, account.type,
          account.participation, account.openingBalance, account.currencyCode,
          account.createdAt, account.closedAt,
        ],
      );
    }
    for (const payee of batch.payees ?? []) {
      if (payee.budgetId !== activeBudgetId) throw workerError("BUDGET_SCOPE_MISMATCH", "Payee belongs to another budget.");
      execute(
        `INSERT INTO local_payees(id, budget_id, name, note, archived,
           default_category_id, default_category_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, note = excluded.note, archived = excluded.archived,
           default_category_id = excluded.default_category_id,
           default_category_name = excluded.default_category_name,
           updated_at = excluded.updated_at`,
        [payee.id, payee.budgetId, payee.name, payee.note, payee.archived ? 1 : 0,
         payee.defaultCategoryId ?? null, payee.defaultCategoryName ?? null,
         payee.createdAt ?? new Date().toISOString(), payee.updatedAt ?? new Date().toISOString()],
      );
      execute("DELETE FROM local_payee_recognition_rules WHERE budget_id = ? AND payee_id = ?", [payee.budgetId, payee.id]);
      for (const rule of payee.importRules ?? []) {
        execute(
          `INSERT INTO local_payee_recognition_rules(
             id, budget_id, payee_id, match_type, pattern, normalized_pattern,
             default_category_id, default_category_name, priority, enabled, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [rule.id, payee.budgetId, payee.id, rule.matchType, rule.text,
           normalisePayeeIdentity(rule.text), rule.defaultCategoryId ?? null,
           rule.defaultCategoryName ?? null, rule.priority ?? 0,
           rule.enabled === false ? 0 : 1, new Date().toISOString(), new Date().toISOString()],
        );
      }
    }
    for (const category of batch.categories ?? []) {
      if (category.budgetId !== activeBudgetId) throw workerError("BUDGET_SCOPE_MISMATCH", "Category belongs to another budget.");
      execute(
        `INSERT INTO local_categories(
           id, budget_id, group_id, group_name, name, archived
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           group_id = excluded.group_id, group_name = excluded.group_name,
           name = excluded.name, archived = excluded.archived`,
        [
          category.id, category.budgetId, category.groupId, category.groupName,
          category.name, category.archived ? 1 : 0,
        ],
      );
    }
    for (const transaction of batch.transactions ?? []) {
      if (transaction.budgetId !== activeBudgetId) throw workerError("BUDGET_SCOPE_MISMATCH", "Transaction belongs to another budget.");
      upsertTransaction(transaction);
      markBudgetProjectionDirty(transaction.date.slice(0, 7));
    }
    if ((batch.accounts?.length ?? 0) > 0 || (batch.categories?.length ?? 0) > 0) {
      markAllBudgetProjectionsDirty();
    }
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function importEntityBatch(entities: readonly LocalImportEntity[]): LocalBudgetManifest {
  assertActiveStagedImport();
  if (entities.length > 2_000) {
    throw workerError("IMPORT_BATCH_TOO_LARGE", "Local import batches may contain at most 2,000 entities.");
  }
  execute("BEGIN IMMEDIATE");
  try {
    for (const entity of entities) {
      const updatedAt = new Date().toISOString();
      if (!writeNormalisedDomainEntity(
        entity.domain,
        entity.entityId,
        entity.payload,
        updatedAt,
      )) {
        execute(
          `INSERT INTO local_budget_entities(
             domain, entity_id, payload_json, revision, updated_at
           ) VALUES (?, ?, ?, 0, ?)
           ON CONFLICT(domain, entity_id) DO UPDATE SET
             payload_json = excluded.payload_json,
             updated_at = excluded.updated_at`,
          [entity.domain, entity.entityId, JSON.stringify(entity.payload), updatedAt],
        );
      }
    }
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

async function removeOpfsFile(filename: string): Promise<void> {
  if (persistentBackend === "opfs-sahpool") {
    sahPool?.unlink(filename);
    return;
  }
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(filename.replace(/^\//, "")).catch(() => undefined);
}

async function ensurePersistentSqlite() {
  const sqlite3 = sqliteRuntime ?? await sqlite3InitModule();
  sqliteRuntime = sqlite3;
  if (persistentBackend) return sqlite3;
  if ("opfs" in sqlite3 && sqlite3.oo1.OpfsDb) {
    persistentBackend = "opfs";
    return sqlite3;
  }
  try {
    sahPool = await sqlite3.installOpfsSAHPoolVfs({
      initialCapacity: 12,
      directory: "/budget-app-sahpool",
    });
    persistentBackend = "opfs-sahpool";
    return sqlite3;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error ?? "");
    if (/another open Access Handle|Access Handles cannot be created|Writable stream/i.test(detail)) {
      throw workerError(
        "SQLITE_DATABASE_BUSY",
        "Budget App's local database is already open in another browser tab or an earlier import session. Close other Budget App tabs and retry the import.",
      );
    }
    throw workerError(
      "PERSISTENT_SQLITE_UNAVAILABLE",
      `Durable browser SQLite is unavailable. Use Safari 16.4 or later outside Private Browsing, or open Budget App from a secure HTTPS address. ${
        detail
      }`.trim(),
    );
  }
}

function openPersistentDatabase(filename: string): SqliteDatabase {
  if (!sqliteRuntime || !persistentBackend) {
    throw workerError("PERSISTENT_SQLITE_UNAVAILABLE", "Durable browser SQLite is unavailable.");
  }
  return persistentBackend === "opfs"
    ? new sqliteRuntime.oo1.OpfsDb(filename) as SqliteDatabase
    : new sahPool!.OpfsSAHPoolDb(filename) as SqliteDatabase;
}

async function importPersistentDatabase(
  filename: string,
  chunks: () => Promise<Uint8Array | undefined>,
): Promise<void> {
  if (persistentBackend === "opfs") {
    await sqliteRuntime!.oo1.OpfsDb.importDb(filename, chunks);
  } else if (persistentBackend === "opfs-sahpool") {
    await sahPool!.importDb(filename, chunks);
  } else {
    throw workerError("PERSISTENT_SQLITE_UNAVAILABLE", "Durable browser SQLite is unavailable.");
  }
}

async function restorePreviousDatabaseFromStage(
  stage: StagedImportState,
): Promise<void> {
  database?.close();
  database = null;

  await removeOpfsFile(stage.filename).catch(() => undefined);

  activeFilename = stage.previousFilename;
  if (!activeFilename) {
    activeBudgetId = "";
    activeSyncEpoch = "";
    stagedImport = null;
    return;
  }

  database = openPersistentDatabase(activeFilename);
  activeBudgetId = readMetadata("budgetId") ?? "";
  activeSyncEpoch = readMetadata("syncEpoch") ?? "";
  initialiseSchema();
  stagedImport = null;
}

async function beginStagedImport(
  request: Extract<LocalBudgetWorkerRequest, { type: "beginStagedImport" }>,
) {
  if (stagedImport) {
    throw workerError("STAGED_IMPORT_ACTIVE", "A staged local import is already active.");
  }

  await ensurePersistentSqlite();

  const stage: StagedImportState = {
    budgetId: request.budgetId,
    syncEpoch: request.syncEpoch,
    deviceId: request.deviceId,
    filename: createStagedImportFilename(request.budgetId),
    previousFilename: activeFilename,
  };

  // Establish recovery state before disturbing the previously active database.
  stagedImport = stage;

  try {
    database?.close();
    database = null;

    await removeOpfsFile(stage.filename);

    activeBudgetId = stage.budgetId;
    activeSyncEpoch = stage.syncEpoch;
    activeFilename = stage.filename;

    database = openPersistentDatabase(stage.filename);
    durable = true;
    initialiseSchema();

    writeMetadata("budgetId", stage.budgetId);
    writeMetadata("syncEpoch", stage.syncEpoch);
    writeMetadata("schemaVersion", String(LOCAL_BUDGET_SCHEMA_VERSION));
    writeMetadata("deviceId", stage.deviceId);
    writeMetadata("localRevision", "0");

    return currentManifest();
  } catch (error) {
    await restorePreviousDatabaseFromStage(stage);
    throw error;
  }
}

async function copyOpfsDatabase(sourceFilename: string, targetFilename: string): Promise<void> {
  if (persistentBackend === "opfs-sahpool") {
    const bytes = await sahPool!.exportFile(sourceFilename);
    let offset = 0;
    await importPersistentDatabase(targetFilename, async () => {
      if (offset >= bytes.byteLength) return undefined;
      const chunk = bytes.slice(offset, offset + 4 * 1024 * 1024);
      offset += chunk.byteLength;
      return chunk;
    });
    return;
  }
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(sourceFilename.replace(/^\//, ""));
  const file = await handle.getFile();
  let offset = 0;
  await importPersistentDatabase(targetFilename, async () => {
    if (offset >= file.size) return undefined;
    const chunk = new Uint8Array(
      await file.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer(),
    );
    offset += chunk.byteLength;
    return chunk;
  });
}

async function commitStagedImport(expectedCounts: BudgetDomainCounts) {
  const stage = stagedImport;
  if (!stage) {
    throw workerError("STAGED_IMPORT_MISSING", "No staged local import is active.");
  }

  const manifest = currentManifest();
  for (const domain of REQUIRED_BUDGET_DOMAINS) {
    if (manifest.counts[domain] !== expectedCounts[domain]) {
      throw workerError(
        "STAGED_IMPORT_INCOMPLETE",
        `Expected ${expectedCounts[domain]} ${domain}, found ${manifest.counts[domain]}.`,
      );
    }
  }

  const foreignKeyErrors = resultRows("PRAGMA foreign_key_check");
  if (foreignKeyErrors.length > 0) {
    throw workerError(
      "STAGED_IMPORT_RELATIONAL_INVALID",
      "The staged import failed relational validation.",
    );
  }

  execute("PRAGMA wal_checkpoint(TRUNCATE)");
  database?.close();
  database = null;

  const targetFilename = createPhysicalGenerationFilename(stage.budgetId);

  try {
    // Copy-on-write promotion: the previously authoritative physical database
    // remains untouched until the complete candidate has been validated.
    await copyOpfsDatabase(stage.filename, targetFilename);

    activeFilename = targetFilename;
    activeBudgetId = stage.budgetId;
    activeSyncEpoch = stage.syncEpoch;
    database = openPersistentDatabase(targetFilename);
    durable = true;
    initialiseSchema();

    const storedBudgetId = readMetadata("budgetId");
    const storedSyncEpoch = readMetadata("syncEpoch");
    if (
      storedBudgetId !== stage.budgetId ||
      storedSyncEpoch !== stage.syncEpoch
    ) {
      throw workerError(
        "STAGED_IMPORT_SCOPE_MISMATCH",
        "Promoted staged import does not match the selected budget and sync epoch.",
      );
    }

    const promotedManifest = currentManifest();
    for (const domain of REQUIRED_BUDGET_DOMAINS) {
      if (promotedManifest.counts[domain] !== expectedCounts[domain]) {
        throw workerError(
          "STAGED_IMPORT_PROMOTION_INCOMPLETE",
          `Promoted import expected ${expectedCounts[domain]} ${domain}, found ${promotedManifest.counts[domain]}.`,
        );
      }
    }

    const promotedForeignKeyErrors = resultRows("PRAGMA foreign_key_check");
    if (promotedForeignKeyErrors.length > 0) {
      throw workerError(
        "STAGED_IMPORT_PROMOTION_RELATIONAL_INVALID",
        "Promoted staged import failed relational validation.",
      );
    }

    stagedImport = null;
    await removeOpfsFile(stage.filename).catch(() => undefined);
    return promotedManifest;
  } catch (error) {
    database?.close();
    database = null;
    await removeOpfsFile(targetFilename).catch(() => undefined);
    await restorePreviousDatabaseFromStage(stage);
    throw error;
  }
}

async function rollbackStagedImport() {
  const stage = stagedImport;
  if (!stage) return { rolledBack: false };

  await restorePreviousDatabaseFromStage(stage);
  return { rolledBack: true };
}

function getAccountSummary(budgetId: string, accountId: string) {
  const account = resultRows<{
    name: string;
    type: string;
    participation: string;
    openingBalance: number;
    currencyCode: string;
  }>(
    `SELECT name, type, participation, opening_balance AS openingBalance,
       currency_code AS currencyCode
     FROM local_accounts WHERE budget_id = ? AND id = ?`,
    [budgetId, accountId],
  )[0];
  if (!account) throw workerError("ACCOUNT_NOT_FOUND", "The local account was not found.");
  const totals = resultRows<{
    clearedBalance: number;
    unclearedBalance: number;
    transactionBalance: number;
    transactionCount: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN cleared_status IN ('cleared', 'reconciled') THEN amount ELSE 0 END), 0)
         AS clearedBalance,
       COALESCE(SUM(CASE WHEN cleared_status NOT IN ('cleared', 'reconciled') THEN amount ELSE 0 END), 0)
         AS unclearedBalance,
       COALESCE(SUM(amount), 0) AS transactionBalance,
       COUNT(*) AS transactionCount
     FROM local_transactions WHERE budget_id = ? AND account_id = ?`,
    [budgetId, accountId],
  )[0]!;
  return {
    budgetId,
    accountId,
    accountName: account.name,
    accountType: account.type,
    participation: account.participation,
    currencyCode: account.currencyCode,
    openingBalance: account.openingBalance,
    clearedBalance: account.openingBalance + totals.clearedBalance,
    unclearedBalance: totals.unclearedBalance,
    workingBalance: account.openingBalance + totals.transactionBalance,
    transactionCount: totals.transactionCount,
  };
}

function monthWindow(month: string, count: number): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, monthNumber - 1 - (count - 1 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { month: "short" })
    .format(new Date(year, monthNumber - 1, 1));
}

function longMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" })
    .format(new Date(year, monthNumber - 1, 1));
}

function getBudgetProjectionDiagnostic(budgetId: string, targetMonth: string) {
  // Imported months remain authoritative opening anchors, but an edit must
  // replay from the earliest dirty month through the requested month. Starting
  // at the requested month would hide prior-month overspending and policy
  // changes; starting at the oldest import month would discard YNAB4-only
  // historical evidence. The dirty boundary gives us both correctness and a
  // bounded replay.
  let dirtyMonth = resultRows<{ earliestMonth: string }>(
    `SELECT earliest_month AS earliestMonth
     FROM local_budget_projection_dirty WHERE budget_id = ?`,
    [budgetId],
  )[0]?.earliestMonth;
  if (!dirtyMonth) {
    const legacyAnchor = resultRows<{ month: string }>(
      `SELECT MIN(month) AS month FROM local_budget_projection_cache
       WHERE budget_id = ? AND month <= ? AND engine_version < ?`,
      [budgetId, targetMonth, BUDGET_PROJECTION_ENGINE_VERSION],
    )[0]?.month;
    if (legacyAnchor) {
      // A previous engine could clear the dirty marker after calculating only
      // the viewed month. Recover from the earliest legacy cache evidence once
      // so already-made historical edits are repaired without re-importing.
      markBudgetProjectionDirty(legacyAnchor);
      dirtyMonth = legacyAnchor;
    }
  }
  const requestedAnchor = dirtyMonth && dirtyMonth <= targetMonth
    ? dirtyMonth
    : targetMonth;
  const firstMonth = resultRows<{ month: string }>(
    `SELECT MAX(month) AS month FROM local_budget_months
     WHERE budget_id = ? AND month <= ?`,
    [budgetId, requestedAnchor],
  )[0]?.month;
  if (!firstMonth) {
    throw workerError("BUDGET_MONTH_NOT_FOUND", `No budget month is available through ${targetMonth}.`);
  }
  const firstSnapshot = readBudgetMonthSnapshot(firstMonth) as BudgetMonthView | null;
  const snapshot = readBudgetMonthSnapshot(targetMonth) as BudgetMonthView | null;
  if (!firstSnapshot || !snapshot) {
    throw workerError("BUDGET_MONTH_NOT_FOUND", `Budget month ${targetMonth} is not available locally.`);
  }

  const policyRows = resultRows<{
    categoryId: string;
    policy: "reduce-next-month" | "carry-category";
  }>(
    `SELECT policy.category_id AS categoryId,
       policy.overspending_policy AS policy
     FROM local_budget_category_policies AS policy
     WHERE policy.budget_id = ? AND policy.month = (
       SELECT MAX(candidate.month)
       FROM local_budget_category_policies AS candidate
       WHERE candidate.budget_id = policy.budget_id
         AND candidate.category_id = policy.category_id
         AND candidate.month <= ?
     )`,
    [budgetId, firstMonth],
  );
  const policyByCategory = new Map(
    policyRows.map(({ categoryId, policy }) => [categoryId, policy]),
  );
  const overspendingPolicies = resultRows<{
    month: string;
    categoryId: string;
    policy: "reduce-next-month" | "carry-category";
  }>(
    `SELECT month, category_id AS categoryId,
       overspending_policy AS policy
     FROM local_budget_category_policies
     WHERE budget_id = ? AND month > ? AND month <= ?
     ORDER BY month, category_id`,
    [budgetId, firstMonth, targetMonth],
  );
  const accounts = resultRows<{
    id: string;
    type: string;
    participation: string;
    openingBalance: number;
  }>(
    `SELECT account.id, account.type, account.participation,
       account.opening_balance + COALESCE((
         SELECT SUM(transaction_row.amount)
         FROM local_transactions AS transaction_row
         WHERE transaction_row.budget_id = account.budget_id
           AND transaction_row.account_id = account.id
           AND substr(transaction_row.date, 1, 7) < ?
       ), 0) AS openingBalance
     FROM local_accounts AS account
     WHERE account.budget_id = ?
     ORDER BY account.id`,
    [firstMonth, budgetId],
  ).map((account) => ({
    id: account.id,
    type: account.type === "credit-card" ? "credit-card" as const : "cash" as const,
    participation: (
      account.type === "tracking" ||
      account.participation === "tracking" ||
      account.participation === "off-budget"
    ) ? "off-budget" as const : "on-budget" as const,
    openingBalance: account.openingBalance,
  }));
  const categories = resultRows<{
    id: string;
    groupId: string;
  }>(
    `SELECT id, group_id AS groupId FROM local_categories
     WHERE budget_id = ? ORDER BY group_id, id`,
    [budgetId],
  ).map((category) => ({
    id: category.id,
    groupId: category.groupId,
    overspendingPolicy:
      policyByCategory.get(category.id) ?? "reduce-next-month" as const,
  }));
  const categoryIds = new Set(categories.map(({ id }) => id));
  const paymentCategoryIdByAccountId = Object.fromEntries(
    accounts.flatMap((account) => {
      if (account.type !== "credit-card") return [];
      const categoryId = `credit-card-payment-${account.id}`;
      return categoryIds.has(categoryId) ? [[account.id, categoryId]] : [];
    }),
  );
  const assignments = resultRows<{
    month: string;
    categoryId: string;
    assigned: number;
  }>(
    `SELECT month, category_id AS categoryId, assigned
     FROM local_budget_assignments
     WHERE budget_id = ? AND month >= ? AND month <= ?
     ORDER BY month, category_id`,
    [budgetId, firstMonth, targetMonth],
  ).map((assignment) => ({
    month: assignment.month,
    categoryId: assignment.categoryId,
    amount: toMinorUnits(assignment.assigned),
  }));
  const transactionRows = resultRows<{
    id: string;
    accountId: string;
    date: string;
    categoryId: string | null;
    transferAccountId: string | null;
    amount: number;
  }>(
    `SELECT id, account_id AS accountId, date,
       category_id AS categoryId, transfer_account_id AS transferAccountId,
       amount
     FROM local_transactions
     WHERE budget_id = ? AND substr(date, 1, 7) >= ?
       AND substr(date, 1, 7) <= ?
     ORDER BY date, id`,
    [budgetId, firstMonth, targetMonth],
  );
  const splitRows = resultRows<{
    transactionId: string;
    id: string;
    categoryId: string | null;
    transferAccountId: string | null;
    amount: number;
  }>(
    `SELECT split.transaction_id AS transactionId, split.id,
       split.category_id AS categoryId,
       split.transfer_account_id AS transferAccountId, split.amount
     FROM local_transaction_splits AS split
     JOIN local_transactions AS parent ON parent.id = split.transaction_id
     WHERE parent.budget_id = ? AND substr(parent.date, 1, 7) >= ?
       AND substr(parent.date, 1, 7) <= ?
     ORDER BY split.transaction_id, split.id`,
    [budgetId, firstMonth, targetMonth],
  );
  const splitsByTransaction = new Map<string, typeof splitRows>();
  for (const split of splitRows) {
    const splits = splitsByTransaction.get(split.transactionId) ?? [];
    splits.push(split);
    splitsByTransaction.set(split.transactionId, splits);
  }
  const transactions = transactionRows.map((transaction) => ({
    ...transaction,
    splits: (splitsByTransaction.get(transaction.id) ?? []).map((split) => ({
      id: split.id,
      categoryId: split.categoryId,
      transferAccountId: split.transferAccountId,
      amount: split.amount,
    })),
  }));

  const openingAvailableByCategoryId = Object.fromEntries(
    firstSnapshot.categoryGroups.flatMap((group) =>
      group.categories.map((category) => [
        category.id,
        toMinorUnits(category.previousAvailable),
      ]),
    ),
  );
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const currentFirstIncome = transactions.reduce((total, transaction) => {
    if (transaction.date.slice(0, 7) !== firstMonth) return total;
    if (accountById.get(transaction.accountId)?.participation !== "on-budget") return total;
    if (transaction.transferAccountId) return total;
    if (transaction.splits.length > 0) {
      return total + transaction.splits.reduce(
        (sum, split) => sum + (
          split.categoryId === "__ready_to_assign__" && !split.transferAccountId
            ? split.amount
            : 0
        ),
        0,
      );
    }
    return total + (transaction.categoryId === "__ready_to_assign__" ? transaction.amount : 0);
  }, 0);
  const currentFirstAssigned = assignments
    .filter(({ month }) => month === firstMonth)
    .reduce((total, assignment) => total + assignment.amount, 0);
  const previousOverspending = categories.reduce((total, category) => {
    const opening = openingAvailableByCategoryId[category.id] ?? 0;
    return total + (
      opening < 0 && category.overspendingPolicy === "reduce-next-month"
        ? opening
        : 0
    );
  }, 0);
  const snapshotIncome = Number.isFinite(firstSnapshot.incomeForMonth)
    ? toMinorUnits(firstSnapshot.incomeForMonth ?? 0)
    : currentFirstIncome;
  const snapshotAssigned = Number.isFinite(firstSnapshot.totalAssigned)
    ? toMinorUnits(firstSnapshot.totalAssigned)
    : currentFirstAssigned;
  const snapshotPreviousOverspending = Number.isFinite(firstSnapshot.previousOverspending)
    ? toMinorUnits(firstSnapshot.previousOverspending ?? 0)
    : previousOverspending;
  const snapshotCarriedForward = Number.isFinite(firstSnapshot.carriedForwardReadyToAssign)
    ? toMinorUnits(firstSnapshot.carriedForwardReadyToAssign ?? 0)
    : toMinorUnits(firstSnapshot.readyToAssign) -
      snapshotPreviousOverspending - snapshotIncome + snapshotAssigned;
  const openingReadyToAssign = snapshotCarriedForward;

  return diagnoseSqliteBudgetProjection({
    budgetId,
    fromMonth: firstMonth,
    throughMonth: targetMonth,
    targetMonth,
    readyToAssignCategoryId: "__ready_to_assign__",
    openingReadyToAssign,
    openingPreviousOverspending: snapshotPreviousOverspending,
    openingAvailableByCategoryId,
    creditCardPolicy:
      Object.keys(paymentCategoryIdByAccountId).length > 0
        ? "payment-funding"
        : "manual",
    paymentCategoryIdByAccountId,
    accounts,
    categories,
    overspendingPolicies,
    assignments,
    transactions,
    snapshot,
  });
}

function readBudgetMonth(month: string): BudgetMonthView | null {
  const snapshot = readBudgetMonthSnapshot(month) as BudgetMonthView | null;
  if (!snapshot) return null;
  const cached = resultRows<{ projectionJson: string }>(
    `SELECT projection_json AS projectionJson
     FROM local_budget_projection_cache
     WHERE budget_id = ? AND month = ? AND engine_version = ?`,
    [activeBudgetId, month, BUDGET_PROJECTION_ENGINE_VERSION],
  )[0];
  let projection: LocalBudgetProjectionDiagnostic["projection"];
  if (cached) {
    projection = JSON.parse(cached.projectionJson) as LocalBudgetProjectionDiagnostic["projection"];
  } else {
    const diagnostic = getBudgetProjectionDiagnostic(activeBudgetId, month);
    projection = diagnostic.projection;
    for (const projectedMonth of diagnostic.projections) execute(
      `INSERT INTO local_budget_projection_cache(
         budget_id, month, engine_version, projection_json, updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(budget_id, month) DO UPDATE SET
         engine_version = excluded.engine_version,
         projection_json = excluded.projection_json,
         updated_at = excluded.updated_at`,
      [
        activeBudgetId,
        projectedMonth.month,
        BUDGET_PROJECTION_ENGINE_VERSION,
        JSON.stringify(projectedMonth),
        new Date().toISOString(),
      ],
    );
  }
  const latestMonth = resultRows<{ month: string | null }>(
    "SELECT MAX(month) AS month FROM local_budget_months WHERE budget_id = ?",
    [activeBudgetId],
  )[0]?.month;
  if (latestMonth && month >= latestMonth) {
    execute("DELETE FROM local_budget_projection_dirty WHERE budget_id = ?", [activeBudgetId]);
  }
  return applyBudgetProjectionToSnapshot(snapshot, projection);
}

function getFinancialOverview(budgetId: string, month: string) {
  const openingBalance = resultRows<{ amount: number }>(
    "SELECT COALESCE(SUM(opening_balance), 0) AS amount FROM local_accounts WHERE budget_id = ?",
    [budgetId],
  )[0]?.amount ?? 0;
  const netWorthTrend = monthWindow(month, 12).map((entry) => {
    const transactionTotal = resultRows<{ amount: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS amount
       FROM local_transactions WHERE budget_id = ? AND date <= ?`,
      [budgetId, monthEnd(entry)],
    )[0]?.amount ?? 0;
    return {
      month: entry,
      label: shortMonthLabel(entry),
      value: (openingBalance + transactionTotal) / 100,
    };
  });
  const flow = readFinancialOverviewFlow(
    resultRows,
    budgetId,
    month,
  );
  const normalisedBudgetView = readBudgetMonth(month);
  const budgetView = normalisedBudgetView
    ? normalisedBudgetView as {
        readyToAssign: number;
        categoryGroups: readonly {
          categories: readonly { isOverspent: boolean; available: number }[];
        }[];
      }
    : { readyToAssign: 0, categoryGroups: [] };
  const uncategorisedRows = resultRows<{ accountId: string; count: number }>(
    `SELECT transaction_row.account_id AS accountId, COUNT(*) AS count
     FROM local_transactions AS transaction_row
     JOIN local_accounts AS account ON account.id = transaction_row.account_id
     WHERE transaction_row.budget_id = ?
       AND substr(transaction_row.date, 1, 7) = ?
       AND transaction_row.category_id IS NULL
       AND transaction_row.amount < 0
       AND transaction_row.transfer_account_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM local_transaction_splits AS split
         WHERE split.transaction_id = transaction_row.id
       )
       AND account.participation = 'on-budget'
     GROUP BY transaction_row.account_id
     ORDER BY COUNT(*) DESC, transaction_row.account_id`,
    [budgetId, month],
  );
  const uncategorised = uncategorisedRows.reduce((total, row) => total + row.count, 0);
  const netWorth = netWorthTrend.at(-1)?.value ?? 0;
  return {
    month,
    monthLabel: longMonthLabel(month),
    netWorth,
    netWorthChangeThisMonth: netWorth - (netWorthTrend.at(-2)?.value ?? netWorth),
    netWorthChangePeriod: netWorth - (netWorthTrend.at(0)?.value ?? netWorth),
    netWorthTrend,
    monthlySnapshot: {
      income: flow.income / 100,
      expenses: flow.expenses / 100,
      savings: (flow.income - flow.expenses) / 100,
      readyToAssign: budgetView.readyToAssign,
    },
    attention: {
      overspentCategories: budgetView.categoryGroups.reduce(
        (count, group) => count + group.categories.filter(
          (category) => category.isOverspent || category.available < 0,
        ).length,
        0,
      ),
      uncategorisedTransactions: uncategorised,
      uncategorisedAccountId: uncategorisedRows[0]?.accountId,
    },
  };
}

function getMonthlySpending(budgetId: string, month: string) {
  return resultRows<{
    categoryId: string;
    categoryName: string;
    groupName: string;
    total: number;
    transactionCount: number;
  }>(
    `SELECT category.id AS categoryId, category.name AS categoryName,
       category.group_name AS groupName, SUM(spending.outflow) AS total,
       COUNT(*) AS transactionCount
     FROM (
       SELECT transaction_row.category_id AS categoryId,
         -transaction_row.amount AS outflow
       FROM local_transactions AS transaction_row
       JOIN local_accounts AS account ON account.id = transaction_row.account_id
       WHERE transaction_row.budget_id = ?
         AND substr(transaction_row.date, 1, 7) = ?
         AND transaction_row.amount < 0
         AND transaction_row.category_id IS NOT NULL
         AND transaction_row.transfer_account_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM local_transaction_splits
           WHERE transaction_id = transaction_row.id
         )
         AND account.type <> 'tracking'
         AND account.participation NOT IN ('tracking', 'off-budget')
       UNION ALL
       SELECT split.category_id AS categoryId, -split.amount AS outflow
       FROM local_transaction_splits AS split
       JOIN local_transactions AS parent ON parent.id = split.transaction_id
       JOIN local_accounts AS account ON account.id = parent.account_id
       WHERE parent.budget_id = ?
         AND substr(parent.date, 1, 7) = ?
         AND split.amount < 0
         AND split.category_id IS NOT NULL
         AND split.transfer_account_id IS NULL
         AND account.type <> 'tracking'
         AND account.participation NOT IN ('tracking', 'off-budget')
     ) AS spending
     JOIN local_categories AS category
       ON category.budget_id = ? AND category.id = spending.categoryId
     GROUP BY category.id, category.name, category.group_name
     ORDER BY total DESC, category.name`,
    [budgetId, month, budgetId, month, budgetId],
  ).map((row) => ({
    ...row,
    total: row.total / 100,
    transactions: [],
  }));
}

function getMonthlyCategoryTransactions(
  budgetId: string,
  month: string,
  categoryId: string,
) {
  return resultRows<{
    id: string; date: string; payee: string; memo: string; outflow: number;
  }>(
    `SELECT * FROM (
       SELECT transaction_row.id, transaction_row.date,
         COALESCE(transaction_row.payee_name, '') AS payee,
         COALESCE(transaction_row.memo, '') AS memo,
         -transaction_row.amount AS outflow
       FROM local_transactions AS transaction_row
       JOIN local_accounts AS account ON account.id = transaction_row.account_id
       WHERE transaction_row.budget_id = ?
         AND substr(transaction_row.date, 1, 7) = ?
         AND transaction_row.category_id = ?
         AND transaction_row.amount < 0
         AND transaction_row.transfer_account_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM local_transaction_splits
           WHERE transaction_id = transaction_row.id
         )
         AND account.type <> 'tracking'
         AND account.participation NOT IN ('tracking', 'off-budget')
       UNION ALL
       SELECT split.id, parent.date, COALESCE(parent.payee_name, '') AS payee,
         COALESCE(split.memo, parent.memo, '') AS memo, -split.amount AS outflow
       FROM local_transaction_splits AS split
       JOIN local_transactions AS parent ON parent.id = split.transaction_id
       JOIN local_accounts AS account ON account.id = parent.account_id
       WHERE parent.budget_id = ?
         AND substr(parent.date, 1, 7) = ?
         AND split.category_id = ?
         AND split.amount < 0
         AND split.transfer_account_id IS NULL
         AND account.type <> 'tracking'
         AND account.participation NOT IN ('tracking', 'off-budget')
     ) ORDER BY date DESC, id DESC LIMIT 250`,
    [budgetId, month, categoryId, budgetId, month, categoryId],
  ).map((row) => ({
    id: row.id,
    date: row.date,
    payee: row.payee,
    category: "",
    categoryId,
    memo: row.memo,
    inflow: 0,
    outflow: row.outflow / 100,
    runningBalance: 0,
    cleared: false,
    reconciled: false,
    attachmentCount: 0,
  }));
}

function getCategoryActivityDrilldown(
  budgetId: string,
  month: string,
  categoryId: string,
): BudgetActivityDrilldown {
  const view = readBudgetMonth(month);
  if (!view || view.budgetId !== budgetId) {
    throw new Error(`Budget month ${month} is not available locally.`);
  }
  const category = view.categoryGroups.flatMap(({ categories }) => categories)
    .find(({ id }) => id === categoryId);
  if (!category) throw new Error("Category not found.");

  const rowCount = resultRows<{ count: number }>(
    `SELECT COUNT(*) AS count FROM (
       SELECT transaction_row.id
       FROM local_transactions AS transaction_row
       JOIN local_accounts AS account ON account.id = transaction_row.account_id
       WHERE transaction_row.budget_id = ?
         AND substr(transaction_row.date, 1, 7) = ?
         AND transaction_row.category_id = ?
         AND transaction_row.transfer_account_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM local_transaction_splits AS split
           WHERE split.transaction_id = transaction_row.id
         )
         AND account.participation = 'on-budget'
       UNION ALL
       SELECT split.id
       FROM local_transaction_splits AS split
       JOIN local_transactions AS parent ON parent.id = split.transaction_id
       JOIN local_accounts AS account ON account.id = parent.account_id
       WHERE parent.budget_id = ?
         AND substr(parent.date, 1, 7) = ?
         AND split.category_id = ?
         AND split.transfer_account_id IS NULL
         AND parent.transfer_account_id IS NULL
         AND account.participation = 'on-budget'
     )`,
    [budgetId, month, categoryId, budgetId, month, categoryId],
  )[0]?.count ?? 0;
  if (rowCount > 2_000) {
    throw new Error(
      "Category activity contains more than 2,000 rows. Narrow the month before opening details.",
    );
  }

  const rows = resultRows<{
    id: string;
    transactionId: string;
    splitLineId: string | null;
    accountId: string;
    accountName: string;
    date: string;
    payee: string;
    memo: string;
    amount: number;
    isSplit: number;
  }>(
    `SELECT * FROM (
       SELECT transaction_row.id, transaction_row.id AS transactionId,
         NULL AS splitLineId, transaction_row.account_id AS accountId,
         account.name AS accountName, transaction_row.date,
         COALESCE(transaction_row.payee_name, 'Unspecified payee') AS payee,
         COALESCE(transaction_row.memo, '') AS memo,
         transaction_row.amount, 0 AS isSplit
       FROM local_transactions AS transaction_row
       JOIN local_accounts AS account ON account.id = transaction_row.account_id
       WHERE transaction_row.budget_id = ?
         AND substr(transaction_row.date, 1, 7) = ?
         AND transaction_row.category_id = ?
         AND transaction_row.transfer_account_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM local_transaction_splits AS split
           WHERE split.transaction_id = transaction_row.id
         )
         AND account.participation = 'on-budget'
       UNION ALL
       SELECT parent.id || ':' || split.id AS id, parent.id AS transactionId,
         split.id AS splitLineId, parent.account_id AS accountId,
         account.name AS accountName, parent.date,
         COALESCE(parent.payee_name, 'Unspecified payee') AS payee,
         COALESCE(split.memo, parent.memo, '') AS memo,
         split.amount, 1 AS isSplit
       FROM local_transaction_splits AS split
       JOIN local_transactions AS parent ON parent.id = split.transaction_id
       JOIN local_accounts AS account ON account.id = parent.account_id
       WHERE parent.budget_id = ?
         AND substr(parent.date, 1, 7) = ?
         AND split.category_id = ?
         AND split.transfer_account_id IS NULL
         AND parent.transfer_account_id IS NULL
         AND account.participation = 'on-budget'
     ) ORDER BY date, payee, transactionId, id LIMIT 2000`,
    [budgetId, month, categoryId, budgetId, month, categoryId],
  ).map((row): BudgetActivityDrilldownRow => ({
    id: row.id,
    transactionId: row.transactionId,
    ...(row.splitLineId ? { splitLineId: row.splitLineId } : {}),
    accountId: row.accountId,
    accountName: row.accountName,
    date: row.date,
    payee: row.payee,
    memo: row.memo,
    categoryId,
    categoryName: category.name,
    inflow: row.amount > 0 ? row.amount / 100 : 0,
    outflow: row.amount < 0 ? -row.amount / 100 : 0,
    amount: row.amount / 100,
    isSplit: row.isSplit === 1,
  }));
  const totalInflow = rows.reduce((sum, row) => sum + row.inflow, 0);
  const totalOutflow = rows.reduce((sum, row) => sum + row.outflow, 0);
  const netActivity = totalInflow - totalOutflow;
  if (Math.round(netActivity * 100) !== Math.round(category.activity * 100)) {
    throw new Error(
      `Category activity details do not reconcile with the budget engine for ${category.name}.`,
    );
  }
  return {
    budgetId,
    month,
    monthLabel: view.monthLabel,
    categoryId,
    categoryName: category.name,
    currencyCode: view.currencyCode,
    rows,
    totalInflow,
    totalOutflow,
    netActivity,
  };
}

function queryTransactions(query: LocalTransactionQuery) {
  const limit = Math.max(1, Math.min(250, Math.trunc(query.limit)));
  const offset = Math.max(0, Math.trunc(query.offset ?? 0));
  const where = ["transaction_row.budget_id = ?", "transaction_row.account_id = ?"];
  const bind: unknown[] = [query.budgetId, query.accountId];
  if (query.before) {
    where.push("(transaction_row.date, transaction_row.id) < (?, ?)");
    bind.push(query.before.date, query.before.id);
  }
  if (query.categoryFilter === "uncategorised") {
    where.push(
      `transaction_row.category_id IS NULL
       AND transaction_row.amount < 0
       AND transaction_row.transfer_account_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM local_transaction_splits AS split
         WHERE split.transaction_id = transaction_row.id
       )`,
    );
  }
  const categoryNameExpression = "COALESCE(category_record.name, transaction_row.category_name)";
  const term = query.search?.query.trim().toLowerCase();
  if (term) {
    const like = `%${term}%`;
    const amountCents = parseRegisterAmountSearchCents(query.search?.query);
    const configuredScopeColumns = {
      payee: ["transaction_row.payee_name"],
      category: [categoryNameExpression],
      memo: ["transaction_row.memo"],
      amount: ["CAST(ABS(transaction_row.amount) AS TEXT)"],
      all: [
        "transaction_row.payee_name",
        categoryNameExpression,
        "transaction_row.memo",
        "CAST(ABS(transaction_row.amount) AS TEXT)",
      ],
    }[query.search?.scope ?? "all"];
    const scopeColumns = amountCents === null
      ? configuredScopeColumns
      : configuredScopeColumns.filter((column) => !column.includes("transaction_row.amount"));
    const textPredicates = scopeColumns.map((column) => `LOWER(COALESCE(${column}, '')) LIKE ?`);
    const amountPredicate = amountCents !== null && (query.search?.scope === "amount" || query.search?.scope === "all")
      ? "ABS(transaction_row.amount) = ?"
      : null;
    where.push(`(${[...textPredicates, ...(amountPredicate ? [amountPredicate] : [])].join(" OR ")})`);
    bind.push(...scopeColumns.map(() => like), ...(amountPredicate ? [amountCents] : []));
  }
  const sortColumn = {
    date: "transaction_row.date",
    payee: "LOWER(COALESCE(transaction_row.payee_name, ''))",
    category: `LOWER(COALESCE(${categoryNameExpression}, ''))`,
    memo: "LOWER(COALESCE(transaction_row.memo, ''))",
    outflow: "CASE WHEN transaction_row.amount < 0 THEN -transaction_row.amount ELSE 0 END",
    inflow: "CASE WHEN transaction_row.amount > 0 THEN transaction_row.amount ELSE 0 END",
  }[query.sort?.column ?? "date"];
  const direction = query.sort?.direction === "ascending" ? "ASC" : "DESC";
  const clause = where.join(" AND ");
  const totalCount = query.includeTotalCount === false
    ? undefined
    : resultRows<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM local_transactions AS transaction_row
         LEFT JOIN local_categories AS category_record
           ON category_record.budget_id = transaction_row.budget_id
          AND category_record.id = transaction_row.category_id
         WHERE ${clause}`,
        bind,
      )[0]?.count ?? 0;
  const rows = resultRows<{
    id: string;
    date: string;
    amount: number;
    memo: string | null;
    checkNumber: string | null;
    clearedStatus: string;
    payeeId: string | null;
    payeeName: string | null;
    rawPayeeName: string | null;
    categoryId: string | null;
    categoryName: string | null;
    transferAccountId: string | null;
    transferAccountName: string | null;
    transferTransactionId: string | null;
    generatedFromSchedule: number;
    scheduledTransactionId: string | null;
    scheduledOccurrenceDate: string | null;
    attachmentCount: number;
  }>(
    `SELECT
       transaction_row.id, transaction_row.date, transaction_row.amount,
       transaction_row.memo, transaction_row.check_number AS checkNumber,
       transaction_row.cleared_status AS clearedStatus,
       transaction_row.payee_id AS payeeId, transaction_row.payee_name AS payeeName,
       transaction_row.raw_payee_name AS rawPayeeName,
       transaction_row.category_id AS categoryId,
       ${categoryNameExpression} AS categoryName,
       transaction_row.transfer_account_id AS transferAccountId,
       transfer_account.name AS transferAccountName,
       transaction_row.transfer_transaction_id AS transferTransactionId,
       transaction_row.generated_from_schedule AS generatedFromSchedule,
       transaction_row.scheduled_transaction_id AS scheduledTransactionId,
       transaction_row.scheduled_occurrence_date AS scheduledOccurrenceDate,
       (SELECT COUNT(*)
          FROM local_transaction_attachments AS attachment
         WHERE attachment.budget_id = transaction_row.budget_id
           AND attachment.transaction_id = transaction_row.id) AS attachmentCount
     FROM local_transactions AS transaction_row
     LEFT JOIN local_categories AS category_record
       ON category_record.budget_id = transaction_row.budget_id
      AND category_record.id = transaction_row.category_id
     LEFT JOIN local_accounts AS transfer_account
       ON transfer_account.budget_id = transaction_row.budget_id
      AND transfer_account.id = transaction_row.transfer_account_id
     WHERE ${clause}
     ORDER BY ${sortColumn} ${direction}, transaction_row.id ${direction}
     LIMIT ? OFFSET ?`,
    [...bind, limit + 1, offset],
  );
  const pageRows = rows.slice(0, limit);
  const pageIds = pageRows.map(({ id }) => id);
  const splitByTransaction = new Map<string, unknown[]>();
  const tagsByTransaction = new Map<string, string[]>();
  const attachmentsByTransaction = new Map<string, unknown[]>();
  if (pageIds.length > 0) {
    const placeholders = pageIds.map(() => "?").join(", ");
    for (const split of resultRows<{
      transactionId: string;
      id: string;
      categoryId: string | null;
      categoryName: string | null;
      transferAccountId: string | null;
      transferAccountName: string | null;
      transferTransactionId: string | null;
      memo: string | null;
      amount: number;
    }>(
      `SELECT split.transaction_id AS transactionId, split.id,
         split.category_id AS categoryId,
         COALESCE(category_record.name, split.category_name) AS categoryName,
         split.transfer_account_id AS transferAccountId,
         transfer_account.name AS transferAccountName,
         split.transfer_transaction_id AS transferTransactionId,
         split.memo, split.amount
       FROM local_transaction_splits AS split
       LEFT JOIN local_accounts AS transfer_account
         ON transfer_account.id = split.transfer_account_id
       LEFT JOIN local_categories AS category_record
         ON category_record.id = split.category_id
       WHERE split.transaction_id IN (${placeholders})
       ORDER BY split.transaction_id, split.id`,
      pageIds,
    )) {
      const values = splitByTransaction.get(split.transactionId) ?? [];
      const { transactionId: _transactionId, ...row } = split;
      values.push(row);
      splitByTransaction.set(split.transactionId, values);
    }
    for (const assignment of resultRows<{ transactionId: string; tagId: string }>(
      `SELECT transaction_id AS transactionId, tag_id AS tagId
       FROM local_transaction_tags
       WHERE transaction_id IN (${placeholders})
       ORDER BY transaction_id, tag_id`,
      pageIds,
    )) {
      const values = tagsByTransaction.get(assignment.transactionId) ?? [];
      values.push(assignment.tagId);
      tagsByTransaction.set(assignment.transactionId, values);
    }
    for (const attachment of resultRows<{
      transactionId: string;
      id: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      attachedAt: string;
      contentHash: string;
    }>(
      `SELECT transaction_id AS transactionId, id, file_name AS fileName,
         file_size AS fileSize, mime_type AS mimeType, attached_at AS attachedAt,
         content_hash AS contentHash
       FROM local_transaction_attachments
       WHERE budget_id = ? AND transaction_id IN (${placeholders})
       ORDER BY transaction_id, attached_at, id`,
      [query.budgetId, ...pageIds],
    )) {
      const values = attachmentsByTransaction.get(attachment.transactionId) ?? [];
      const { transactionId: _transactionId, ...metadata } = attachment;
      values.push({
        ...metadata,
        contentRef: `local-sqlite:${encodeURIComponent(query.budgetId)}:${encodeURIComponent(metadata.id)}`,
        storageType: "local-sqlite",
      });
      attachmentsByTransaction.set(attachment.transactionId, values);
    }
  }
  const selected = pageRows.map((row) => ({
    ...row,
    generatedFromSchedule: row.generatedFromSchedule === 1,
    splitLines: splitByTransaction.get(row.id) ?? [],
    tagIds: tagsByTransaction.get(row.id) ?? [],
    attachments: attachmentsByTransaction.get(row.id) ?? [],
  }));
  const last = selected.at(-1);
  return {
    rows: selected,
    nextCursor: last ? { date: last.date, id: last.id } : null,
    hasMore: rows.length > limit,
    totalCount,
  };
}

function getTransaction(budgetId: string, transactionId: string): LocalTransactionRecord | null {
  const row = resultRows<{
    id: string; budgetId: string; accountId: string; date: string; amount: number;
    memo: string | null; checkNumber: string | null; clearedStatus: string;
    payeeId: string | null; payeeName: string | null; rawPayeeName: string | null;
    categoryId: string | null;
    categoryName: string | null; transferAccountId: string | null;
    transferTransactionId: string | null; generatedFromSchedule: number;
    scheduledTransactionId: string | null; scheduledOccurrenceDate: string | null;
    updatedAt: string;
  }>(
    `SELECT transaction_row.id, transaction_row.budget_id AS budgetId,
       transaction_row.account_id AS accountId, transaction_row.date, transaction_row.amount,
       transaction_row.memo, transaction_row.check_number AS checkNumber,
       transaction_row.cleared_status AS clearedStatus,
       transaction_row.payee_id AS payeeId, transaction_row.payee_name AS payeeName,
       transaction_row.raw_payee_name AS rawPayeeName,
       transaction_row.category_id AS categoryId,
       COALESCE(category_record.name, transaction_row.category_name) AS categoryName,
       transaction_row.transfer_account_id AS transferAccountId,
       transaction_row.transfer_transaction_id AS transferTransactionId,
       transaction_row.generated_from_schedule AS generatedFromSchedule,
       transaction_row.scheduled_transaction_id AS scheduledTransactionId,
       transaction_row.scheduled_occurrence_date AS scheduledOccurrenceDate,
       transaction_row.updated_at AS updatedAt
     FROM local_transactions AS transaction_row
     LEFT JOIN local_categories AS category_record
       ON category_record.budget_id = transaction_row.budget_id
      AND category_record.id = transaction_row.category_id
     WHERE transaction_row.budget_id = ? AND transaction_row.id = ?`,
    [budgetId, transactionId],
  )[0];
  if (!row) return null;
  return {
    ...row,
    generatedFromSchedule: row.generatedFromSchedule === 1,
    splitLines: resultRows(
      `SELECT split.id, split.category_id AS categoryId,
         COALESCE(category_record.name, split.category_name) AS categoryName,
         transfer_account_id AS transferAccountId,
         transfer_transaction_id AS transferTransactionId, memo, amount
       FROM local_transaction_splits AS split
       LEFT JOIN local_categories AS category_record ON category_record.id = split.category_id
       WHERE split.transaction_id = ? ORDER BY split.id`,
      [transactionId],
    ),
    tagIds: resultRows<{ tagId: string }>(
      "SELECT tag_id AS tagId FROM local_transaction_tags WHERE transaction_id = ? ORDER BY tag_id",
      [transactionId],
    ).map(({ tagId }) => tagId),
  };
}

function getTransactionsByIds(
  budgetId: string,
  accountId: string,
  transactionIds: readonly string[],
): readonly LocalTransactionRecord[] {
  if (transactionIds.length === 0) return [];
  return [...new Set(transactionIds)]
    .map((transactionId) => getTransaction(budgetId, transactionId))
    .filter(
      (transaction): transaction is LocalTransactionRecord =>
        transaction !== null && transaction.accountId === accountId,
    );
}

function writeTransaction(
  transaction: LocalTransactionRecord,
  mutation: LocalBudgetMutation,
  resolveConflictId?: string,
): LocalBudgetManifest {
  assertMutationScope(mutation);
  execute("BEGIN IMMEDIATE");
  try {
    const previousMonth = resultRows<{ month: string }>(
      "SELECT substr(date, 1, 7) AS month FROM local_transactions WHERE budget_id = ? AND id = ?",
      [activeBudgetId, transaction.id],
    )[0]?.month;
    upsertTransaction(transaction);
    markBudgetProjectionDirty(
      previousMonth && previousMonth < transaction.date.slice(0, 7)
        ? previousMonth
        : transaction.date.slice(0, 7),
    );
    insertOutbox(mutation);
    writeMetadata("localRevision", String(Number(readMetadata("localRevision") ?? "0") + 1));
    resolveLocalConflictInTransaction(resolveConflictId);
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function writeTransactionBatch(
  writes: readonly {
    readonly transaction: LocalTransactionRecord;
    readonly mutation: LocalBudgetMutation;
  }[],
): LocalBudgetManifest {
  for (const { mutation } of writes) assertMutationScope(mutation);
  if (writes.length === 0) return currentManifest();
  execute("BEGIN IMMEDIATE");
  try {
    for (const { transaction, mutation } of writes) {
      const previousMonth = resultRows<{ month: string }>(
        "SELECT substr(date, 1, 7) AS month FROM local_transactions WHERE budget_id = ? AND id = ?",
        [activeBudgetId, transaction.id],
      )[0]?.month;
      upsertTransaction(transaction);
      markBudgetProjectionDirty(
        previousMonth && previousMonth < transaction.date.slice(0, 7)
          ? previousMonth
          : transaction.date.slice(0, 7),
      );
      insertOutbox(mutation);
    }
    writeMetadata(
      "localRevision",
      String(Number(readMetadata("localRevision") ?? "0") + writes.length),
    );
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function deleteTransaction(
  transactionId: string,
  mutation: LocalBudgetMutation,
  resolveConflictId?: string,
): LocalBudgetManifest {
  assertMutationScope(mutation);
  execute("BEGIN IMMEDIATE");
  try {
    const previousMonth = resultRows<{ month: string }>(
      "SELECT substr(date, 1, 7) AS month FROM local_transactions WHERE budget_id = ? AND id = ?",
      [activeBudgetId, transactionId],
    )[0]?.month;
    execute(
      "DELETE FROM local_transactions WHERE budget_id = ? AND id = ?",
      [activeBudgetId, transactionId],
    );
    if (previousMonth) markBudgetProjectionDirty(previousMonth);
    insertOutbox(mutation);
    writeMetadata("localRevision", String(Number(readMetadata("localRevision") ?? "0") + 1));
    resolveLocalConflictInTransaction(resolveConflictId);
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function deleteTransactionBatch(
  deletes: readonly {
    readonly transactionId: string;
    readonly mutation: LocalBudgetMutation;
  }[],
): LocalBudgetManifest {
  for (const { mutation } of deletes) assertMutationScope(mutation);
  if (deletes.length === 0) return currentManifest();

  execute("BEGIN IMMEDIATE");
  try {
    for (const { transactionId, mutation } of deletes) {
      const previousMonth = resultRows<{ month: string }>(
        "SELECT substr(date, 1, 7) AS month FROM local_transactions WHERE budget_id = ? AND id = ?",
        [activeBudgetId, transactionId],
      )[0]?.month;

      execute(
        "DELETE FROM local_transactions WHERE budget_id = ? AND id = ?",
        [activeBudgetId, transactionId],
      );

      if (previousMonth) markBudgetProjectionDirty(previousMonth);
      insertOutbox(mutation);
    }

    writeMetadata(
      "localRevision",
      String(Number(readMetadata("localRevision") ?? "0") + deletes.length),
    );
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }

  return currentManifest();
}

function writeTransactionAttachment(
  attachment: LocalTransactionAttachmentRecord,
  content: Uint8Array,
  mutation: LocalBudgetMutation,
  resolveConflictId?: string,
): LocalBudgetManifest {
  assertMutationScope(mutation);
  if (mutation.entityId !== attachmentEntityId(attachment.id)) {
    throw workerError("INVALID_ATTACHMENT", "Attachment mutation identity is invalid.");
  }
  execute("BEGIN IMMEDIATE");
  try {
    upsertTransactionAttachment(attachment, content);
    insertOutbox(mutation);
    writeMetadata("localRevision", String(Number(readMetadata("localRevision") ?? "0") + 1));
    resolveLocalConflictInTransaction(resolveConflictId);
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function deleteTransactionAttachment(
  attachmentId: string,
  mutation: LocalBudgetMutation,
  resolveConflictId?: string,
): LocalBudgetManifest {
  assertMutationScope(mutation);
  if (mutation.entityId !== attachmentEntityId(attachmentId)) {
    throw workerError("INVALID_ATTACHMENT", "Attachment mutation identity is invalid.");
  }
  execute("BEGIN IMMEDIATE");
  try {
    execute(
      "DELETE FROM local_transaction_attachments WHERE budget_id = ? AND id = ?",
      [activeBudgetId, attachmentId],
    );
    insertOutbox(mutation);
    writeMetadata("localRevision", String(Number(readMetadata("localRevision") ?? "0") + 1));
    resolveLocalConflictInTransaction(resolveConflictId);
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function readTransactionAttachmentContent(
  budgetId: string,
  attachmentId: string,
): { readonly content: Uint8Array; readonly mimeType: string; readonly contentHash: string } | null {
  const row = resultRows<{
    content: Uint8Array;
    mimeType: string;
    contentHash: string;
  }>(
    `SELECT content, mime_type AS mimeType, content_hash AS contentHash
     FROM local_transaction_attachments WHERE budget_id = ? AND id = ?`,
    [budgetId, attachmentId],
  )[0];
  return row ? { ...row, content: Uint8Array.from(row.content) } : null;
}

function listAccountNavigation(budgetId: string) {
  return resultRows(
    `SELECT account.id, account.name, account.type, account.participation,
       account.opening_balance AS openingBalance,
       account.currency_code AS currencyCode, account.closed_at AS closedAt,
       account.opening_balance + COALESCE((
         SELECT SUM(transaction_row.amount)
         FROM local_transactions AS transaction_row
         WHERE transaction_row.budget_id = account.budget_id
           AND transaction_row.account_id = account.id
       ), 0) AS workingBalance,
       (
         SELECT COUNT(*)
         FROM local_transactions AS transaction_row
         WHERE transaction_row.budget_id = account.budget_id
           AND transaction_row.account_id = account.id
       ) AS transactionCount,
       CASE
         WHEN account.participation <> 'on-budget' THEN 0
         WHEN EXISTS (
           SELECT 1
           FROM local_transactions AS transaction_row
           WHERE transaction_row.budget_id = account.budget_id
             AND transaction_row.account_id = account.id
             AND transaction_row.category_id IS NULL
             AND transaction_row.amount < 0
             AND transaction_row.transfer_account_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM local_transaction_splits AS split
               WHERE split.transaction_id = transaction_row.id
             )
           LIMIT 1
         )
         THEN 1
         ELSE 0
       END AS hasUncategorizedTransactions
     FROM local_accounts AS account
     WHERE account.budget_id = ?
     ORDER BY account.closed_at IS NOT NULL, account.name`,
    [budgetId],
  );
}

function listPayees(budgetId: string, archived: boolean) {
  return resultRows<{
    id: string; name: string; note: string; archived: number;
    defaultCategoryId: string | null; defaultCategoryName: string | null;
    iconRef: string | null; createdAt: string | null; updatedAt: string | null;
    useCount: number; scheduledUseCount: number; firstUsedAt: string | null; lastUsedAt: string | null;
  }>(
    `SELECT payee.id, payee.name, payee.note, payee.archived,
       payee.default_category_id AS defaultCategoryId,
       payee.default_category_name AS defaultCategoryName,
       payee.icon_ref AS iconRef, payee.created_at AS createdAt,
       payee.updated_at AS updatedAt,
       (SELECT COUNT(*) FROM local_transactions tx
         WHERE tx.budget_id = payee.budget_id AND tx.payee_id = payee.id) AS useCount,
       (SELECT MIN(date) FROM local_transactions tx
         WHERE tx.budget_id = payee.budget_id AND tx.payee_id = payee.id) AS firstUsedAt,
       (SELECT MAX(date) FROM local_transactions tx
         WHERE tx.budget_id = payee.budget_id AND tx.payee_id = payee.id) AS lastUsedAt,
       (SELECT COUNT(*) FROM local_scheduled_transactions schedule
         WHERE schedule.budget_id = payee.budget_id
           AND json_extract(schedule.payload_json, '$.payeeId') = payee.id) AS scheduledUseCount
     FROM local_payees payee
     WHERE payee.budget_id = ? AND payee.archived = ?
     ORDER BY payee.name`,
    [budgetId, archived ? 1 : 0],
  ).map((row) => ({
    ...row, archived,
    aliases: resultRows<{ id: string; value: string }>(
      `SELECT id, value FROM local_payee_aliases
       WHERE budget_id = ? AND payee_id = ? ORDER BY value`, [budgetId, row.id]),
    importRules: resultRows<{
      id: string; matchType: "equals" | "contains" | "startsWith" | "endsWith";
      text: string; defaultCategoryId: string | null; defaultCategoryName: string | null;
      priority: number; enabled: number;
    }>(`SELECT id, match_type AS matchType, pattern AS text,
          default_category_id AS defaultCategoryId, default_category_name AS defaultCategoryName,
          priority, enabled
        FROM local_payee_recognition_rules WHERE budget_id = ? AND payee_id = ?
        ORDER BY priority DESC, id`, [budgetId, row.id])
      .map((rule) => ({ ...rule, enabled: Boolean(rule.enabled) })),
  }));
}

function listPayeeDuplicateSuppressions(budgetId: string) {
  return resultRows<{ leftPayeeId: string; rightPayeeId: string }>(
    `SELECT left_payee_id AS leftPayeeId, right_payee_id AS rightPayeeId
     FROM local_payee_duplicate_suppressions WHERE budget_id = ?`, [budgetId]);
}

function keepPayeesSeparate(
  budgetId: string,
  pairs: readonly { readonly leftPayeeId: string; readonly rightPayeeId: string }[],
) {
  execute("BEGIN IMMEDIATE");
  try {
    for (const pair of pairs) {
      const [left, right] = [pair.leftPayeeId, pair.rightPayeeId].sort();
      if (!left || !right || left === right) continue;
      execute(`INSERT OR IGNORE INTO local_payee_duplicate_suppressions(
        budget_id,left_payee_id,right_payee_id,decision,created_at) VALUES(?,?,?,?,?)`,
      [budgetId, left, right, "keep-separate", new Date().toISOString()]);
    }
    execute("COMMIT");
  } catch (error) { execute("ROLLBACK"); throw error; }
}

function writePayee(
  payee: import("./registerSchema").LocalPayeeRecord,
  mutation: LocalBudgetMutation,
  resolveConflictId?: string,
) {
  assertMutationScope(mutation);
  execute("BEGIN IMMEDIATE");
  try {
    execute(
      `INSERT INTO local_payees(id, budget_id, name, note, archived,
         default_category_id, default_category_name, icon_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, note = excluded.note, archived = excluded.archived,
         default_category_id = excluded.default_category_id,
         default_category_name = excluded.default_category_name,
         icon_ref = excluded.icon_ref, updated_at = excluded.updated_at`,
      [payee.id, payee.budgetId, payee.name, payee.note, payee.archived ? 1 : 0,
       payee.defaultCategoryId ?? null, payee.defaultCategoryName ?? null,
       payee.iconRef ?? null, payee.createdAt ?? new Date().toISOString(),
       payee.updatedAt ?? new Date().toISOString()],
    );
    execute("DELETE FROM local_payee_aliases WHERE budget_id = ? AND payee_id = ?", [payee.budgetId, payee.id]);
    for (const alias of payee.aliases ?? []) {
      execute(`INSERT INTO local_payee_aliases(id,budget_id,payee_id,value,normalized_value,created_at)
        VALUES(?,?,?,?,?,?)`, [alias.id, payee.budgetId, payee.id, alias.value,
        normalisePayeeIdentity(alias.value), new Date().toISOString()]);
    }
    execute("DELETE FROM local_payee_recognition_rules WHERE budget_id = ? AND payee_id = ?", [payee.budgetId, payee.id]);
    for (const rule of payee.importRules ?? []) {
      execute(`INSERT INTO local_payee_recognition_rules(id,budget_id,payee_id,match_type,pattern,
        normalized_pattern,default_category_id,default_category_name,priority,enabled,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [rule.id, payee.budgetId, payee.id, rule.matchType,
        rule.text, normalisePayeeIdentity(rule.text), rule.defaultCategoryId ?? null,
        rule.defaultCategoryName ?? null, rule.priority ?? 0, rule.enabled === false ? 0 : 1,
        new Date().toISOString(), new Date().toISOString()]);
    }
    execute(
      `UPDATE local_transactions SET payee_name = ?
       WHERE budget_id = ? AND payee_id = ?`,
      [payee.name, payee.budgetId, payee.id],
    );
    const linkedSchedules = resultRows<{ id: string; payloadJson: string }>(
      `SELECT id, payload_json AS payloadJson FROM local_scheduled_transactions
       WHERE budget_id = ? AND json_extract(payload_json, '$.payeeId') = ?`,
      [payee.budgetId, payee.id],
    );
    for (const schedule of linkedSchedules) {
      const payload = JSON.parse(schedule.payloadJson) as Record<string, unknown>;
      payload.payee = payee.name;
      payload.updatedAt = new Date().toISOString();
      execute(
        "UPDATE local_scheduled_transactions SET payload_json = ?, updated_at = ? WHERE budget_id = ? AND id = ?",
        [JSON.stringify(payload), payload.updatedAt, payee.budgetId, schedule.id],
      );
    }
    insertOutbox(mutation);
    writeMetadata("localRevision", String(Number(readMetadata("localRevision") ?? "0") + 1));
    resolveLocalConflictInTransaction(resolveConflictId);
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function deleteUnusedPayee(budgetId: string, payeeId: string, mutation: LocalBudgetMutation) {
  assertMutationScope(mutation);
  const transactionCount = resultRows<{ count: number }>(
    "SELECT COUNT(*) AS count FROM local_transactions WHERE budget_id = ? AND payee_id = ?", [budgetId, payeeId],
  )[0]?.count ?? 0;
  const scheduledCount = resultRows<{ count: number }>(
    `SELECT COUNT(*) AS count FROM local_scheduled_transactions
     WHERE budget_id = ? AND json_extract(payload_json, '$.payeeId') = ?`, [budgetId, payeeId],
  )[0]?.count ?? 0;
  const ruleCount = resultRows<{ count: number }>(
    "SELECT COUNT(*) AS count FROM local_payee_recognition_rules WHERE budget_id = ? AND payee_id = ? AND enabled = 1",
    [budgetId, payeeId],
  )[0]?.count ?? 0;
  if (transactionCount || scheduledCount || ruleCount) {
    throw workerError("PAYEE_IN_USE", "Used payees must be archived or merged, not deleted.");
  }
  execute("BEGIN IMMEDIATE");
  try {
    execute("DELETE FROM local_payee_aliases WHERE budget_id = ? AND payee_id = ?", [budgetId, payeeId]);
    execute("DELETE FROM local_payee_recognition_rules WHERE budget_id = ? AND payee_id = ?", [budgetId, payeeId]);
    execute("DELETE FROM local_payees WHERE budget_id = ? AND id = ?", [budgetId, payeeId]);
    insertOutbox(mutation);
    writeMetadata("localRevision", String(Number(readMetadata("localRevision") ?? "0") + 1));
    execute("COMMIT");
  } catch (error) { execute("ROLLBACK"); throw error; }
  return currentManifest();
}

function normalisePayeeIdentity(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function reconcileCreditCardPaymentCategoryForAccount(
  account: import("./registerSchema").LocalAccountRecord,
): void {
  const categoryId = `credit-card-payment-${account.id}`;
  const groupId = "credit-card-payments";
  const groupName = "Credit Card Payments";
  const isCreditCard = account.type === "credit-card";

  const rows = resultRows<{ month: string; payload: string }>(
    `SELECT month, view_json AS payload
     FROM local_budget_months
     WHERE budget_id = ?
     ORDER BY month`,
    [account.budgetId],
  );

  if (!isCreditCard) {
    const hasMeaningfulPaymentCategoryState = rows.some((row) => {
      const view = JSON.parse(row.payload) as BudgetMonthView;
      const category = view.categoryGroups
        ?.flatMap((group) => group.categories ?? [])
        .find((candidate) => candidate.id === categoryId);

      if (!category) return false;

      return (
        category.previousAvailable !== 0 ||
        category.assigned !== 0 ||
        category.activity !== 0 ||
        category.available !== 0
      );
    });

    if (hasMeaningfulPaymentCategoryState) {
      throw workerError(
        "CREDIT_CARD_PAYMENT_CATEGORY_IN_USE",
        "An account with credit-card payment budget history cannot change to another account type.",
      );
    }
  }

  for (const row of rows) {
    const view = JSON.parse(row.payload) as BudgetMonthView;
    if (!Array.isArray(view.categoryGroups)) continue;

    const existingCategory = view.categoryGroups
      .flatMap((group) => group.categories ?? [])
      .find((category) => category.id === categoryId);

    let categoryGroups = view.categoryGroups
      .map((group) => ({
        ...group,
        categories: (group.categories ?? []).filter(
          (category) => category.id !== categoryId,
        ),
      }))
      .filter(
        (group) =>
          group.id !== groupId ||
          isCreditCard ||
          group.categories.length > 0,
      );

    if (isCreditCard) {
      const paymentCategory = existingCategory
        ? {
            ...existingCategory,
            name: account.name,
            isArchived: false,
          }
        : {
            id: categoryId,
            name: account.name,
            previousAvailable: 0,
            assigned: 0,
            activity: 0,
            available: 0,
            isOverspent: false,
            isArchived: false,
            note: "",
          };

      const paymentGroupIndex = categoryGroups.findIndex(
        (group) => group.id === groupId,
      );

      if (paymentGroupIndex >= 0) {
        categoryGroups = categoryGroups.map((group, index) =>
          index === paymentGroupIndex
            ? {
                ...group,
                name: groupName,
                categories: [...group.categories, paymentCategory],
              }
            : group,
        );
      } else {
        categoryGroups = [
          {
            id: groupId,
            name: groupName,
            previousAvailable: 0,
            assigned: 0,
            activity: 0,
            available: 0,
            note: "",
            categories: [paymentCategory],
          },
          ...categoryGroups,
        ];
      }
    }

    categoryGroups = categoryGroups.map((group) => {
      const categories = group.categories ?? [];
      return {
        ...group,
        previousAvailable: categories.reduce(
          (sum, category) => sum + category.previousAvailable,
          0,
        ),
        assigned: categories.reduce(
          (sum, category) => sum + category.assigned,
          0,
        ),
        activity: categories.reduce(
          (sum, category) => sum + category.activity,
          0,
        ),
        available: categories.reduce(
          (sum, category) => sum + category.available,
          0,
        ),
      };
    });

    const nextView = {
      ...view,
      categoryGroups,
      totalAssigned: categoryGroups.reduce(
        (sum, group) => sum + group.assigned,
        0,
      ),
      totalActivity: categoryGroups.reduce(
        (sum, group) => sum + group.activity,
        0,
      ),
      totalAvailable: categoryGroups.reduce(
        (sum, group) => sum + group.available,
        0,
      ),
    };

    execute(
      `UPDATE local_budget_months
       SET view_json = ?
       WHERE budget_id = ? AND month = ?`,
      [JSON.stringify(nextView), account.budgetId, row.month],
    );
  }

  if (isCreditCard) {
    execute(
      `INSERT INTO local_categories(
         id, budget_id, group_id, group_name, name, archived
       ) VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         group_id = excluded.group_id,
         group_name = excluded.group_name,
         name = excluded.name,
         archived = 0`,
      [
        categoryId,
        account.budgetId,
        groupId,
        groupName,
        account.name,
      ],
    );
  } else {
    execute(
      `DELETE FROM local_budget_assignments
       WHERE budget_id = ? AND category_id = ?`,
      [account.budgetId, categoryId],
    );
    execute(
      `DELETE FROM local_budget_category_policies
       WHERE budget_id = ? AND category_id = ?`,
      [account.budgetId, categoryId],
    );
    execute(
      `DELETE FROM local_categories
       WHERE budget_id = ? AND id = ?`,
      [account.budgetId, categoryId],
    );
  }
}

function upsertAccount(account: import("./registerSchema").LocalAccountRecord) {
  execute(
    `INSERT INTO local_accounts(
       id, budget_id, name, type, participation, opening_balance,
       currency_code, created_at, closed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, type = excluded.type,
       participation = excluded.participation,
       opening_balance = excluded.opening_balance,
       currency_code = excluded.currency_code,
       closed_at = excluded.closed_at`,
    [
      account.id, account.budgetId, account.name, account.type,
      account.participation, account.openingBalance, account.currencyCode,
      account.createdAt, account.closedAt,
    ],
  );
}

function writeAccount(
  account: import("./registerSchema").LocalAccountRecord,
  mutation: LocalBudgetMutation,
  resolveConflictId?: string,
) {
  assertMutationScope(mutation);
  execute("BEGIN IMMEDIATE");
  try {
    upsertAccount(account);
    reconcileCreditCardPaymentCategoryForAccount(account);
    markAllBudgetProjectionsDirty();
    insertOutbox(mutation);
    writeMetadata("localRevision", String(Number(readMetadata("localRevision") ?? "0") + 1));
    resolveLocalConflictInTransaction(resolveConflictId);
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function assertAccountDeletable(
  budgetId: string,
  accountId: string,
) {
  const transactionCount = resultRows<{ count: number }>(
    "SELECT COUNT(*) AS count FROM local_transactions WHERE budget_id = ? AND account_id = ?",
    [budgetId, accountId],
  )[0]?.count ?? 0;

  if (transactionCount > 0) {
    throw workerError(
      "ACCOUNT_NOT_EMPTY",
      "An account with transactions cannot be deleted.",
    );
  }

  const scheduledTransactionCount = resultRows<{ count: number }>(
    "SELECT COUNT(*) AS count FROM local_scheduled_transactions WHERE budget_id = ? AND account_id = ?",
    [budgetId, accountId],
  )[0]?.count ?? 0;

  if (scheduledTransactionCount > 0) {
    throw workerError(
      "ACCOUNT_HAS_SCHEDULED_TRANSACTIONS",
      "An account with scheduled transactions cannot be deleted.",
    );
  }

  const transferReferenceCount = resultRows<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM local_transactions
     WHERE budget_id = ? AND transfer_account_id = ?`,
    [budgetId, accountId],
  )[0]?.count ?? 0;

  if (transferReferenceCount > 0) {
    throw workerError(
      "ACCOUNT_IN_USE",
      "An account referenced by a transfer cannot be deleted.",
    );
  }

  const splitTransferReferenceCount = resultRows<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM local_transaction_splits AS split
     JOIN local_transactions AS parent
       ON parent.id = split.transaction_id
     WHERE parent.budget_id = ?
       AND split.transfer_account_id = ?`,
    [budgetId, accountId],
  )[0]?.count ?? 0;

  if (splitTransferReferenceCount > 0) {
    throw workerError(
      "ACCOUNT_IN_USE",
      "An account referenced by a split transfer cannot be deleted.",
    );
  }
}

function deleteAccount(
  budgetId: string,
  accountId: string,
  mutation: LocalBudgetMutation,
  resolveConflictId?: string,
) {
  assertMutationScope(mutation);
  assertAccountDeletable(budgetId, accountId);
  execute("BEGIN IMMEDIATE");
  try {
    execute("DELETE FROM local_accounts WHERE budget_id = ? AND id = ?", [budgetId, accountId]);
    markAllBudgetProjectionsDirty();
    insertOutbox(mutation);
    writeMetadata("localRevision", String(Number(readMetadata("localRevision") ?? "0") + 1));
    resolveLocalConflictInTransaction(resolveConflictId);
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function mergePayees(
  budgetId: string,
  sourcePayeeId: string,
  sourcePayeeIds: readonly string[] | undefined,
  targetPayeeId: string,
  targetPayeeName: string,
  updateLinkedTransactions = true,
  updateScheduledTransactions = true,
  addMergedAliases = true,
  redirectRecognitionRules = true,
  mutation: LocalBudgetMutation,
  resolveConflictId?: string,
) {
  assertMutationScope(mutation);
  execute("BEGIN IMMEDIATE");
  try {
    const sourceIds = Array.from(new Set(sourcePayeeIds?.length ? sourcePayeeIds : [sourcePayeeId]))
      .filter((id) => id !== targetPayeeId);
    if (sourceIds.length === 0) {
      throw workerError("PAYEE_NOT_FOUND", "Select at least one source payee to merge.");
    }
    const targetKnowledge = resultRows<{
      defaultCategoryId: string | null; defaultCategoryName: string | null;
    }>(
      `SELECT default_category_id AS defaultCategoryId,
              default_category_name AS defaultCategoryName
       FROM local_payees WHERE budget_id = ? AND id = ?`,
      [budgetId, targetPayeeId],
    )[0];
    if (!targetKnowledge) throw workerError("PAYEE_NOT_FOUND", "The merge target payee does not exist.");
    if (!targetKnowledge.defaultCategoryId) {
      const sourceDefaults = resultRows<{
        defaultCategoryId: string; defaultCategoryName: string | null;
      }>(
        `SELECT DISTINCT default_category_id AS defaultCategoryId,
                         default_category_name AS defaultCategoryName
         FROM local_payees
         WHERE budget_id = ?
           AND id IN (${sourceIds.map(() => "?").join(",")})
           AND default_category_id IS NOT NULL AND default_category_id <> ''`,
        [budgetId, ...sourceIds],
      );
      // A single source default safely fills an empty survivor. Conflicting
      // source defaults deliberately leave it empty for explicit user review.
      if (sourceDefaults.length === 1) execute(
        `UPDATE local_payees SET default_category_id = ?, default_category_name = ?, updated_at = ?
         WHERE budget_id = ? AND id = ?`,
        [sourceDefaults[0].defaultCategoryId, sourceDefaults[0].defaultCategoryName,
         new Date().toISOString(), budgetId, targetPayeeId],
      );
    }
    for (const sourcePayeeId of sourceIds) {
    const source = resultRows<{ name: string }>(
      "SELECT name FROM local_payees WHERE budget_id = ? AND id = ?",
      [budgetId, sourcePayeeId],
    )[0];
    const target = resultRows<{ id: string }>(
      "SELECT id FROM local_payees WHERE budget_id = ? AND id = ?",
      [budgetId, targetPayeeId],
    )[0];
    if (!source || !target) {
      throw workerError("PAYEE_NOT_FOUND", "Both merge payees must exist.");
    }
    if (updateLinkedTransactions) execute(
      `UPDATE local_transactions SET payee_id = ?, payee_name = ?
       WHERE budget_id = ? AND payee_id = ?`,
      [targetPayeeId, targetPayeeName, budgetId, sourcePayeeId],
    );
    const schedules = updateScheduledTransactions ? resultRows<{ id: string; payloadJson: string }>(
      `SELECT id, payload_json AS payloadJson FROM local_scheduled_transactions
       WHERE budget_id = ? AND json_extract(payload_json, '$.payeeId') = ?`,
      [budgetId, sourcePayeeId],
    ) : [];
    for (const schedule of schedules) {
      const payload = JSON.parse(schedule.payloadJson) as Record<string, unknown>;
      payload.payeeId = targetPayeeId;
      payload.payee = targetPayeeName;
      payload.updatedAt = new Date().toISOString();
      execute(
        `UPDATE local_scheduled_transactions SET payload_json = ?, updated_at = ?
         WHERE budget_id = ? AND id = ?`,
        [JSON.stringify(payload), payload.updatedAt, budgetId, schedule.id],
      );
    }
    if (addMergedAliases) execute(
      `UPDATE local_payee_aliases SET payee_id = ?
       WHERE budget_id = ? AND payee_id = ?
         AND normalized_value NOT IN (
           SELECT normalized_value FROM local_payee_aliases
           WHERE budget_id = ? AND payee_id = ?
         )`,
      [targetPayeeId, budgetId, sourcePayeeId, budgetId, targetPayeeId],
    );
    execute("DELETE FROM local_payee_aliases WHERE budget_id = ? AND payee_id = ?", [budgetId, sourcePayeeId]);
    if (redirectRecognitionRules) execute(
      `UPDATE local_payee_recognition_rules SET payee_id = ?, updated_at = ?
       WHERE budget_id = ? AND payee_id = ?`,
      [targetPayeeId, new Date().toISOString(), budgetId, sourcePayeeId],
    );
    const aliasNormalised = normalisePayeeIdentity(source.name);
    if (addMergedAliases && aliasNormalised) {
      execute(
        `INSERT OR IGNORE INTO local_payee_aliases(
           id,budget_id,payee_id,value,normalized_value,created_at
         ) VALUES(?,?,?,?,?,?)`,
        [`merged:${sourcePayeeId}`, budgetId, targetPayeeId, source.name,
         aliasNormalised, new Date().toISOString()],
      );
    }
    execute(
      `INSERT INTO local_payee_history(id,budget_id,payee_id,operation,detail_json,created_at)
       VALUES(?,?,?,?,?,?)`,
      [`merge:${mutation.mutationId}:${sourcePayeeId}`, budgetId, targetPayeeId, "merge",
       JSON.stringify({ sourcePayeeId, sourceName: source.name,
         scheduledTransactionsUpdated: schedules.length }), new Date().toISOString()],
    );
    if (redirectRecognitionRules) {
      // Rules were moved above.
    } else {
      execute("DELETE FROM local_payee_recognition_rules WHERE budget_id = ? AND payee_id = ?", [budgetId, sourcePayeeId]);
    }
    if (updateLinkedTransactions && updateScheduledTransactions) {
      execute("DELETE FROM local_payees WHERE budget_id = ? AND id = ?", [budgetId, sourcePayeeId]);
    } else {
      execute("UPDATE local_payees SET archived = 1, updated_at = ? WHERE budget_id = ? AND id = ?", [new Date().toISOString(), budgetId, sourcePayeeId]);
    }
    }
    insertOutbox(mutation);
    writeMetadata("localRevision", String(Number(readMetadata("localRevision") ?? "0") + 1));
    resolveLocalConflictInTransaction(resolveConflictId);
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

function redirectMergedCategoryReferences(
  budgetId: string,
  sourceCategoryId: string,
  targetCategoryId: string,
  targetCategoryName: string | null,
): void {
  const resolvedTargetCategoryName =
    targetCategoryName ??
    resultRows<{ name: string }>(
      `SELECT name FROM local_categories
       WHERE budget_id = ? AND id = ?`,
      [budgetId, targetCategoryId],
    )[0]?.name ??
    null;

  const updatedAt = new Date().toISOString();

  execute(
    `UPDATE local_transactions SET category_id = ?, category_name = ?
     WHERE budget_id = ? AND category_id = ?`,
    [
      targetCategoryId,
      resolvedTargetCategoryName,
      budgetId,
      sourceCategoryId,
    ],
  );

  execute(
    `UPDATE local_transaction_splits SET category_id = ?, category_name = ?
     WHERE category_id = ? AND transaction_id IN (
       SELECT id FROM local_transactions WHERE budget_id = ?
     )`,
    [
      targetCategoryId,
      resolvedTargetCategoryName,
      sourceCategoryId,
      budgetId,
    ],
  );

  execute(
    `UPDATE local_payees
     SET default_category_id = ?, default_category_name = ?, updated_at = ?
     WHERE budget_id = ? AND default_category_id = ?`,
    [
      targetCategoryId,
      resolvedTargetCategoryName,
      updatedAt,
      budgetId,
      sourceCategoryId,
    ],
  );

  execute(
    `UPDATE local_payee_recognition_rules
     SET default_category_id = ?, default_category_name = ?, updated_at = ?
     WHERE budget_id = ? AND default_category_id = ?`,
    [
      targetCategoryId,
      resolvedTargetCategoryName,
      updatedAt,
      budgetId,
      sourceCategoryId,
    ],
  );

  // Scan every schedule in the budget rather than filtering only by the
  // top-level category. A source category may exist solely in a split line.
  const schedules = resultRows<{ id: string; payloadJson: string }>(
    `SELECT id, payload_json AS payloadJson
     FROM local_scheduled_transactions
     WHERE budget_id = ?`,
    [budgetId],
  );

  for (const schedule of schedules) {
    const payload = JSON.parse(
      schedule.payloadJson,
    ) as Record<string, unknown>;

    let changed = false;

    if (payload.categoryId === sourceCategoryId) {
      payload.categoryId = targetCategoryId;
      payload.category = resolvedTargetCategoryName;
      changed = true;
    }

    if (Array.isArray(payload.splitLines)) {
      payload.splitLines = payload.splitLines.map((line) => {
        if (
          typeof line === "object" &&
          line !== null &&
          (line as Record<string, unknown>).categoryId === sourceCategoryId
        ) {
          changed = true;
          return {
            ...(line as Record<string, unknown>),
            categoryId: targetCategoryId,
            categoryName: resolvedTargetCategoryName,
          };
        }

        return line;
      });
    }

    if (!changed) continue;

    payload.updatedAt = updatedAt;

    execute(
      `UPDATE local_scheduled_transactions
       SET payload_json = ?, updated_at = ?
       WHERE budget_id = ? AND id = ?`,
      [
        JSON.stringify(payload),
        updatedAt,
        budgetId,
        schedule.id,
      ],
    );
  }

  mergeBudgetCategoryProjectionFacts(
    sourceCategoryId,
    targetCategoryId,
  );
}

function mergeCategories(
  budgetId: string,
  sourceCategoryId: string,
  targetCategoryId: string,
  targetCategoryName: string,
  mutation: LocalBudgetMutation,
  resolveConflictId?: string,
) {
  assertMutationScope(mutation);
  execute("BEGIN IMMEDIATE");
  try {
    redirectMergedCategoryReferences(
      budgetId,
      sourceCategoryId,
      targetCategoryId,
      targetCategoryName,
    );
    execute("DELETE FROM local_categories WHERE budget_id = ? AND id = ?", [
      budgetId, sourceCategoryId,
    ]);
    insertOutbox(mutation);
    writeMetadata("localRevision", String(Number(readMetadata("localRevision") ?? "0") + 1));
    resolveLocalConflictInTransaction(resolveConflictId);
    execute("COMMIT");
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
  return currentManifest();
}

async function openBudget(request: Extract<LocalBudgetWorkerRequest, { type: "open" }>) {
  database?.close();
  await ensurePersistentSqlite();
  activeFilename = request.physicalFilename ?? safeFilename(request.budgetId);
  if (!isAllowedPhysicalFilename(request.budgetId, activeFilename)) {
    throw workerError(
      "INVALID_PHYSICAL_DATABASE_FILE",
      "The selected local SQLite physical generation is invalid for this budget.",
    );
  }
  database = openPersistentDatabase(activeFilename);
  durable = true;
  activeBudgetId = request.budgetId;
  activeSyncEpoch = request.syncEpoch;
  initialiseSchema();
  const storedEpoch = readMetadata("syncEpoch");
  if (storedEpoch && storedEpoch !== request.syncEpoch) {
    database.close();
    database = null;
    throw workerError(
      "STALE_SYNC_EPOCH",
      "This device contains an obsolete budget generation and must download the new baseline.",
    );
  }
  writeMetadata("budgetId", request.budgetId);
  writeMetadata("syncEpoch", request.syncEpoch);
  writeMetadata("schemaVersion", String(LOCAL_BUDGET_SCHEMA_VERSION));
  writeMetadata("deviceId", request.deviceId);
  writeMetadata("localRevision", readMetadata("localRevision") ?? "0");
  writeMetadata("pulledCursor", String(readPulledCursor()));
  return currentManifest();
}

async function prepareBaselineExport() {
  if (!database || !sqliteRuntime) {
    throw workerError("DATABASE_NOT_OPEN", "The local budget is not open.");
  }
  execute("PRAGMA wal_checkpoint(TRUNCATE)");
  if (persistentBackend === "opfs-sahpool") {
    baselineExportBytes = await sahPool!.exportFile(activeFilename);
    return { totalBytes: baselineExportBytes.byteLength };
  }
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(activeFilename.replace(/^\//, ""));
  const file = await handle.getFile();
  return { totalBytes: file.size };
}

async function readBaselineExportChunk(offset: number, length: number) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1) {
    throw workerError("INVALID_BASELINE_RANGE", "Baseline export range is invalid.");
  }
  if (persistentBackend === "opfs-sahpool") {
    if (!baselineExportBytes) {
      throw workerError("BASELINE_EXPORT_MISSING", "Prepare the baseline export before reading it.");
    }
    return baselineExportBytes.slice(offset, offset + length);
  }
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(activeFilename.replace(/^\//, ""));
  const file = await handle.getFile();
  return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
}

async function beginBaselineReplacement(
  request: Extract<LocalBudgetWorkerRequest, { type: "beginBaselineReplacement" }>,
) {
  await ensurePersistentSqlite();

  if (database) {
    const pendingOutboxCount =
      resultRows<{ count: number }>(
        "SELECT COUNT(*) AS count FROM local_budget_outbox",
      )[0]?.count ?? 0;

    if (pendingOutboxCount > 0) {
      throw workerError(
        "UNSYNCED_LOCAL_CHANGES",
        "Baseline replacement would discard unsynced local changes.",
      );
    }
  }

  if (!Number.isSafeInteger(request.totalBytes) || request.totalBytes < 1) {
    throw workerError("INVALID_BASELINE_SIZE", "Baseline size must be positive.");
  }
  if (replacement) {
    throw workerError("BASELINE_REPLACEMENT_ACTIVE", "A baseline replacement is already active.");
  }
  const root = await navigator.storage.getDirectory();
  const temporaryName = `budget-baseline-${createRuntimeUuid()}.partial`;
  const handle = await root.getFileHandle(temporaryName, { create: true });
  replacement = {
    budgetId: request.budgetId,
    syncEpoch: request.syncEpoch,
    deviceId: request.deviceId,
    totalBytes: request.totalBytes,
    temporaryName,
    writable: await handle.createWritable(),
    receivedBytes: 0,
  };
  return { accepted: true, totalBytes: request.totalBytes };
}

async function appendBaselineReplacement(offset: number, content: Uint8Array) {
  if (!replacement) throw workerError("BASELINE_REPLACEMENT_MISSING", "No baseline replacement is active.");
  if (offset !== replacement.receivedBytes) {
    throw workerError("BASELINE_CHUNK_OUT_OF_ORDER", "Baseline chunks must be appended in order.");
  }
  if (replacement.receivedBytes + content.byteLength > replacement.totalBytes) {
    throw workerError("BASELINE_SIZE_EXCEEDED", "Baseline contains more bytes than declared.");
  }
  await replacement.writable.write({
    type: "write",
    position: offset,
    data: Uint8Array.from(content).buffer,
  });
  replacement.receivedBytes += content.byteLength;
  return { receivedBytes: replacement.receivedBytes };
}

async function commitBaselineReplacement() {
  const current = replacement;
  if (!current) {
    throw workerError(
      "BASELINE_REPLACEMENT_MISSING",
      "No baseline replacement is active.",
    );
  }
  if (current.receivedBytes !== current.totalBytes) {
    throw workerError(
      "BASELINE_INCOMPLETE",
      "Not all baseline bytes were received.",
    );
  }

  await current.writable.close();

  const root = await navigator.storage.getDirectory();
  const temporaryHandle = await root.getFileHandle(current.temporaryName);
  const temporaryFile = await temporaryHandle.getFile();

  const previousFilename = activeFilename;
  const previousBudgetId = activeBudgetId;
  const previousSyncEpoch = activeSyncEpoch;
  const targetFilename = createPhysicalGenerationFilename(current.budgetId);

  try {
    let offset = 0;
    await importPersistentDatabase(targetFilename, async () => {
      if (offset >= temporaryFile.size) return undefined;
      const chunk = new Uint8Array(
        await temporaryFile
          .slice(offset, offset + 4 * 1024 * 1024)
          .arrayBuffer(),
      );
      offset += chunk.byteLength;
      return chunk;
    });

    // Only switch the worker to the candidate after the entire physical file
    // has been imported. The old physical generation has not been modified.
    database?.close();
    database = null;

    activeFilename = targetFilename;
    activeBudgetId = current.budgetId;
    activeSyncEpoch = current.syncEpoch;
    database = openPersistentDatabase(activeFilename);
    durable = true;
    initialiseSchema();

    const storedBudgetId = readMetadata("budgetId");
    const storedSyncEpoch = readMetadata("syncEpoch");
    if (
      storedBudgetId !== current.budgetId ||
      storedSyncEpoch !== current.syncEpoch
    ) {
      throw workerError(
        "BASELINE_SCOPE_MISMATCH",
        "Downloaded SQLite baseline does not match the selected budget and sync epoch.",
      );
    }

    execute("BEGIN IMMEDIATE");
    try {
      // These tables describe the publishing device, not canonical budget data.
      // A device rebuilt from its baseline must start with its own empty outbox
      // and conflict inbox.
      execute("DELETE FROM local_budget_outbox");
      execute("DELETE FROM local_budget_sync_conflicts");
      writeMetadata("deviceId", current.deviceId);
      execute("COMMIT");
    } catch (error) {
      execute("ROLLBACK");
      throw error;
    }

    const promotedManifest = currentManifest();

    replacement = null;
    await root.removeEntry(current.temporaryName).catch(() => undefined);

    return promotedManifest;
  } catch (error) {
    database?.close();
    database = null;
    await removeOpfsFile(targetFilename).catch(() => undefined);

    activeFilename = previousFilename;
    activeBudgetId = previousBudgetId;
    activeSyncEpoch = previousSyncEpoch;

    if (previousFilename) {
      database = openPersistentDatabase(previousFilename);
      durable = true;
      activeBudgetId = readMetadata("budgetId") ?? previousBudgetId;
      activeSyncEpoch = readMetadata("syncEpoch") ?? previousSyncEpoch;
      initialiseSchema();
    }

    throw error;
  }
}

async function abortBaselineReplacement() {
  const current = replacement;
  if (!current) return { aborted: false };
  replacement = null;
  await current.writable.abort().catch(() => undefined);
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(current.temporaryName).catch(() => undefined);
  return { aborted: true };
}

function workerError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

async function handle(request: LocalBudgetWorkerRequest): Promise<unknown> {
  switch (request.type) {
    case "open":
      return openBudget(request);
    case "manifest":
      return currentManifest();
    case "prepareBaselineExport":
      return prepareBaselineExport();
    case "readBaselineExportChunk":
      return readBaselineExportChunk(request.offset, request.length);
    case "finishBaselineExport":
      baselineExportBytes = null;
      return null;
    case "beginBaselineReplacement":
      return beginBaselineReplacement(request);
    case "appendBaselineReplacement":
      return appendBaselineReplacement(request.offset, request.content);
    case "commitBaselineReplacement":
      return commitBaselineReplacement();
    case "abortBaselineReplacement":
      return abortBaselineReplacement();
    case "importRegisterBatch":
      return importRegisterBatch(request.batch);
    case "beginStagedImport":
      return beginStagedImport(request);
    case "importEntityBatch":
      return importEntityBatch(request.entities);
    case "commitStagedImport":
      return commitStagedImport(request.expectedCounts);
    case "rollbackStagedImport":
      return rollbackStagedImport();
    case "queryTransactions":
      return queryTransactions(request.query);
    case "getTransaction":
      return getTransaction(request.budgetId, request.transactionId);
    case "getTransactionsByIds":
      return getTransactionsByIds(
        request.budgetId,
        request.accountId,
        request.transactionIds,
      );
    case "getAccountSummary":
      return getAccountSummary(request.budgetId, request.accountId);
    case "getFinancialOverview":
      return getFinancialOverview(request.budgetId, request.month);
    case "getMonthlySpending":
      return getMonthlySpending(request.budgetId, request.month);
    case "getMonthlyCategoryTransactions":
      return getMonthlyCategoryTransactions(
        request.budgetId,
        request.month,
        request.categoryId,
      );
    case "getCategoryActivityDrilldown":
      return getCategoryActivityDrilldown(
        request.budgetId,
        request.month,
        request.categoryId,
      );
    case "getBudgetProjectionDiagnostic":
      return getBudgetProjectionDiagnostic(request.budgetId, request.month);
    case "writeTransaction":
      return writeTransaction(request.transaction, request.mutation, request.resolveConflictId);
    case "writeTransactionBatch":
      return writeTransactionBatch(request.writes);
    case "deleteTransaction":
      return deleteTransaction(request.transactionId, request.mutation, request.resolveConflictId);
    case "deleteTransactionBatch":
      return deleteTransactionBatch(request.deletes);
    case "writeTransactionAttachment":
      return writeTransactionAttachment(request.attachment, request.content, request.mutation, request.resolveConflictId);
    case "deleteTransactionAttachment":
      return deleteTransactionAttachment(request.attachmentId, request.mutation, request.resolveConflictId);
    case "readTransactionAttachmentContent":
      return readTransactionAttachmentContent(request.budgetId, request.attachmentId);
    case "mutate":
      return applyMutation(request.mutation, request.resolveConflictId);
    case "mutateBatch":
      return applyMutationBatch(request.mutations);
    case "readEntity": {
      const normalised = readNormalisedDomainEntity(
        request.domain,
        request.entityId,
      );
      if (normalised.handled) return normalised.value;
      const row = resultRows<{ payload: string }>(
        `SELECT payload_json AS payload FROM local_budget_entities
         WHERE domain = ? AND entity_id = ?`,
        [request.domain, request.entityId],
      )[0];
      return row ? JSON.parse(row.payload) : null;
    }
    case "listEntities": {
      const normalised = listNormalisedDomainEntities(request.domain);
      if (normalised.handled) return normalised.values;
      return resultRows<{ payload: string }>(
        `SELECT payload_json AS payload FROM local_budget_entities
         WHERE domain = ? ORDER BY entity_id`,
        [request.domain],
      ).map(({ payload }) => JSON.parse(payload));
    }
    case "listAccountNavigation":
      return listAccountNavigation(request.budgetId);
    case "listPayees":
      return listPayees(request.budgetId, request.archived);
    case "listPayeeDuplicateSuppressions":
      return listPayeeDuplicateSuppressions(request.budgetId);
    case "keepPayeesSeparate":
      return keepPayeesSeparate(request.budgetId, request.pairs);
    case "writePayee":
      return writePayee(request.payee, request.mutation, request.resolveConflictId);
    case "deleteUnusedPayee":
      return deleteUnusedPayee(request.budgetId, request.payeeId, request.mutation);
    case "writeAccount":
      return writeAccount(request.account, request.mutation, request.resolveConflictId);
    case "deleteAccount":
      return deleteAccount(
        request.budgetId,
        request.accountId,
        request.mutation,
        request.resolveConflictId,
      );
    case "mergePayees":
      return mergePayees(
        request.budgetId,
        request.sourcePayeeId,
        request.sourcePayeeIds,
        request.targetPayeeId,
        request.targetPayeeName,
        request.updateLinkedTransactions,
        request.updateScheduledTransactions,
        request.addMergedAliases,
        request.redirectRecognitionRules,
        request.mutation,
        request.resolveConflictId,
      );
    case "mergeCategories":
      return mergeCategories(
        request.budgetId,
        request.sourceCategoryId,
        request.targetCategoryId,
        request.targetCategoryName,
        request.mutation,
        request.resolveConflictId,
      );
    case "readOutbox":
      return resultRows(
        `SELECT sequence, mutation_id AS mutationId, device_id AS deviceId,
           device_sequence AS deviceSequence, base_cursor AS baseCursor,
           domain, entity_id AS entityId,
           operation, payload_json AS payloadJson, created_at AS createdAt
         FROM local_budget_outbox
         WHERE acknowledged = 0 AND sequence > ?
         ORDER BY sequence LIMIT ?`,
        [request.afterSequence, request.limit],
      );
    case "acknowledgeOutbox":
      execute(
        "DELETE FROM local_budget_outbox WHERE sequence <= ?",
        [request.throughSequence],
      );
      return { acknowledgedThroughSequence: request.throughSequence };
    case "applyRemoteMutations":
      return applyRemoteMutations(request.mutations, request.throughCursor);
    case "getSyncState":
      return currentSyncState();
    case "setSyncState":
      return setSyncState(request.baselineHash, request.pulledCursor);
    case "listSyncConflicts":
      return listSyncConflicts(request.status, request.limit);
    case "resolveSyncConflict":
      return resolveSyncConflict(request.conflictId, request.resolution);
    case "close":
      database?.close();
      database = null;
      baselineExportBytes = null;
      return null;
    case "deleteBudgetFile": {
      const filename = activeFilename;
      database?.close();
      database = null;
      baselineExportBytes = null;
      activeBudgetId = "";
      activeSyncEpoch = "";
      await removeOpfsFile(filename);
      return null;
    }
  }
}

self.onmessage = (event: MessageEvent<LocalBudgetWorkerRequest>) => {
  const request = event.data;
  void handle(request).then(
    (result) => {
      const response: LocalBudgetWorkerResponse = {
        requestId: request.requestId,
        ok: true,
        result,
      };
      if (result instanceof Uint8Array && result.buffer instanceof ArrayBuffer) {
        self.postMessage(response, { transfer: [result.buffer] });
      } else {
        self.postMessage(response);
      }
    },
    (error: unknown) => {
      const typed = error as Error & { code?: string };
      const response: LocalBudgetWorkerResponse = {
        requestId: request.requestId,
        ok: false,
        error: {
          code: typed.code ?? "LOCAL_SQLITE_ERROR",
          message: typed.message ?? String(error),
        },
      };
      self.postMessage(response);
    },
  );
};

export {};
