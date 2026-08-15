export function uncategorisedTransactionPredicate(
  alias = "transaction_row",
): string {
  return `${alias}.amount <> 0
    AND EXISTS (
      SELECT 1 FROM local_accounts AS category_account
      WHERE category_account.budget_id = ${alias}.budget_id
        AND category_account.id = ${alias}.account_id
        AND category_account.participation = 'on-budget'
    )
    AND (
      (
        NOT EXISTS (
          SELECT 1 FROM local_transaction_splits AS category_split
          WHERE category_split.transaction_id = ${alias}.id
        )
        AND ${alias}.category_id IS NULL
        AND (
          ${alias}.transfer_account_id IS NULL
          OR ${alias}.transfer_transaction_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM local_accounts AS transfer_category_account
            WHERE transfer_category_account.budget_id = ${alias}.budget_id
              AND transfer_category_account.id = ${alias}.transfer_account_id
              AND transfer_category_account.participation = 'on-budget'
          )
        )
      )
      OR EXISTS (
        SELECT 1 FROM local_transaction_splits AS category_split
        WHERE category_split.transaction_id = ${alias}.id
          AND category_split.amount <> 0
          AND category_split.category_id IS NULL
          AND (
            category_split.transfer_account_id IS NULL
            OR category_split.transfer_transaction_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM local_accounts AS split_transfer_category_account
              WHERE split_transfer_category_account.budget_id = ${alias}.budget_id
                AND split_transfer_category_account.id = category_split.transfer_account_id
                AND split_transfer_category_account.participation = 'on-budget'
            )
          )
      )
    )`;
}
