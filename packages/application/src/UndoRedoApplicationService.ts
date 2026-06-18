/**
 * Executable undo/redo service.
 *
 * Earlier milestones stored undo previews only. This service is the first real command
 * executor: it records both an undo payload and a redo payload, then applies the correct
 * payload when the user chooses Undo or Redo. The payload format is intentionally explicit
 * rather than magical; each supported operation names the entity, action, and data needed
 * to reverse or replay the command.
 *
 * Supported payload examples:
 *   { action: "restoreTransaction", transaction: { ...full row... } }
 *   { action: "updateTransaction", before: { ... }, after: { ... } }
 *   { action: "softDeleteTransaction", transactionId: "..." }
 *
 * This keeps the backend safe for a local-first budget file: undo data is stored in SQLite
 * with the budget and remains available after closing/reopening the app.
 */
import { randomUUID } from "crypto";
import { CommandHistoryEntry } from "../../types/src/CommandHistoryEntry.js";
import { CommandHistoryRepository } from "../../repository/src/CommandHistoryRepository.js";

export interface RecordCommandInput {
  budgetId: string;
  eventId?: string | null;
  commandType: string;
  entityType: string;
  entityId: string;
  undoPayload: UndoRedoPayload;
  redoPayload: UndoRedoPayload;
}

export type UndoRedoPayload =
  | { action: "insertTransaction"; transaction: any }
  | { action: "updateTransaction"; transaction: any }
  | { action: "softDeleteTransaction"; transactionId: string }
  | { action: "restoreTransaction"; transactionId: string }
  | { action: "deleteTransaction"; transactionId: string }
  | { action: "updateAccount"; account: any }
  | { action: "updateCategory"; category: any }
  | { action: "updatePayee"; payee: any }
  | { action: "noop"; reason?: string };

export interface UndoRedoResult {
  entryId: string;
  action: "undo" | "redo";
  appliedPayload: UndoRedoPayload;
}

export class UndoRedoApplicationService {
  constructor(private historyRepo: CommandHistoryRepository, private db: any) {}

  async recordCommand(input: RecordCommandInput): Promise<CommandHistoryEntry> {
    const now = new Date();
    const entry: CommandHistoryEntry = {
      id: randomUUID(),
      budgetId: input.budgetId,
      eventId: input.eventId ?? null,
      commandType: input.commandType,
      entityType: input.entityType,
      entityId: input.entityId,
      undoPayloadJson: JSON.stringify(input.undoPayload),
      redoPayloadJson: JSON.stringify(input.redoPayload),
      status: "done",
      createdAt: now,
      executedAt: now,
      undoneAt: null,
      redoneAt: null
    };
    await this.historyRepo.create(entry);
    return entry;
  }

  async getUndoStack(budgetId: string): Promise<CommandHistoryEntry[]> {
    const entries = await this.historyRepo.findByBudget(budgetId);
    return entries
      .filter((entry) => entry.status === "done")
      .sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());
  }

  async getRedoStack(budgetId: string): Promise<CommandHistoryEntry[]> {
    const entries = await this.historyRepo.findByBudget(budgetId);
    return entries
      .filter((entry) => entry.status === "undone")
      .sort((a, b) => (a.undoneAt?.getTime() ?? 0) - (b.undoneAt?.getTime() ?? 0));
  }

  async undoLast(budgetId: string): Promise<UndoRedoResult | null> {
    const stack = await this.getUndoStack(budgetId);
    const entry = stack[stack.length - 1];
    if (!entry) return null;
    const payload = JSON.parse(entry.undoPayloadJson) as UndoRedoPayload;
    await this.applyPayload(payload);
    entry.status = "undone";
    entry.undoneAt = new Date();
    await this.historyRepo.update(entry);
    return { entryId: entry.id, action: "undo", appliedPayload: payload };
  }

  async redoLast(budgetId: string): Promise<UndoRedoResult | null> {
    const stack = await this.getRedoStack(budgetId);
    const entry = stack[stack.length - 1];
    if (!entry) return null;
    const payload = JSON.parse(entry.redoPayloadJson) as UndoRedoPayload;
    await this.applyPayload(payload);
    entry.status = "done";
    entry.redoneAt = new Date();
    entry.executedAt = new Date();
    await this.historyRepo.update(entry);
    return { entryId: entry.id, action: "redo", appliedPayload: payload };
  }

  private async applyPayload(payload: UndoRedoPayload): Promise<void> {
    const sqlite = sqliteClient(this.db);

    switch (payload.action) {
      case "insertTransaction":
        insertTransaction(sqlite, payload.transaction);
        return;
      case "updateTransaction":
        updateTransaction(sqlite, payload.transaction);
        return;
      case "softDeleteTransaction":
        sqlite.prepare(`UPDATE transactions SET is_deleted = 1, updated_at = ? WHERE id = ?`).run(Date.now(), payload.transactionId);
        return;
      case "restoreTransaction":
        sqlite.prepare(`UPDATE transactions SET is_deleted = 0, updated_at = ? WHERE id = ?`).run(Date.now(), payload.transactionId);
        return;
      case "deleteTransaction":
        sqlite.prepare(`DELETE FROM transactions WHERE id = ?`).run(payload.transactionId);
        return;
      case "updateAccount":
        updateAccount(sqlite, payload.account);
        return;
      case "updateCategory":
        updateCategory(sqlite, payload.category);
        return;
      case "updatePayee":
        updatePayee(sqlite, payload.payee);
        return;
      case "noop":
        return;
      default: {
        const exhaustive: never = payload;
        throw new Error(`Unsupported undo/redo payload: ${JSON.stringify(exhaustive)}`);
      }
    }
  }
}

function sqliteClient(db: any) {
  const client = db?.$client;
  if (!client || typeof client.prepare !== "function") {
    throw new Error("UndoRedoApplicationService requires a Drizzle better-sqlite3 database with $client");
  }
  return client;
}

function toTimestamp(value: Date | number | string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

function insertTransaction(sqlite: any, transaction: any): void {
  sqlite.prepare(`
    INSERT INTO transactions (
      id, budget_id, account_id, payee_id, category_id, transfer_account_id, type, date, memo,
      amount, cleared_status, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    transaction.id,
    transaction.budgetId,
    transaction.accountId,
    transaction.payeeId ?? null,
    transaction.categoryId ?? null,
    transaction.transferAccountId ?? null,
    transaction.type,
    transaction.date,
    transaction.memo ?? null,
    transaction.amount,
    transaction.clearedStatus,
    transaction.isDeleted ? 1 : 0,
    toTimestamp(transaction.createdAt),
    toTimestamp(transaction.updatedAt)
  );
}

function updateTransaction(sqlite: any, transaction: any): void {
  sqlite.prepare(`
    UPDATE transactions
    SET budget_id = ?, account_id = ?, payee_id = ?, category_id = ?, transfer_account_id = ?,
        type = ?, date = ?, memo = ?, amount = ?, cleared_status = ?, is_deleted = ?, created_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    transaction.budgetId,
    transaction.accountId,
    transaction.payeeId ?? null,
    transaction.categoryId ?? null,
    transaction.transferAccountId ?? null,
    transaction.type,
    transaction.date,
    transaction.memo ?? null,
    transaction.amount,
    transaction.clearedStatus,
    transaction.isDeleted ? 1 : 0,
    toTimestamp(transaction.createdAt),
    toTimestamp(transaction.updatedAt),
    transaction.id
  );
}

function updateAccount(sqlite: any, account: any): void {
  sqlite.prepare(`
    UPDATE accounts
    SET budget_id = ?, name = ?, type = ?, participation = ?, opening_balance = ?, current_balance = ?
    WHERE id = ?
  `).run(account.budgetId, account.name, account.type, account.participation, account.openingBalance, account.currentBalance, account.id);
}

function updateCategory(sqlite: any, category: any): void {
  sqlite.prepare(`
    UPDATE categories
    SET budget_id = ?, group_id = ?, name = ?, sort_order = ?, is_hidden = ?
    WHERE id = ?
  `).run(category.budgetId, category.groupId, category.name, category.sortOrder, category.isHidden ? 1 : 0, category.id);
}

function updatePayee(sqlite: any, payee: any): void {
  sqlite.prepare(`
    UPDATE payees
    SET budget_id = ?, name = ?, normalized_name = ?, is_archived = ?, is_transfer = ?, transfer_account_id = ?, created_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    payee.budgetId,
    payee.name,
    payee.normalizedName,
    payee.isArchived ? 1 : 0,
    payee.isTransfer ? 1 : 0,
    payee.transferAccountId ?? null,
    toTimestamp(payee.createdAt),
    toTimestamp(payee.updatedAt),
    payee.id
  );
}
