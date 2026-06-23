import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const categoryGroups = sqliteTable("category_groups", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull()
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull()
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  participation: text("participation").notNull(),
  openingBalance: integer("opening_balance").notNull(),
  currentBalance: integer("current_balance").notNull()
});

export const payees = sqliteTable("payees", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  isArchived: integer("is_archived", { mode: "boolean" }).notNull(),
  isTransfer: integer("is_transfer", { mode: "boolean" }).notNull(),
  transferAccountId: text("transfer_account_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  accountId: text("account_id").notNull(),
  payeeId: text("payee_id"),
  categoryId: text("category_id"),
  transferAccountId: text("transfer_account_id"),
  type: text("type").notNull(),
  date: text("date").notNull(),
  memo: text("memo"),
  amount: integer("amount").notNull(),
  clearedStatus: text("cleared_status").notNull(),
  isDeleted: integer("is_deleted", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});


export const splitTransactionLines = sqliteTable("split_transaction_lines", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull(),
  categoryId: text("category_id").notNull(),
  memo: text("memo"),
  amount: integer("amount").notNull(),
  sortOrder: integer("sort_order").notNull()
});

export const reconciliations = sqliteTable("reconciliations", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  accountId: text("account_id").notNull(),
  statementDate: text("statement_date").notNull(),
  statementBalance: integer("statement_balance").notNull(),
  clearedBalance: integer("cleared_balance").notNull(),
  difference: integer("difference").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const scheduledTransactions = sqliteTable("scheduled_transactions", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  accountId: text("account_id").notNull(),
  payeeId: text("payee_id"),
  categoryId: text("category_id"),
  transferAccountId: text("transfer_account_id"),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  memo: text("memo"),
  nextDueDate: text("next_due_date").notNull(),
  frequency: text("frequency").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const budgetMonths = sqliteTable("budget_months", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  month: text("month").notNull(),
  income: integer("income").notNull(),
  assigned: integer("assigned").notNull(),
  activity: integer("activity").notNull(),
  readyToBudget: integer("ready_to_budget").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const categoryMonths = sqliteTable("category_months", {
  id: text("id").primaryKey(),
  budgetMonthId: text("budget_month_id").notNull(),
  categoryId: text("category_id").notNull(),
  previousAvailable: integer("previous_available").notNull(),
  assigned: integer("assigned").notNull(),
  activity: integer("activity").notNull(),
  available: integer("available").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const domainEvents = sqliteTable("domain_events", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  type: text("type").notNull(),
  entityId: text("entity_id"),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
  payloadJson: text("payload_json").notNull()
});


export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  categoryId: text("category_id").notNull(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  targetAmount: integer("target_amount").notNull(),
  targetDate: text("target_date"),
  monthlyAmount: integer("monthly_amount"),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const budgetMetadata = sqliteTable("budget_metadata", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  appVersion: text("app_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  lastOpenedAt: integer("last_opened_at", { mode: "timestamp" })
});

export const fileFingerprints = sqliteTable("file_fingerprints", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  modifiedAt: integer("modified_at").notNull(),
  fingerprint: text("fingerprint").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const undoRecords = sqliteTable("undo_records", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  eventId: text("event_id").notNull(),
  reverseEventPayloadJson: text("reverse_event_payload_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const commandHistory = sqliteTable("command_history", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  eventId: text("event_id"),
  commandType: text("command_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  undoPayloadJson: text("undo_payload_json").notNull(),
  redoPayloadJson: text("redo_payload_json").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  executedAt: integer("executed_at", { mode: "timestamp" }).notNull(),
  undoneAt: integer("undone_at", { mode: "timestamp" }),
  redoneAt: integer("redone_at", { mode: "timestamp" })
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull()
});

export const budgetUsers = sqliteTable("budget_users", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});


export const userSettings = sqliteTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  defaultBudgetId: text("default_budget_id"),
  theme: text("theme").notNull(),
  language: text("language").notNull(),
  dateFormat: text("date_format").notNull(),
  numberFormat: text("number_format").notNull(),
  currency: text("currency").notNull(),
  firstDayOfWeek: integer("first_day_of_week").notNull(),
  privacyMode: integer("privacy_mode", { mode: "boolean" }).notNull(),
  sidebarCollapsed: integer("sidebar_collapsed", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});


export const userKeys = sqliteTable("user_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  keySalt: text("key_salt").notNull(),
  keyCheckHash: text("key_check_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const budgetKeys = sqliteTable("budget_keys", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  keyVersion: integer("key_version").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const encryptedBudgetKeys = sqliteTable("encrypted_budget_keys", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  userId: text("user_id").notNull(),
  budgetKeyId: text("budget_key_id").notNull(),
  encryptedBudgetKey: text("encrypted_budget_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const backupRecords = sqliteTable("backup_records", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  userId: text("user_id").notNull(),
  filePath: text("file_path").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const backupVersions = sqliteTable("backup_versions", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  userId: text("user_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  type: text("type").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  fingerprint: text("fingerprint").notNull(),
  note: text("note"),
  appVersion: text("app_version").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const transactionAttachments = sqliteTable("transaction_attachments", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  transactionId: text("transaction_id").notNull(),
  originalFileName: text("original_file_name").notNull(),
  storedFileName: text("stored_file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  storageType: text("storage_type").notNull(),
  relativePath: text("relative_path").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const encryptedRecords = sqliteTable("encrypted_records", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  keyVersion: integer("key_version").notNull(),
  nonce: text("nonce").notNull(),
  authTag: text("auth_tag").notNull(),
  cipherText: text("cipher_text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  fingerprint: text("fingerprint").notNull(),
  trusted: integer("trusted", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
});

export const changeRecords = sqliteTable("change_records", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  deviceId: text("device_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  operation: text("operation").notNull(),
  eventId: text("event_id"),
  changedAt: integer("changed_at", { mode: "timestamp" }).notNull(),
  changeHash: text("change_hash").notNull()
});

export const syncStates = sqliteTable("sync_states", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  deviceId: text("device_id").notNull(),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  lastChangeHash: text("last_change_hash"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const budgetSettings = sqliteTable("budget_settings", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  currency: text("currency").notNull(),
  currencySymbol: text("currency_symbol").notNull(),
  decimalPlaces: integer("decimal_places").notNull(),
  monthFormat: text("month_format").notNull(),
  startMonth: text("start_month"),
  maxFutureMonths: integer("max_future_months").notNull(),
  backupLimit: integer("backup_limit").notNull(),
  autoBackupOnClose: integer("auto_backup_on_close", { mode: "boolean" }).notNull(),
  autoBackupBeforeImport: integer("auto_backup_before_import", { mode: "boolean" }).notNull(),
  autoBackupBeforeRestore: integer("auto_backup_before_restore", { mode: "boolean" }).notNull(),
  autoBackupBeforeMigration: integer("auto_backup_before_migration", { mode: "boolean" }).notNull(),
  attachmentFolderName: text("attachment_folder_name").notNull(),
  cloudStorageSettingId: text("cloud_storage_setting_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const accountSettings = sqliteTable("account_settings", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  displayOrder: integer("display_order").notNull(),
  hidden: integer("hidden", { mode: "boolean" }).notNull(),
  closed: integer("closed", { mode: "boolean" }).notNull(),
  startingBalanceDate: text("starting_balance_date"),
  reconciliationReminder: integer("reconciliation_reminder", { mode: "boolean" }).notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const categorySettings = sqliteTable("category_settings", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull(),
  colour: text("colour"),
  hidden: integer("hidden", { mode: "boolean" }).notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull(),
  notes: text("notes"),
  goalDisplayMode: text("goal_display_mode").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const categoryGroupSettings = sqliteTable("category_group_settings", {
  id: text("id").primaryKey(),
  categoryGroupId: text("category_group_id").notNull(),
  notes: text("notes"),
  hidden: integer("hidden", { mode: "boolean" }).notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const transactionFlags = sqliteTable("transaction_flags", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull(),
  colour: text("colour").notNull(),
  label: text("label"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const transactionTags = sqliteTable("transaction_tags", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  name: text("name").notNull(),
  colour: text("colour"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const transactionTagAssignments = sqliteTable("transaction_tag_assignments", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull(),
  tagId: text("tag_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const transactionNotes = sqliteTable("transaction_notes", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull(),
  note: text("note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const cloudStorageSettings = sqliteTable("cloud_storage_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  deviceId: text("device_id"),
  provider: text("provider").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  syncRootPath: text("sync_root_path").notNull(),
  budgetFolderPath: text("budget_folder_path").notNull(),
  backupFolderPath: text("backup_folder_path").notNull(),
  attachmentFolderPath: text("attachment_folder_path").notNull(),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
  syncMode: text("sync_mode").notNull(),
  conflictPolicy: text("conflict_policy").notNull(),
  intervalMinutes: integer("interval_minutes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  valueJson: text("value_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const deviceSettings = sqliteTable("device_settings", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  lastOpenedBudgetId: text("last_opened_budget_id"),
  backupFolder: text("backup_folder"),
  attachmentFolder: text("attachment_folder"),
  syncFolder: text("sync_folder"),
  autoLockMinutes: integer("auto_lock_minutes").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const recentFiles = sqliteTable("recent_files", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  filePath: text("file_path").notNull(),
  displayName: text("display_name").notNull(),
  lastOpenedAt: integer("last_opened_at", { mode: "timestamp" }).notNull()
});

export const importRuns = sqliteTable("import_runs", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  userId: text("user_id").notNull(),
  source: text("source").notNull(),
  sourceFileName: text("source_file_name"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  status: text("status").notNull(),
  summaryJson: text("summary_json").notNull()
});

export const importMaps = sqliteTable("import_maps", {
  id: text("id").primaryKey(),
  importRunId: text("import_run_id").notNull(),
  sourceEntityType: text("source_entity_type").notNull(),
  sourceEntityId: text("source_entity_id").notNull(),
  targetEntityType: text("target_entity_type").notNull(),
  targetEntityId: text("target_entity_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const deletedItems = sqliteTable("deleted_items", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  deletedByUserId: text("deleted_by_user_id"),
  deletedAt: integer("deleted_at", { mode: "timestamp" }).notNull(),
  reason: text("reason")
});


export const payeeRules = sqliteTable("payee_rules", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  name: text("name").notNull(),
  pattern: text("pattern").notNull(),
  matchMode: text("match_mode").notNull(),
  payeeName: text("payee_name").notNull(),
  categoryId: text("category_id"),
  memo: text("memo"),
  priority: integer("priority").notNull(),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const bankImportBatches = sqliteTable("bank_import_batches", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id").notNull(),
  accountId: text("account_id").notNull(),
  userId: text("user_id").notNull(),
  source: text("source").notNull(),
  sourceFileName: text("source_file_name"),
  status: text("status").notNull(),
  transactionCount: integer("transaction_count").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  committedAt: integer("committed_at", { mode: "timestamp" }),
  undoneAt: integer("undone_at", { mode: "timestamp" })
});

export const bankImportBatchItems = sqliteTable("bank_import_batch_items", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  transactionId: text("transaction_id").notNull(),
  externalId: text("external_id"),
  rawPayee: text("raw_payee").notNull(),
  amount: integer("amount").notNull(),
  date: text("date").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const schemaMigrations = sqliteTable("schema_migrations", {
  id: text("id").primaryKey(),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  appliedAt: integer("applied_at", { mode: "timestamp" }).notNull()
});
