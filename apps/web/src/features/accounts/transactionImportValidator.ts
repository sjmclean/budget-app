import type { ParsedImportTransaction } from "./transactionImportParser";
import type {
  TransactionImportCandidate,
  TransactionImportPreview,
} from "./transactionImport";

export interface ImportValidationDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  transactionIndex?: number;
}

export interface QifTransferValidationOptions {
  sourceAccountName?: string;
  availableTransferAccountNames?: string[];
}

/**
 * Validate the canonical transaction shape produced by any import parser.
 * Format-specific parsers should remain deterministic and leave semantic
 * checks to this layer.
 */
export function validateParsedImportTransaction(
  parsed: ParsedImportTransaction,
): string[] {
  return validateParsedImportTransactionDiagnostics(parsed).map(
    (diagnostic) => diagnostic.message,
  );
}

export function validateParsedImportTransactionDiagnostics(
  parsed: ParsedImportTransaction,
): ImportValidationDiagnostic[] {
  const diagnostics: ImportValidationDiagnostic[] = [];

  if (!parsed.date) {
    diagnostics.push({
      severity: "error",
      code: "transaction.date.invalid",
      message: "Missing or invalid date.",
      transactionIndex: parsed.rowNumber,
    });
  }

  if (!parsed.payee) {
    diagnostics.push({
      severity: "error",
      code: "transaction.payee.missing",
      message: "Missing payee/description.",
      transactionIndex: parsed.rowNumber,
    });
  }

  if (parsed.inflow <= 0 && parsed.outflow <= 0) {
    diagnostics.push({
      severity: "error",
      code: "transaction.amount.missing",
      message: "Missing amount.",
      transactionIndex: parsed.rowNumber,
    });
  }

  return diagnostics;
}

/**
 * Validate QIF transfer destinations after matching has produced the review
 * preview. This preserves the existing candidate status and summary contract
 * while moving format-specific semantic validation out of the facade.
 */
export function validateQifTransferDestinations(
  preview: TransactionImportPreview,
  options?: QifTransferValidationOptions,
): TransactionImportPreview {
  if (!options) {
    return preview;
  }

  const sourceAccountName = options.sourceAccountName?.trim().toLocaleLowerCase();
  const availableTransferAccounts = new Set(
    (options.availableTransferAccountNames ?? []).map((name) =>
      name.trim().toLocaleLowerCase(),
    ),
  );

  const candidates = preview.candidates.map((candidate) =>
    validateQifTransferCandidate(
      candidate,
      sourceAccountName,
      availableTransferAccounts,
    ),
  );

  return {
    candidates,
    summary: summariseCandidates(candidates),
  };
}

function validateQifTransferCandidate(
  candidate: TransactionImportCandidate,
  sourceAccountName: string | undefined,
  availableTransferAccounts: Set<string>,
): TransactionImportCandidate {
  const transferAccountName = candidate.parsed.transferAccountName?.trim();
  if (!transferAccountName) {
    return candidate;
  }

  const normalisedTransferAccountName = transferAccountName.toLocaleLowerCase();
  let transferError: string | undefined;

  if (sourceAccountName && normalisedTransferAccountName === sourceAccountName) {
    transferError = `Transfer destination “${transferAccountName}” is the account currently being imported.`;
  } else if (!availableTransferAccounts.has(normalisedTransferAccountName)) {
    transferError = `Transfer destination account “${transferAccountName}” could not be found. Create or rename the account before importing this transaction.`;
  }

  if (!transferError) {
    return candidate;
  }

  return {
    ...candidate,
    status: "invalid",
    selected: false,
    reviewDecision: undefined,
    reason: transferError,
    errors: [...candidate.errors, transferError],
  };
}

function summariseCandidates(
  candidates: TransactionImportCandidate[],
): TransactionImportPreview["summary"] {
  return {
    totalRows: candidates.length,
    newTransactions: candidates.filter((candidate) => candidate.status === "new").length,
    exactMatches: candidates.filter((candidate) => candidate.status === "exact-match").length,
    possibleMatches: candidates.filter((candidate) => candidate.status === "possible-match").length,
    invalidRows: candidates.filter((candidate) => candidate.status === "invalid").length,
    selectedForImport: candidates.filter((candidate) => candidate.selected).length,
  };
}
