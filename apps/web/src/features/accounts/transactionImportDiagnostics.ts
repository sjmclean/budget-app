import { createBudgetScopedStorage } from "../budget/budgetDataScope";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage";
import type { ImportCommitAuditRecord } from "./importCommitEngine";
import type { TransactionImportCandidate } from "./transactionImport";

const STORAGE_KEY = "budget-app.transaction-import-diagnostics.v1";
const MAX_SESSIONS = 50;

export type ImportDiagnosticCandidateOutcome =
  | "imported"
  | "matched"
  | "skipped"
  | "invalid"
  | "pending";

export interface ImportDiagnosticCandidateRecord {
  id: string;
  rowNumber: number;
  sourcePayee: string;
  sourceDate: string;
  amount: number;
  status: TransactionImportCandidate["status"];
  outcome: ImportDiagnosticCandidateOutcome;
  proposal: TransactionImportCandidate["lifecycle"]["proposal"];
  matchedTransactionId: string | null;
  validationErrors: readonly string[];
  trace: NonNullable<TransactionImportCandidate["trace"]>;
}

export interface ImportDiagnosticSessionRecord {
  version: 1;
  id: string;
  capturedAt: string;
  budgetId: string;
  accountId: string;
  accountName: string;
  fileName: string | null;
  fileType: string;
  status: "completed" | "failed";
  audit: ImportCommitAuditRecord | null;
  candidates: ImportDiagnosticCandidateRecord[];
}

function storage() {
  return createBudgetScopedStorage(getActiveKeyValueStorage());
}

function readAll(): ImportDiagnosticSessionRecord[] {
  try {
    const raw = storage().getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ImportDiagnosticSessionRecord =>
        Boolean(entry) &&
        typeof entry === "object" &&
        (entry as ImportDiagnosticSessionRecord).version === 1 &&
        Array.isArray((entry as ImportDiagnosticSessionRecord).candidates),
    );
  } catch {
    return [];
  }
}

function writeAll(records: readonly ImportDiagnosticSessionRecord[]): void {
  storage().setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_SESSIONS)));
}

function candidateAmount(candidate: TransactionImportCandidate): number {
  return candidate.parsed.inflow > 0 ? candidate.parsed.inflow : -candidate.parsed.outflow;
}

export function createImportDiagnosticSessionRecord(input: {
  accountId: string;
  accountName: string;
  fileName: string | null;
  fileType: string;
  status: "completed" | "failed";
  audit?: ImportCommitAuditRecord | null;
  candidates: readonly {
    candidate: TransactionImportCandidate;
    outcome: ImportDiagnosticCandidateOutcome;
  }[];
}): ImportDiagnosticSessionRecord {
  const capturedAt = new Date().toISOString();
  const audit = input.audit ?? null;
  return {
    version: 1,
    id: audit?.sessionId ?? `import-diagnostic-${capturedAt}-${Math.random().toString(36).slice(2, 9)}`,
    capturedAt,
    budgetId: audit?.budgetId ?? "active-budget",
    accountId: input.accountId,
    accountName: input.accountName,
    fileName: input.fileName,
    fileType: input.fileType,
    status: input.status,
    audit,
    candidates: input.candidates.map(({ candidate, outcome }) => ({
      id: candidate.id,
      rowNumber: candidate.parsed.rowNumber,
      sourcePayee: candidate.lifecycle.source.rawPayee,
      sourceDate: candidate.parsed.date,
      amount: candidateAmount(candidate),
      status: candidate.status,
      outcome,
      proposal: candidate.lifecycle.proposal,
      matchedTransactionId: candidate.matchedTransaction?.id ?? null,
      validationErrors: candidate.errors,
      trace: candidate.trace ?? [],
    })),
  };
}

export function recordImportDiagnosticSession(record: ImportDiagnosticSessionRecord): void {
  try {
    writeAll([record, ...readAll().filter((entry) => entry.id !== record.id)]);
  } catch {
    // Diagnostics must never interfere with importing.
  }
}

export function listImportDiagnosticSessions(): ImportDiagnosticSessionRecord[] {
  return readAll();
}

export function deleteImportDiagnosticSession(id: string): void {
  try {
    writeAll(readAll().filter((entry) => entry.id !== id));
  } catch {
    // Developer tooling remains optional.
  }
}

export function clearImportDiagnosticSessions(): void {
  try {
    storage().removeItem(STORAGE_KEY);
  } catch {
    // Developer tooling remains optional.
  }
}

export function serialiseImportDiagnosticSession(record: ImportDiagnosticSessionRecord): string {
  return JSON.stringify(record, null, 2);
}
