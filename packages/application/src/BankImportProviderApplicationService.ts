import type { BankImportInspection, BankImportProvider, BankImportProviderInput, BankImportPreview, CsvBankImportMapping } from "../../types/src/index.js";
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
