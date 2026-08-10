import type Database from "better-sqlite3";
import {
  ACCOUNT_TRANSACTION_MAX_LIMIT,
  type AccountRegisterQueryPort,
  type AccountRegisterSummary,
  type AccountTransactionPage,
  type AccountTransactionQuery,
  type AccountTransactionRow,
} from "../../application/src/accountRegister/AccountRegisterQueryPort.js";

interface AccountRow {
  id: string;
  budget_id: string;
  name: string;
  type: string;
  participation: string;
  opening_balance: number;
  currency: string;
}

interface SummaryRow {
  transaction_count: number;
  cleared_balance: number;
  uncleared_balance: number;
  working_balance: number;
}

interface TransactionRow {
  id: string;
  date: string;
  amount: number;
  memo: string | null;
  check_number: string | null;
  cleared_status: string;
  payee_id: string | null;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  transfer_account_id: string | null;
}

/**
 * Native SQLite implementation of the bounded account-register read port.
 *
 * This class belongs on the database side of a worker/host/HTTP boundary. Web
 * bundles must depend on AccountRegisterQueryPort, never on this implementation.
 */
export class SqliteAccountRegisterQueryService implements AccountRegisterQueryPort {
  private readonly readAccount;
  private readonly readSummary;
  private readonly readFirstPage;
  private readonly readNextPage;

  constructor(private readonly sqlite: Database.Database) {
    this.readAccount = sqlite.prepare(`
      SELECT
        account.id,
        account.budget_id,
        account.name,
        account.type,
        account.participation,
        account.opening_balance,
        budget.currency
      FROM accounts AS account
      JOIN budgets AS budget ON budget.id = account.budget_id
      WHERE account.budget_id = ? AND account.id = ?
      LIMIT 1
    `);
    this.readSummary = sqlite.prepare(`
      SELECT
        COUNT(*) AS transaction_count,
        COALESCE(SUM(CASE WHEN cleared_status IN ('cleared', 'reconciled') THEN amount ELSE 0 END), 0)
          AS cleared_balance,
        COALESCE(SUM(CASE WHEN cleared_status NOT IN ('cleared', 'reconciled') THEN amount ELSE 0 END), 0)
          AS uncleared_balance,
        COALESCE(SUM(amount), 0) AS working_balance
      FROM transactions
      WHERE budget_id = ? AND account_id = ? AND is_deleted = 0
    `);
    this.readFirstPage = sqlite.prepare(`
      SELECT
        transaction_row.id,
        transaction_row.date,
        transaction_row.amount,
        transaction_row.memo,
        transaction_row.check_number,
        transaction_row.cleared_status,
        transaction_row.payee_id,
        payee.name AS payee_name,
        transaction_row.category_id,
        category.name AS category_name,
        transaction_row.transfer_account_id
      FROM transactions AS transaction_row
      LEFT JOIN payees AS payee ON payee.id = transaction_row.payee_id
      LEFT JOIN categories AS category ON category.id = transaction_row.category_id
      WHERE transaction_row.budget_id = ?
        AND transaction_row.account_id = ?
        AND transaction_row.is_deleted = 0
      ORDER BY transaction_row.date DESC, transaction_row.id DESC
      LIMIT ?
    `);
    this.readNextPage = sqlite.prepare(`
      SELECT
        transaction_row.id,
        transaction_row.date,
        transaction_row.amount,
        transaction_row.memo,
        transaction_row.check_number,
        transaction_row.cleared_status,
        transaction_row.payee_id,
        payee.name AS payee_name,
        transaction_row.category_id,
        category.name AS category_name,
        transaction_row.transfer_account_id
      FROM transactions AS transaction_row
      LEFT JOIN payees AS payee ON payee.id = transaction_row.payee_id
      LEFT JOIN categories AS category ON category.id = transaction_row.category_id
      WHERE transaction_row.budget_id = ?
        AND transaction_row.account_id = ?
        AND transaction_row.is_deleted = 0
        AND (
          transaction_row.date < ?
          OR (transaction_row.date = ? AND transaction_row.id < ?)
        )
      ORDER BY transaction_row.date DESC, transaction_row.id DESC
      LIMIT ?
    `);
  }

  async getAccountSummary(input: {
    readonly budgetId: string;
    readonly accountId: string;
  }): Promise<AccountRegisterSummary> {
    const account = this.readAccount.get(input.budgetId, input.accountId) as AccountRow | undefined;
    if (!account) {
      throw new Error(`Account ${input.accountId} was not found in budget ${input.budgetId}.`);
    }
    const summary = this.readSummary.get(input.budgetId, input.accountId) as SummaryRow;
    return {
      budgetId: account.budget_id,
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      participation: account.participation,
      currencyCode: account.currency,
      openingBalance: account.opening_balance,
      clearedBalance: account.opening_balance + summary.cleared_balance,
      unclearedBalance: summary.uncleared_balance,
      workingBalance: account.opening_balance + summary.working_balance,
      transactionCount: summary.transaction_count,
    };
  }

  async queryTransactions(input: AccountTransactionQuery): Promise<AccountTransactionPage> {
    const limit = validateLimit(input.limit);
    const readLimit = limit + 1;
    const databaseRows = (input.before
      ? this.readNextPage.all(
          input.budgetId,
          input.accountId,
          input.before.date,
          input.before.date,
          input.before.id,
          readLimit,
        )
      : this.readFirstPage.all(input.budgetId, input.accountId, readLimit)) as TransactionRow[];
    const hasMore = databaseRows.length > limit;
    const rows = databaseRows.slice(0, limit).map(mapTransactionRow);
    const last = rows.at(-1);
    return {
      rows,
      hasMore,
      nextCursor: hasMore && last ? { date: last.date, id: last.id } : null,
    };
  }
}

function validateLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ACCOUNT_TRANSACTION_MAX_LIMIT) {
    throw new RangeError(
      `Account transaction limit must be an integer between 1 and ${ACCOUNT_TRANSACTION_MAX_LIMIT}.`,
    );
  }
  return limit;
}

function mapTransactionRow(row: TransactionRow): AccountTransactionRow {
  return {
    id: row.id,
    date: row.date,
    amount: row.amount,
    memo: row.memo,
    checkNumber: row.check_number,
    clearedStatus: row.cleared_status,
    payeeId: row.payee_id,
    payeeName: row.payee_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    transferAccountId: row.transfer_account_id,
  };
}
