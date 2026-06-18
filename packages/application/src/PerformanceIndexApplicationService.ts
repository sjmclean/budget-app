import Database from "better-sqlite3";

export interface QueryPlanIssue {
  queryName: string;
  detail: string;
}

/**
 * Verifies that important register/search queries are index-friendly.
 *
 * SQLite query plans are not a perfect performance guarantee, but they catch accidental
 * full-table scans early when schema/index changes are made. These checks are deliberately
 * small and practical so they can run in ordinary test suites.
 */
export class PerformanceIndexApplicationService {
  constructor(private sqlite: Database.Database) {}

  listIndexes(): string[] {
    return (this.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
  }

  explain(sql: string, params: Record<string, unknown> = {}): string[] {
    return (this.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(params) as Array<{ detail: string }>).map((row) => row.detail);
  }

  findFullScanIssues(): QueryPlanIssue[] {
    const plans = [
      {
        queryName: "account register by date",
        details: this.explain("SELECT * FROM transactions WHERE account_id = @accountId AND date >= @dateFrom ORDER BY date DESC", { accountId: "a", dateFrom: "2026-01-01" })
      },
      {
        queryName: "budget date range",
        details: this.explain("SELECT * FROM transactions WHERE budget_id = @budgetId AND date BETWEEN @from AND @to", { budgetId: "b", from: "2026-01-01", to: "2026-12-31" })
      },
      {
        queryName: "payee filter",
        details: this.explain("SELECT * FROM transactions WHERE payee_id = @payeeId", { payeeId: "p" })
      }
    ];

    return plans.flatMap((plan) =>
      plan.details
        .filter((detail) => /SCAN transactions/i.test(detail) && !/USING INDEX|USING COVERING INDEX/i.test(detail))
        .map((detail) => ({ queryName: plan.queryName, detail }))
    );
  }
}
