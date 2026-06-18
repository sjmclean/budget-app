import { Budget } from "../../types/src/Budget.js";
import { BudgetRepository } from "./BudgetRepository.js";

/**
 * SQLite budget repository.
 *
 * This repository intentionally uses explicit better-sqlite3 statements instead of
 * Drizzle's insert builder. v1.2.9 introduced stronger schema/integrity rules and the
 * v1.2.10 undo tests exposed a Drizzle/better-sqlite3 placeholder mismatch in this code
 * path. Explicit statements make the column/value mapping obvious and keep tests stable.
 */
export class SqliteBudgetRepository implements BudgetRepository {
  constructor(private db: any) {}

  async create(budget: Budget): Promise<void> {
    sqliteClient(this.db)
      .prepare(
        `INSERT INTO budgets (id, name, currency, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(
        budget.id,
        budget.name,
        budget.currency,
        toTimestamp(budget.createdAt),
      );
  }

  async getById(id: string): Promise<Budget | null> {
    const row = sqliteClient(this.db)
      .prepare(
        `SELECT id, name, currency, created_at FROM budgets WHERE id = ?`,
      )
      .get(id) as any;
    return row
      ? {
          id: row.id,
          name: row.name,
          currency: row.currency,
          createdAt: new Date(row.created_at),
        }
      : null;
  }
}

function sqliteClient(db: any) {
  const client = db?.$client;
  if (!client || typeof client.prepare !== "function")
    throw new Error(
      "Repository requires a Drizzle better-sqlite3 database with $client",
    );
  return client;
}
function toTimestamp(value: Date | number | string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}
