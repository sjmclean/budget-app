import type {
  AccountRegisterQueryPort,
  AccountTransactionCursor,
  AccountTransactionRow,
} from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import { ACCOUNT_TRANSACTION_MAX_LIMIT } from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import type { RegisterTransactionView } from "./accountRegisterTypes";
import { mapSqliteTransactions } from "./useAccountRegister";

export interface TransactionImportDateRange {
  readonly fromDate: string;
  readonly toDate: string;
}

/**
 * Reads every candidate match in bounded pages. Optional date bounds keep
 * large-register import matching proportional to the file being reviewed.
 */
export async function loadCompleteAccountTransactionsForImport(input: {
  readonly queries: AccountRegisterQueryPort;
  readonly budgetId: string;
  readonly accountId: string;
  readonly range?: TransactionImportDateRange;
}): Promise<RegisterTransactionView[]> {
  const rows: AccountTransactionRow[] = [];
  let before: AccountTransactionCursor | undefined;
  let previousCursor: string | null = null;

  do {
    const page = await input.queries.queryTransactions({
      budgetId: input.budgetId,
      accountId: input.accountId,
      limit: ACCOUNT_TRANSACTION_MAX_LIMIT,
      before,
      fromDate: input.range?.fromDate,
      toDate: input.range?.toDate,
    });
    rows.push(...page.rows);
    if (!page.hasMore) break;
    if (!page.nextCursor) {
      throw new Error("The account transaction query reported more rows without a continuation cursor.");
    }
    const cursorKey = `${page.nextCursor.date}\u0000${page.nextCursor.id}`;
    if (cursorKey === previousCursor) {
      throw new Error("The account transaction query returned a non-advancing continuation cursor.");
    }
    previousCursor = cursorKey;
    before = page.nextCursor;
  } while (before);

  return mapSqliteTransactions(rows, 0);
}
