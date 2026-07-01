import type { BankImportInspection, BankImportIssue, BankImportProvider, BankImportProviderInput, BankImportPreview, CsvBankImportMapping, FullBudgetImportPreview } from "../../types/src/index.js";
import { BankImportApplicationService } from "./BankImportApplicationService.js";

const DEFAULT_CSV_MAPPING: CsvBankImportMapping = {
  date: "Date",
  payee: "Description",
  amount: "Amount",
  debit: "Debit",
  credit: "Credit",
  memo: "Memo",
  externalId: "Transaction Id",
  category: "Category",
  hasHeader: true,
  dateFormat: "yyyy-mm-dd",
};

/**
 * Central registry for file-based import providers.
 *
 * v2.43.0 deliberately keeps commit behaviour out of this layer. Providers only
 * identify and inspect files, and optionally produce the existing normalized
 * BankImportPreview shape. Matching, review and commit remain downstream.
 */
export class BankImportProviderApplicationService {
  private readonly providers: BankImportProvider[];

  constructor(private readonly bankImport = new BankImportApplicationService()) {
    this.providers = [
      new ActualBudgetImportProvider(),
      new CsvImportProvider(this.bankImport),
      new QifImportProvider(this.bankImport),
      new OfxImportProvider(this.bankImport, "ofx"),
      new OfxImportProvider(this.bankImport, "qfx"),
    ];
  }

  listProviders(): BankImportProvider[] {
    return [...this.providers];
  }

  detectProvider(input: BankImportProviderInput): BankImportProvider | null {
    return this.providers.find((provider) => provider.canImport(input)) ?? null;
  }

  inspect(input: BankImportProviderInput): BankImportInspection {
    const provider = this.detectProvider(input);
    if (!provider) return unknownInspection();
    return provider.inspect(input);
  }

  preview(input: BankImportProviderInput): BankImportPreview | null {
    const provider = this.detectProvider(input);
    if (!provider?.preview) return null;
    return provider.preview(input);
  }

  fullBudgetPreview(input: BankImportProviderInput): FullBudgetImportPreview | null {
    const provider = this.detectProvider(input);
    if (!provider?.fullBudgetPreview) return null;
    return provider.fullBudgetPreview(input);
  }
}

class CsvImportProvider implements BankImportProvider {
  id = "csv";
  label = "CSV";
  format = "csv" as const;
  scope = "account-transactions" as const;

  constructor(private readonly service: BankImportApplicationService) {}

  canImport(input: BankImportProviderInput): boolean {
    return hasExtension(input.fileName, ".csv") || looksLikeCsv(input.text);
  }

  inspect(input: BankImportProviderInput): BankImportInspection {
    const preview = this.preview(input);
    return {
      format: "csv",
      scope: this.scope,
      providerId: this.id,
      providerLabel: this.label,
      confidence: hasExtension(input.fileName, ".csv") ? "high" : "medium",
      isRecognized: true,
      canPreviewTransactions: true,
      canCommitTransactions: true,
      canPreviewFullBudget: false,
      canCommitFullBudget: false,
      summary: [{ label: "Transactions", count: preview.transactions.length, supported: true }],
      issues: preview.issues,
      metadata: { fileName: input.fileName },
    };
  }

  preview(input: BankImportProviderInput): BankImportPreview {
    return this.service.previewCsv(input.text, DEFAULT_CSV_MAPPING);
  }
}

class QifImportProvider implements BankImportProvider {
  id = "qif";
  label = "QIF";
  format = "qif" as const;
  scope = "account-transactions" as const;

  constructor(private readonly service: BankImportApplicationService) {}

  canImport(input: BankImportProviderInput): boolean {
    return hasExtension(input.fileName, ".qif") || /^!Type:/im.test(input.text);
  }

  inspect(input: BankImportProviderInput): BankImportInspection {
    const preview = this.preview(input);
    return {
      format: "qif",
      scope: this.scope,
      providerId: this.id,
      providerLabel: this.label,
      confidence: hasExtension(input.fileName, ".qif") ? "high" : "medium",
      isRecognized: true,
      canPreviewTransactions: true,
      canCommitTransactions: true,
      canPreviewFullBudget: false,
      canCommitFullBudget: false,
      summary: [{ label: "Transactions", count: preview.transactions.length, supported: true }],
      issues: preview.issues,
      metadata: { fileName: input.fileName },
    };
  }

  preview(input: BankImportProviderInput): BankImportPreview {
    return this.service.previewQif(input.text);
  }
}

class OfxImportProvider implements BankImportProvider {
  id: "ofx" | "qfx";
  label: "OFX" | "QFX";
  format: "ofx" | "qfx";
  scope = "account-transactions" as const;

  constructor(private readonly service: BankImportApplicationService, format: "ofx" | "qfx") {
    this.id = format;
    this.format = format;
    this.label = format.toUpperCase() as "OFX" | "QFX";
  }

  canImport(input: BankImportProviderInput): boolean {
    return hasExtension(input.fileName, `.${this.format}`) || (this.format === "ofx" && /<OFX[>\s]/i.test(input.text));
  }

  inspect(input: BankImportProviderInput): BankImportInspection {
    const preview = this.preview(input);
    return {
      format: this.format,
      scope: this.scope,
      providerId: this.id,
      providerLabel: this.label,
      confidence: hasExtension(input.fileName, `.${this.format}`) ? "high" : "medium",
      isRecognized: true,
      canPreviewTransactions: true,
      canCommitTransactions: true,
      canPreviewFullBudget: false,
      canCommitFullBudget: false,
      summary: [{ label: "Transactions", count: preview.transactions.length, supported: true }],
      issues: preview.issues,
      metadata: { fileName: input.fileName },
    };
  }

  preview(input: BankImportProviderInput): BankImportPreview {
    return this.service.previewOfx(input.text, this.format);
  }
}

export class ActualBudgetImportProvider implements BankImportProvider {
  id = "actual-budget";
  label = "Actual Budget";
  format = "actual-budget" as const;
  scope = "full-budget" as const;

  canImport(input: BankImportProviderInput): boolean {
    if (hasExtension(input.fileName, ".actual") || hasExtension(input.fileName, ".actualbudget")) return true;
    const parsed = parseJsonObject(input.text);
    if (!parsed) return false;
    return findArray(parsed, ["accounts"]) !== null && findArray(parsed, ["transactions"]) !== null && (findArray(parsed, ["categories"]) !== null || findArray(parsed, ["category_groups", "categoryGroups"]) !== null);
  }

  inspect(input: BankImportProviderInput): BankImportInspection {
    const parsed = parseJsonObject(input.text);
    if (!parsed) {
      return {
        format: "actual-budget",
        scope: this.scope,
        providerId: this.id,
        providerLabel: this.label,
        confidence: "low",
        isRecognized: hasExtension(input.fileName, ".actual") || hasExtension(input.fileName, ".actualbudget"),
        canPreviewTransactions: false,
        canCommitTransactions: false,
        canPreviewFullBudget: true,
        canCommitFullBudget: false,
        summary: [],
        issues: [{ rowNumber: null, severity: "error", code: "InvalidActualJson", message: "Could not parse the Actual Budget file as JSON." }],
        metadata: { fileName: input.fileName },
      };
    }

    const accounts = findArray(parsed, ["accounts"]);
    const transactions = findArray(parsed, ["transactions"]);
    const payees = findArray(parsed, ["payees"]);
    const categories = findArray(parsed, ["categories"]);
    const categoryGroups = findArray(parsed, ["category_groups", "categoryGroups"]);
    const rules = findArray(parsed, ["rules", "payee_rules", "payeeRules"]);
    const schedules = findArray(parsed, ["schedules", "scheduled_transactions", "scheduledTransactions"]);
    const notes = findArray(parsed, ["notes"]);
    const attachments = findArray(parsed, ["attachments", "files"]);

    const issues: BankImportIssue[] = [];
    if (!accounts) issues.push({ rowNumber: null, severity: "error" as const, code: "MissingActualAccounts", message: "Actual Budget data does not contain an accounts collection." });
    if (!transactions) issues.push({ rowNumber: null, severity: "error" as const, code: "MissingActualTransactions", message: "Actual Budget data does not contain a transactions collection." });
    if (rules?.length) issues.push({ rowNumber: null, severity: "warning" as const, code: "ActualRulesPreviewOnly", message: "Actual Budget rules are detected but are not imported in v2.43.0." });
    if (schedules?.length) issues.push({ rowNumber: null, severity: "warning" as const, code: "ActualSchedulesPreviewOnly", message: "Actual Budget schedules are detected but are not imported in v2.43.0." });
    if (attachments?.length) issues.push({ rowNumber: null, severity: "warning" as const, code: "ActualAttachmentsPreviewOnly", message: "Actual Budget attachments/files are detected but are not imported in v2.43.0." });

    return {
      format: "actual-budget",
      scope: this.scope,
      providerId: this.id,
      providerLabel: this.label,
      confidence: accounts && transactions ? "high" : "medium",
      isRecognized: true,
      canPreviewTransactions: false,
      canCommitTransactions: false,
      canPreviewFullBudget: true,
      canCommitFullBudget: false,
      summary: [
        { label: "Accounts", count: accounts?.length ?? 0, supported: true, note: "Inspection only in v2.43.0" },
        { label: "Transactions", count: transactions?.length ?? 0, supported: true, note: "Full-budget transaction mapping is planned next" },
        { label: "Payees", count: payees?.length ?? 0, supported: true, note: "Inspection only in v2.43.0" },
        { label: "Category groups", count: categoryGroups?.length ?? 0, supported: true, note: "Inspection only in v2.43.0" },
        { label: "Categories", count: categories?.length ?? 0, supported: true, note: "Inspection only in v2.43.0" },
        { label: "Rules", count: rules?.length ?? 0, supported: false, note: "Not imported yet" },
        { label: "Schedules", count: schedules?.length ?? 0, supported: false, note: "Not imported yet" },
        { label: "Notes", count: notes?.length ?? 0, supported: false, note: "Not imported yet" },
        { label: "Attachments/files", count: attachments?.length ?? 0, supported: false, note: "Not imported yet" },
      ],
      issues,
      metadata: extractActualMetadata(parsed, input.fileName),
    };
  }

  fullBudgetPreview(input: BankImportProviderInput): FullBudgetImportPreview {
    const inspection = this.inspect(input);
    return {
      format: "actual-budget",
      providerId: this.id,
      providerLabel: this.label,
      sourceBudgetName: typeof inspection.metadata.budgetName === "string" ? inspection.metadata.budgetName : typeof inspection.metadata.name === "string" ? inspection.metadata.name : null,
      entityCounts: inspection.summary,
      issues: inspection.issues,
      metadata: inspection.metadata,
      canCommit: false,
    };
  }
}

function unknownInspection(): BankImportInspection {
  return {
    format: "unknown",
    scope: "unknown",
    providerId: null,
    providerLabel: null,
    confidence: "none",
    isRecognized: false,
    canPreviewTransactions: false,
    canCommitTransactions: false,
    canPreviewFullBudget: false,
    canCommitFullBudget: false,
    summary: [],
    issues: [{ rowNumber: null, severity: "error", code: "UnknownImportFormat", message: "No import provider recognized this file." }],
    metadata: {},
  };
}

function hasExtension(fileName: string | null, extension: string): boolean {
  return (fileName ?? "").toLowerCase().endsWith(extension.toLowerCase());
}

function looksLikeCsv(text: string): boolean {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes(",") && /date|description|payee|amount|debit|credit/i.test(firstLine);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function findArray(source: Record<string, unknown>, names: string[]): unknown[] | null {
  const queue: Record<string, unknown>[] = [source];
  const seen = new Set<Record<string, unknown>>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const name of names) {
      const value = current[name];
      if (Array.isArray(value)) return value;
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object" && !Array.isArray(value)) queue.push(value as Record<string, unknown>);
    }
  }
  return null;
}

function extractActualMetadata(source: Record<string, unknown>, fileName: string | null): Record<string, string | number | boolean | null> {
  const metadata: Record<string, string | number | boolean | null> = { fileName };
  for (const key of ["version", "budgetName", "name", "id", "createdAt", "updatedAt"] as const) {
    const value = findPrimitive(source, key);
    if (value !== undefined) metadata[key] = value;
  }
  return metadata;
}

function findPrimitive(source: Record<string, unknown>, key: string): string | number | boolean | null | undefined {
  const queue: Record<string, unknown>[] = [source];
  const seen = new Set<Record<string, unknown>>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const value = current[key];
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    for (const nested of Object.values(current)) {
      if (nested && typeof nested === "object" && !Array.isArray(nested)) queue.push(nested as Record<string, unknown>);
    }
  }
  return undefined;
}
