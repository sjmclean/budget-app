import type { BankImportBatch } from "../../types/src/index.js";
import type {
  BankImportBatchItem,
  BankImportBatchRepository,
} from "./BankImportBatchRepository.js";

/** Stores committed bank-import batches so they can be reviewed or undone as a group. */
export class SqliteBankImportBatchRepository implements BankImportBatchRepository {
  constructor(private db: any) {}

  async createBatch(batch: BankImportBatch): Promise<void> {
    sqlite(this.db)
      .prepare(
        `
      INSERT INTO bank_import_batches (
        id, budget_id, account_id, user_id, source, source_file_name, status,
        transaction_count, created_at, committed_at, undone_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        batch.id,
        batch.budgetId,
        batch.accountId,
        batch.userId,
        batch.source,
        batch.sourceFileName,
        batch.status,
        batch.transactionCount,
        batch.createdAt.getTime(),
        batch.committedAt?.getTime() ?? null,
        batch.undoneAt?.getTime() ?? null,
      );
  }

  async addItem(item: BankImportBatchItem): Promise<void> {
    sqlite(this.db)
      .prepare(
        `
      INSERT INTO bank_import_batch_items (id, batch_id, transaction_id, external_id, raw_payee, amount, date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        item.id,
        item.batchId,
        item.transactionId,
        item.externalId,
        item.rawPayee,
        item.amount,
        item.date,
        item.createdAt.getTime(),
      );
  }

  async getBatch(batchId: string): Promise<BankImportBatch | null> {
    const row = sqlite(this.db)
      .prepare(`SELECT * FROM bank_import_batches WHERE id = ?`)
      .get(batchId) as any;
    return row ? batchFromRow(row) : null;
  }

  async findItems(batchId: string): Promise<BankImportBatchItem[]> {
    return (
      sqlite(this.db)
        .prepare(
          `SELECT * FROM bank_import_batch_items WHERE batch_id = ? ORDER BY created_at ASC`,
        )
        .all(batchId) as any[]
    ).map(itemFromRow);
  }

  async markUndone(batchId: string, undoneAt: Date): Promise<void> {
    sqlite(this.db)
      .prepare(
        `UPDATE bank_import_batches SET status = 'undone', undone_at = ? WHERE id = ?`,
      )
      .run(undoneAt.getTime(), batchId);
  }
}

function batchFromRow(row: any): BankImportBatch {
  return {
    id: row.id,
    budgetId: row.budget_id,
    accountId: row.account_id,
    userId: row.user_id,
    source: row.source,
    sourceFileName: row.source_file_name ?? null,
    status: row.status,
    transactionCount: row.transaction_count,
    createdAt: new Date(row.created_at),
    committedAt: row.committed_at ? new Date(row.committed_at) : null,
    undoneAt: row.undone_at ? new Date(row.undone_at) : null,
  };
}

function itemFromRow(row: any): BankImportBatchItem {
  return {
    id: row.id,
    batchId: row.batch_id,
    transactionId: row.transaction_id,
    externalId: row.external_id ?? null,
    rawPayee: row.raw_payee,
    amount: row.amount,
    date: row.date,
    createdAt: new Date(row.created_at),
  };
}

function sqlite(db: any) {
  const client = db?.$client;
  if (!client?.prepare)
    throw new Error(
      "SqliteBankImportBatchRepository requires a Drizzle better-sqlite3 database with $client",
    );
  return client;
}
