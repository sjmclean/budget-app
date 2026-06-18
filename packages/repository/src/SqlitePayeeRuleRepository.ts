import type { PayeeRule } from "../../types/src/index.js";
import type { PayeeRuleRepository } from "./PayeeRuleRepository.js";

/**
 * Persists auto-categorisation/payee rules.
 *
 * These rules are deliberately stored separately from payees. A rule is not a payee;
 * it is a repeatable transformation such as "when bank text contains WOOLWORTHS,
 * use payee Woolworths and category Groceries". Keeping them separate lets the UI
 * reorder, disable, and test rules without mutating historical transactions.
 */
export class SqlitePayeeRuleRepository implements PayeeRuleRepository {
  constructor(private db: any) {}

  async create(rule: PayeeRule): Promise<void> {
    sqlite(this.db)
      .prepare(
        `
      INSERT INTO payee_rules (
        id, budget_id, name, pattern, match_mode, payee_name, category_id, memo,
        priority, is_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        rule.id,
        rule.budgetId,
        rule.name,
        rule.pattern,
        rule.matchMode,
        rule.payeeName,
        rule.categoryId,
        rule.memo,
        rule.priority,
        rule.isEnabled ? 1 : 0,
        Date.now(),
        Date.now(),
      );
  }

  async update(rule: PayeeRule): Promise<void> {
    sqlite(this.db)
      .prepare(
        `
      UPDATE payee_rules
      SET name = ?, pattern = ?, match_mode = ?, payee_name = ?, category_id = ?, memo = ?,
          priority = ?, is_enabled = ?, updated_at = ?
      WHERE id = ?
    `,
      )
      .run(
        rule.name,
        rule.pattern,
        rule.matchMode,
        rule.payeeName,
        rule.categoryId,
        rule.memo,
        rule.priority,
        rule.isEnabled ? 1 : 0,
        Date.now(),
        rule.id,
      );
  }

  async delete(ruleId: string): Promise<void> {
    sqlite(this.db).prepare(`DELETE FROM payee_rules WHERE id = ?`).run(ruleId);
  }

  async getById(ruleId: string): Promise<PayeeRule | null> {
    const row = sqlite(this.db)
      .prepare(`SELECT * FROM payee_rules WHERE id = ?`)
      .get(ruleId) as any;
    return row ? fromRow(row) : null;
  }

  async findByBudget(budgetId: string): Promise<PayeeRule[]> {
    return (
      sqlite(this.db)
        .prepare(
          `SELECT * FROM payee_rules WHERE budget_id = ? ORDER BY priority DESC, name ASC`,
        )
        .all(budgetId) as any[]
    ).map(fromRow);
  }

  async findEnabledByBudget(budgetId: string): Promise<PayeeRule[]> {
    return (
      sqlite(this.db)
        .prepare(
          `SELECT * FROM payee_rules WHERE budget_id = ? AND is_enabled = 1 ORDER BY priority DESC, name ASC`,
        )
        .all(budgetId) as any[]
    ).map(fromRow);
  }
}

function fromRow(row: any): PayeeRule {
  return {
    id: row.id,
    budgetId: row.budget_id,
    name: row.name,
    pattern: row.pattern,
    matchMode: row.match_mode,
    payeeName: row.payee_name,
    categoryId: row.category_id ?? null,
    memo: row.memo ?? null,
    priority: row.priority,
    isEnabled: Boolean(row.is_enabled),
  };
}

function sqlite(db: any) {
  const client = db?.$client;
  if (!client?.prepare)
    throw new Error(
      "SqlitePayeeRuleRepository requires a Drizzle better-sqlite3 database with $client",
    );
  return client;
}
