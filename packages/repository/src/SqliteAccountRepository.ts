import { Account } from "../../types/src/Account.js";
import { AccountRepository } from "./AccountRepository.js";

/**
 * SQLite account repository with explicit SQL column mappings.
 *
 * Account rows are used heavily by transaction, transfer, import, and undo/redo tests.
 * Binding columns explicitly avoids silent camelCase/snake_case mapping mistakes and
 * avoids the Drizzle placeholder mismatch seen in the v1.2.10 regression.
 */
export class SqliteAccountRepository implements AccountRepository {
  constructor(private db: any) {}

  async create(account: Account): Promise<void> {
    sqliteClient(this.db)
      .prepare(
        `
        INSERT INTO accounts (id, budget_id, name, type, participation, opening_balance, current_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        account.id,
        account.budgetId,
        account.name,
        account.type,
        account.participation,
        account.openingBalance,
        account.currentBalance,
      );
  }

  async update(account: Account): Promise<void> {
    sqliteClient(this.db)
      .prepare(
        `
        UPDATE accounts
        SET budget_id = ?, name = ?, type = ?, participation = ?, opening_balance = ?, current_balance = ?
        WHERE id = ?
      `,
      )
      .run(
        account.budgetId,
        account.name,
        account.type,
        account.participation,
        account.openingBalance,
        account.currentBalance,
        account.id,
      );
  }

  async getById(id: string): Promise<Account | null> {
    const row = sqliteClient(this.db)
      .prepare(`SELECT * FROM accounts WHERE id = ?`)
      .get(id) as any;
    return row ? fromAccountRow(row) : null;
  }

  async findByBudget(budgetId: string): Promise<Account[]> {
    const rows = sqliteClient(this.db)
      .prepare(`SELECT * FROM accounts WHERE budget_id = ?`)
      .all(budgetId) as any[];
    return rows.map(fromAccountRow);
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
function fromAccountRow(row: any): Account {
  return {
    id: row.id,
    budgetId: row.budget_id,
    name: row.name,
    type: row.type,
    participation: row.participation,
    openingBalance: row.opening_balance,
    currentBalance: row.current_balance,
  };
}
