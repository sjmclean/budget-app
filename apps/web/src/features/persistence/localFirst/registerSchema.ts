export const LOCAL_REGISTER_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS local_accounts (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    participation TEXT NOT NULL,
    opening_balance INTEGER NOT NULL DEFAULT 0,
    currency_code TEXT NOT NULL,
    created_at TEXT NOT NULL,
    closed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS local_accounts_budget_closed
    ON local_accounts(budget_id, closed_at, name);

  CREATE TABLE IF NOT EXISTS local_payees (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    name TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    default_category_id TEXT,
    default_category_name TEXT,
    icon_ref TEXT,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS local_payees_budget_name
    ON local_payees(budget_id, archived, name);

  CREATE TABLE IF NOT EXISTS local_payee_aliases (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    payee_id TEXT NOT NULL,
    value TEXT NOT NULL,
    normalized_value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(budget_id, normalized_value),
    FOREIGN KEY(payee_id) REFERENCES local_payees(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS local_payee_aliases_owner
    ON local_payee_aliases(budget_id, payee_id, value);

  CREATE TABLE IF NOT EXISTS local_payee_recognition_rules (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    payee_id TEXT NOT NULL,
    match_type TEXT NOT NULL CHECK(match_type IN ('equals','startsWith','endsWith','contains')),
    pattern TEXT NOT NULL,
    normalized_pattern TEXT NOT NULL,
    default_category_id TEXT,
    default_category_name TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(payee_id) REFERENCES local_payees(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS local_payee_rules_owner
    ON local_payee_recognition_rules(budget_id, payee_id, enabled, priority);

  CREATE TABLE IF NOT EXISTS local_payee_history (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    payee_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    detail_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS local_payee_duplicate_suppressions (
    budget_id TEXT NOT NULL,
    left_payee_id TEXT NOT NULL,
    right_payee_id TEXT NOT NULL,
    decision TEXT NOT NULL CHECK(decision IN ('keep-separate')),
    created_at TEXT NOT NULL,
    PRIMARY KEY(budget_id, left_payee_id, right_payee_id),
    CHECK(left_payee_id < right_payee_id),
    FOREIGN KEY(left_payee_id) REFERENCES local_payees(id) ON DELETE CASCADE,
    FOREIGN KEY(right_payee_id) REFERENCES local_payees(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS local_categories (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    group_name TEXT NOT NULL,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS local_categories_budget_group
    ON local_categories(budget_id, archived, group_name, name);

  CREATE TABLE IF NOT EXISTS local_transactions (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    memo TEXT,
    check_number TEXT,
    cleared_status TEXT NOT NULL,
    payee_id TEXT,
    payee_name TEXT,
    raw_payee_name TEXT,
    import_provenance TEXT CHECK(import_provenance IN ('ynab4-imported-payee')),
    category_id TEXT,
    category_name TEXT,
    transfer_account_id TEXT,
    transfer_transaction_id TEXT,
    generated_from_schedule INTEGER NOT NULL DEFAULT 0,
    scheduled_transaction_id TEXT,
    scheduled_occurrence_date TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES local_accounts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS local_transactions_register
    ON local_transactions(budget_id, account_id, date DESC, id DESC);
  CREATE INDEX IF NOT EXISTS local_transactions_account_summary
    ON local_transactions(budget_id, account_id, amount, cleared_status);
  CREATE INDEX IF NOT EXISTS local_transactions_category_month
    ON local_transactions(budget_id, category_id, substr(date, 1, 7), date, id);
  CREATE INDEX IF NOT EXISTS local_transactions_budget_date
    ON local_transactions(budget_id, date, id);
  CREATE INDEX IF NOT EXISTS local_transactions_budget_month
    ON local_transactions(budget_id, substr(date, 1, 7), category_id, amount);
  CREATE INDEX IF NOT EXISTS local_transactions_payee
    ON local_transactions(budget_id, payee_id, date DESC, id DESC);

  CREATE TABLE IF NOT EXISTS local_transaction_splits (
    transaction_id TEXT NOT NULL,
    id TEXT NOT NULL,
    category_id TEXT,
    category_name TEXT,
    transfer_account_id TEXT,
    transfer_transaction_id TEXT,
    memo TEXT,
    amount INTEGER NOT NULL,
    PRIMARY KEY(transaction_id, id),
    FOREIGN KEY(transaction_id) REFERENCES local_transactions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS local_transaction_splits_category
    ON local_transaction_splits(category_id, transaction_id, id);

  CREATE TABLE IF NOT EXISTS local_transaction_tags (
    transaction_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY(transaction_id, tag_id),
    FOREIGN KEY(transaction_id) REFERENCES local_transactions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS local_transaction_tags_tag
    ON local_transaction_tags(tag_id, transaction_id);

  CREATE TABLE IF NOT EXISTS local_transaction_attachments (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    attached_at TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    content BLOB NOT NULL,
    FOREIGN KEY(transaction_id) REFERENCES local_transactions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS local_transaction_attachments_transaction
    ON local_transaction_attachments(budget_id, transaction_id, attached_at, id);
`;

export interface LocalAccountRecord {
  readonly id: string;
  readonly budgetId: string;
  readonly name: string;
  readonly type: string;
  readonly participation: string;
  readonly openingBalance: number;
  readonly currencyCode: string;
  readonly createdAt: string;
  readonly closedAt: string | null;
}

export interface LocalReferenceRecord {
  readonly id: string;
  readonly budgetId: string;
  readonly name: string;
}

export interface LocalPayeeRecord extends LocalReferenceRecord {
  readonly note: string;
  readonly archived: boolean;
  readonly defaultCategoryId?: string;
  readonly defaultCategoryName?: string;
  readonly iconRef?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly aliases?: readonly { id: string; value: string }[];
  readonly importRules?: readonly {
    id: string; matchType: "equals" | "contains" | "startsWith" | "endsWith";
    text: string; defaultCategoryId?: string; defaultCategoryName?: string;
    priority?: number; enabled?: boolean;
  }[];
  readonly useCount?: number;
  readonly scheduledUseCount?: number;
  readonly firstUsedAt?: string;
  readonly lastUsedAt?: string;
}

export interface LocalCategoryRecord extends LocalReferenceRecord {
  readonly groupId: string;
  readonly groupName: string;
  readonly archived: boolean;
}

export interface LocalTransactionSplitRecord {
  readonly id: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly transferAccountId: string | null;
  readonly transferTransactionId: string | null;
  readonly memo: string | null;
  readonly amount: number;
}

export interface LocalTransactionRecord {
  readonly id: string;
  readonly budgetId: string;
  readonly accountId: string;
  readonly date: string;
  readonly amount: number;
  readonly memo: string | null;
  readonly checkNumber: string | null;
  readonly clearedStatus: string;
  readonly payeeId: string | null;
  readonly payeeName: string | null;
  readonly rawPayeeName?: string | null;
  readonly importProvenance?: "ynab4-imported-payee" | null;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly transferAccountId: string | null;
  readonly transferTransactionId: string | null;
  readonly generatedFromSchedule: boolean;
  readonly scheduledTransactionId: string | null;
  readonly scheduledOccurrenceDate: string | null;
  readonly splitLines: readonly LocalTransactionSplitRecord[];
  readonly tagIds: readonly string[];
  readonly updatedAt: string;
}

export const LOCAL_TRANSACTION_UPSERT_SQL = `
  INSERT INTO local_transactions(
    id, budget_id, account_id, date, amount, memo, check_number,
    cleared_status, payee_id, payee_name, raw_payee_name, import_provenance, category_id, category_name,
    transfer_account_id, transfer_transaction_id, generated_from_schedule,
    scheduled_transaction_id, scheduled_occurrence_date, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    import_provenance = excluded.import_provenance,
    category_id = excluded.category_id,
    category_name = excluded.category_name,
    transfer_account_id = excluded.transfer_account_id,
    transfer_transaction_id = excluded.transfer_transaction_id,
    generated_from_schedule = excluded.generated_from_schedule,
    scheduled_transaction_id = excluded.scheduled_transaction_id,
    scheduled_occurrence_date = excluded.scheduled_occurrence_date,
    updated_at = excluded.updated_at
`;

export function localTransactionUpsertBindings(
  transaction: LocalTransactionRecord,
): readonly unknown[] {
  return [
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
    transaction.rawPayeeName ?? null,
    transaction.importProvenance ?? null,
    transaction.categoryId,
    transaction.categoryName,
    transaction.transferAccountId,
    transaction.transferTransactionId,
    transaction.generatedFromSchedule ? 1 : 0,
    transaction.scheduledTransactionId,
    transaction.scheduledOccurrenceDate,
    transaction.updatedAt,
  ];
}

export interface LocalTransactionAttachmentRecord {
  readonly id: string;
  readonly budgetId: string;
  readonly transactionId: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly mimeType: string;
  readonly attachedAt: string;
  readonly contentHash: string;
}

export interface LocalTransactionAttachmentMutationPayload {
  readonly kind: "transaction-attachment-upsert" | "transaction-attachment-delete";
  readonly attachment: LocalTransactionAttachmentRecord;
  readonly contentBase64?: string;
}

export interface LocalRegisterImportBatch {
  readonly accounts?: readonly LocalAccountRecord[];
  readonly payees?: readonly LocalPayeeRecord[];
  readonly categories?: readonly LocalCategoryRecord[];
  readonly transactions?: readonly LocalTransactionRecord[];
}

export interface LocalTransactionQuery {
  readonly budgetId: string;
  readonly accountId: string;
  readonly limit: number;
  readonly offset?: number;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly before?: { readonly date: string; readonly id: string };
  readonly includeTotalCount?: boolean;
  readonly search?: {
    readonly query: string;
    readonly scope: "all" | "payee" | "category" | "memo" | "amount";
  };
  readonly categoryFilter?: "all" | "uncategorised";
  readonly sort?: {
    readonly column: "date" | "payee" | "category" | "memo" | "outflow" | "inflow";
    readonly direction: "ascending" | "descending";
  };
}
