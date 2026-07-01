/**
 * Supported external bank/import formats.
 *
 * YNAB4 import remains the main migration path. These formats are for ongoing
 * bank statement imports after the user is already using the application.
 */
export type BankImportFormat = "csv" | "qif" | "ofx" | "qfx" | "actual-budget";


export interface BankImportProviderInput {
  fileName: string | null;
  text: string;
}

export interface BankImportInspectionItem {
  label: string;
  count: number;
  supported: boolean;
  note?: string;
}

export interface BankImportInspection {
  format: BankImportFormat | "unknown";
  providerId: string | null;
  providerLabel: string | null;
  confidence: "high" | "medium" | "low" | "none";
  isRecognized: boolean;
  canPreviewTransactions: boolean;
  canCommitTransactions: boolean;
  summary: BankImportInspectionItem[];
  issues: BankImportIssue[];
  metadata: Record<string, string | number | boolean | null>;
}

export interface BankImportProvider {
  id: string;
  label: string;
  format: BankImportFormat;
  canImport(input: BankImportProviderInput): boolean;
  inspect(input: BankImportProviderInput): BankImportInspection;
  preview?(input: BankImportProviderInput): BankImportPreview;
}

/** A raw transaction row as provided by a bank file after format parsing. */
export interface ImportedBankTransaction {
  /** Stable import-side identifier when the file contains one, e.g. OFX FITID. */
  externalId: string | null;
  /** ISO date string, YYYY-MM-DD. */
  date: string;
  /** Original payee/merchant text from the bank. This is intentionally unmodified. */
  rawPayee: string;
  /** Optional memo/narration/reference supplied by the bank. */
  memo: string | null;
  /** Minor-unit amount. For AUD, $12.34 is 1234. Outflows are negative. */
  amount: number;
  /** Optional category name/label supplied by formats such as QIF. */
  importedCategoryName: string | null;
}

/** Non-fatal import issue. Imports should prefer reports over silent loss. */
export interface BankImportIssue {
  rowNumber: number | null;
  severity: "warning" | "error";
  code: string;
  message: string;
}

export interface BankImportPreview {
  format: BankImportFormat;
  transactions: ImportedBankTransaction[];
  issues: BankImportIssue[];
}

/** Mapping used by the configurable CSV parser. */
export interface CsvBankImportMapping {
  date: string;
  payee: string;
  amount?: string;
  debit?: string;
  credit?: string;
  memo?: string;
  externalId?: string;
  category?: string;
  hasHeader?: boolean;
  dateFormat?: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy";
}

export interface ExistingTransactionForMatch {
  id: string;
  date: string;
  amount: number;
  payeeName: string | null;
  memo: string | null;
  externalId?: string | null;
}

export interface TransactionMatchCandidate {
  imported: ImportedBankTransaction;
  existingTransactionId: string;
  score: number;
  reasons: string[];
}

export interface PayeeRule {
  id: string;
  budgetId: string;
  name: string;
  /** Case-insensitive substring or regular expression pattern matched against raw payee/memo text. */
  pattern: string;
  matchMode: "contains" | "regex";
  payeeName: string;
  categoryId: string | null;
  memo: string | null;
  priority: number;
  isEnabled: boolean;
}

export interface AutoCategorizationSuggestion {
  imported: ImportedBankTransaction;
  ruleId: string | null;
  suggestedPayeeName: string | null;
  suggestedCategoryId: string | null;
  suggestedMemo: string | null;
  confidence: number;
  reason: string;
}


/** Persisted import batch used to commit and undo ongoing bank statement imports. */
export interface BankImportBatch {
  id: string;
  budgetId: string;
  accountId: string;
  userId: string;
  source: BankImportFormat;
  sourceFileName: string | null;
  status: "previewed" | "committed" | "undone" | "failed";
  transactionCount: number;
  createdAt: Date;
  committedAt: Date | null;
  undoneAt: Date | null;
}

/** Options supplied when the user approves a bank import preview. */
export interface BankImportCommitOptions {
  budgetId: string;
  accountId: string;
  userId: string;
  source: BankImportFormat;
  sourceFileName?: string | null;
  importedRows: ImportedBankTransaction[];
  /** Optional category/payee suggestions generated before commit. */
  suggestions?: AutoCategorizationSuggestion[];
}

export interface BankImportCommitResult {
  batch: BankImportBatch;
  createdTransactionIds: string[];
}

export interface PayeeRuleConflict {
  ruleId: string;
  conflictingRuleId: string;
  reason: string;
}
