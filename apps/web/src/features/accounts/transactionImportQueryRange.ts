import {
  TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
  type TransactionImportPreview,
} from "./transactionImport";

export interface TransactionImportQueryRange {
  readonly fromDate: string;
  readonly toDate: string;
}

/**
 * Covers every date that the reconciliation engine can consider for the
 * parsed statement while keeping the persistence read account/date bounded.
 */
export function getTransactionImportQueryRange(
  preview: TransactionImportPreview,
): TransactionImportQueryRange | undefined {
  const dates = preview.candidates
    .map((candidate) => candidate.parsed.date)
    .filter((date): date is string => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  const firstDate = dates.at(0);
  const lastDate = dates.at(-1);
  if (!firstDate || !lastDate) return undefined;

  const shiftDate = (date: string, days: number) => {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };

  return {
    fromDate: shiftDate(firstDate, -TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS),
    toDate: shiftDate(lastDate, TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS),
  };
}
