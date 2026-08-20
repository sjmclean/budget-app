export type ImportedTransactionSourceFileType =
  | "csv"
  | "qif"
  | "ofx"
  | "qfx";

export interface ImportedTransactionSourceOccurrenceRow {
  readonly identity: string;
  readonly occurrenceCount: number;
}

export type ImportedTransactionSourceOccurrenceQuery = <T>(
  sql: string,
  bind?: readonly unknown[],
) => T[];

export function readImportedTransactionSourceOccurrences(
  query: ImportedTransactionSourceOccurrenceQuery,
  budgetId: string,
  accountId: string,
  fileType: ImportedTransactionSourceFileType,
): readonly ImportedTransactionSourceOccurrenceRow[] {
  return query<ImportedTransactionSourceOccurrenceRow>(
    `SELECT provenance.identity,
       MAX(provenance.occurrence) AS occurrenceCount
     FROM local_transaction_import_provenance AS provenance
     INNER JOIN local_transactions AS transaction_row
       ON transaction_row.id = provenance.transaction_id
     WHERE transaction_row.budget_id = ?
       AND transaction_row.account_id = ?
       AND provenance.file_type = ?
     GROUP BY provenance.identity
     ORDER BY provenance.identity`,
    [budgetId, accountId, fileType],
  );
}
