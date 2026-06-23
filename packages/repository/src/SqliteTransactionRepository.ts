import { ClearedStatus } from "../../types/src/ClearedStatus.js";
import { Transaction } from "../../types/src/Transaction.js";
import { TransactionRepository } from "./TransactionRepository.js";

/**
 * SQLite transaction repository with explicit SQL mappings.
 *
 * Transactions sit at the centre of budgeting, reconciliation, import, reports, and
 * undo/redo. v1.2.10 exposed that relying on generic Drizzle object inserts could produce
 * a better-sqlite3 placeholder mismatch in some test paths. These explicit statements make
 * every stored field visible and predictable.
 */
export class SqliteTransactionRepository implements TransactionRepository {
  constructor(private db: any) {}

  async create(transaction: Transaction): Promise<void> {
    sqliteClient(this.db)
      .prepare(`
        INSERT INTO transactions (
          id, budget_id, account_id, payee_id, category_id, transfer_account_id, type, date, memo, check_number,
          amount, cleared_status, is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(...transactionParams(transaction));
  }

  async update(transaction: Transaction): Promise<void> {
    sqliteClient(this.db)
      .prepare(`
        UPDATE transactions
        SET budget_id = ?, account_id = ?, payee_id = ?, category_id = ?, transfer_account_id = ?,
            type = ?, date = ?, memo = ?, check_number = ?, amount = ?, cleared_status = ?, is_deleted = ?, created_at = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        transaction.budgetId,
        transaction.accountId,
        transaction.payeeId,
        transaction.categoryId,
        transaction.transferAccountId,
        transaction.type,
        transaction.date,
        transaction.memo,
        normaliseCheckNumber(transaction.checkNumber),
        transaction.amount,
        transaction.clearedStatus,
        transaction.isDeleted ? 1 : 0,
        toTimestamp(transaction.createdAt),
        toTimestamp(transaction.updatedAt),
        transaction.id
      );
  }

  async getById(id: string): Promise<Transaction | null> {
    const row = sqliteClient(this.db).prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) as any;
    return row ? fromTransactionRow(row) : null;
  }

  async findByBudget(budgetId: string): Promise<Transaction[]> {
    const rows = sqliteClient(this.db).prepare(`SELECT * FROM transactions WHERE budget_id = ?`).all(budgetId) as any[];
    return rows.map(fromTransactionRow);
  }

  async findByAccount(accountId: string): Promise<Transaction[]> {
    const rows = sqliteClient(this.db).prepare(`SELECT * FROM transactions WHERE account_id = ?`).all(accountId) as any[];
    return rows.map(fromTransactionRow);
  }

  async findByStatus(budgetId: string, status: ClearedStatus): Promise<Transaction[]> {
    const rows = sqliteClient(this.db)
      .prepare(`SELECT * FROM transactions WHERE budget_id = ? AND cleared_status = ?`)
      .all(budgetId, status) as any[];
    return rows.map(fromTransactionRow);
  }

  async softDelete(id: string): Promise<void> {
    sqliteClient(this.db).prepare(`UPDATE transactions SET is_deleted = 1, updated_at = ? WHERE id = ?`).run(Date.now(), id);
  }

  async restore(id: string): Promise<void> {
    sqliteClient(this.db).prepare(`UPDATE transactions SET is_deleted = 0, updated_at = ? WHERE id = ?`).run(Date.now(), id);
  }
}

function transactionParams(transaction: Transaction): any[] {
  return [
    transaction.id,
    transaction.budgetId,
    transaction.accountId,
    transaction.payeeId,
    transaction.categoryId,
    transaction.transferAccountId,
    transaction.type,
    transaction.date,
    transaction.memo,
    normaliseCheckNumber(transaction.checkNumber),
    transaction.amount,
    transaction.clearedStatus,
    transaction.isDeleted ? 1 : 0,
    toTimestamp(transaction.createdAt),
    toTimestamp(transaction.updatedAt)
  ];
}
function sqliteClient(db: any) {
  const client = db?.$client;
  if (!client || typeof client.prepare !== "function") throw new Error("Repository requires a Drizzle better-sqlite3 database with $client");
  return client;
}
function toTimestamp(value: Date | number | string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}
function fromTransactionRow(row: any): Transaction {
  return {
    id: row.id,
    budgetId: row.budget_id,
    accountId: row.account_id,
    payeeId: row.payee_id ?? null,
    categoryId: row.category_id ?? null,
    transferAccountId: row.transfer_account_id ?? null,
    type: row.type,
    date: row.date,
    memo: row.memo ?? null,
    checkNumber: row.check_number ?? null,
    amount: row.amount,
    clearedStatus: row.cleared_status,
    isDeleted: Boolean(row.is_deleted),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function normaliseCheckNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
