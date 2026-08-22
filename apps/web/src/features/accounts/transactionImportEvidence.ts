import type { RegisterTransactionView } from "./accountRegisterTypes";
import type { ParsedImportTransaction } from "./transactionImport";

export const TRANSACTION_IMPORT_EVIDENCE_PADDING_DAYS = 14;

export interface TransactionImportEvidenceDateRange {
  readonly startDate: string;
  readonly endDate: string;
}

export type TransactionImportEvidenceLoader = (
  accountId: string,
  dateRange?: TransactionImportEvidenceDateRange,
) => Promise<RegisterTransactionView[]>;

function shiftIsoDate(date: string, days: number): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Import transaction date ${date} is not a valid ISO date.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

export function getTransactionImportEvidenceDateRange(
  transactions: readonly ParsedImportTransaction[],
): TransactionImportEvidenceDateRange | null {
  const dates = transactions
    .map((transaction) => transaction.date.trim())
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();

  if (dates.length === 0) {
    return null;
  }

  return {
    startDate: shiftIsoDate(
      dates[0],
      -TRANSACTION_IMPORT_EVIDENCE_PADDING_DAYS,
    ),
    endDate: shiftIsoDate(
      dates[dates.length - 1],
      TRANSACTION_IMPORT_EVIDENCE_PADDING_DAYS,
    ),
  };
}

export async function loadTransactionImportEvidence(
  accountId: string,
  parsedTransactions: readonly ParsedImportTransaction[],
  loadAccountTransactions: TransactionImportEvidenceLoader,
): Promise<RegisterTransactionView[]> {
  const dateRange =
    getTransactionImportEvidenceDateRange(parsedTransactions);

  if (!dateRange) {
    return [];
  }

  return loadAccountTransactions(accountId, dateRange);
}
