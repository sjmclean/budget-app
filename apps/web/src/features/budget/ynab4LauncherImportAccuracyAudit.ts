import { readTransactionRegisters } from "../accounts/entities/transactionEntityPersistence.js";
import { getBudgetScopedStorageKey } from "./budgetDataScope";
import { createScheduledTransactionEntityRepository } from "../accounts/entities/scheduledTransactionEntity.js";
import { projectScheduledTransaction } from "../accounts/entities/scheduledTransactionEntity.js";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import { readAccounts, type SidebarAccount } from "../accounts/accountService";
import { createFixedBudgetScopedStorage } from "./budgetDataScope.js";
import type { AccountRegisterView } from "../accounts/accountRegisterTypes";
import type { BudgetMonthView } from "./budgetViewTypes";
import type { Ynab4PackageEntry } from "../../../../../packages/ynab4-importer/src/analyzeYnab4Package";
import { readYnab4BudgetData } from "../../../../../packages/ynab4-importer/src/package/readBudget";
import {
  decodeYnabAmount,
  firstYnabDisplayAmount,
} from "../../../../../packages/ynab4-importer/src/money/decodeYnabAmount";
import { isYnab4Tombstone } from "./ynab4/ynab4RecordState";
import {
  auditYnab4ImportedPayeeProvenance,
  type Ynab4ImportedPayeeProvenanceAudit,
} from "./ynab4/ynab4ImportedPayeeProvenanceAudit";
import { listBudgetMonthEntities } from "./entities/budgetMonthEntity.js";

const ACCOUNTS_STORAGE_KEY = "budget-app.accounts.v1";

export interface Ynab4LauncherImportAccuracyAuditInput {
  entries: Ynab4PackageEntry[];
  budgetId: string;
  budgetDataPath?: string | null;
}

export interface Ynab4LauncherImportAccuracyAuditResult {
  status: "pass" | "fail";
  mismatches: string[];
  warnings: string[];
  /** Source-description fidelity, deliberately separate from financial totals. */
  importedPayeeProvenance: Ynab4ImportedPayeeProvenanceAudit;
  source: {
    accounts: number;
    openAccounts: number;
    closedAccounts: number;
    transactions: number;
    openAccountTransactions: number;
    closedAccountTransactions: number;
    scheduledTransactions: number;
    categoryGroups: number;
    categories: number;
    monthlyBudgets: number;
    budgetMonthSourceRowSchema: BudgetMonthSourceRowSchemaSummary;
    budgetMonthTotals: Record<string, BudgetMonthTotals>;
    budgetMonthCategoryValues: Record<
      string,
      Record<string, BudgetMonthCategoryValues>
    >;
    budgetMonthCategoryActivityContributions: Record<
      string,
      Record<string, BudgetActivityContribution[]>
    >;
    transactionsByAccountName: Record<string, number>;
    accountTransactionFidelity: Record<string, AccountTransactionFidelityRow>;
  };
  imported: {
    accounts: number;
    openAccounts: number;
    closedAccounts: number;
    transactions: number;
    openAccountTransactions: number;
    closedAccountTransactions: number;
    scheduledTransactions: number;
    budgetMonthViews: number;
    budgetMonthTotals: Record<string, BudgetMonthTotals>;
    budgetMonthCategoryValues: Record<
      string,
      Record<string, BudgetMonthCategoryValues>
    >;
    budgetMonthCategoryActivityContributions: Record<
      string,
      Record<string, BudgetActivityContribution[]>
    >;
    transactionsByAccountName: Record<string, number>;
    accountTransactionFidelity: Record<string, AccountTransactionFidelityRow>;
  };
}

interface BudgetMonthTotals {
  assigned: number;
  activity: number;
  available: number;
}

interface SourceAccountAuditInfo {
  name: string;
  closed: boolean;
  accountType: string;
  onBudget: boolean | null;
  hidden: boolean | null;
}

interface AccountTransactionFidelityRow {
  accountName: string;
  sourceAccountType: string | null;
  importedAccountType: string | null;
  sourceClosed: boolean;
  sourceHidden: boolean | null;
  sourceClosedOrHidden: boolean;
  importedClosed: boolean;
  sourceTransactionCount: number;
  importedTransactionCount: number;
  transactionCountDelta: number;
  sourceTransactionBalance: number;
  importedTransactionBalance: number;
  transactionBalanceDelta: number;
  sourceFirstTransactionDate: string | null;
  sourceLastTransactionDate: string | null;
  importedFirstTransactionDate: string | null;
  importedLastTransactionDate: string | null;
}

interface BudgetMonthSourceRowSchemaSummary {
  totalRows: number;
  rowsWithBudgeted: number;
  rowsWithActivity: number;
  rowsWithOutflows: number;
  rowsWithAvailable: number;
  rowsWithBalance: number;
  rowsWithOverspendingHandling: number;
}

interface BudgetMonthCategoryValues extends BudgetMonthTotals {
  hasSourceActivity: boolean;
  hasSourceAvailable: boolean;
  categoryId: string | null;
  categoryName: string;
  overspendingHandling: string | null;
}

interface BudgetActivityContribution {
  id: string;
  date: string;
  accountName: string;
  accountType: string | null;
  accountOnBudget: boolean | null;
  accountHidden: boolean | null;
  payee: string;
  memo: string | null;
  categoryId: string | null;
  categoryName: string;
  amount: number;
  source: "transaction" | "split";
  transferAccountName: string | null;
  transferAccountType: string | null;
  transferAccountOnBudget: boolean | null;
}

interface BudgetMonthCategoryDifference {
  month: string;
  categoryKey: string;
  categoryName: string;
  sourceCategoryId: string | null;
  importedCategoryId: string | null;
  source: BudgetMonthCategoryValues | null;
  imported: BudgetMonthCategoryValues | null;
  delta: BudgetMonthTotals;
}

type RecordMap = Record<string, unknown>;

export function auditYnab4LauncherImportAccuracy(
  storage: KeyValueStoragePort,
  input: Ynab4LauncherImportAccuracyAuditInput,
): Ynab4LauncherImportAccuracyAuditResult {
  const data = readActiveYnab4BudgetData(input.entries, input.budgetDataPath);
  if (!data) {
    return {
      status: "fail",
      mismatches: [
        "Could not read active YNAB4 Budget.yfull data from package entries.",
      ],
      warnings: [],
      importedPayeeProvenance: emptyImportedPayeeProvenanceAudit(),
      source: emptySourceAudit(),
      imported: emptyImportedAudit(),
    };
  }

  const source = buildSourceAudit(data);
  const imported = buildImportedAudit(storage, input.budgetId);
  const importedPayeeProvenance = auditYnab4ImportedPayeeProvenance(
    toRecords(data.transactions).filter((transaction) => !isDeleted(transaction)),
    readImportedTransactions(storage, input.budgetId),
  );
  reconcileAccountTransactionFidelity(
    source.accountTransactionFidelity,
    imported.accountTransactionFidelity,
  );
  const mismatches: string[] = [...importedPayeeProvenance.mismatches];
  const warnings: string[] = [];

  compareCount(mismatches, "accounts", source.accounts, imported.accounts);
  compareCount(
    mismatches,
    "open accounts",
    source.openAccounts,
    imported.openAccounts,
  );
  compareCount(
    mismatches,
    "closed accounts",
    source.closedAccounts,
    imported.closedAccounts,
  );
  compareCount(
    mismatches,
    "transactions",
    source.transactions,
    imported.transactions,
  );
  compareCount(
    mismatches,
    "open-account transactions",
    source.openAccountTransactions,
    imported.openAccountTransactions,
  );
  compareCount(
    mismatches,
    "closed-account transactions",
    source.closedAccountTransactions,
    imported.closedAccountTransactions,
  );
  compareCount(
    mismatches,
    "scheduled transactions",
    source.scheduledTransactions,
    imported.scheduledTransactions,
  );

  if (imported.transactions < source.transactions) {
    warnings.push(
      `Imported transaction history is incomplete: ${imported.transactions} of ${source.transactions} transactions are present in persisted launcher data.`,
    );
  }

  if (
    source.closedAccountTransactions > 0 &&
    imported.closedAccountTransactions === 0
  ) {
    warnings.push(
      "Closed YNAB4 accounts have source transactions, but no closed-account transactions were found in persisted launcher data.",
    );
  }

  for (const [accountName, sourceCount] of Object.entries(
    source.transactionsByAccountName,
  )) {
    const importedCount = imported.transactionsByAccountName[accountName] ?? 0;
    if (sourceCount !== importedCount) {
      mismatches.push(
        `Account transaction count mismatch for ${accountName}: source=${sourceCount}, imported=${importedCount}.`,
      );
    }
  }

  for (const row of Object.values(source.accountTransactionFidelity)) {
    if (!row.sourceClosedOrHidden) continue;
    if (row.transactionCountDelta !== 0) {
      mismatches.push(
        `Closed/hidden account transaction count mismatch for ${row.accountName}: source=${row.sourceTransactionCount}, imported=${row.importedTransactionCount}.`,
      );
    }
    if (Math.abs(row.transactionBalanceDelta) > MONEY_AUDIT_TOLERANCE) {
      mismatches.push(
        `Closed/hidden account transaction balance mismatch for ${row.accountName}: source=${row.sourceTransactionBalance.toFixed(2)}, imported=${row.importedTransactionBalance.toFixed(2)}.`,
      );
    }
  }

  for (const [month, sourceTotals] of Object.entries(
    source.budgetMonthTotals,
  )) {
    const importedTotals = imported.budgetMonthTotals[month];
    if (!importedTotals) {
      mismatches.push(
        `Budget month ${month} exists in source but was not persisted.`,
      );
      continue;
    }

    compareMoney(
      mismatches,
      `budget month ${month} assigned`,
      sourceTotals.assigned,
      importedTotals.assigned,
    );

    const categoryDifferences = budgetMonthCategoryDifferences(
      source.budgetMonthCategoryValues[month] ?? {},
      imported.budgetMonthCategoryValues[month] ?? {},
      month,
    );
    for (const difference of categoryDifferences) {
      const parts: string[] = [];
      if (Math.abs(difference.delta.assigned) > MONEY_AUDIT_TOLERANCE) {
        parts.push(
          `assigned source=${formatOptionalMoney(difference.source?.assigned)} imported=${formatOptionalMoney(difference.imported?.assigned)} delta=${difference.delta.assigned.toFixed(2)}`,
        );
      }
      if (
        difference.source?.hasSourceActivity !== false &&
        Math.abs(difference.delta.activity) > MONEY_AUDIT_TOLERANCE
      ) {
        parts.push(
          `activity source=${formatOptionalMoney(difference.source?.activity)} imported=${formatOptionalMoney(difference.imported?.activity)} delta=${difference.delta.activity.toFixed(2)}`,
        );
      }
      if (
        difference.source?.hasSourceAvailable !== false &&
        Math.abs(difference.delta.available) > MONEY_AUDIT_TOLERANCE
      ) {
        parts.push(
          `available source=${formatOptionalMoney(difference.source?.available)} imported=${formatOptionalMoney(difference.imported?.available)} delta=${difference.delta.available.toFixed(2)}`,
        );
      }
      if (parts.length > 0) {
        warnings.push(
          `Budget month ${month} category ${difference.categoryName} differs: ${parts.join("; ")}.`,
        );
      }
    }

    // YNAB4 Budget.yfull monthly subcategory rows in real-world packages only
    // provide budgeted/assigned values reliably. Activity and available are
    // reconstructed by the app from imported transactions and rollover rules,
    // so keep any source-row activity/available differences diagnostic-only.
    const sourceMonthCategoryValues = Object.values(
      source.budgetMonthCategoryValues[month] ?? {},
    );
    const sourceMonthHasActivityRows = sourceMonthCategoryValues.some(
      (row) => row.hasSourceActivity,
    );
    const sourceMonthHasAvailableRows = sourceMonthCategoryValues.some(
      (row) => row.hasSourceAvailable,
    );

    if (
      sourceMonthHasActivityRows &&
      Math.abs(sourceTotals.activity - importedTotals.activity) > 0.005
    ) {
      warnings.push(
        `Budget month ${month} activity differs: source=${sourceTotals.activity.toFixed(2)}, imported=${importedTotals.activity.toFixed(2)}.`,
      );
    }

    if (
      sourceMonthHasAvailableRows &&
      Math.abs(sourceTotals.available - importedTotals.available) > 0.005
    ) {
      warnings.push(
        `Budget month ${month} available differs: source=${sourceTotals.available.toFixed(2)}, imported=${importedTotals.available.toFixed(2)}.`,
      );
    }
  }

  if (imported.budgetMonthViews < source.monthlyBudgets) {
    warnings.push(
      `Persisted budget month history is incomplete: ${imported.budgetMonthViews} of ${source.monthlyBudgets} month views are present.`,
    );
  }

  return {
    status: mismatches.length === 0 ? "pass" : "fail",
    mismatches,
    warnings,
    importedPayeeProvenance,
    source,
    imported,
  };
}

export function formatYnab4LauncherImportAccuracyAuditReport(
  audit: Ynab4LauncherImportAccuracyAuditResult,
): string {
  const lines: string[] = [];
  lines.push("v1.71.5 YNAB4 Import Diagnostic Report");
  lines.push(`Status: ${audit.status.toUpperCase()}`);
  lines.push("");
  lines.push("Accounts");
  lines.push(`  Source total: ${audit.source.accounts}`);
  lines.push(`  Imported total: ${audit.imported.accounts}`);
  lines.push(`  Source open: ${audit.source.openAccounts}`);
  lines.push(`  Imported open: ${audit.imported.openAccounts}`);
  lines.push(`  Source closed: ${audit.source.closedAccounts}`);
  lines.push(`  Imported closed: ${audit.imported.closedAccounts}`);
  lines.push("");
  lines.push("Transactions");
  lines.push(`  Source total: ${audit.source.transactions}`);
  lines.push(`  Imported total: ${audit.imported.transactions}`);
  lines.push(
    `  Source open-account transactions: ${audit.source.openAccountTransactions}`,
  );
  lines.push(
    `  Imported open-account transactions: ${audit.imported.openAccountTransactions}`,
  );
  lines.push(
    `  Source closed-account transactions: ${audit.source.closedAccountTransactions}`,
  );
  lines.push(
    `  Imported closed-account transactions: ${audit.imported.closedAccountTransactions}`,
  );
  lines.push("");
  lines.push("Imported Payee Provenance");
  lines.push(
    `  Source transactions with imported payee text: ${audit.importedPayeeProvenance.sourceTransactionsWithImportedPayee}`,
  );
  lines.push(
    `  Preserved raw payees: ${audit.importedPayeeProvenance.preservedRawPayees}`,
  );
  lines.push(
    `  Provenance mismatches: ${audit.importedPayeeProvenance.mismatches.length}`,
  );
  lines.push("");
  lines.push("Scheduled Transactions");
  lines.push(`  Source: ${audit.source.scheduledTransactions}`);
  lines.push(`  Imported: ${audit.imported.scheduledTransactions}`);
  lines.push("");
  lines.push("Budget Months");
  lines.push(`  Source monthly budgets: ${audit.source.monthlyBudgets}`);
  lines.push(`  Persisted month views: ${audit.imported.budgetMonthViews}`);
  lines.push("");

  lines.push("Budget Month Source Row Schema");
  lines.push(
    `  Monthly category rows: ${audit.source.budgetMonthSourceRowSchema.totalRows}`,
  );
  lines.push(
    `  Rows with budgeted/assigned fields: ${audit.source.budgetMonthSourceRowSchema.rowsWithBudgeted}`,
  );
  lines.push(
    `  Rows with activity fields: ${audit.source.budgetMonthSourceRowSchema.rowsWithActivity}`,
  );
  lines.push(
    `  Rows with outflow fields: ${audit.source.budgetMonthSourceRowSchema.rowsWithOutflows}`,
  );
  lines.push(
    `  Rows with available fields: ${audit.source.budgetMonthSourceRowSchema.rowsWithAvailable}`,
  );
  lines.push(
    `  Rows with balance fields: ${audit.source.budgetMonthSourceRowSchema.rowsWithBalance}`,
  );
  lines.push(
    `  Rows with overspending handling: ${audit.source.budgetMonthSourceRowSchema.rowsWithOverspendingHandling}`,
  );
  if (
    audit.source.budgetMonthSourceRowSchema.totalRows > 0 &&
    audit.source.budgetMonthSourceRowSchema.rowsWithActivity === 0
  ) {
    lines.push(
      "  Note: This YNAB4 package does not expose budget-row activity fields. Activity comparisons must use transaction-derived activity instead of treating missing source activity as zero.",
    );
  }
  lines.push("");

  appendClosedAccountFidelity(lines, audit);

  const accountMismatches = Object.entries(
    audit.source.transactionsByAccountName,
  )
    .map(([accountName, sourceCount]) => ({
      accountName,
      sourceCount,
      importedCount: audit.imported.transactionsByAccountName[accountName] ?? 0,
    }))
    .filter((row) => row.sourceCount !== row.importedCount);

  if (accountMismatches.length > 0) {
    lines.push("Accounts With Transaction Count Mismatches");
    for (const row of accountMismatches) {
      lines.push(
        `  ${row.accountName}: source=${row.sourceCount}, imported=${row.importedCount}`,
      );
    }
    lines.push("");
  }

  const missingBudgetMonths = Object.keys(
    audit.source.budgetMonthTotals,
  ).filter((month) => !audit.imported.budgetMonthTotals[month]);
  if (missingBudgetMonths.length > 0) {
    lines.push("Missing Budget Months");
    for (const month of missingBudgetMonths.slice(0, 24)) {
      lines.push(`  ${month}`);
    }
    if (missingBudgetMonths.length > 24) {
      lines.push(`  ... ${missingBudgetMonths.length - 24} more`);
    }
    lines.push("");
  }

  appendActivityCalculationRuleInputs(lines, audit);

  const categoryDifferences = allBudgetMonthCategoryDifferences(audit);
  if (categoryDifferences.length > 0) {
    lines.push("Budget Month Category Differences");
    for (const row of categoryDifferences.slice(0, 40)) {
      lines.push(`  ${row.month} / ${row.categoryName}`);
      if (row.sourceCategoryId || row.importedCategoryId) {
        lines.push(
          `    IDs: source=${row.sourceCategoryId ?? "missing"}, imported=${row.importedCategoryId ?? "missing"}`,
        );
      }
      lines.push(
        `    Assigned: source=${formatOptionalMoney(row.source?.assigned)}, imported=${formatOptionalMoney(row.imported?.assigned)}, delta=${row.delta.assigned.toFixed(2)}`,
      );
      lines.push(
        `    Activity:  source=${formatSourceMoney(row.source, "activity")}, imported=${formatOptionalMoney(row.imported?.activity)}, delta=${row.source?.hasSourceActivity === false ? "n/a" : row.delta.activity.toFixed(2)}`,
      );
      lines.push(
        `    Available: source=${formatSourceMoney(row.source, "available")}, imported=${formatOptionalMoney(row.imported?.available)}, delta=${row.source?.hasSourceAvailable === false ? "n/a" : row.delta.available.toFixed(2)}`,
      );
      appendActivityContributionBreakdown(lines, audit, row);
    }
    if (categoryDifferences.length > 40) {
      lines.push(
        `  ... ${categoryDifferences.length - 40} more category differences`,
      );
    }
    lines.push("");
  }

  if (audit.warnings.length > 0) {
    lines.push("Warnings");
    for (const warning of audit.warnings) {
      lines.push(`  - ${warning}`);
    }
    lines.push("");
  }

  if (audit.mismatches.length > 0) {
    lines.push("Mismatches");
    for (const mismatch of audit.mismatches.slice(0, 80)) {
      lines.push(`  - ${mismatch}`);
    }
    if (audit.mismatches.length > 80) {
      lines.push(`  - ... ${audit.mismatches.length - 80} more mismatches`);
    }
    lines.push("");
  }

  lines.push("Likely Cause Hints");
  if (
    audit.source.closedAccountTransactions > 0 &&
    audit.imported.closedAccountTransactions === 0
  ) {
    lines.push(
      "  - Closed-account transactions are probably not being persisted or associated with imported closed accounts.",
    );
  }
  if (audit.imported.transactions < audit.source.transactions) {
    lines.push(
      "  - Transaction history is incomplete. Check localStorage quota fallback/truncation and account-id mapping.",
    );
  }
  if (audit.imported.budgetMonthViews < audit.source.monthlyBudgets) {
    lines.push(
      "  - Budget month history is incomplete due to localStorage capping/compaction.",
    );
  }
  if (audit.mismatches.some((mismatch) => mismatch.includes("budget month"))) {
    lines.push(
      "  - Monthly budget mapping still differs from the YNAB4 source values.",
    );
  }
  if (lines[lines.length - 1] === "Likely Cause Hints") {
    lines.push("  - No obvious mismatch hints were detected by the audit.");
  }

  return lines.join("\n");
}

function buildSourceAudit(
  data: RecordMap,
): Ynab4LauncherImportAccuracyAuditResult["source"] {
  const accounts = toRecords(data.accounts);
  const accountBySourceId = new Map<string, SourceAccountAuditInfo>();
  for (const [index, account] of accounts.entries()) {
    const name =
      firstString(account.name, account.accountName, account.displayName) ??
      `Imported Account ${index + 1}`;
    const closed = isClosed(account);
    const info: SourceAccountAuditInfo = {
      name,
      closed,
      accountType: firstString(account.accountType, account.type) ?? "unknown",
      onBudget: boolOrNull(account.onBudget),
      hidden: boolOrNull(account.hidden),
    };
    for (const sourceId of accountSourceIds(account, `account:${index}`)) {
      accountBySourceId.set(sourceId, info);
    }
  }

  const accountTransactionFidelity =
    initialSourceAccountFidelityRows(accountBySourceId);
  const transactionsByAccountName: Record<string, number> = {};
  let transactions = 0;
  let openAccountTransactions = 0;
  let closedAccountTransactions = 0;

  for (const transaction of toRecords(data.transactions)) {
    if (isDeleted(transaction)) continue;
    const accountId = firstString(
      transaction.accountId,
      transaction.accountEntityId,
    );
    const account = accountId ? accountBySourceId.get(accountId) : undefined;
    const accountName = account?.name ?? "Unknown Account";
    const amount =
      decodeYnabAmount({
        amount: transaction.amount,
        amountMilliUnits: transaction.amountMilliUnits,
        inflow: transaction.inflow,
        outflow: transaction.outflow,
      }) ?? 0;
    const date = monthDate(
      firstString(
        transaction.date,
        transaction.dateString,
        transaction.acceptedDate,
      ),
    );
    transactions += 1;
    transactionsByAccountName[accountName] =
      (transactionsByAccountName[accountName] ?? 0) + 1;
    const row = accountTransactionFidelity[accountName] ?? {
      accountName,
      sourceAccountType: account?.accountType ?? null,
      importedAccountType: null,
      sourceClosed: account?.closed ?? false,
      sourceHidden: account?.hidden ?? null,
      sourceClosedOrHidden: Boolean(account?.closed || account?.hidden),
      importedClosed: false,
      sourceTransactionCount: 0,
      importedTransactionCount: 0,
      transactionCountDelta: 0,
      sourceTransactionBalance: 0,
      importedTransactionBalance: 0,
      transactionBalanceDelta: 0,
      sourceFirstTransactionDate: null,
      sourceLastTransactionDate: null,
      importedFirstTransactionDate: null,
      importedLastTransactionDate: null,
    };
    row.sourceTransactionCount += 1;
    row.sourceTransactionBalance = roundMoney(
      row.sourceTransactionBalance + amount,
    );
    row.sourceFirstTransactionDate = earliestDate(
      row.sourceFirstTransactionDate,
      date,
    );
    row.sourceLastTransactionDate = latestDate(
      row.sourceLastTransactionDate,
      date,
    );
    accountTransactionFidelity[accountName] = row;
    if (account?.closed) closedAccountTransactions += 1;
    else openAccountTransactions += 1;
  }

  const categoryGroups = toRecords(data.masterCategories);
  const importableCategoryIds = importableYnab4CategoryIds(categoryGroups);
  const categories = importableCategoryIds.size;
  const monthlyBudgets = toRecords(data.monthlyBudgets);

  return {
    accounts: accounts.length,
    openAccounts: accounts.filter((account) => !isClosed(account)).length,
    closedAccounts: accounts.filter(isClosed).length,
    transactions,
    openAccountTransactions,
    closedAccountTransactions,
    scheduledTransactions: toRecords(data.scheduledTransactions).filter(
      (transaction) => !isDeleted(transaction),
    ).length,
    categoryGroups: categoryGroups.length,
    categories,
    monthlyBudgets: monthlyBudgets.length,
    budgetMonthSourceRowSchema: budgetMonthSourceRowSchema(monthlyBudgets),
    budgetMonthTotals: Object.fromEntries(
      monthlyBudgets.map((month) => [
        sourceMonthKey(month),
        sourceBudgetMonthTotals(month, importableCategoryIds),
      ]),
    ),
    budgetMonthCategoryValues: Object.fromEntries(
      monthlyBudgets.map((month) => [
        sourceMonthKey(month),
        sourceBudgetMonthCategoryValues(
          month,
          categoryNameById(categoryGroups),
          importableCategoryIds,
        ),
      ]),
    ),
    budgetMonthCategoryActivityContributions:
      sourceBudgetMonthCategoryActivityContributions(
        data,
        accountBySourceId,
        categoryNameById(categoryGroups),
        importableCategoryIds,
      ),
    transactionsByAccountName,
    accountTransactionFidelity,
  };
}

function readImportedTransactions(
  storage: KeyValueStoragePort,
  budgetId: string,
): RegisterTransactionView[] {
  const registers = readTransactionRegisters(
    createFixedBudgetScopedStorage(storage, budgetId),
  );
  return Object.values(registers).flatMap((register) => register.transactions);
}

function buildImportedAudit(
  storage: KeyValueStoragePort,
  budgetId: string,
): Ynab4LauncherImportAccuracyAuditResult["imported"] {
  const accounts = readAccounts(createFixedBudgetScopedStorage(storage, budgetId));
  const registers = readTransactionRegisters(createFixedBudgetScopedStorage(storage, budgetId));
  const scheduled = createScheduledTransactionEntityRepository(
    createFixedBudgetScopedStorage(storage, budgetId),
  ).list().map(projectScheduledTransaction);
  const monthViews = readBudgetMonthViews(storage, budgetId);
  const sourceCategoryIdByImportedId = new Map<string, string>();
  for (const { view } of monthViews) {
    for (const group of view.categoryGroups) {
      for (const category of group.categories) {
        if (category.sourceCategoryId) {
          sourceCategoryIdByImportedId.set(category.id, category.sourceCategoryId);
        }
      }
    }
  }
  const accountById = new Map(
    accounts.map((account) => [account.id, account] as const),
  );
  const transactionsByAccountName: Record<string, number> = {};
  const accountTransactionFidelity: Record<
    string,
    AccountTransactionFidelityRow
  > = {};
  let transactions = 0;
  let openAccountTransactions = 0;
  let closedAccountTransactions = 0;

  for (const register of Object.values(registers)) {
    const account = accountById.get(register.accountId);
    const accountName = account?.name ?? register.accountName;
    const count = register.transactions.length;
    const importedBalance = roundMoney(
      register.transactions.reduce(
        (sum, transaction) => sum + transaction.inflow - transaction.outflow,
        0,
      ),
    );
    const dates = register.transactions.map((transaction) => transaction.date);
    transactions += count;
    transactionsByAccountName[accountName] = count;
    accountTransactionFidelity[accountName] = {
      accountName,
      sourceAccountType: null,
      importedAccountType: account?.type ?? null,
      sourceClosed: false,
      sourceHidden: null,
      sourceClosedOrHidden: false,
      importedClosed: Boolean(account?.closedAt),
      sourceTransactionCount: 0,
      importedTransactionCount: count,
      transactionCountDelta: count,
      sourceTransactionBalance: 0,
      importedTransactionBalance: importedBalance,
      transactionBalanceDelta: importedBalance,
      sourceFirstTransactionDate: null,
      sourceLastTransactionDate: null,
      importedFirstTransactionDate:
        dates.length > 0 ? ([...dates].sort()[0] ?? null) : null,
      importedLastTransactionDate:
        dates.length > 0 ? ([...dates].sort().at(-1) ?? null) : null,
    };
    if (account?.closedAt) closedAccountTransactions += count;
    else openAccountTransactions += count;
  }

  return {
    accounts: accounts.length,
    openAccounts: accounts.filter((account) => !account.closedAt).length,
    closedAccounts: accounts.filter((account) => Boolean(account.closedAt))
      .length,
    transactions,
    openAccountTransactions,
    closedAccountTransactions,
    scheduledTransactions: scheduled.length,
    budgetMonthViews: monthViews.length,
    budgetMonthTotals: Object.fromEntries(
      monthViews.map(({ month, view }) => [
        month,
        importedBudgetMonthTotals(view),
      ]),
    ),
    budgetMonthCategoryValues: Object.fromEntries(
      monthViews.map(({ month, view }) => [
        month,
        importedBudgetMonthCategoryValues(view),
      ]),
    ),
    budgetMonthCategoryActivityContributions:
      importedBudgetMonthCategoryActivityContributions(
        registers,
        sourceCategoryIdByImportedId,
      ),
    transactionsByAccountName,
    accountTransactionFidelity,
  };
}

function initialSourceAccountFidelityRows(
  accountBySourceId: Map<string, SourceAccountAuditInfo>,
): Record<string, AccountTransactionFidelityRow> {
  const rows: Record<string, AccountTransactionFidelityRow> = {};
  for (const account of uniqueAccountsByName(accountBySourceId)) {
    rows[account.name] = {
      accountName: account.name,
      sourceAccountType: account.accountType,
      importedAccountType: null,
      sourceClosed: account.closed,
      sourceHidden: account.hidden,
      sourceClosedOrHidden: Boolean(account.closed || account.hidden),
      importedClosed: false,
      sourceTransactionCount: 0,
      importedTransactionCount: 0,
      transactionCountDelta: 0,
      sourceTransactionBalance: 0,
      importedTransactionBalance: 0,
      transactionBalanceDelta: 0,
      sourceFirstTransactionDate: null,
      sourceLastTransactionDate: null,
      importedFirstTransactionDate: null,
      importedLastTransactionDate: null,
    };
  }
  return rows;
}

function uniqueAccountsByName(
  accountBySourceId: Map<string, SourceAccountAuditInfo>,
): SourceAccountAuditInfo[] {
  const byName = new Map<string, SourceAccountAuditInfo>();
  for (const account of accountBySourceId.values()) {
    byName.set(account.name, account);
  }
  return [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function reconcileAccountTransactionFidelity(
  source: Record<string, AccountTransactionFidelityRow>,
  imported: Record<string, AccountTransactionFidelityRow>,
): void {
  const names = new Set([...Object.keys(source), ...Object.keys(imported)]);
  for (const accountName of names) {
    const sourceRow = source[accountName];
    const importedRow = imported[accountName];
    const row: AccountTransactionFidelityRow = {
      accountName,
      sourceAccountType: sourceRow?.sourceAccountType ?? null,
      importedAccountType: importedRow?.importedAccountType ?? null,
      sourceClosed: sourceRow?.sourceClosed ?? false,
      sourceHidden: sourceRow?.sourceHidden ?? null,
      sourceClosedOrHidden: sourceRow?.sourceClosedOrHidden ?? false,
      importedClosed: importedRow?.importedClosed ?? false,
      sourceTransactionCount: sourceRow?.sourceTransactionCount ?? 0,
      importedTransactionCount: importedRow?.importedTransactionCount ?? 0,
      transactionCountDelta: 0,
      sourceTransactionBalance: sourceRow?.sourceTransactionBalance ?? 0,
      importedTransactionBalance: importedRow?.importedTransactionBalance ?? 0,
      transactionBalanceDelta: 0,
      sourceFirstTransactionDate: sourceRow?.sourceFirstTransactionDate ?? null,
      sourceLastTransactionDate: sourceRow?.sourceLastTransactionDate ?? null,
      importedFirstTransactionDate:
        importedRow?.importedFirstTransactionDate ?? null,
      importedLastTransactionDate:
        importedRow?.importedLastTransactionDate ?? null,
    };
    row.transactionCountDelta =
      row.importedTransactionCount - row.sourceTransactionCount;
    row.transactionBalanceDelta = roundMoney(
      row.importedTransactionBalance - row.sourceTransactionBalance,
    );
    source[accountName] = row;
    imported[accountName] = row;
  }
}

function earliestDate(
  current: string | null,
  next: string | null,
): string | null {
  if (!next) return current;
  if (!current) return next;
  return next < current ? next : current;
}

function latestDate(
  current: string | null,
  next: string | null,
): string | null {
  if (!next) return current;
  if (!current) return next;
  return next > current ? next : current;
}

function readBudgetMonthViews(
  storage: KeyValueStoragePort,
  budgetId: string,
): Array<{ month: string; view: BudgetMonthView }> {
  return listBudgetMonthEntities(storage, budgetId).map(({ month, view }) => ({ month, view }));
}

function sourceBudgetMonthTotals(
  month: RecordMap,
  importableCategoryIds: ReadonlySet<string>,
): BudgetMonthTotals {
  return sumBudgetMonthCategoryValues(
    Object.values(
      sourceBudgetMonthCategoryValues(
        month,
        new Map(),
        importableCategoryIds,
      ),
    ),
  );
}

function sourceBudgetMonthCategoryValues(
  month: RecordMap,
  categoryNamesById: Map<string, string>,
  importableCategoryIds: ReadonlySet<string>,
): Record<string, BudgetMonthCategoryValues> {
  const values: Record<string, BudgetMonthCategoryValues> = {};
  for (const row of toRecords(month.monthlySubCategoryBudgets)) {
    if (isDeleted(row)) continue;
    const categoryId = firstString(
      row.categoryId,
      row.subCategoryId,
      row.categoryEntityId,
    );
    if (!categoryId || !importableCategoryIds.has(categoryId)) continue;
    const categoryName =
      firstString(row.categoryName, row.name) ??
      (categoryId ? categoryNamesById.get(categoryId) : null) ??
      "Unknown Category";
    const key = categoryIdentityAuditKey(categoryId, categoryName);
    const assigned = firstYnabDisplayAmount(row.budgeted, row.assigned) ?? 0;
    const activity = decodeYnabAmount({ amount: row.activity, outflow: row.outflows });
    const available = firstYnabDisplayAmount(row.balance, row.available);
    const existing = values[key];
    const overspendingHandling = firstString(row.overspendingHandling);
    values[key] = {
      categoryId,
      categoryName,
      assigned: roundMoney((existing?.assigned ?? 0) + assigned),
      activity: roundMoney((existing?.activity ?? 0) + (activity ?? 0)),
      available: roundMoney((existing?.available ?? 0) + (available ?? 0)),
      hasSourceActivity:
        Boolean(existing?.hasSourceActivity) || activity !== null,
      hasSourceAvailable:
        Boolean(existing?.hasSourceAvailable) || available !== null,
      overspendingHandling:
        existing?.overspendingHandling ?? overspendingHandling,
    };
  }
  return values;
}

function budgetMonthSourceRowSchema(
  monthlyBudgets: RecordMap[],
): BudgetMonthSourceRowSchemaSummary {
  const rows = monthlyBudgets.flatMap((month) =>
    toRecords(month.monthlySubCategoryBudgets).filter((row) => !isDeleted(row)),
  );
  return {
    totalRows: rows.length,
    rowsWithBudgeted: rows.filter((row) =>
      hasAnyField(row, "budgeted", "assigned"),
    ).length,
    rowsWithActivity: rows.filter((row) => hasAnyField(row, "activity")).length,
    rowsWithOutflows: rows.filter((row) =>
      hasAnyField(row, "outflows", "outflow"),
    ).length,
    rowsWithAvailable: rows.filter((row) => hasAnyField(row, "available"))
      .length,
    rowsWithBalance: rows.filter((row) => hasAnyField(row, "balance")).length,
    rowsWithOverspendingHandling: rows.filter((row) =>
      hasAnyField(row, "overspendingHandling"),
    ).length,
  };
}

function hasAnyField(record: RecordMap, ...fields: string[]): boolean {
  return fields.some(
    (field) => record[field] !== undefined && record[field] !== null,
  );
}

function importedBudgetMonthTotals(view: BudgetMonthView): BudgetMonthTotals {
  return sumBudgetMonthCategoryValues(
    Object.values(importedBudgetMonthCategoryValues(view)),
  );
}

function importedBudgetMonthCategoryValues(
  view: BudgetMonthView,
): Record<string, BudgetMonthCategoryValues> {
  const values: Record<string, BudgetMonthCategoryValues> = {};
  for (const group of view.categoryGroups) {
    for (const category of group.categories) {
      const key = categoryIdentityAuditKey(
        category.sourceCategoryId ?? null,
        category.name,
      );
      values[key] = {
        categoryId: category.id,
        categoryName: category.name,
        assigned: roundMoney((values[key]?.assigned ?? 0) + category.assigned),
        activity: roundMoney((values[key]?.activity ?? 0) + category.activity),
        available: roundMoney(
          (values[key]?.available ?? 0) + category.available,
        ),
        hasSourceActivity: true,
        hasSourceAvailable: true,
        overspendingHandling: null,
      };
    }
  }
  return values;
}

function sourceBudgetMonthCategoryActivityContributions(
  data: RecordMap,
  accountBySourceId: Map<string, SourceAccountAuditInfo>,
  categoryNamesById: Map<string, string>,
  importableCategoryIds: ReadonlySet<string>,
): Record<string, Record<string, BudgetActivityContribution[]>> {
  const contributions: Record<
    string,
    Record<string, BudgetActivityContribution[]>
  > = {};
  for (const transaction of toRecords(data.transactions)) {
    if (isDeleted(transaction)) continue;
    const month = monthKey(
      firstString(
        transaction.date,
        transaction.dateString,
        transaction.acceptedDate,
      ),
    );
    if (!month) continue;
    const accountId = firstString(
      transaction.accountId,
      transaction.accountEntityId,
    );
    const account = accountId ? accountBySourceId.get(accountId) : undefined;
    if (account?.onBudget === false) continue;
    const accountName = account?.name ?? "Unknown Account";
    const transactionId =
      firstString(
        transaction.entityId,
        transaction.id,
        transaction.transactionId,
      ) ?? "unknown-transaction";
    const payee =
      firstString(transaction.payeeName, transaction.payee) ?? "Imported Payee";
    const memo = firstString(
      transaction.memo,
      transaction.note,
      transaction.notes,
    );
    const transferAccountId = firstString(
      transaction.transferAccountId,
      transaction.transferAccountEntityId,
    );
    const transferAccount = transferAccountId
      ? accountBySourceId.get(transferAccountId)
      : undefined;
    const splitLines = toRecords(transaction.subTransactions).filter(
      (line) => !isDeleted(line),
    );

    if (splitLines.length > 0) {
      for (const [index, line] of splitLines.entries()) {
        if (firstString(line.transferTransactionId, line.targetAccountId, line.transferAccountId)) {
          continue;
        }
        const categoryId = firstString(
          line.categoryId,
          line.subCategoryId,
          line.categoryEntityId,
        );
        if (!categoryId || !importableCategoryIds.has(categoryId)) continue;
        const amount =
          decodeYnabAmount({
            amount: line.amount,
            amountMilliUnits: line.amountMilliUnits,
            inflow: line.inflow,
            outflow: line.outflow,
          }) ?? 0;
        addActivityContribution(contributions, month, {
          id:
            firstString(line.entityId, line.id) ??
            `${transactionId}:split:${index + 1}`,
          date:
            monthDate(
              firstString(
                transaction.date,
                transaction.dateString,
                transaction.acceptedDate,
              ),
            ) ?? `${month}-01`,
          accountName,
          accountType: account?.accountType ?? null,
          accountOnBudget: account?.onBudget ?? null,
          accountHidden: account?.hidden ?? null,
          payee,
          memo: firstString(line.memo, line.note, line.notes) ?? memo,
          categoryId,
          categoryName:
            categoryNamesById.get(categoryId) ??
            firstString(line.categoryName, line.name) ??
            "Unknown Category",
          amount,
          source: "split",
          transferAccountName: transferAccount?.name ?? null,
          transferAccountType: transferAccount?.accountType ?? null,
          transferAccountOnBudget: transferAccount?.onBudget ?? null,
        }, categoryIdentityAuditKey(categoryId, categoryNamesById.get(categoryId) ?? null));
      }
      continue;
    }

    const categoryId = firstString(
      transaction.categoryId,
      transaction.subCategoryId,
      transaction.categoryEntityId,
    );
    if (!categoryId || !importableCategoryIds.has(categoryId)) continue;
    const amount =
      decodeYnabAmount({
        amount: transaction.amount,
        amountMilliUnits: transaction.amountMilliUnits,
        inflow: transaction.inflow,
        outflow: transaction.outflow,
      }) ?? 0;
    addActivityContribution(contributions, month, {
      id: transactionId,
      date:
        monthDate(
          firstString(
            transaction.date,
            transaction.dateString,
            transaction.acceptedDate,
          ),
        ) ?? `${month}-01`,
      accountName,
      accountType: account?.accountType ?? null,
      accountOnBudget: account?.onBudget ?? null,
      accountHidden: account?.hidden ?? null,
      payee,
      memo,
      categoryId,
      categoryName:
        categoryNamesById.get(categoryId) ??
        firstString(transaction.categoryName, transaction.name) ??
        "Unknown Category",
      amount,
      source: "transaction",
      transferAccountName: transferAccount?.name ?? null,
      transferAccountType: transferAccount?.accountType ?? null,
      transferAccountOnBudget: transferAccount?.onBudget ?? null,
    }, categoryIdentityAuditKey(categoryId, categoryNamesById.get(categoryId) ?? null));
  }
  return contributions;
}

function importedBudgetMonthCategoryActivityContributions(
  registers: Record<string, AccountRegisterView>,
  sourceCategoryIdByImportedId: ReadonlyMap<string, string>,
): Record<string, Record<string, BudgetActivityContribution[]>> {
  const contributions: Record<
    string,
    Record<string, BudgetActivityContribution[]>
  > = {};
  for (const register of Object.values(registers)) {
    if (register.accountType === "Tracking") continue;
    for (const transaction of register.transactions) {
      const month = monthKey(transaction.date);
      if (!month) continue;
      if (transaction.splitLines && transaction.splitLines.length > 0) {
        for (const splitLine of transaction.splitLines) {
          if (splitLine.transferAccountId || splitLine.transferTransactionId) {
            continue;
          }
          const categoryName = splitLine.category || "Unknown Category";
          addActivityContribution(contributions, month, {
            id: splitLine.id,
            date: transaction.date,
            accountName: register.accountName,
            accountType: null,
            accountOnBudget: null,
            accountHidden: null,
            payee: transaction.payee,
            memo: splitLine.memo ?? transaction.memo ?? null,
            categoryId: splitLine.categoryId ?? null,
            categoryName,
            amount: roundMoney(splitLine.inflow - splitLine.outflow),
            source: "split",
            transferAccountName: null,
            transferAccountType: null,
            transferAccountOnBudget: null,
          }, categoryIdentityAuditKey(
            sourceCategoryIdByImportedId.get(splitLine.categoryId ?? "") ?? null,
            categoryName,
          ));
        }
        continue;
      }
      const categoryName = transaction.category || "Unknown Category";
      addActivityContribution(contributions, month, {
        id: transaction.id,
        date: transaction.date,
        accountName: register.accountName,
        accountType: null,
        accountOnBudget: null,
        accountHidden: null,
        payee: transaction.payee,
        memo: transaction.memo ?? null,
        categoryId: transaction.categoryId ?? null,
        categoryName,
        amount: roundMoney(transaction.inflow - transaction.outflow),
        source: "transaction",
        transferAccountName: null,
        transferAccountType: null,
        transferAccountOnBudget: null,
      }, categoryIdentityAuditKey(
        sourceCategoryIdByImportedId.get(transaction.categoryId ?? "") ?? null,
        categoryName,
      ));
    }
  }
  return contributions;
}

function addActivityContribution(
  contributions: Record<string, Record<string, BudgetActivityContribution[]>>,
  month: string,
  contribution: BudgetActivityContribution,
  key = categoryAuditKey(contribution.categoryName),
): void {
  const monthContributions = contributions[month] ?? {};
  const categoryContributions = monthContributions[key] ?? [];
  categoryContributions.push({
    ...contribution,
    amount: roundMoney(contribution.amount),
  });
  categoryContributions.sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
  );
  monthContributions[key] = categoryContributions;
  contributions[month] = monthContributions;
}

function appendClosedAccountFidelity(
  lines: string[],
  audit: Ynab4LauncherImportAccuracyAuditResult,
): void {
  const rows = Object.values(audit.source.accountTransactionFidelity)
    .filter((row) => row.sourceClosedOrHidden || row.importedClosed)
    .sort((left, right) => left.accountName.localeCompare(right.accountName));

  if (rows.length === 0) return;

  lines.push("Closed/Hidden Account Transaction Fidelity");
  for (const row of rows) {
    lines.push(`  ${row.accountName}`);
    lines.push(
      `    Source: type=${row.sourceAccountType ?? "unknown"}, closed=${row.sourceClosed}, hidden=${formatNullableBoolean(row.sourceHidden)}, transactions=${row.sourceTransactionCount}, transactionBalance=${row.sourceTransactionBalance.toFixed(2)}, first=${row.sourceFirstTransactionDate ?? "none"}, last=${row.sourceLastTransactionDate ?? "none"}`,
    );
    lines.push(
      `    Imported: type=${row.importedAccountType ?? "missing"}, closed=${row.importedClosed}, transactions=${row.importedTransactionCount}, transactionBalance=${row.importedTransactionBalance.toFixed(2)}, first=${row.importedFirstTransactionDate ?? "none"}, last=${row.importedLastTransactionDate ?? "none"}`,
    );
    lines.push(
      `    Delta: transactions=${row.transactionCountDelta}, transactionBalance=${row.transactionBalanceDelta.toFixed(2)}`,
    );
  }
  lines.push("");
}

function appendActivityContributionBreakdown(
  lines: string[],
  audit: Ynab4LauncherImportAccuracyAuditResult,
  row: BudgetMonthCategoryDifference,
): void {
  if (Math.abs(row.delta.activity) <= MONEY_AUDIT_TOLERANCE) return;
  const sourceContributions =
    audit.source.budgetMonthCategoryActivityContributions[row.month]?.[
      row.categoryKey
    ] ?? [];
  const importedContributions =
    audit.imported.budgetMonthCategoryActivityContributions[row.month]?.[
      row.categoryKey
    ] ?? [];
  const sourceTransactionActivity = roundMoney(
    sourceContributions.reduce(
      (sum, contribution) => sum + contribution.amount,
      0,
    ),
  );
  const importedTransactionActivity = roundMoney(
    importedContributions.reduce(
      (sum, contribution) => sum + contribution.amount,
      0,
    ),
  );
  const transactionDelta = roundMoney(
    importedTransactionActivity - sourceTransactionActivity,
  );

  const sourceBudgetRowActivity = row.source?.activity ?? 0;
  const importedBudgetRowActivity = row.imported?.activity ?? 0;
  const sourceBudgetRowGap = roundMoney(
    sourceBudgetRowActivity - sourceTransactionActivity,
  );
  const importedBudgetRowGap = roundMoney(
    importedBudgetRowActivity - importedTransactionActivity,
  );

  lines.push(
    `    Transaction Activity: source=${sourceTransactionActivity.toFixed(2)}, imported=${importedTransactionActivity.toFixed(2)}, delta=${transactionDelta.toFixed(2)}`,
  );
  const sourceRowLabel =
    row.source?.hasSourceActivity === false
      ? "not exposed"
      : sourceBudgetRowActivity.toFixed(2);
  const sourceGapLabel =
    row.source?.hasSourceActivity === false
      ? "n/a"
      : sourceBudgetRowGap.toFixed(2);
  lines.push(
    `    Budget Activity Semantics: sourceRow=${sourceRowLabel}, sourceTransactions=${sourceTransactionActivity.toFixed(2)}, sourceRowMinusTransactions=${sourceGapLabel}, importedRow=${importedBudgetRowActivity.toFixed(2)}, importedTransactions=${importedTransactionActivity.toFixed(2)}, importedRowMinusTransactions=${importedBudgetRowGap.toFixed(2)}`,
  );
  if (
    row.source?.hasSourceActivity !== false &&
    Math.abs(transactionDelta) <= MONEY_AUDIT_TOLERANCE &&
    Math.abs(sourceBudgetRowGap) > MONEY_AUDIT_TOLERANCE
  ) {
    lines.push(
      "    Interpretation: imported transaction activity matches source transaction activity; remaining difference comes from the YNAB4 budget-row activity value.",
    );
  }
  appendContributionList(lines, "Source Transactions", sourceContributions);
  appendContributionList(lines, "Imported Transactions", importedContributions);
}

function appendContributionList(
  lines: string[],
  label: string,
  contributions: BudgetActivityContribution[],
): void {
  lines.push(`    ${label}:`);
  if (contributions.length === 0) {
    lines.push("      none");
    return;
  }
  for (const contribution of contributions.slice(0, 10)) {
    const memo = contribution.memo ? ` memo=${contribution.memo}` : "";
    const accountRule = contribution.accountType
      ? ` accountType=${contribution.accountType} onBudget=${formatNullableBoolean(contribution.accountOnBudget)} hidden=${formatNullableBoolean(contribution.accountHidden)}`
      : "";
    const transferRule = contribution.transferAccountName
      ? ` transferTo=${contribution.transferAccountName} transferAccountType=${contribution.transferAccountType ?? "unknown"} transferOnBudget=${formatNullableBoolean(contribution.transferAccountOnBudget)}`
      : "";
    lines.push(
      `      ${contribution.date} ${contribution.accountName} ${contribution.payee} ${contribution.amount.toFixed(2)} [${contribution.source}]${accountRule}${transferRule}${memo}`,
    );
  }
  if (contributions.length > 10) {
    lines.push(`      ... ${contributions.length - 10} more`);
  }
}

function appendActivityCalculationRuleInputs(
  lines: string[],
  audit: Ynab4LauncherImportAccuracyAuditResult,
): void {
  const rows: Array<{
    month: string;
    categoryKey: string;
    categoryName: string;
    sourceValues: BudgetMonthCategoryValues | null;
    sourceContributions: BudgetActivityContribution[];
    importedContributions: BudgetActivityContribution[];
  }> = [];

  const months = new Set([
    ...Object.keys(audit.source.budgetMonthCategoryValues),
    ...Object.keys(audit.source.budgetMonthCategoryActivityContributions),
  ]);

  for (const month of [...months].sort()) {
    const categoryKeys = new Set([
      ...Object.keys(audit.source.budgetMonthCategoryValues[month] ?? {}),
      ...Object.keys(
        audit.source.budgetMonthCategoryActivityContributions[month] ?? {},
      ),
    ]);
    for (const categoryKey of [...categoryKeys].sort()) {
      const sourceValues =
        audit.source.budgetMonthCategoryValues[month]?.[categoryKey] ?? null;
      const sourceContributions =
        audit.source.budgetMonthCategoryActivityContributions[month]?.[
          categoryKey
        ] ?? [];
      const importedContributions =
        audit.imported.budgetMonthCategoryActivityContributions[month]?.[
          categoryKey
        ] ?? [];
      const hasRuleSignal =
        Boolean(sourceValues?.overspendingHandling) ||
        sourceContributions.some(hasNonBasicActivityRuleSignal) ||
        Math.abs(
          sumContributions(sourceContributions) -
            sumContributions(importedContributions),
        ) > MONEY_AUDIT_TOLERANCE;
      if (!hasRuleSignal) continue;
      rows.push({
        month,
        categoryKey,
        categoryName: sourceValues?.categoryName ?? categoryKey,
        sourceValues,
        sourceContributions,
        importedContributions,
      });
    }
  }

  if (rows.length === 0) return;

  lines.push("YNAB4 Activity Calculation Rule Inputs");
  for (const row of rows.slice(0, 40)) {
    const sourceActivity = sumContributions(row.sourceContributions);
    const importedActivity = sumContributions(row.importedContributions);
    lines.push(`  ${row.month} / ${row.categoryName}`);
    lines.push(
      `    Overspending handling: ${row.sourceValues?.overspendingHandling ?? "none"}`,
    );
    lines.push(
      `    Transaction-derived activity: source=${sourceActivity.toFixed(2)}, imported=${importedActivity.toFixed(2)}, delta=${roundMoney(importedActivity - sourceActivity).toFixed(2)}`,
    );
    appendContributionList(
      lines,
      "Source Rule Transactions",
      row.sourceContributions,
    );
  }
  if (rows.length > 40) {
    lines.push(`  ... ${rows.length - 40} more rule-input rows`);
  }
  lines.push("");
}

function hasNonBasicActivityRuleSignal(
  contribution: BudgetActivityContribution,
): boolean {
  return (
    Boolean(contribution.transferAccountName) ||
    (contribution.accountType !== null &&
      contribution.accountType !== "Checking") ||
    contribution.accountOnBudget === false ||
    contribution.accountHidden === true
  );
}

function sumContributions(contributions: BudgetActivityContribution[]): number {
  return roundMoney(
    contributions.reduce((sum, contribution) => sum + contribution.amount, 0),
  );
}

function formatNullableBoolean(value: boolean | null): string {
  return value === null ? "unknown" : String(value);
}

function sumBudgetMonthCategoryValues(
  values: BudgetMonthTotals[],
): BudgetMonthTotals {
  return {
    assigned: roundMoney(values.reduce((sum, row) => sum + row.assigned, 0)),
    activity: roundMoney(values.reduce((sum, row) => sum + row.activity, 0)),
    available: roundMoney(values.reduce((sum, row) => sum + row.available, 0)),
  };
}

function importableYnab4CategoryIds(
  categoryGroups: RecordMap[],
): Set<string> {
  const ids = new Set<string>();
  for (const group of categoryGroups) {
    if (isDeleted(group)) continue;
    for (const category of toRecords(group.subCategories)) {
      if (isDeleted(category)) continue;
      for (const id of categorySourceIds(category, `category:${ids.size + 1}`)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

function categoryNameById(categoryGroups: RecordMap[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const group of categoryGroups) {
    const groupName = firstString(group.name, group.masterCategoryName, group.displayName) ?? "";
    const isHiddenGroup =
      groupName === "Hidden Categories" ||
      categoryGroupSourceIds(group, "").includes("MasterCategory/__Hidden__");
    for (const category of toRecords(group.subCategories)) {
      const rawName = firstString(
        category.name,
        category.categoryName,
        category.displayName,
      );
      const name = isHiddenGroup ? hiddenCategoryDisplayName(rawName) : rawName;
      if (!name) continue;
      for (const id of categorySourceIds(category, `category:${names.size + 1}`)) {
        names.set(id, name);
      }
    }
  }
  return names;
}

function categoryIdentityAuditKey(
  categoryId: string | null,
  categoryName: string | null,
): string {
  return categoryId
    ? `source:${categoryId}`
    : categoryAuditKey(categoryName ?? "Unknown Category");
}

function hiddenCategoryDisplayName(name: string | null): string | null {
  if (!name) return null;
  const parts = name.split(" ` ").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.at(-2) ?? name : name;
}

function budgetMonthCategoryDifferences(
  source: Record<string, BudgetMonthCategoryValues>,
  imported: Record<string, BudgetMonthCategoryValues>,
  month: string,
): BudgetMonthCategoryDifference[] {
  const keys = new Set([...Object.keys(source), ...Object.keys(imported)]);
  return [...keys]
    .map((categoryKey) => {
      const sourceValues = source[categoryKey] ?? null;
      const importedValues = imported[categoryKey] ?? null;
      const delta = {
        assigned: roundMoney(
          (importedValues?.assigned ?? 0) - (sourceValues?.assigned ?? 0),
        ),
        activity: roundMoney(
          (importedValues?.activity ?? 0) - (sourceValues?.activity ?? 0),
        ),
        available: roundMoney(
          (importedValues?.available ?? 0) - (sourceValues?.available ?? 0),
        ),
      };
      return {
        month,
        categoryKey,
        categoryName:
          importedValues?.categoryName ??
          sourceValues?.categoryName ??
          categoryKey,
        sourceCategoryId: sourceValues?.categoryId ?? null,
        importedCategoryId: importedValues?.categoryId ?? null,
        source: sourceValues,
        imported: importedValues,
        delta,
      };
    })
    .filter(
      (difference) =>
        Math.abs(difference.delta.assigned) > MONEY_AUDIT_TOLERANCE ||
        (difference.source?.hasSourceActivity !== false &&
          Math.abs(difference.delta.activity) > MONEY_AUDIT_TOLERANCE) ||
        (difference.source?.hasSourceAvailable !== false &&
          Math.abs(difference.delta.available) > MONEY_AUDIT_TOLERANCE),
    )
    .sort(
      (a, b) =>
        differenceMagnitude(b) - differenceMagnitude(a) ||
        a.month.localeCompare(b.month) ||
        a.categoryName.localeCompare(b.categoryName),
    );
}

function allBudgetMonthCategoryDifferences(
  audit: Ynab4LauncherImportAccuracyAuditResult,
): BudgetMonthCategoryDifference[] {
  const months = new Set([
    ...Object.keys(audit.source.budgetMonthCategoryValues),
    ...Object.keys(audit.imported.budgetMonthCategoryValues),
  ]);
  return [...months]
    .flatMap((month) =>
      budgetMonthCategoryDifferences(
        audit.source.budgetMonthCategoryValues[month] ?? {},
        audit.imported.budgetMonthCategoryValues[month] ?? {},
        month,
      ),
    )
    .sort(
      (a, b) =>
        differenceMagnitude(b) - differenceMagnitude(a) ||
        a.month.localeCompare(b.month) ||
        a.categoryName.localeCompare(b.categoryName),
    );
}

function differenceMagnitude(
  difference: BudgetMonthCategoryDifference,
): number {
  return (
    Math.abs(difference.delta.assigned) +
    Math.abs(difference.delta.activity) +
    Math.abs(difference.delta.available)
  );
}

function categoryAuditKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatOptionalMoney(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : "missing";
}

function formatSourceMoney(
  row: BudgetMonthCategoryValues | null | undefined,
  field: "activity" | "available",
): string {
  if (!row) return "missing";
  if (field === "activity" && !row.hasSourceActivity) return "not exposed";
  if (field === "available" && !row.hasSourceAvailable) return "not exposed";
  return formatOptionalMoney(row[field]);
}

function compareCount(
  mismatches: string[],
  label: string,
  source: number,
  imported: number,
): void {
  if (source !== imported) {
    mismatches.push(
      `${label} mismatch: source=${source}, imported=${imported}.`,
    );
  }
}

const MONEY_AUDIT_TOLERANCE = 0.015;

function compareMoney(
  mismatches: string[],
  label: string,
  source: number,
  imported: number,
): void {
  if (Math.abs(source - imported) > MONEY_AUDIT_TOLERANCE) {
    mismatches.push(
      `${label} mismatch: source=${source.toFixed(2)}, imported=${imported.toFixed(2)}.`,
    );
  }
}

function readJson<T>(
  storage: KeyValueStoragePort,
  key: string,
  fallback: T,
): T {
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readActiveYnab4BudgetData(
  entries: Ynab4PackageEntry[],
  selectedBudgetDataPath?: string | null,
): RecordMap | null {
  return readYnab4BudgetData(entries, selectedBudgetDataPath).data;
}

function sourceMonthKey(month: RecordMap): string {
  return (
    monthKey(firstString(month.month, month.date, month.monthName)) ??
    "unknown-month"
  );
}

function accountSourceIds(record: RecordMap, fallback: string): string[] {
  return ownEntitySourceIds(record, fallback, record.accountId);
}

function categoryGroupSourceIds(record: RecordMap, fallback: string): string[] {
  return ownEntitySourceIds(record, fallback, record.masterCategoryId);
}

function categorySourceIds(record: RecordMap, fallback: string): string[] {
  return ownEntitySourceIds(
    record,
    fallback,
    record.categoryId,
    record.subCategoryId,
  );
}

function ownEntitySourceIds(
  record: RecordMap,
  fallback: string,
  ...entitySpecificIds: unknown[]
): string[] {
  const ids = [
    firstString(record.entityId),
    firstString(record.id),
    ...entitySpecificIds.map((value) => firstString(value)),
  ].filter((value): value is string => Boolean(value));
  return [...new Set(ids.length > 0 ? ids : [fallback])];
}

function isClosed(record: RecordMap): boolean {
  return isYnab4Tombstone(record) || record.closed === true || record.hidden === true;
}

function isDeleted(record: RecordMap): boolean {
  return isYnab4Tombstone(record);
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  return null;
}

function toRecords(value: unknown): RecordMap[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is RecordMap {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function monthKey(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function monthDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}


function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyImportedPayeeProvenanceAudit(): Ynab4ImportedPayeeProvenanceAudit {
  return {
    sourceTransactionsWithImportedPayee: 0,
    preservedRawPayees: 0,
    mismatches: [],
  };
}

function emptySourceAudit(): Ynab4LauncherImportAccuracyAuditResult["source"] {
  return {
    accounts: 0,
    openAccounts: 0,
    closedAccounts: 0,
    transactions: 0,
    openAccountTransactions: 0,
    closedAccountTransactions: 0,
    scheduledTransactions: 0,
    categoryGroups: 0,
    categories: 0,
    monthlyBudgets: 0,
    budgetMonthSourceRowSchema: {
      totalRows: 0,
      rowsWithBudgeted: 0,
      rowsWithActivity: 0,
      rowsWithOutflows: 0,
      rowsWithAvailable: 0,
      rowsWithBalance: 0,
      rowsWithOverspendingHandling: 0,
    },
    budgetMonthTotals: {},
    budgetMonthCategoryValues: {},
    budgetMonthCategoryActivityContributions: {},
    transactionsByAccountName: {},
    accountTransactionFidelity: {},
  };
}

function emptyImportedAudit(): Ynab4LauncherImportAccuracyAuditResult["imported"] {
  return {
    accounts: 0,
    openAccounts: 0,
    closedAccounts: 0,
    transactions: 0,
    openAccountTransactions: 0,
    closedAccountTransactions: 0,
    scheduledTransactions: 0,
    budgetMonthViews: 0,
    budgetMonthTotals: {},
    budgetMonthCategoryValues: {},
    budgetMonthCategoryActivityContributions: {},
    transactionsByAccountName: {},
    accountTransactionFidelity: {},
  };
}
