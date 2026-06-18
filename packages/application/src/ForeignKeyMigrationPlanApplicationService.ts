/**
 * Documents the future migration path from application-level integrity checks to true
 * SQLite foreign-key constraints.
 *
 * SQLite cannot simply ALTER most existing tables to add foreign keys. The safe path is
 * create-copy-validate-rename per table. This service gives migrations/UI diagnostics a
 * stable checklist without forcing a risky rewrite of every current table in v1.2.14.
 */
export class ForeignKeyMigrationPlanApplicationService {
  getPlan(): ForeignKeyMigrationPlanStep[] {
    return [
      { table: "category_groups", references: "budgets(id)", action: "rebuild-table", deleteRule: "RESTRICT" },
      { table: "categories", references: "category_groups(id)", action: "rebuild-table", deleteRule: "RESTRICT" },
      { table: "accounts", references: "budgets(id)", action: "rebuild-table", deleteRule: "RESTRICT" },
      { table: "transactions", references: "budgets/accounts/payees/categories", action: "rebuild-table", deleteRule: "RESTRICT + soft delete" },
      { table: "split_transaction_lines", references: "transactions(id), categories(id)", action: "rebuild-table", deleteRule: "CASCADE from transaction only" },
      { table: "category_months", references: "budget_months(id), categories(id)", action: "rebuild-table", deleteRule: "RESTRICT" },
      { table: "goals", references: "budgets(id), categories(id)", action: "rebuild-table", deleteRule: "RESTRICT" },
      { table: "transaction_metadata", references: "transactions(id)", action: "rebuild metadata tables", deleteRule: "CASCADE from transaction" },
      { table: "bank_import_batch_items", references: "bank_import_batches(id), transactions(id)", action: "rebuild-table", deleteRule: "CASCADE from batch" }
    ];
  }
}

export interface ForeignKeyMigrationPlanStep {
  table: string;
  references: string;
  action: "rebuild-table" | "rebuild metadata tables";
  deleteRule: string;
}
