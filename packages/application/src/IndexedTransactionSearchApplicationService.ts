import Database from "better-sqlite3";

export type SortDirection = "asc" | "desc";

export interface IndexedTransactionSearchFilters {
  budgetId: string;
  accountId?: string;
  categoryId?: string;
  payeeId?: string;
  clearedStatus?: string;
  tagId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  text?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: "date" | "amount" | "createdAt";
  sortDirection?: SortDirection;
}

export interface IndexedTransactionSearchResult<T = any> {
  rows: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Production-oriented transaction search for register and review screens.
 *
 * The older search services returned all matches and left pagination/sorting to callers.
 * That is fine for tiny tests, but a migrated YNAB4 file may contain many years of data.
 * This service pushes filtering, sorting, and pagination into SQLite and is designed to be
 * backed by the indexes created in v1.2.9/v1.2.12.
 */
export class IndexedTransactionSearchApplicationService {
  constructor(private sqlite: Database.Database) {}

  search(filters: IndexedTransactionSearchFilters): IndexedTransactionSearchResult {
    const params: Record<string, unknown> = { budgetId: filters.budgetId };
    const where: string[] = ["t.budget_id = @budgetId"];
    const joins: string[] = [];

    if (!filters.includeDeleted) where.push("t.is_deleted = 0");
    if (filters.accountId) { where.push("t.account_id = @accountId"); params.accountId = filters.accountId; }
    if (filters.categoryId) { where.push("t.category_id = @categoryId"); params.categoryId = filters.categoryId; }
    if (filters.payeeId) { where.push("t.payee_id = @payeeId"); params.payeeId = filters.payeeId; }
    if (filters.clearedStatus) { where.push("t.cleared_status = @clearedStatus"); params.clearedStatus = filters.clearedStatus; }
    if (filters.dateFrom) { where.push("t.date >= @dateFrom"); params.dateFrom = filters.dateFrom; }
    if (filters.dateTo) { where.push("t.date <= @dateTo"); params.dateTo = filters.dateTo; }
    if (filters.amountMin !== undefined) { where.push("t.amount >= @amountMin"); params.amountMin = filters.amountMin; }
    if (filters.amountMax !== undefined) { where.push("t.amount <= @amountMax"); params.amountMax = filters.amountMax; }
    if (filters.tagId) {
      joins.push("INNER JOIN transaction_tag_assignments tta ON tta.transaction_id = t.id");
      where.push("tta.tag_id = @tagId");
      params.tagId = filters.tagId;
    }
    if (filters.text) {
      joins.push("LEFT JOIN payees p ON p.id = t.payee_id");
      where.push("(lower(coalesce(t.memo, '')) LIKE @text OR lower(coalesce(p.name, '')) LIKE @text)");
      params.text = `%${filters.text.toLowerCase()}%`;
    }

    const limit = clamp(filters.limit ?? 50, 1, 500);
    const offset = Math.max(0, filters.offset ?? 0);
    params.limit = limit;
    params.offset = offset;

    const sortColumn = filters.sortBy === "amount" ? "t.amount" : filters.sortBy === "createdAt" ? "t.created_at" : "t.date";
    const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
    const from = `FROM transactions t ${joins.join(" ")}`;
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const total = (this.sqlite.prepare(`SELECT COUNT(DISTINCT t.id) AS count ${from} ${whereSql}`).get(params) as { count: number }).count;
    const rows = this.sqlite.prepare(`
      SELECT DISTINCT t.*
      ${from}
      ${whereSql}
      ORDER BY ${sortColumn} ${sortDirection}, t.id ASC
      LIMIT @limit OFFSET @offset
    `).all(params);

    return { rows, total: Number(total), limit, offset };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
