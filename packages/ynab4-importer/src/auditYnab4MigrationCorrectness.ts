import { discoverYnab4Package, type Ynab4PackageEntry } from "./analyzeYnab4Package.js";

export type Ynab4MigrationCorrectnessSeverity = "info" | "warning" | "blocker";
export type Ynab4MigrationCorrectnessArea =
  | "package"
  | "accounts"
  | "budgets"
  | "categories"
  | "credit-cards"
  | "transfers";

export type Ynab4MigrationCorrectnessFinding = {
  id: string;
  area: Ynab4MigrationCorrectnessArea;
  severity: Ynab4MigrationCorrectnessSeverity;
  message: string;
  sourceEntityId?: string;
  details?: Record<string, unknown>;
};

export type Ynab4MigrationCorrectnessAudit = {
  title: "YNAB4 Migration Correctness Audit";
  canProceedToWriteImport: boolean;
  summary: {
    accounts: number;
    transactions: number;
    scheduledTransactions: number;
    categoryGroups: number;
    categories: number;
    monthlyBudgets: number;
    monthlyCategoryBudgets: number;
    creditCardAccounts: number;
    transferTransactions: number;
    blockers: number;
    warnings: number;
  };
  findings: Ynab4MigrationCorrectnessFinding[];
  blockers: Ynab4MigrationCorrectnessFinding[];
  warnings: Ynab4MigrationCorrectnessFinding[];
};

type Ynab4PackageMetadata = {
  relativeDataFolderName?: unknown;
};

export function auditYnab4MigrationCorrectness(entries: Ynab4PackageEntry[]): Ynab4MigrationCorrectnessAudit {
  const findings: Ynab4MigrationCorrectnessFinding[] = [];
  const discovery = discoverYnab4Package(entries);
  if (!discovery.isYnab4Package) {
    for (const warning of discovery.warnings) {
      findings.push({
        id: "package.discovery-failed",
        area: "package",
        severity: "blocker",
        message: warning,
      });
    }
    return buildAudit(emptySummary(), findings);
  }

  const { data, warnings } = readActiveBudgetData(entries);
  for (const warning of warnings) {
    findings.push({ id: "package.active-data", area: "package", severity: "blocker", message: warning });
  }
  if (!data) return buildAudit(emptySummary(), findings);

  const accounts = toRecords(data.accounts);
  const transactions = toRecords(data.transactions);
  const scheduledTransactions = toRecords(data.scheduledTransactions);
  const categoryGroups = toRecords(data.masterCategories);
  const monthlyBudgets = toRecords(data.monthlyBudgets);
  const categories = categoryGroups.flatMap((group) => toRecords(group.subCategories));
  const monthlyCategoryBudgets = monthlyBudgets.flatMap((month) => toRecords(month.monthlySubCategoryBudgets));
  const transferTransactions = transactions.filter(isTransferTransaction);
  const creditCardAccounts = accounts.filter((account) => mapAccountType(firstString(account.accountType, account.type)) === "creditCard");

  auditAccounts(accounts, transactions, findings);
  auditCategories(categoryGroups, categories, monthlyCategoryBudgets, findings);
  auditMonthlyBudgets(monthlyBudgets, categories, findings);
  auditTransfers(accounts, transactions, findings);
  auditCreditCards(creditCardAccounts, transactions, findings);

  return buildAudit(
    {
      accounts: accounts.length,
      transactions: transactions.length,
      scheduledTransactions: scheduledTransactions.length,
      categoryGroups: categoryGroups.length,
      categories: categories.length,
      monthlyBudgets: monthlyBudgets.length,
      monthlyCategoryBudgets: monthlyCategoryBudgets.length,
      creditCardAccounts: creditCardAccounts.length,
      transferTransactions: transferTransactions.length,
      blockers: 0,
      warnings: 0,
    },
    findings,
  );
}

function auditAccounts(
  accounts: Record<string, unknown>[],
  transactions: Record<string, unknown>[],
  findings: Ynab4MigrationCorrectnessFinding[],
): void {
  const accountIds = new Set<string>();
  for (const [index, account] of accounts.entries()) {
    const sourceId = firstString(account.entityId, account.id, account.accountId);
    if (!sourceId) {
      findings.push({
        id: "accounts.missing-source-id",
        area: "accounts",
        severity: "blocker",
        message: `YNAB4 account at index ${index} has no stable source id.`,
        details: { index },
      });
      continue;
    }
    if (accountIds.has(sourceId)) {
      findings.push({
        id: "accounts.duplicate-source-id",
        area: "accounts",
        severity: "blocker",
        message: `YNAB4 account source id ${sourceId} appears more than once.`,
        sourceEntityId: sourceId,
      });
    }
    accountIds.add(sourceId);

    const currentBalance = toMinorUnits(account.balance, account.clearedBalance, account.workingBalance);
    const startingBalance = toMinorUnits(account.startingBalance);
    const transactionTotal = transactions
      .filter((transaction) => firstString(transaction.accountId) === sourceId && !isDeleted(transaction))
      .reduce((sum, transaction) => sum + (toMinorUnits(transaction.amount, transaction.amountMilliUnits, transaction.inflow, transaction.outflow) ?? 0), 0);

    if (currentBalance === null) {
      findings.push({
        id: "accounts.missing-current-balance",
        area: "accounts",
        severity: "warning",
        message: `YNAB4 account ${sourceId} has no importable current balance snapshot.`,
        sourceEntityId: sourceId,
      });
      continue;
    }

    if (startingBalance !== null) {
      const expectedCurrentBalance = startingBalance + transactionTotal;
      if (expectedCurrentBalance !== currentBalance) {
        findings.push({
          id: "accounts.balance-does-not-reconcile",
          area: "accounts",
          severity: "blocker",
          message: `YNAB4 account ${sourceId} balance does not reconcile from starting balance plus transactions.`,
          sourceEntityId: sourceId,
          details: { startingBalance, transactionTotal, expectedCurrentBalance, currentBalance, difference: currentBalance - expectedCurrentBalance },
        });
      }
    } else if (transactions.some((transaction) => firstString(transaction.accountId) === sourceId && !isDeleted(transaction))) {
      findings.push({
        id: "accounts.balance-snapshot-without-starting-balance-proof",
        area: "accounts",
        severity: "warning",
        message: `YNAB4 account ${sourceId} has transactions and a current balance snapshot, but no startingBalance field to prove the imported account balance.`,
        sourceEntityId: sourceId,
        details: { transactionTotal, currentBalance },
      });
    }
  }

  for (const transaction of transactions) {
    const accountId = firstString(transaction.accountId);
    if (accountId && !accountIds.has(accountId)) {
      findings.push({
        id: "accounts.transaction-references-missing-account",
        area: "accounts",
        severity: "blocker",
        message: `YNAB4 transaction references missing account ${accountId}.`,
        sourceEntityId: firstString(transaction.entityId, transaction.id, transaction.transactionId) ?? undefined,
        details: { accountId },
      });
    }
  }
}

function auditCategories(
  groups: Record<string, unknown>[],
  categories: Record<string, unknown>[],
  monthlyCategoryBudgets: Record<string, unknown>[],
  findings: Ynab4MigrationCorrectnessFinding[],
): void {
  const groupIds = new Set<string>();
  for (const [index, group] of groups.entries()) {
    const sourceId = firstString(group.entityId, group.id, group.masterCategoryId);
    if (!sourceId) {
      findings.push({
        id: "categories.group-missing-source-id",
        area: "categories",
        severity: "blocker",
        message: `YNAB4 category group at index ${index} has no stable source id.`,
        details: { index },
      });
      continue;
    }
    if (groupIds.has(sourceId)) {
      findings.push({
        id: "categories.duplicate-group-source-id",
        area: "categories",
        severity: "blocker",
        message: `YNAB4 category group source id ${sourceId} appears more than once.`,
        sourceEntityId: sourceId,
      });
    }
    groupIds.add(sourceId);
  }

  const categoryIds = new Set<string>();
  for (const [index, category] of categories.entries()) {
    const sourceId = firstString(category.entityId, category.id, category.categoryId);
    if (!sourceId) {
      findings.push({
        id: "categories.category-missing-source-id",
        area: "categories",
        severity: "blocker",
        message: `YNAB4 category at flattened index ${index} has no stable source id.`,
        details: { index },
      });
      continue;
    }
    if (categoryIds.has(sourceId)) {
      findings.push({
        id: "categories.duplicate-category-source-id",
        area: "categories",
        severity: "blocker",
        message: `YNAB4 category source id ${sourceId} appears more than once.`,
        sourceEntityId: sourceId,
      });
    }
    categoryIds.add(sourceId);
  }

  for (const row of monthlyCategoryBudgets) {
    const categoryId = firstString(row.categoryId, row.subCategoryId);
    if (categoryId && !categoryIds.has(categoryId)) {
      findings.push({
        id: "categories.monthly-budget-references-missing-category",
        area: "categories",
        severity: "blocker",
        message: `YNAB4 monthly category budget references missing category ${categoryId}.`,
        sourceEntityId: firstString(row.entityId, row.id) ?? undefined,
        details: { categoryId },
      });
    }
  }
}

function auditMonthlyBudgets(
  monthlyBudgets: Record<string, unknown>[],
  categories: Record<string, unknown>[],
  findings: Ynab4MigrationCorrectnessFinding[],
): void {
  const categoryIds = new Set(categories.map((category) => firstString(category.entityId, category.id, category.categoryId)).filter(Boolean) as string[]);
  for (const [index, monthlyBudget] of monthlyBudgets.entries()) {
    const month = monthKey(firstString(monthlyBudget.month, monthlyBudget.date, monthlyBudget.monthName) ?? "");
    if (!month) {
      findings.push({
        id: "budgets.monthly-budget-missing-month",
        area: "budgets",
        severity: "blocker",
        message: `YNAB4 monthly budget at index ${index} has no importable month key.`,
        sourceEntityId: firstString(monthlyBudget.entityId, monthlyBudget.id, monthlyBudget.monthlyBudgetId) ?? undefined,
        details: { index },
      });
      continue;
    }

    const rows = toRecords(monthlyBudget.monthlySubCategoryBudgets);
    const unmappedRows = rows.filter((row) => {
      const categoryId = firstString(row.categoryId, row.subCategoryId);
      return !categoryId || !categoryIds.has(categoryId);
    });
    if (unmappedRows.length > 0) {
      findings.push({
        id: "budgets.monthly-category-budget-unmapped",
        area: "budgets",
        severity: "blocker",
        message: `YNAB4 monthly budget ${month} contains ${unmappedRows.length} category budget row(s) that cannot map to imported categories.`,
        sourceEntityId: firstString(monthlyBudget.entityId, monthlyBudget.id, monthlyBudget.monthlyBudgetId) ?? undefined,
        details: { month, unmappedRows: unmappedRows.length },
      });
    }

    for (const row of rows) {
      const assigned = toMinorUnits(row.budgeted, row.assigned) ?? 0;
      const activity = toMinorUnits(row.activity) ?? -Math.abs(toMinorUnits(row.outflows) ?? 0);
      const available = toMinorUnits(row.balance, row.available);
      if (available === null) {
        findings.push({
          id: "budgets.monthly-category-budget-missing-available",
          area: "budgets",
          severity: "warning",
          message: `YNAB4 monthly category budget row in ${month} has no available/balance value to preserve.`,
          sourceEntityId: firstString(row.entityId, row.id) ?? undefined,
          details: { month, assigned, activity },
        });
      }
    }
  }
}

function auditTransfers(
  accounts: Record<string, unknown>[],
  transactions: Record<string, unknown>[],
  findings: Ynab4MigrationCorrectnessFinding[],
): void {
  const accountIds = new Set(accounts.map((account) => firstString(account.entityId, account.id, account.accountId)).filter(Boolean) as string[]);
  const transactionsById = new Map<string, Record<string, unknown>>();
  for (const [index, transaction] of transactions.entries()) {
    const sourceId = firstString(transaction.entityId, transaction.id, transaction.transactionId) ?? `transaction:${index}`;
    transactionsById.set(sourceId, transaction);
  }

  for (const [index, transaction] of transactions.entries()) {
    if (!isTransferTransaction(transaction)) continue;
    const sourceId = firstString(transaction.entityId, transaction.id, transaction.transactionId) ?? `transaction:${index}`;
    const sourceAccountId = firstString(transaction.accountId);
    const targetAccountId = firstString(transaction.targetAccountId, transaction.transferAccountId);
    const pairedTransactionId = firstString(transaction.transferTransactionId);
    const amount = toMinorUnits(transaction.amount, transaction.amountMilliUnits, transaction.inflow, transaction.outflow) ?? 0;

    if (!sourceAccountId || !accountIds.has(sourceAccountId)) {
      findings.push({
        id: "transfers.missing-source-account",
        area: "transfers",
        severity: "blocker",
        message: `YNAB4 transfer ${sourceId} references a missing source account.`,
        sourceEntityId: sourceId,
        details: { sourceAccountId },
      });
    }
    if (!targetAccountId || !accountIds.has(targetAccountId)) {
      findings.push({
        id: "transfers.missing-target-account",
        area: "transfers",
        severity: "blocker",
        message: `YNAB4 transfer ${sourceId} references a missing target account.`,
        sourceEntityId: sourceId,
        details: { targetAccountId },
      });
    }
    if (!pairedTransactionId) {
      findings.push({
        id: "transfers.missing-paired-transaction-id",
        area: "transfers",
        severity: "blocker",
        message: `YNAB4 transfer ${sourceId} has no transferTransactionId, so the pair cannot be proven.`,
        sourceEntityId: sourceId,
      });
      continue;
    }

    const paired = transactionsById.get(pairedTransactionId);
    if (!paired) {
      findings.push({
        id: "transfers.paired-transaction-missing",
        area: "transfers",
        severity: "blocker",
        message: `YNAB4 transfer ${sourceId} references missing paired transaction ${pairedTransactionId}.`,
        sourceEntityId: sourceId,
        details: { pairedTransactionId },
      });
      continue;
    }

    const pairedBacklink = firstString(paired.transferTransactionId);
    const pairedAmount = toMinorUnits(paired.amount, paired.amountMilliUnits, paired.inflow, paired.outflow) ?? 0;
    if (pairedBacklink !== sourceId) {
      findings.push({
        id: "transfers.pair-backlink-mismatch",
        area: "transfers",
        severity: "blocker",
        message: `YNAB4 transfer ${sourceId} pair does not link back to the source transaction.`,
        sourceEntityId: sourceId,
        details: { pairedTransactionId, pairedBacklink },
      });
    }
    if (amount + pairedAmount !== 0) {
      findings.push({
        id: "transfers.pair-amount-mismatch",
        area: "transfers",
        severity: "blocker",
        message: `YNAB4 transfer ${sourceId} and paired transaction ${pairedTransactionId} are not equal and opposite.`,
        sourceEntityId: sourceId,
        details: { amount, pairedAmount, difference: amount + pairedAmount },
      });
    }
  }
}

function auditCreditCards(
  creditCardAccounts: Record<string, unknown>[],
  transactions: Record<string, unknown>[],
  findings: Ynab4MigrationCorrectnessFinding[],
): void {
  const creditCardIds = new Set(creditCardAccounts.map((account) => firstString(account.entityId, account.id, account.accountId)).filter(Boolean) as string[]);
  if (creditCardIds.size === 0) return;

  for (const account of creditCardAccounts) {
    const sourceId = firstString(account.entityId, account.id, account.accountId);
    if (!sourceId) continue;
    const balance = toMinorUnits(account.balance, account.clearedBalance, account.workingBalance);
    if (balance === null) {
      findings.push({
        id: "credit-cards.missing-balance",
        area: "credit-cards",
        severity: "blocker",
        message: `YNAB4 credit card account ${sourceId} has no balance value to preserve.`,
        sourceEntityId: sourceId,
      });
    }
  }

  const creditCardTransfers = transactions.filter((transaction) => {
    const sourceAccountId = firstString(transaction.accountId);
    const targetAccountId = firstString(transaction.targetAccountId, transaction.transferAccountId);
    return isTransferTransaction(transaction) && Boolean((sourceAccountId && creditCardIds.has(sourceAccountId)) || (targetAccountId && creditCardIds.has(targetAccountId)));
  });

  if (creditCardTransfers.length > 0) {
    findings.push({
      id: "credit-cards.manual-ynab4-transfer-model-detected",
      area: "credit-cards",
      severity: "info",
      message: "YNAB4 credit card transfer/payment transactions detected. Audit expects manual/traditional YNAB4 handling, not modern automatic payment-category behaviour.",
      details: { creditCardTransfers: creditCardTransfers.length },
    });
  }
}

function buildAudit(
  summary: Ynab4MigrationCorrectnessAudit["summary"],
  findings: Ynab4MigrationCorrectnessFinding[],
): Ynab4MigrationCorrectnessAudit {
  const blockers = findings.filter((finding) => finding.severity === "blocker");
  const warnings = findings.filter((finding) => finding.severity === "warning");
  return {
    title: "YNAB4 Migration Correctness Audit",
    canProceedToWriteImport: blockers.length === 0,
    summary: {
      ...summary,
      blockers: blockers.length,
      warnings: warnings.length,
    },
    findings,
    blockers,
    warnings,
  };
}

function emptySummary(): Ynab4MigrationCorrectnessAudit["summary"] {
  return {
    accounts: 0,
    transactions: 0,
    scheduledTransactions: 0,
    categoryGroups: 0,
    categories: 0,
    monthlyBudgets: 0,
    monthlyCategoryBudgets: 0,
    creditCardAccounts: 0,
    transferTransactions: 0,
    blockers: 0,
    warnings: 0,
  };
}

function readActiveBudgetData(entries: Ynab4PackageEntry[]): { data: Record<string, unknown> | null; warnings: string[] } {
  const normalisedEntries = entries.map((entry) => ({ path: normalisePath(entry.path), text: entry.text }));
  const metadataEntry = normalisedEntries.find((entry) => entry.path.endsWith("/Budget.ymeta") || entry.path === "Budget.ymeta");
  if (!metadataEntry) return { data: null, warnings: ["Budget.ymeta was not found."] };

  let metadata: Ynab4PackageMetadata;
  try {
    metadata = JSON.parse(metadataEntry.text) as Ynab4PackageMetadata;
  } catch {
    return { data: null, warnings: ["Budget.ymeta is not valid JSON."] };
  }

  const relativeDataFolderName = typeof metadata.relativeDataFolderName === "string" ? metadata.relativeDataFolderName : null;
  if (!relativeDataFolderName) return { data: null, warnings: ["Budget.ymeta does not contain a relativeDataFolderName value."] };

  const packageRoot = inferPackageRoot(metadataEntry.path);
  const activeDataFolderPath = packageRoot ? `${packageRoot}/${relativeDataFolderName}` : relativeDataFolderName;
  const activePrefix = `${activeDataFolderPath}/`;
  const budgetDataEntry = normalisedEntries
    .filter((entry) => entry.path.startsWith(activePrefix))
    .find((entry) => entry.path.endsWith("/Budget.yfull") || entry.path.endsWith("/Budget.json"));

  if (!budgetDataEntry) return { data: null, warnings: [`No Budget.yfull or Budget.json file was found under ${activeDataFolderPath}.`] };

  try {
    const parsed = JSON.parse(budgetDataEntry.text);
    return isRecord(parsed) ? { data: parsed, warnings: [] } : { data: null, warnings: ["The active YNAB4 budget data root is not an object."] };
  } catch {
    return { data: null, warnings: ["The active YNAB4 budget data file is not valid JSON."] };
  }
}

function isTransferTransaction(transaction: Record<string, unknown>): boolean {
  return Boolean(firstString(transaction.targetAccountId, transaction.transferAccountId, transaction.transferTransactionId));
}

function isDeleted(row: Record<string, unknown>): boolean {
  return row.isTombstone === true || row.deleted === true;
}

function mapAccountType(value: string | null): "checking" | "savings" | "cash" | "creditCard" | "investment" | "asset" | "liability" {
  const normalized = (value ?? "").replace(/[\s_-]/g, "").toLowerCase();
  if (["creditcard", "credit", "card"].includes(normalized)) return "creditCard";
  if (["savings", "saving"].includes(normalized)) return "savings";
  if (["cash", "wallet"].includes(normalized)) return "cash";
  if (["investment", "brokerage"].includes(normalized)) return "investment";
  if (["asset"].includes(normalized)) return "asset";
  if (["liability", "loan", "mortgage"].includes(normalized)) return "liability";
  return "checking";
}

function toMinorUnits(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Number.isInteger(value) ? value : Math.round(value * 100);
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[$,]/g, ""));
      if (Number.isFinite(parsed)) return Number.isInteger(parsed) ? parsed : Math.round(parsed * 100);
    }
  }
  return null;
}

function monthKey(value: string): string | null {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function toRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalisePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function inferPackageRoot(path: string): string | null {
  const parts = normalisePath(path).split("/");
  return parts.length > 1 ? parts[0] || null : null;
}
