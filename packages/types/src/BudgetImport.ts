import type { BankImportIssue, BankImportProviderInput, FullBudgetImportPreview } from "./BankImport.js";

export type BudgetImportFormat = "actual-budget";
export type BudgetImportProviderScope = "full-budget";

export type BudgetImportProviderInput = BankImportProviderInput;

export interface BudgetImportInspectionItem {
  label: string;
  count: number;
  supported: boolean;
  note?: string;
}

export interface BudgetImportInspection {
  format: BudgetImportFormat | "unknown";
  scope: BudgetImportProviderScope | "unknown";
  providerId: string | null;
  providerLabel: string | null;
  confidence: "high" | "medium" | "low" | "none";
  isRecognized: boolean;
  canPreviewFullBudget: boolean;
  canCommitFullBudget: boolean;
  summary: BudgetImportInspectionItem[];
  issues: BankImportIssue[];
  metadata: Record<string, string | number | boolean | null>;
}

export interface BudgetImportProvider {
  id: string;
  label: string;
  format: BudgetImportFormat;
  scope: BudgetImportProviderScope;
  canImport(input: BudgetImportProviderInput): boolean;
  inspect(input: BudgetImportProviderInput): BudgetImportInspection;
  fullBudgetPreview?(input: BudgetImportProviderInput): FullBudgetImportPreview;
  fullBudgetPreviewAsync?(input: BudgetImportProviderInput): Promise<FullBudgetImportPreview>;
}
