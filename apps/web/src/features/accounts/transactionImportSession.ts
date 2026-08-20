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
import {
  readTransactionImportSessionEntity,
  tombstoneTransactionImportSessionEntity,
  writeTransactionImportSessionEntity,
} from "./entities/importSessionEntity";
import type {
  TransactionImportSourceIdentity,
} from "./transactionImportKnowledge";

export type PersistedImportFileType = "csv" | "qif" | "ofx" | "qfx";
export type PersistedImportAction = "imported" | "matched" | "skipped";

export interface PersistedProcessedImportCandidate {
  candidate: TransactionImportCandidate;
  action: PersistedImportAction;
  processedAt: number;
}

export interface TransactionImportSessionSnapshot {
  version: 2;
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
  sourceIdentities: Record<string, TransactionImportSourceIdentity>;
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


export function readTransactionImportSession(
  accountId: string,
): TransactionImportSessionSnapshot | null {
  try {
    return readTransactionImportSessionEntity(getStorage(), accountId);
  } catch {
    return null;
  }
}

export function writeTransactionImportSession(
  session: TransactionImportSessionSnapshot,
): boolean {
  try {
    writeTransactionImportSessionEntity(getStorage(), session);
    return true;
  } catch {
    return false;
  }
}

export function deleteTransactionImportSession(accountId: string): void {
  try {
    tombstoneTransactionImportSessionEntity(getStorage(), accountId);
  } catch {
    // Import remains usable when storage is unavailable.
  }
}
