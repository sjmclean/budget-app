import { CommandHistoryEntry } from "../../types/src/CommandHistoryEntry.js";
import { CommandHistoryRepository } from "./CommandHistoryRepository.js";

/**
 * SQLite-backed command history repository used by the executable undo/redo system.
 *
 * This repository deliberately uses the underlying better-sqlite3 client instead of
 * Drizzle's insert/update builder. The rest of the project can keep using Drizzle, but
 * command_history stores JSON payloads plus several nullable timestamp fields. In the
 * v1.2.10 test path Drizzle generated a prepared insert whose placeholders did not
 * match the supplied values, producing better-sqlite3's:
 *
 *   RangeError: Too few parameter values were provided
 *
 * For undo/redo we need absolute reliability, so this repository binds every column
 * explicitly with positional parameters and stores timestamps as milliseconds since epoch.
 * The row mapping below converts those integer timestamps back into Date objects for the
 * domain/application layer.
 */
export class SqliteCommandHistoryRepository implements CommandHistoryRepository {
  constructor(private db: any) {}

  async create(entry: CommandHistoryEntry): Promise<void> {
    sqliteClient(this.db)
      .prepare(`
        INSERT INTO command_history (
          id,
          budget_id,
          event_id,
          command_type,
          entity_type,
          entity_id,
          undo_payload_json,
          redo_payload_json,
          status,
          created_at,
          executed_at,
          undone_at,
          redone_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        entry.id,
        entry.budgetId,
        entry.eventId ?? null,
        entry.commandType,
        entry.entityType,
        entry.entityId,
        entry.undoPayloadJson,
        entry.redoPayloadJson,
        entry.status,
        toTimestamp(entry.createdAt),
        toTimestamp(entry.executedAt),
        entry.undoneAt ? toTimestamp(entry.undoneAt) : null,
        entry.redoneAt ? toTimestamp(entry.redoneAt) : null
      );
  }

  async update(entry: CommandHistoryEntry): Promise<void> {
    sqliteClient(this.db)
      .prepare(`
        UPDATE command_history
        SET
          event_id = ?,
          command_type = ?,
          entity_type = ?,
          entity_id = ?,
          undo_payload_json = ?,
          redo_payload_json = ?,
          status = ?,
          created_at = ?,
          executed_at = ?,
          undone_at = ?,
          redone_at = ?
        WHERE id = ?
      `)
      .run(
        entry.eventId ?? null,
        entry.commandType,
        entry.entityType,
        entry.entityId,
        entry.undoPayloadJson,
        entry.redoPayloadJson,
        entry.status,
        toTimestamp(entry.createdAt),
        toTimestamp(entry.executedAt),
        entry.undoneAt ? toTimestamp(entry.undoneAt) : null,
        entry.redoneAt ? toTimestamp(entry.redoneAt) : null,
        entry.id
      );
  }

  async findByBudget(budgetId: string): Promise<CommandHistoryEntry[]> {
    const rows = sqliteClient(this.db)
      .prepare(`
        SELECT
          id,
          budget_id,
          event_id,
          command_type,
          entity_type,
          entity_id,
          undo_payload_json,
          redo_payload_json,
          status,
          created_at,
          executed_at,
          undone_at,
          redone_at
        FROM command_history
        WHERE budget_id = ?
      `)
      .all(budgetId);

    return rows.map(fromCommandHistoryRow);
  }

  async getById(id: string): Promise<CommandHistoryEntry | null> {
    const row = sqliteClient(this.db)
      .prepare(`
        SELECT
          id,
          budget_id,
          event_id,
          command_type,
          entity_type,
          entity_id,
          undo_payload_json,
          redo_payload_json,
          status,
          created_at,
          executed_at,
          undone_at,
          redone_at
        FROM command_history
        WHERE id = ?
      `)
      .get(id);

    return row ? fromCommandHistoryRow(row) : null;
  }
}

function sqliteClient(db: any) {
  const client = db?.$client;
  if (!client || typeof client.prepare !== "function") {
    throw new Error("SqliteCommandHistoryRepository requires a Drizzle better-sqlite3 database with $client");
  }
  return client;
}

function toTimestamp(value: Date | number | string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

function fromCommandHistoryRow(row: any): CommandHistoryEntry {
  return {
    id: row.id,
    budgetId: row.budget_id,
    eventId: row.event_id ?? null,
    commandType: row.command_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    undoPayloadJson: row.undo_payload_json,
    redoPayloadJson: row.redo_payload_json,
    status: row.status,
    createdAt: new Date(row.created_at),
    executedAt: new Date(row.executed_at),
    undoneAt: row.undone_at == null ? null : new Date(row.undone_at),
    redoneAt: row.redone_at == null ? null : new Date(row.redone_at)
  };
}
