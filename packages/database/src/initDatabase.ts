import Database from "better-sqlite3";

export function initDatabase(sqlite: Database.Database): void {
  // SQLite does not enforce foreign keys unless every connection explicitly enables them.
  // This is especially important for a local-first app because the database file can be
  // opened directly by different processes during tests, imports, restores, and future sync.
  sqlite.pragma("foreign_keys = ON");

  // WAL gives safer concurrent read behaviour for the future desktop/PWA shell while keeping
  // normal writes fast. It is not a sync engine by itself; it simply makes local SQLite usage
  // more resilient.
  sqlite.pragma("journal_mode = WAL");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      currency TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_groups (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      participation TEXT NOT NULL,
      opening_balance INTEGER NOT NULL,
      current_balance INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payees (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL DEFAULT '',
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_transfer INTEGER NOT NULL DEFAULT 0,
      transfer_account_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      payee_id TEXT,
      category_id TEXT,
      transfer_account_id TEXT,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      memo TEXT,
      check_number TEXT,
      amount INTEGER NOT NULL,
      cleared_status TEXT NOT NULL,
      is_deleted INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );


CREATE TABLE IF NOT EXISTS split_transaction_lines (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      memo TEXT,
      amount INTEGER NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reconciliations (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      statement_date TEXT NOT NULL,
      statement_balance INTEGER NOT NULL,
      cleared_balance INTEGER NOT NULL,
      difference INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_transactions (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      payee_id TEXT,
      category_id TEXT,
      transfer_account_id TEXT,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      memo TEXT,
      next_due_date TEXT NOT NULL,
      frequency TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );


    CREATE TABLE IF NOT EXISTS scheduled_transaction_split_lines (
      id TEXT PRIMARY KEY,
      scheduled_transaction_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      memo TEXT,
      amount INTEGER NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_months (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      month TEXT NOT NULL,
      income INTEGER NOT NULL,
      assigned INTEGER NOT NULL,
      activity INTEGER NOT NULL,
      ready_to_budget INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_months (
      id TEXT PRIMARY KEY,
      budget_month_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      previous_available INTEGER NOT NULL,
      assigned INTEGER NOT NULL,
      activity INTEGER NOT NULL,
      available INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_events (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      type TEXT NOT NULL,
      entity_id TEXT,
      occurred_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      target_amount INTEGER NOT NULL,
      target_date TEXT,
      monthly_amount INTEGER,
      is_active INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_metadata (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      app_version TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_opened_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS file_fingerprints (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      modified_at INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS undo_records (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      reverse_event_payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );


    CREATE TABLE IF NOT EXISTS command_history (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      event_id TEXT,
      command_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      undo_payload_json TEXT NOT NULL,
      redo_payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      executed_at INTEGER NOT NULL,
      undone_at INTEGER,
      redone_at INTEGER
    );


    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_users (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      default_budget_id TEXT,
      theme TEXT NOT NULL,
      language TEXT NOT NULL,
      date_format TEXT NOT NULL,
      number_format TEXT NOT NULL,
      currency TEXT NOT NULL,
      first_day_of_week INTEGER NOT NULL,
      privacy_mode INTEGER NOT NULL,
      sidebar_collapsed INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key_salt TEXT NOT NULL,
      key_check_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_keys (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      key_version INTEGER NOT NULL,
      encrypted_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS encrypted_budget_keys (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      budget_key_id TEXT NOT NULL,
      encrypted_budget_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backup_records (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );


    CREATE TABLE IF NOT EXISTS backup_versions (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      note TEXT,
      app_version TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_attachments (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      original_file_name TEXT NOT NULL,
      stored_file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_type TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );


    CREATE TABLE IF NOT EXISTS encrypted_records (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      key_version INTEGER NOT NULL,
      nonce TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      cipher_text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      trusted INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS change_records (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      event_id TEXT,
      changed_at INTEGER NOT NULL,
      change_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_states (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      last_synced_at INTEGER,
      last_change_hash TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );


    CREATE TABLE IF NOT EXISTS budget_settings (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      currency_symbol TEXT NOT NULL,
      decimal_places INTEGER NOT NULL,
      month_format TEXT NOT NULL,
      start_month TEXT,
      max_future_months INTEGER NOT NULL,
      backup_limit INTEGER NOT NULL,
      auto_backup_on_close INTEGER NOT NULL,
      auto_backup_before_import INTEGER NOT NULL,
      auto_backup_before_restore INTEGER NOT NULL,
      auto_backup_before_migration INTEGER NOT NULL,
      attachment_folder_name TEXT NOT NULL,
      cloud_storage_setting_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_settings (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      hidden INTEGER NOT NULL,
      closed INTEGER NOT NULL,
      starting_balance_date TEXT,
      reconciliation_reminder INTEGER NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_settings (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      colour TEXT,
      hidden INTEGER NOT NULL,
      pinned INTEGER NOT NULL,
      notes TEXT,
      goal_display_mode TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_group_settings (
      id TEXT PRIMARY KEY,
      category_group_id TEXT NOT NULL,
      notes TEXT,
      hidden INTEGER NOT NULL,
      pinned INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_flags (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      colour TEXT NOT NULL,
      label TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_tags (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      name TEXT NOT NULL,
      colour TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_tag_assignments (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_notes (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cloud_storage_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      provider TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      sync_root_path TEXT NOT NULL,
      budget_folder_path TEXT NOT NULL,
      backup_folder_path TEXT NOT NULL,
      attachment_folder_path TEXT NOT NULL,
      last_sync_at INTEGER,
      sync_mode TEXT NOT NULL,
      conflict_policy TEXT NOT NULL,
      interval_minutes INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_settings (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      last_opened_budget_id TEXT,
      backup_folder TEXT,
      attachment_folder TEXT,
      sync_folder TEXT,
      auto_lock_minutes INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recent_files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      display_name TEXT NOT NULL,
      last_opened_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_runs (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_file_name TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      status TEXT NOT NULL,
      summary_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_maps (
      id TEXT PRIMARY KEY,
      import_run_id TEXT NOT NULL,
      source_entity_type TEXT NOT NULL,
      source_entity_id TEXT NOT NULL,
      target_entity_type TEXT NOT NULL,
      target_entity_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deleted_items (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      deleted_by_user_id TEXT,
      deleted_at INTEGER NOT NULL,
      reason TEXT
    );



    CREATE TABLE IF NOT EXISTS payee_rules (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      name TEXT NOT NULL,
      pattern TEXT NOT NULL,
      match_mode TEXT NOT NULL,
      payee_name TEXT NOT NULL,
      category_id TEXT,
      memo TEXT,
      priority INTEGER NOT NULL,
      is_enabled INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bank_import_batches (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_file_name TEXT,
      status TEXT NOT NULL,
      transaction_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      committed_at INTEGER,
      undone_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS bank_import_batch_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      external_id TEXT,
      raw_payee TEXT NOT NULL,
      amount INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );


    -- v1.2.9 integrity and query-performance hardening.
    -- These indexes do not replace domain validation in the application services. They make
    -- the database safer and faster by supporting the most common UI/import queries while
    -- avoiding uniqueness constraints that could break existing YNAB4 imports with duplicates.
    CREATE INDEX IF NOT EXISTS idx_category_groups_budget_id ON category_groups(budget_id);
    CREATE INDEX IF NOT EXISTS idx_categories_group_id ON categories(group_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_budget_id ON accounts(budget_id);
    CREATE INDEX IF NOT EXISTS idx_payees_budget_id ON payees(budget_id);
    CREATE INDEX IF NOT EXISTS idx_payees_budget_normalized ON payees(budget_id, normalized_name);
    CREATE INDEX IF NOT EXISTS idx_payees_transfer_account ON payees(transfer_account_id);

    CREATE INDEX IF NOT EXISTS idx_transactions_budget_id ON transactions(budget_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date);
    CREATE INDEX IF NOT EXISTS idx_transactions_budget_date ON transactions(budget_id, date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_payee_id ON transactions(payee_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_cleared_status ON transactions(budget_id, cleared_status);
    CREATE INDEX IF NOT EXISTS idx_transactions_transfer_account ON transactions(transfer_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_deleted ON transactions(budget_id, is_deleted);

    CREATE INDEX IF NOT EXISTS idx_split_lines_transaction_id ON split_transaction_lines(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_split_lines_category_id ON split_transaction_lines(category_id);
    CREATE INDEX IF NOT EXISTS idx_reconciliations_account_id ON reconciliations(account_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_budget_due ON scheduled_transactions(budget_id, next_due_date);
    CREATE INDEX IF NOT EXISTS idx_scheduled_account_id ON scheduled_transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_scheduled_category_id ON scheduled_transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_budget_months_budget_month ON budget_months(budget_id, month);
    CREATE INDEX IF NOT EXISTS idx_category_months_budget_month_id ON category_months(budget_month_id);
    CREATE INDEX IF NOT EXISTS idx_category_months_category_id ON category_months(category_id);
    CREATE INDEX IF NOT EXISTS idx_goals_budget_category ON goals(budget_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_domain_events_budget_time ON domain_events(budget_id, occurred_at);

    CREATE INDEX IF NOT EXISTS idx_transaction_flags_transaction_id ON transaction_flags(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_tags_budget_name ON transaction_tags(budget_id, name);
    CREATE INDEX IF NOT EXISTS idx_tag_assignments_transaction_id ON transaction_tag_assignments(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_tag_assignments_tag_id ON transaction_tag_assignments(tag_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_notes_transaction_id ON transaction_notes(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_transaction_id ON transaction_attachments(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_import_maps_import_run_id ON import_maps(import_run_id);
    CREATE INDEX IF NOT EXISTS idx_import_maps_target ON import_maps(target_entity_type, target_entity_id);
    CREATE INDEX IF NOT EXISTS idx_deleted_items_budget_entity ON deleted_items(budget_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_undo_records_budget_created ON undo_records(budget_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
    CREATE INDEX IF NOT EXISTS idx_transactions_budget_amount ON transactions(budget_id, amount);
    CREATE INDEX IF NOT EXISTS idx_transactions_budget_created ON transactions(budget_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_transaction_flags_colour ON transaction_flags(colour);
    CREATE INDEX IF NOT EXISTS idx_transaction_notes_note ON transaction_notes(note);
    CREATE INDEX IF NOT EXISTS idx_payee_rules_budget_priority ON payee_rules(budget_id, priority);
    CREATE INDEX IF NOT EXISTS idx_payee_rules_enabled ON payee_rules(budget_id, is_enabled);
    CREATE INDEX IF NOT EXISTS idx_bank_import_batches_budget ON bank_import_batches(budget_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_bank_import_items_batch ON bank_import_batch_items(batch_id);
    CREATE INDEX IF NOT EXISTS idx_bank_import_items_transaction ON bank_import_batch_items(transaction_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_import_items_external ON bank_import_batch_items(batch_id, external_id) WHERE external_id IS NOT NULL;


  `);

  const payeeColumns = sqlite.prepare("PRAGMA table_info(payees)").all().map((column: any) => column.name);
  const addPayeeColumn = (name: string, definition: string) => {
    if (!payeeColumns.includes(name)) sqlite.exec(`ALTER TABLE payees ADD COLUMN ${definition}`);
  };
  addPayeeColumn("normalized_name", "normalized_name TEXT NOT NULL DEFAULT ''");
  addPayeeColumn("is_archived", "is_archived INTEGER NOT NULL DEFAULT 0");
  addPayeeColumn("is_transfer", "is_transfer INTEGER NOT NULL DEFAULT 0");
  addPayeeColumn("transfer_account_id", "transfer_account_id TEXT");
  addPayeeColumn("created_at", "created_at INTEGER NOT NULL DEFAULT 0");
  addPayeeColumn("updated_at", "updated_at INTEGER NOT NULL DEFAULT 0");

  const transactionColumns = sqlite.prepare("PRAGMA table_info(transactions)").all().map((column: any) => column.name);
  const addTransactionColumn = (name: string, definition: string) => {
    if (!transactionColumns.includes(name)) sqlite.exec(`ALTER TABLE transactions ADD COLUMN ${definition}`);
  };
  addTransactionColumn("check_number", "check_number TEXT");

}
