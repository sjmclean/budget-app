/**
 * Database-backed transaction search.
 *
 * Earlier search was intentionally in-memory while the domain model was moving quickly.
 * This service is the bridge toward production register/search screens: filters are
 * expressed directly in SQLite-friendly clauses and are supported by v1.2.9 indexes.
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { transactions } from "../../database/src/schema.js";
import { ClearedStatus } from "../../types/src/ClearedStatus.js";
import { Transaction } from "../../types/src/Transaction.js";

export interface DbTransactionSearchFilters {
  budgetId: string;
  accountId?: string;
  categoryId?: string;
  payeeId?: string;
  clearedStatus?: ClearedStatus;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  includeDeleted?: boolean;
}

export class DbBackedSearchApplicationService {
  constructor(private db: any) {}

  async searchTransactions(filters: DbTransactionSearchFilters): Promise<Transaction[]> {
    const clauses: any[] = [eq(transactions.budgetId, filters.budgetId)];
    if (!filters.includeDeleted) clauses.push(eq(transactions.isDeleted, false));
    if (filters.accountId) clauses.push(eq(transactions.accountId, filters.accountId));
    if (filters.categoryId) clauses.push(eq(transactions.categoryId, filters.categoryId));
    if (filters.payeeId) clauses.push(eq(transactions.payeeId, filters.payeeId));
    if (filters.clearedStatus) clauses.push(eq(transactions.clearedStatus, filters.clearedStatus));
    if (filters.dateFrom) clauses.push(gte(transactions.date, filters.dateFrom));
    if (filters.dateTo) clauses.push(lte(transactions.date, filters.dateTo));
    if (filters.amountMin !== undefined) clauses.push(gte(transactions.amount, filters.amountMin));
    if (filters.amountMax !== undefined) clauses.push(lte(transactions.amount, filters.amountMax));
    return await this.db.select().from(transactions).where(and(...clauses));
  }
}
