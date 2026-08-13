export interface FinancialOverviewFlow {
  readonly income: number;
  readonly expenses: number;
}

export type FinancialOverviewFlowQuery = <T>(
  sql: string,
  bind?: readonly unknown[],
) => T[];

export function readFinancialOverviewFlow(
  query: FinancialOverviewFlowQuery,
  budgetId: string,
  month: string,
): FinancialOverviewFlow {
  return query<FinancialOverviewFlow>(
    `SELECT
       COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS expenses
     FROM (
       SELECT transaction_row.amount AS amount
       FROM local_transactions AS transaction_row
       WHERE transaction_row.budget_id = ?
         AND substr(transaction_row.date, 1, 7) = ?
         AND transaction_row.transfer_account_id IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM local_transaction_splits AS split
           WHERE split.transaction_id = transaction_row.id
         )
         AND lower(
           COALESCE(transaction_row.payee_name, '') || ' ' ||
           COALESCE(transaction_row.memo, '')
         ) NOT LIKE '%starting balance%'
         AND lower(
           COALESCE(transaction_row.payee_name, '') || ' ' ||
           COALESCE(transaction_row.memo, '')
         ) NOT LIKE '%opening balance%'
         AND lower(
           COALESCE(transaction_row.payee_name, '') || ' ' ||
           COALESCE(transaction_row.memo, '')
         ) NOT LIKE '%balance adjustment%'
         AND lower(
           COALESCE(transaction_row.payee_name, '') || ' ' ||
           COALESCE(transaction_row.memo, '')
         ) NOT LIKE '%reconciliation adjustment%'
         AND lower(
           COALESCE(transaction_row.payee_name, '') || ' ' ||
           COALESCE(transaction_row.memo, '')
         ) NOT LIKE '%credit card payment%'

       UNION ALL

       SELECT split.amount AS amount
       FROM local_transaction_splits AS split
       JOIN local_transactions AS parent
         ON parent.id = split.transaction_id
       WHERE parent.budget_id = ?
         AND substr(parent.date, 1, 7) = ?
         AND parent.transfer_account_id IS NULL
         AND split.transfer_account_id IS NULL
         AND lower(
           COALESCE(parent.payee_name, '') || ' ' ||
           COALESCE(parent.memo, '')
         ) NOT LIKE '%starting balance%'
         AND lower(
           COALESCE(parent.payee_name, '') || ' ' ||
           COALESCE(parent.memo, '')
         ) NOT LIKE '%opening balance%'
         AND lower(
           COALESCE(parent.payee_name, '') || ' ' ||
           COALESCE(parent.memo, '')
         ) NOT LIKE '%balance adjustment%'
         AND lower(
           COALESCE(parent.payee_name, '') || ' ' ||
           COALESCE(parent.memo, '')
         ) NOT LIKE '%reconciliation adjustment%'
         AND lower(
           COALESCE(parent.payee_name, '') || ' ' ||
           COALESCE(parent.memo, '')
         ) NOT LIKE '%credit card payment%'
     ) AS financial_flow`,
    [budgetId, month, budgetId, month],
  )[0] ?? { income: 0, expenses: 0 };
}
