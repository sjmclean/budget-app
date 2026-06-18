import { ClearedStatus, TransactionType, type BankImportBatch, type BankImportCommitOptions, type BankImportCommitResult } from "../../types/src/index.js";
import type { BankImportBatchRepository } from "../../repository/src/BankImportBatchRepository.js";
import type { TransactionRepository } from "../../repository/src/TransactionRepository.js";
import type { Transaction } from "../../types/src/Transaction.js";

/**
 * Commits approved bank-import previews into real transactions and can undo the batch.
 *
 * This service intentionally performs the commit with a synchronous better-sqlite3
 * transaction. Earlier versions of the backend hit runtime failures when async functions
 * were used inside better-sqlite3 transaction callbacks. Keeping this block synchronous
 * gives true all-or-nothing behaviour: either every imported row and batch item is stored,
 * or none of them are.
 */
export class BankImportCommitApplicationService {
  constructor(
    private readonly db: any,
    private readonly batches: BankImportBatchRepository,
    private readonly transactions: TransactionRepository
  ) {}

  async commit(options: BankImportCommitOptions): Promise<BankImportCommitResult> {
    if (!options.importedRows.length) throw new Error("Cannot commit an empty bank import batch");

    const now = new Date();
    const batch: BankImportBatch = {
      id: cryptoId("bank_batch"),
      budgetId: options.budgetId,
      accountId: options.accountId,
      userId: options.userId,
      source: options.source,
      sourceFileName: options.sourceFileName ?? null,
      status: "committed",
      transactionCount: options.importedRows.length,
      createdAt: now,
      committedAt: now,
      undoneAt: null
    };

    const createdTransactionIds: string[] = [];
    const client = sqlite(this.db);
    const run = client.transaction(() => {
      client.prepare(`
        INSERT INTO bank_import_batches (
          id, budget_id, account_id, user_id, source, source_file_name, status,
          transaction_count, created_at, committed_at, undone_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(batch.id, batch.budgetId, batch.accountId, batch.userId, batch.source, batch.sourceFileName, batch.status, batch.transactionCount, now.getTime(), now.getTime(), null);

      options.importedRows.forEach((row, index) => {
        const suggestion = options.suggestions?.find((candidate) => candidate.imported === row || sameImported(candidate.imported, row));
        const tx: Transaction = {
          id: cryptoId("bank_tx"),
          budgetId: options.budgetId,
          accountId: options.accountId,
          payeeId: null,
          categoryId: suggestion?.suggestedCategoryId ?? null,
          transferAccountId: null,
          type: TransactionType.Standard,
          date: row.date,
          memo: suggestion?.suggestedMemo ?? row.memo,
          amount: row.amount,
          clearedStatus: ClearedStatus.Cleared,
          isDeleted: false,
          createdAt: now,
          updatedAt: now
        };
        client.prepare(`
          INSERT INTO transactions (
            id, budget_id, account_id, payee_id, category_id, transfer_account_id, type, date, memo,
            amount, cleared_status, is_deleted, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tx.id, tx.budgetId, tx.accountId, tx.payeeId, tx.categoryId, tx.transferAccountId, tx.type, tx.date, tx.memo, tx.amount, tx.clearedStatus, 0, now.getTime(), now.getTime());
        client.prepare(`
          INSERT INTO bank_import_batch_items (id, batch_id, transaction_id, external_id, raw_payee, amount, date, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(cryptoId(`bank_item_${index}`), batch.id, tx.id, row.externalId, row.rawPayee, row.amount, row.date, now.getTime());
        createdTransactionIds.push(tx.id);
      });
    });

    run();
    return { batch, createdTransactionIds };
  }

  async undo(batchId: string): Promise<number> {
    const batch = await this.batches.getBatch(batchId);
    if (!batch) throw new Error(`Bank import batch not found: ${batchId}`);
    if (batch.status === "undone") return 0;
    const items = await this.batches.findItems(batchId);
    const client = sqlite(this.db);
    const run = client.transaction(() => {
      for (const item of items) {
        client.prepare(`UPDATE transactions SET is_deleted = 1, updated_at = ? WHERE id = ?`).run(Date.now(), item.transactionId);
      }
      client.prepare(`UPDATE bank_import_batches SET status = 'undone', undone_at = ? WHERE id = ?`).run(Date.now(), batchId);
    });
    run();
    return items.length;
  }
}

function sameImported(a: any, b: any): boolean {
  return a.externalId === b.externalId && a.date === b.date && a.amount === b.amount && a.rawPayee === b.rawPayee;
}

function cryptoId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sqlite(db: any) {
  const client = db?.$client;
  if (!client?.prepare || !client.transaction) throw new Error("BankImportCommitApplicationService requires a Drizzle better-sqlite3 database with $client");
  return client;
}
