import type {
  BankImportIssue,
  BudgetImportInspection,
  BudgetImportProvider,
  BudgetImportProviderInput,
  FullBudgetImportPreview,
} from "../../types/src/index.js";
import { inspectActualBudgetZipPackage } from "./actualBudget/ActualBudgetZipExplorer.js";

/**
 * Registry for full-budget import providers.
 *
 * This is deliberately separate from BankImportProviderApplicationService. Bank
 * imports are account-level transaction imports that enter review, matching and
 * commit. Budget imports are migration/restore workflows that create or replace
 * a whole budget.
 */
export class BudgetImportProviderApplicationService {
  private readonly providers: BudgetImportProvider[];

  constructor() {
    this.providers = [new ActualBudgetImportProvider()];
  }

  listProviders(): BudgetImportProvider[] {
    return [...this.providers];
  }

  detectProvider(input: BudgetImportProviderInput): BudgetImportProvider | null {
    return this.providers.find((provider) => provider.canImport(input)) ?? null;
  }

  inspect(input: BudgetImportProviderInput): BudgetImportInspection {
    const provider = this.detectProvider(input);
    if (!provider) return unknownBudgetInspection();
    return provider.inspect(input);
  }

  fullBudgetPreview(input: BudgetImportProviderInput): FullBudgetImportPreview | null {
    const provider = this.detectProvider(input);
    if (!provider?.fullBudgetPreview) return null;
    return provider.fullBudgetPreview(input);
  }

  async fullBudgetPreviewAsync(input: BudgetImportProviderInput): Promise<FullBudgetImportPreview | null> {
    const provider = this.detectProvider(input);
    if (provider?.fullBudgetPreviewAsync) return provider.fullBudgetPreviewAsync(input);
    if (provider?.fullBudgetPreview) return provider.fullBudgetPreview(input);
    return null;
  }
}

export class ActualBudgetImportProvider implements BudgetImportProvider {
  id = "actual-budget";
  label = "Actual Budget";
  format = "actual-budget" as const;
  scope = "full-budget" as const;

  canImport(input: BudgetImportProviderInput): boolean {
    if (isActualBudgetPackageFile(input.fileName)) return true;
    const parsed = parseJsonObject(input.text);
    if (!parsed) return false;
    return findArray(parsed, ["accounts"]) !== null && findArray(parsed, ["transactions"]) !== null && (findArray(parsed, ["categories"]) !== null || findArray(parsed, ["category_groups", "categoryGroups"]) !== null);
  }

  inspect(input: BudgetImportProviderInput): BudgetImportInspection {
    const parsed = parseJsonObject(input.text);
    if (!parsed) {
      const isPackage = isActualBudgetPackageFile(input.fileName);
      return {
        format: "actual-budget",
        scope: this.scope,
        providerId: this.id,
        providerLabel: this.label,
        confidence: isPackage ? "medium" : "low",
        isRecognized: isPackage,
        canPreviewFullBudget: isPackage,
        canCommitFullBudget: false,
        summary: isPackage
          ? [
              { label: "Actual export package", count: 1, supported: true, note: "ZIP accepted; SQLite inspection is planned next" },
              { label: "SQLite database", count: 1, supported: false, note: "db.sqlite parsing not implemented yet" },
            ]
          : [],
        issues: [
          {
            rowNumber: null,
            severity: isPackage ? "warning" : "error",
            code: isPackage ? "ActualZipPreviewPending" : "InvalidActualJson",
            message: isPackage
              ? "Actual Budget ZIP exports are accepted here. Detailed db.sqlite inspection is planned for the next Actual importer release."
              : "Could not parse the Actual Budget file as JSON.",
          },
        ],
        metadata: { fileName: input.fileName, packageType: isPackage ? "zip" : null },
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
    if (!accounts) issues.push({ rowNumber: null, severity: "error", code: "MissingActualAccounts", message: "Actual Budget data does not contain an accounts collection." });
    if (!transactions) issues.push({ rowNumber: null, severity: "error", code: "MissingActualTransactions", message: "Actual Budget data does not contain a transactions collection." });
    if (rules?.length) issues.push({ rowNumber: null, severity: "warning", code: "ActualRulesPreviewOnly", message: "Actual Budget rules are detected but are not imported yet." });
    if (schedules?.length) issues.push({ rowNumber: null, severity: "warning", code: "ActualSchedulesPreviewOnly", message: "Actual Budget schedules are detected but are not imported yet." });
    if (attachments?.length) issues.push({ rowNumber: null, severity: "warning", code: "ActualAttachmentsPreviewOnly", message: "Actual Budget attachments/files are detected but are not imported yet." });

    return {
      format: "actual-budget",
      scope: this.scope,
      providerId: this.id,
      providerLabel: this.label,
      confidence: accounts && transactions ? "high" : "medium",
      isRecognized: true,
      canPreviewFullBudget: true,
      canCommitFullBudget: false,
      summary: [
        { label: "Accounts", count: accounts?.length ?? 0, supported: true, note: "Full-budget preview only" },
        { label: "Transactions", count: transactions?.length ?? 0, supported: true, note: "Full-budget preview only" },
        { label: "Payees", count: payees?.length ?? 0, supported: true, note: "Full-budget preview only" },
        { label: "Category groups", count: categoryGroups?.length ?? 0, supported: true, note: "Full-budget preview only" },
        { label: "Categories", count: categories?.length ?? 0, supported: true, note: "Full-budget preview only" },
        { label: "Rules", count: rules?.length ?? 0, supported: false, note: "Not imported yet" },
        { label: "Schedules", count: schedules?.length ?? 0, supported: false, note: "Not imported yet" },
        { label: "Notes", count: notes?.length ?? 0, supported: false, note: "Not imported yet" },
        { label: "Attachments/files", count: attachments?.length ?? 0, supported: false, note: "Not imported yet" },
      ],
      issues,
      metadata: extractActualMetadata(parsed, input.fileName),
    };
  }

  async fullBudgetPreviewAsync(input: BudgetImportProviderInput): Promise<FullBudgetImportPreview> {
    if (isActualBudgetPackageFile(input.fileName)) return inspectActualBudgetZipPackage(input);
    return this.fullBudgetPreview(input);
  }

  fullBudgetPreview(input: BudgetImportProviderInput): FullBudgetImportPreview {
    const inspection = this.inspect(input);
    const parsed = parseJsonObject(input.text);
    const preview = parsed ? buildActualFullBudgetPreview(parsed) : emptyActualFullBudgetPreview();
    return {
      format: "actual-budget",
      providerId: this.id,
      providerLabel: this.label,
      sourceBudgetName: typeof inspection.metadata.budgetName === "string" ? inspection.metadata.budgetName : typeof inspection.metadata.name === "string" ? inspection.metadata.name : null,
      entityCounts: inspection.summary,
      issues: [...inspection.issues, ...preview.issues],
      metadata: inspection.metadata,
      accounts: preview.accounts,
      categoryGroups: preview.categoryGroups,
      categories: preview.categories,
      payees: preview.payees,
      transactions: preview.transactions,
      transferCount: preview.transferCount,
      canCommit: true,
    };
  }
}

interface ActualFullBudgetPreviewDetails {
  accounts: FullBudgetImportPreview["accounts"];
  categoryGroups: FullBudgetImportPreview["categoryGroups"];
  categories: FullBudgetImportPreview["categories"];
  payees: FullBudgetImportPreview["payees"];
  transactions: FullBudgetImportPreview["transactions"];
  transferCount: number;
  issues: BankImportIssue[];
}

function emptyActualFullBudgetPreview(): ActualFullBudgetPreviewDetails {
  return { accounts: [], categoryGroups: [], categories: [], payees: [], transactions: [], transferCount: 0, issues: [] };
}

function buildActualFullBudgetPreview(source: Record<string, unknown>): ActualFullBudgetPreviewDetails {
  const issues: BankImportIssue[] = [];
  const rawAccounts = findArray(source, ["accounts"]) ?? [];
  const rawCategoryGroups = findArray(source, ["category_groups", "categoryGroups"]) ?? [];
  const rawCategories = findArray(source, ["categories"]) ?? [];
  const rawPayees = findArray(source, ["payees"]) ?? [];
  const rawTransactions = findArray(source, ["transactions"]) ?? [];

  const accounts = rawAccounts.filter(isRecord).map((account, index) => {
    const id = readEntityId(account, `actual-account-${index + 1}`);
    return { id, name: readString(account, ["name"], id), type: readOptionalString(account, ["type", "accountType"]), closed: readBoolean(account, ["closed", "is_closed", "isClosed"]), offBudget: readBoolean(account, ["offbudget", "offBudget", "off_budget"]) };
  });
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const categoryGroups = rawCategoryGroups.filter(isRecord).map((group, index) => {
    const id = readEntityId(group, `actual-group-${index + 1}`);
    return { id, name: readString(group, ["name"], id), hidden: readBoolean(group, ["hidden", "is_hidden", "isHidden"]) };
  });
  const groupById = new Map(categoryGroups.map((group) => [group.id, group]));

  const categories = rawCategories.filter(isRecord).map((category, index) => {
    const id = readEntityId(category, `actual-category-${index + 1}`);
    const groupId = readOptionalString(category, ["group", "groupId", "cat_group", "categoryGroupId"]);
    return { id, name: readString(category, ["name"], id), groupId, groupName: groupId ? groupById.get(groupId)?.name ?? null : null, hidden: readBoolean(category, ["hidden", "is_hidden", "isHidden"]) };
  });
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const payees = rawPayees.filter(isRecord).map((payee, index) => {
    const id = readEntityId(payee, `actual-payee-${index + 1}`);
    return { id, name: readString(payee, ["name"], id) };
  });
  const payeeById = new Map(payees.map((payee) => [payee.id, payee]));

  const transactions = rawTransactions.filter(isRecord).map((transaction, index) => {
    const id = readEntityId(transaction, `actual-transaction-${index + 1}`);
    const accountId = readOptionalString(transaction, ["account", "accountId", "acct"]);
    const categoryId = readOptionalString(transaction, ["category", "categoryId", "cat"]);
    const payeeId = readOptionalString(transaction, ["payee", "payeeId"]);
    const transferId = readOptionalString(transaction, ["transfer_id", "transferId", "transfer"]);
    const importedPayee = readOptionalString(transaction, ["imported_payee", "importedPayee"]);
    const memo = readOptionalString(transaction, ["notes", "note", "memo"]);
    const date = readOptionalString(transaction, ["date"]);
    const amount = readOptionalNumber(transaction, ["amount"]);
    const cleared = readOptionalBoolean(transaction, ["cleared", "is_cleared", "isCleared"]);
    return {
      id,
      accountId,
      accountName: accountId ? accountById.get(accountId)?.name ?? null : null,
      date,
      amount,
      payeeId,
      payeeName: payeeId ? payeeById.get(payeeId)?.name ?? importedPayee : importedPayee,
      categoryId,
      categoryName: categoryId ? categoryById.get(categoryId)?.name ?? null : null,
      memo,
      cleared,
      transferId,
      isTransfer: Boolean(transferId) || Boolean(payeeId && payeeById.get(payeeId)?.name.toLowerCase().startsWith("transfer")),
    };
  });

  for (const transaction of transactions) {
    if (transaction.accountId && !accountById.has(transaction.accountId)) issues.push({ rowNumber: null, severity: "warning", code: "ActualUnknownAccountReference", message: `Actual transaction ${transaction.id} references unknown account ${transaction.accountId}.` });
    if (transaction.categoryId && !categoryById.has(transaction.categoryId)) issues.push({ rowNumber: null, severity: "warning", code: "ActualUnknownCategoryReference", message: `Actual transaction ${transaction.id} references unknown category ${transaction.categoryId}.` });
    if (transaction.payeeId && !payeeById.has(transaction.payeeId)) issues.push({ rowNumber: null, severity: "warning", code: "ActualUnknownPayeeReference", message: `Actual transaction ${transaction.id} references unknown payee ${transaction.payeeId}.` });
    if (!transaction.date) issues.push({ rowNumber: null, severity: "warning", code: "ActualMissingTransactionDate", message: `Actual transaction ${transaction.id} does not have a date.` });
    if (transaction.amount === null) issues.push({ rowNumber: null, severity: "warning", code: "ActualMissingTransactionAmount", message: `Actual transaction ${transaction.id} does not have a numeric amount.` });
  }

  return { accounts, categoryGroups, categories, payees, transactions, transferCount: transactions.filter((transaction) => transaction.isTransfer).length, issues };
}

function unknownBudgetInspection(): BudgetImportInspection {
  return {
    format: "unknown",
    scope: "unknown",
    providerId: null,
    providerLabel: null,
    confidence: "none",
    isRecognized: false,
    canPreviewFullBudget: false,
    canCommitFullBudget: false,
    summary: [],
    issues: [{ rowNumber: null, severity: "error", code: "UnknownBudgetImportFormat", message: "No budget import provider recognized this file." }],
    metadata: {},
  };
}

function hasExtension(fileName: string | null, extension: string): boolean {
  return (fileName ?? "").toLowerCase().endsWith(extension.toLowerCase());
}

function isActualBudgetPackageFile(fileName: string | null): boolean {
  return [".actual", ".actualbudget", ".zip"].some((extension) => hasExtension(fileName, extension));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readEntityId(source: Record<string, unknown>, fallback: string): string {
  return readString(source, ["id", "uuid"], fallback);
}

function readString(source: Record<string, unknown>, names: string[], fallback: string): string {
  return readOptionalString(source, names) ?? fallback;
}

function readOptionalString(source: Record<string, unknown>, names: string[]): string | null {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readOptionalNumber(source: Record<string, unknown>, names: string[]): number | null {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function readBoolean(source: Record<string, unknown>, names: string[]): boolean {
  return readOptionalBoolean(source, names) ?? false;
}

function readOptionalBoolean(source: Record<string, unknown>, names: string[]): boolean | null {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "1", "cleared"].includes(normalized)) return true;
      if (["false", "no", "0", "uncleared"].includes(normalized)) return false;
    }
  }
  return null;
}
