import Database from "better-sqlite3";

export interface IntegrityIssue {
  code: string;
  message: string;
  table?: string;
  count?: number;
}

export interface IntegrityReport {
  ok: boolean;
  foreignKeysEnabled: boolean;
  quickCheck: string;
  missingIndexes: string[];
  orphanIssues: IntegrityIssue[];
  duplicateIssues: IntegrityIssue[];
}

/**
 * Performs lightweight database integrity checks that sit between SQLite's low-level
 * `PRAGMA quick_check` and the richer application-level validation services.
 *
 * Why this service exists:
 * - The app is local-first, so user data lives in ordinary SQLite files that can be
 *   copied, synced, backed up, restored, and imported from older YNAB4 data.
 * - SQLite will happily store inconsistent references if a bug or import mistake writes
 *   bad IDs. The UI should not discover those problems for the first time by crashing.
 * - This service gives migrations, restore flows, and future support tools a common way
 *   to ask: "Does this budget database look structurally safe enough to open?"
 *
 * The service intentionally reports issues instead of repairing them automatically.
 * Repair rules are domain-specific: for example, an orphaned transaction category may be
 * recoverable by mapping it to an "Uncategorised" category, while an orphaned account is
 * a much more serious data-loss warning.
 */
export class DatabaseIntegrityApplicationService {
  constructor(private sqlite: Database.Database) {}

  /**
   * Returns true when SQLite foreign key enforcement is enabled on this connection.
   * This must be checked per connection; it is not a permanent database-file setting.
   */
  foreignKeysEnabled(): boolean {
    const row = this.sqlite.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    return row.foreign_keys === 1;
  }

  /**
   * Ensures the query indexes created in v1.2.9 are present.
   * Missing indexes are not corrupt data, but they are a performance footgun before GUI
   * work because registers, search screens, import review, and reports all depend on them.
   */
  findMissingIndexes(expectedIndexes = DEFAULT_REQUIRED_INDEXES): string[] {
    const rows = this.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>;
    const present = new Set(rows.map((row) => row.name));
    return expectedIndexes.filter((name) => !present.has(name));
  }

  /**
   * Checks the most important cross-table references that are not yet fully expressed as
   * SQLite foreign keys in the legacy schema. These checks are deliberately narrow and
   * practical: they target references that can immediately break balances, register views,
   * import rollback, or budget screens.
   */
  findOrphanIssues(): IntegrityIssue[] {
    const checks: Array<{ code: string; table: string; message: string; sql: string }> = [
      {
        code: "orphan_category_group_budget",
        table: "category_groups",
        message: "Category groups reference missing budgets",
        sql: "SELECT COUNT(*) AS count FROM category_groups cg LEFT JOIN budgets b ON b.id = cg.budget_id WHERE b.id IS NULL"
      },
      {
        code: "orphan_category_group",
        table: "categories",
        message: "Categories reference missing category groups",
        sql: "SELECT COUNT(*) AS count FROM categories c LEFT JOIN category_groups cg ON cg.id = c.group_id WHERE cg.id IS NULL"
      },
      {
        code: "orphan_account_budget",
        table: "accounts",
        message: "Accounts reference missing budgets",
        sql: "SELECT COUNT(*) AS count FROM accounts a LEFT JOIN budgets b ON b.id = a.budget_id WHERE b.id IS NULL"
      },
      {
        code: "orphan_transaction_budget",
        table: "transactions",
        message: "Transactions reference missing budgets",
        sql: "SELECT COUNT(*) AS count FROM transactions t LEFT JOIN budgets b ON b.id = t.budget_id WHERE b.id IS NULL"
      },
      {
        code: "orphan_transaction_account",
        table: "transactions",
        message: "Transactions reference missing accounts",
        sql: "SELECT COUNT(*) AS count FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id WHERE a.id IS NULL"
      },
      {
        code: "orphan_transaction_payee",
        table: "transactions",
        message: "Transactions reference missing payees",
        sql: "SELECT COUNT(*) AS count FROM transactions t LEFT JOIN payees p ON p.id = t.payee_id WHERE t.payee_id IS NOT NULL AND p.id IS NULL"
      },
      {
        code: "orphan_transaction_category",
        table: "transactions",
        message: "Transactions reference missing categories",
        sql: "SELECT COUNT(*) AS count FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.category_id IS NOT NULL AND c.id IS NULL"
      },
      {
        code: "orphan_split_transaction",
        table: "split_transaction_lines",
        message: "Split lines reference missing parent transactions",
        sql: "SELECT COUNT(*) AS count FROM split_transaction_lines s LEFT JOIN transactions t ON t.id = s.transaction_id WHERE t.id IS NULL"
      },
      {
        code: "orphan_category_month_category",
        table: "category_months",
        message: "Budget month category values reference missing categories",
        sql: "SELECT COUNT(*) AS count FROM category_months cm LEFT JOIN categories c ON c.id = cm.category_id WHERE c.id IS NULL"
      },
      {
        code: "orphan_goal_category",
        table: "goals",
        message: "Goals reference missing categories",
        sql: "SELECT COUNT(*) AS count FROM goals g LEFT JOIN categories c ON c.id = g.category_id WHERE c.id IS NULL"
      }
    ];

    return checks
      .map((check) => ({ ...check, count: this.count(check.sql) }))
      .filter((check) => check.count > 0)
      .map(({ code, table, message, count }) => ({ code, table, message, count }));
  }

  /**
   * Finds duplicates that can lead to confusing UI behaviour or unsafe merges.
   * These are not always illegal: YNAB4 imports may intentionally preserve messy payee
   * names. They should still be reported so cleanup tools can make explicit decisions.
   */
  findDuplicateIssues(): IntegrityIssue[] {
    const checks: Array<{ code: string; table: string; message: string; sql: string }> = [
      {
        code: "duplicate_payee_normalized_name",
        table: "payees",
        message: "Multiple active payees have the same normalized name in one budget",
        sql: "SELECT COUNT(*) AS count FROM (SELECT budget_id, normalized_name FROM payees WHERE is_archived = 0 GROUP BY budget_id, normalized_name HAVING COUNT(*) > 1)"
      },
      {
        code: "duplicate_tag_name",
        table: "transaction_tags",
        message: "Multiple tags have the same name in one budget",
        sql: "SELECT COUNT(*) AS count FROM (SELECT budget_id, name FROM transaction_tags GROUP BY budget_id, lower(name) HAVING COUNT(*) > 1)"
      },
      {
        code: "duplicate_category_month",
        table: "category_months",
        message: "A category has more than one value row for the same budget month",
        sql: "SELECT COUNT(*) AS count FROM (SELECT budget_month_id, category_id FROM category_months GROUP BY budget_month_id, category_id HAVING COUNT(*) > 1)"
      }
    ];

    return checks
      .map((check) => ({ ...check, count: this.count(check.sql) }))
      .filter((check) => check.count > 0)
      .map(({ code, table, message, count }) => ({ code, table, message, count }));
  }

  /**
   * Combines SQLite's own health check, v1.2.9 index verification, and practical orphan /
   * duplicate checks into a single report suitable for startup, restore, and import flows.
   */
  inspect(): IntegrityReport {
    const quickCheck = (this.sqlite.prepare("PRAGMA quick_check").get() as { quick_check: string }).quick_check;
    const missingIndexes = this.findMissingIndexes();
    const orphanIssues = this.findOrphanIssues();
    const duplicateIssues = this.findDuplicateIssues();

    return {
      ok: quickCheck === "ok" && missingIndexes.length === 0 && orphanIssues.length === 0,
      foreignKeysEnabled: this.foreignKeysEnabled(),
      quickCheck,
      missingIndexes,
      orphanIssues,
      duplicateIssues
    };
  }

  private count(sql: string): number {
    const row = this.sqlite.prepare(sql).get() as { count: number };
    return Number(row.count ?? 0);
  }
}

export const DEFAULT_REQUIRED_INDEXES = [
  "idx_category_groups_budget_id",
  "idx_categories_group_id",
  "idx_accounts_budget_id",
  "idx_payees_budget_id",
  "idx_payees_budget_normalized",
  "idx_transactions_budget_id",
  "idx_transactions_account_date",
  "idx_transactions_budget_date",
  "idx_transactions_category_id",
  "idx_transactions_payee_id",
  "idx_transactions_cleared_status",
  "idx_transactions_deleted",
  "idx_scheduled_budget_due",
  "idx_budget_months_budget_month",
  "idx_category_months_category_id",
  "idx_goals_budget_category",
  "idx_domain_events_budget_time",
  "idx_transaction_flags_transaction_id",
  "idx_transaction_tags_budget_name",
  "idx_tag_assignments_transaction_id",
  "idx_transaction_notes_transaction_id",
  "idx_import_maps_import_run_id",
  "idx_deleted_items_budget_entity",
  "idx_undo_records_budget_created"
];
