import { createBudgetScopedStorage } from "../budget/budgetDataScope";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage";
import type {
  CsvImportAnalysis,
  CsvImportColumnMapping,
  QifAmountFormat,
  QifDateFormat,
  QifImportDetection,
  TransactionImportCandidate,
  TransactionImportPreview,
} from "./transactionImport";
import type { OfxImportInspection } from "./transactionImportInspection";
import type { RegisterTransactionView } from "./accountRegisterTypes";

const IMPORT_SESSION_STORAGE_KEY = "budget-app.transaction-import-session.v1";

export type PersistedImportFileType = "csv" | "qif" | "ofx" | "qfx";
export type PersistedImportAction = "imported" | "matched" | "skipped";

export interface PersistedProcessedImportCandidate {
  candidate: TransactionImportCandidate;
  action: PersistedImportAction;
  processedAt: number;
}

export interface TransactionImportSessionSnapshot {
  version: 1;
  accountId: string;
  savedAt: string;
  fileName: string | null;
  fileType: PersistedImportFileType;
  fileHash: string | null;
  csvText: string | null;
  qifText: string | null;
  ofxText: string | null;
  ofxInspection: OfxImportInspection | null;
  qifDetection: QifImportDetection | null;
  qifDateFormat: QifDateFormat;
  qifAmountFormat: QifAmountFormat;
  analysis: CsvImportAnalysis | null;
  mapping: CsvImportColumnMapping;
  preview: TransactionImportPreview;
  candidates: TransactionImportCandidate[];
  bankCandidateDetails: Record<string, TransactionImportCandidate["parsed"]>;
  processedCandidates: PersistedProcessedImportCandidate[];
  matchEditorOrigins: Record<string, TransactionImportCandidate>;
  matchedTransactionOrigins: Record<string, RegisterTransactionView>;
  previouslyImportedCount: number;
  alreadyRepresentedCount: number;
  excludeMemos: boolean;
  updateMatchedTransactionDates: boolean;
}

function getStorage() {
  return createBudgetScopedStorage(getActiveKeyValueStorage());
}

function getSessionKey(accountId: string) {
  return `${IMPORT_SESSION_STORAGE_KEY}.${accountId}`;
}

export function readTransactionImportSession(
  accountId: string,
): TransactionImportSessionSnapshot | null {
  try {
    const raw = getStorage().getItem(getSessionKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TransactionImportSessionSnapshot;
    if (
      parsed?.version !== 1 ||
      parsed.accountId !== accountId ||
      !parsed.preview ||
      !Array.isArray(parsed.candidates) ||
      !Array.isArray(parsed.processedCandidates)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeTransactionImportSession(
  session: TransactionImportSessionSnapshot,
): boolean {
  try {
    getStorage().setItem(getSessionKey(session.accountId), JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function deleteTransactionImportSession(accountId: string): void {
  try {
    getStorage().removeItem(getSessionKey(accountId));
  } catch {
    // Import remains usable when storage is unavailable.
  }
}
