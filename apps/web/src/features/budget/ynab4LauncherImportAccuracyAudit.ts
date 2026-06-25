import { getBudgetScopedStorageKey } from "./budgetDataScope";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import type { SidebarAccount } from "../accounts/accountService";
import type { AccountRegisterView } from "../accounts/accountRegisterTypes";
import type { BudgetMonthView } from "./budgetViewTypes";
import type { Ynab4PackageEntry } from "../../../../../packages/ynab4-importer/src/analyzeYnab4Package";

const ACCOUNTS_STORAGE_KEY = "budget-app.accounts.v1";
const REGISTERS_STORAGE_KEY = "budget-app.account-registers.v1";
const SCHEDULED_STORAGE_KEY = "budget-app.scheduled-transactions.v1";
const BUDGET_VIEW_STORAGE_PREFIX = "budget-app.budget-view.v1";

export interface Ynab4LauncherImportAccuracyAuditInput {
  entries: Ynab4PackageEntry[];
  budgetId: string;
}

export interface Ynab4LauncherImportAccuracyAuditResult {
  status: "pass" | "fail";
  mismatches: string[];
  warnings: string[];
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
    budgetMonthTotals: Record<string, BudgetMonthTotals>;
    budgetMonthCategoryValues: Record<string, Record<string, BudgetMonthCategoryValues>>;
    budgetMonthCategoryActivityContributions: Record<string, Record<string, BudgetActivityContribution[]>>;
    transactionsByAccountName: Record<string, number>;
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
    budgetMonthCategoryValues: Record<string, Record<string, BudgetMonthCategoryValues>>;
    budgetMonthCategoryActivityContributions: Record<string, Record<string, BudgetActivityContribution[]>>;
    transactionsByAccountName: Record<string, number>;
  };
}

interface BudgetMonthTotals {
  assigned: number;
  activity: number;
  available: number;
}

interface BudgetMonthCategoryValues extends BudgetMonthTotals {
  categoryId: string | null;
  categoryName: string;
}

interface BudgetActivityContribution {
  id: string;
  date: string;
  accountName: string;
  payee: string;
  memo: string | null;
  categoryId: string | null;
  categoryName: string;
  amount: number;
  source: "transaction" | "split";
}

interface BudgetMonthCategoryDifference {
  month: string;
  categoryKey: string;
  categoryName: string;
  sourceCategoryId: string | null;
  importedCategoryId: string | null;
  source: BudgetMonthTotals | null;
  imported: BudgetMonthTotals | null;
  delta: BudgetMonthTotals;
}

type RecordMap = Record<string, unknown>;

export function auditYnab4LauncherImportAccuracy(
  storage: KeyValueStoragePort,
  input: Ynab4LauncherImportAccuracyAuditInput,
): Ynab4LauncherImportAccuracyAuditResult {
  const data = readActiveYnab4BudgetData(input.entries);
  if (!data) {
    return {
      status: "fail",
      mismatches: ["Could not read active YNAB4 Budget.yfull data from package entries."],
      warnings: [],
      source: emptySourceAudit(),
      imported: emptyImportedAudit(),
    };
  }

  const source = buildSourceAudit(data);
  const imported = buildImportedAudit(storage, input.budgetId);
  const mismatches: string[] = [];
  const warnings: string[] = [];

  compareCount(mismatches, "accounts", source.accounts, imported.accounts);
  compareCount(mismatches, "open accounts", source.openAccounts, imported.openAccounts);
  compareCount(mismatches, "closed accounts", source.closedAccounts, imported.closedAccounts);
  compareCount(mismatches, "transactions", source.transactions, imported.transactions);
  compareCount(mismatches, "open-account transactions", source.openAccountTransactions, imported.openAccountTransactions);
  compareCount(mismatches, "closed-account transactions", source.closedAccountTransactions, imported.closedAccountTransactions);
  compareCount(mismatches, "scheduled transactions", source.scheduledTransactions, imported.scheduledTransactions);

  if (imported.transactions < source.transactions) {
    warnings.push(
      `Imported transaction history is incomplete: ${imported.transactions} of ${source.transactions} transactions are present in persisted launcher data.`,
    );
  }

  if (source.closedAccountTransactions > 0 && imported.closedAccountTransactions === 0) {
    warnings.push(
      "Closed YNAB4 accounts have source transactions, but no closed-account transactions were found in persisted launcher data.",
    );
  }

  for (const [accountName, sourceCount] of Object.entries(source.transactionsByAccountName)) {
    const importedCount = imported.transactionsByAccountName[accountName] ?? 0;
    if (sourceCount !== importedCount) {
      mismatches.push(
        `Account transaction count mismatch for ${accountName}: source=${sourceCount}, imported=${importedCount}.`,
      );
    }
  }

  for (const [month, sourceTotals] of Object.entries(source.budgetMonthTotals)) {
    const importedTotals = imported.budgetMonthTotals[month];
    if (!importedTotals) {
      mismatches.push(`Budget month ${month} exists in source but was not persisted.`);
      continue;
    }

    compareMoney(mismatches, `budget month ${month} assigned`, sourceTotals.assigned, importedTotals.assigned);

    const categoryDifferences = budgetMonthCategoryDifferences(
      source.budgetMonthCategoryValues[month] ?? {},
      imported.budgetMonthCategoryValues[month] ?? {},
      month,
    );
    for (const difference of categoryDifferences) {
      const parts: string[] = [];
      if (Math.abs(difference.delta.assigned) > MONEY_AUDIT_TOLERANCE) {
        parts.push(`assigned source=${formatOptionalMoney(difference.source?.assigned)} imported=${formatOptionalMoney(difference.imported?.assigned)} delta=${difference.delta.assigned.toFixed(2)}`);
      }
      if (Math.abs(difference.delta.activity) > MONEY_AUDIT_TOLERANCE) {
        parts.push(`activity source=${formatOptionalMoney(difference.source?.activity)} imported=${formatOptionalMoney(difference.imported?.activity)} delta=${difference.delta.activity.toFixed(2)}`);
      }
      if (Math.abs(difference.delta.available) > MONEY_AUDIT_TOLERANCE) {
        parts.push(`available source=${formatOptionalMoney(difference.source?.available)} imported=${formatOptionalMoney(difference.imported?.available)} delta=${difference.delta.available.toFixed(2)}`);
      }
      warnings.push(`Budget month ${month} category ${difference.categoryName} differs: ${parts.join('; ')}.`);
    }

    // YNAB4 Budget.yfull monthly subcategory rows in real-world packages only
    // provide budgeted/assigned values reliably. Activity and available are
    // reconstructed by the app from imported transactions and rollover rules,
    // so keep any source-row activity/available differences diagnostic-only.
    if (Math.abs(sourceTotals.activity - importedTotals.activity) > 0.005) {
      warnings.push(
        `Budget month ${month} activity differs: source=${sourceTotals.activity.toFixed(2)}, imported=${importedTotals.activity.toFixed(2)}.`,
      );
    }

    if (Math.abs(sourceTotals.available - importedTotals.available) > 0.005) {
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
  lines.push(`  Source open-account transactions: ${audit.source.openAccountTransactions}`);
  lines.push(`  Imported open-account transactions: ${audit.imported.openAccountTransactions}`);
  lines.push(`  Source closed-account transactions: ${audit.source.closedAccountTransactions}`);
  lines.push(`  Imported closed-account transactions: ${audit.imported.closedAccountTransactions}`);
  lines.push("");
  lines.push("Scheduled Transactions");
  lines.push(`  Source: ${audit.source.scheduledTransactions}`);
  lines.push(`  Imported: ${audit.imported.scheduledTransactions}`);
  lines.push("");
  lines.push("Budget Months");
  lines.push(`  Source monthly budgets: ${audit.source.monthlyBudgets}`);
  lines.push(`  Persisted month views: ${audit.imported.budgetMonthViews}`);
  lines.push("");

  const accountMismatches = Object.entries(audit.source.transactionsByAccountName)
    .map(([accountName, sourceCount]) => ({
      accountName,
      sourceCount,
      importedCount: audit.imported.transactionsByAccountName[accountName] ?? 0,
    }))
    .filter((row) => row.sourceCount !== row.importedCount);

  if (accountMismatches.length > 0) {
    lines.push("Accounts With Transaction Count Mismatches");
    for (const row of accountMismatches) {
      lines.push(`  ${row.accountName}: source=${row.sourceCount}, imported=${row.importedCount}`);
    }
    lines.push("");
  }

  const missingBudgetMonths = Object.keys(audit.source.budgetMonthTotals)
    .filter((month) => !audit.imported.budgetMonthTotals[month]);
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

  const categoryDifferences = allBudgetMonthCategoryDifferences(audit);
  if (categoryDifferences.length > 0) {
    lines.push("Budget Month Category Differences");
    for (const row of categoryDifferences.slice(0, 40)) {
      lines.push(`  ${row.month} / ${row.categoryName}`);
      if (row.sourceCategoryId || row.importedCategoryId) {
        lines.push(`    IDs: source=${row.sourceCategoryId ?? "missing"}, imported=${row.importedCategoryId ?? "missing"}`);
      }
      lines.push(`    Assigned: source=${formatOptionalMoney(row.source?.assigned)}, imported=${formatOptionalMoney(row.imported?.assigned)}, delta=${row.delta.assigned.toFixed(2)}`);
      lines.push(`    Activity:  source=${formatOptionalMoney(row.source?.activity)}, imported=${formatOptionalMoney(row.imported?.activity)}, delta=${row.delta.activity.toFixed(2)}`);
      lines.push(`    Available: source=${formatOptionalMoney(row.source?.available)}, imported=${formatOptionalMoney(row.imported?.available)}, delta=${row.delta.available.toFixed(2)}`);
      appendActivityContributionBreakdown(lines, audit, row);
    }
    if (categoryDifferences.length > 40) {
      lines.push(`  ... ${categoryDifferences.length - 40} more category differences`);
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
  if (audit.source.closedAccountTransactions > 0 && audit.imported.closedAccountTransactions === 0) {
    lines.push("  - Closed-account transactions are probably not being persisted or associated with imported closed accounts.");
  }
  if (audit.imported.transactions < audit.source.transactions) {
    lines.push("  - Transaction history is incomplete. Check localStorage quota fallback/truncation and account-id mapping.");
  }
  if (audit.imported.budgetMonthViews < audit.source.monthlyBudgets) {
    lines.push("  - Budget month history is incomplete due to localStorage capping/compaction.");
  }
  if (audit.mismatches.some((mismatch) => mismatch.includes("budget month"))) {
    lines.push("  - Monthly budget mapping still differs from the YNAB4 source values.");
  }
  if (lines[lines.length - 1] === "Likely Cause Hints") {
    lines.push("  - No obvious mismatch hints were detected by the audit.");
  }

  return lines.join("\n");
}

function buildSourceAudit(data: RecordMap): Ynab4LauncherImportAccuracyAuditResult["source"] {
  const accounts = toRecords(data.accounts);
  const accountBySourceId = new Map<string, { name: string; closed: boolean }>();
  for (const [index, account] of accounts.entries()) {
    const name = firstString(account.name, account.accountName, account.displayName) ?? `Imported Account ${index + 1}`;
    const closed = isClosed(account);
    for (const sourceId of sourceIds(account, `account:${index}`)) {
      accountBySourceId.set(sourceId, { name, closed });
    }
  }

  const transactionsByAccountName: Record<string, number> = {};
  let transactions = 0;
  let openAccountTransactions = 0;
  let closedAccountTransactions = 0;

  for (const transaction of toRecords(data.transactions)) {
    if (isDeleted(transaction)) continue;
    const accountId = firstString(transaction.accountId, transaction.accountEntityId);
    const account = accountId ? accountBySourceId.get(accountId) : undefined;
    const accountName = account?.name ?? "Unknown Account";
    transactions += 1;
    transactionsByAccountName[accountName] = (transactionsByAccountName[accountName] ?? 0) + 1;
    if (account?.closed) closedAccountTransactions += 1;
    else openAccountTransactions += 1;
  }

  const categoryGroups = toRecords(data.masterCategories);
  const categories = categoryGroups.reduce((sum, group) => sum + toRecords(group.subCategories).length, 0);
  const monthlyBudgets = toRecords(data.monthlyBudgets);

  return {
    accounts: accounts.length,
    openAccounts: accounts.filter((account) => !isClosed(account)).length,
    closedAccounts: accounts.filter(isClosed).length,
    transactions,
    openAccountTransactions,
    closedAccountTransactions,
    scheduledTransactions: toRecords(data.scheduledTransactions).filter((transaction) => !isDeleted(transaction)).length,
    categoryGroups: categoryGroups.length,
    categories,
    monthlyBudgets: monthlyBudgets.length,
    budgetMonthTotals: Object.fromEntries(
      monthlyBudgets.map((month) => [sourceMonthKey(month), sourceBudgetMonthTotals(month)]),
    ),
    budgetMonthCategoryValues: Object.fromEntries(
      monthlyBudgets.map((month) => [sourceMonthKey(month), sourceBudgetMonthCategoryValues(month, categoryNameById(categoryGroups))]),
    ),
    budgetMonthCategoryActivityContributions: sourceBudgetMonthCategoryActivityContributions(data, accountBySourceId, categoryNameById(categoryGroups)),
    transactionsByAccountName,
  };
}

function buildImportedAudit(
  storage: KeyValueStoragePort,
  budgetId: string,
): Ynab4LauncherImportAccuracyAuditResult["imported"] {
  const accounts = readJson<SidebarAccount[]>(storage, getBudgetScopedStorageKey(budgetId, ACCOUNTS_STORAGE_KEY), []);
  const registers = readJson<Record<string, AccountRegisterView>>(storage, getBudgetScopedStorageKey(budgetId, REGISTERS_STORAGE_KEY), {});
  const scheduled = readJson<unknown[]>(storage, getBudgetScopedStorageKey(budgetId, SCHEDULED_STORAGE_KEY), []);
  const monthViews = readBudgetMonthViews(storage, budgetId);
  const accountById = new Map(accounts.map((account) => [account.id, account] as const));
  const transactionsByAccountName: Record<string, number> = {};
  let transactions = 0;
  let openAccountTransactions = 0;
  let closedAccountTransactions = 0;

  for (const register of Object.values(registers)) {
    const account = accountById.get(register.accountId);
    const count = register.transactions.length;
    transactions += count;
    transactionsByAccountName[account?.name ?? register.accountName] = count;
    if (account?.closedAt) closedAccountTransactions += count;
    else openAccountTransactions += count;
  }

  return {
    accounts: accounts.length,
    openAccounts: accounts.filter((account) => !account.closedAt).length,
    closedAccounts: accounts.filter((account) => Boolean(account.closedAt)).length,
    transactions,
    openAccountTransactions,
    closedAccountTransactions,
    scheduledTransactions: scheduled.length,
    budgetMonthViews: monthViews.length,
    budgetMonthTotals: Object.fromEntries(monthViews.map(({ month, view }) => [month, importedBudgetMonthTotals(view)])),
    budgetMonthCategoryValues: Object.fromEntries(monthViews.map(({ month, view }) => [month, importedBudgetMonthCategoryValues(view)])),
    budgetMonthCategoryActivityContributions: importedBudgetMonthCategoryActivityContributions(registers),
    transactionsByAccountName,
  };
}

function readBudgetMonthViews(storage: KeyValueStoragePort, budgetId: string): Array<{ month: string; view: BudgetMonthView }> {
  const prefix = `${BUDGET_VIEW_STORAGE_PREFIX}.${budgetId}.`;
  const keys = storage.listKeys?.() ?? [];
  return keys
    .filter((key) => key.startsWith(prefix))
    .sort()
    .flatMap((key) => {
      const view = readJson<BudgetMonthView | null>(storage, key, null);
      return view ? [{ month: key.slice(prefix.length), view }] : [];
    });
}

function sourceBudgetMonthTotals(month: RecordMap): BudgetMonthTotals {
  return sumBudgetMonthCategoryValues(Object.values(sourceBudgetMonthCategoryValues(month, new Map())));
}

function sourceBudgetMonthCategoryValues(
  month: RecordMap,
  categoryNamesById: Map<string, string>,
): Record<string, BudgetMonthCategoryValues> {
  const values: Record<string, BudgetMonthCategoryValues> = {};
  for (const row of toRecords(month.monthlySubCategoryBudgets)) {
    const categoryId = firstString(row.categoryId, row.subCategoryId, row.categoryEntityId);
    const categoryName = firstString(row.categoryName, row.name) ?? (categoryId ? categoryNamesById.get(categoryId) : null) ?? "Unknown Category";
    const key = categoryAuditKey(categoryName);
    values[key] = {
      categoryId,
      categoryName,
      assigned: roundMoney((values[key]?.assigned ?? 0) + (amountToDisplayUnits(row.budgeted, row.assigned) ?? 0)),
      activity: roundMoney((values[key]?.activity ?? 0) + (amountToDisplayUnits(row.activity) ?? -Math.abs(amountToDisplayUnits(row.outflows) ?? 0))),
      available: roundMoney((values[key]?.available ?? 0) + (amountToDisplayUnits(row.balance, row.available) ?? 0)),
    };
  }
  return values;
}

function importedBudgetMonthTotals(view: BudgetMonthView): BudgetMonthTotals {
  return sumBudgetMonthCategoryValues(Object.values(importedBudgetMonthCategoryValues(view)));
}

function importedBudgetMonthCategoryValues(view: BudgetMonthView): Record<string, BudgetMonthCategoryValues> {
  const values: Record<string, BudgetMonthCategoryValues> = {};
  for (const group of view.categoryGroups) {
    for (const category of group.categories) {
      const key = categoryAuditKey(category.name);
      values[key] = {
        categoryId: category.id,
        categoryName: category.name,
        assigned: roundMoney((values[key]?.assigned ?? 0) + category.assigned),
        activity: roundMoney((values[key]?.activity ?? 0) + category.activity),
        available: roundMoney((values[key]?.available ?? 0) + category.available),
      };
    }
  }
  return values;
}


function sourceBudgetMonthCategoryActivityContributions(
  data: RecordMap,
  accountBySourceId: Map<string, { name: string; closed: boolean }>,
  categoryNamesById: Map<string, string>,
): Record<string, Record<string, BudgetActivityContribution[]>> {
  const contributions: Record<string, Record<string, BudgetActivityContribution[]>> = {};
  for (const transaction of toRecords(data.transactions)) {
    if (isDeleted(transaction)) continue;
    const month = monthKey(firstString(transaction.date, transaction.dateString, transaction.acceptedDate));
    if (!month) continue;
    const accountId = firstString(transaction.accountId, transaction.accountEntityId);
    const accountName = (accountId ? accountBySourceId.get(accountId)?.name : null) ?? "Unknown Account";
    const transactionId = firstString(transaction.entityId, transaction.id, transaction.transactionId) ?? "unknown-transaction";
    const payee = firstString(transaction.payeeName, transaction.payee) ?? "Imported Payee";
    const memo = firstString(transaction.memo, transaction.note, transaction.notes);
    const splitLines = toRecords(transaction.subTransactions);

    if (splitLines.length > 0) {
      for (const [index, line] of splitLines.entries()) {
        const categoryId = firstString(line.categoryId, line.subCategoryId, line.categoryEntityId);
        if (!categoryId) continue;
        const amount = amountToDisplayUnits(line.amount, line.amountMilliUnits, line.inflow, line.outflow) ?? 0;
        addActivityContribution(contributions, month, {
          id: firstString(line.entityId, line.id) ?? `${transactionId}:split:${index + 1}`,
          date: monthDate(firstString(transaction.date, transaction.dateString, transaction.acceptedDate)) ?? `${month}-01`,
          accountName,
          payee,
          memo: firstString(line.memo, line.note, line.notes) ?? memo,
          categoryId,
          categoryName: categoryNamesById.get(categoryId) ?? firstString(line.categoryName, line.name) ?? "Unknown Category",
          amount,
          source: "split",
        });
      }
      continue;
    }

    const categoryId = firstString(transaction.categoryId, transaction.subCategoryId, transaction.categoryEntityId);
    if (!categoryId) continue;
    const amount = amountToDisplayUnits(transaction.amount, transaction.amountMilliUnits, transaction.inflow, transaction.outflow) ?? 0;
    addActivityContribution(contributions, month, {
      id: transactionId,
      date: monthDate(firstString(transaction.date, transaction.dateString, transaction.acceptedDate)) ?? `${month}-01`,
      accountName,
      payee,
      memo,
      categoryId,
      categoryName: categoryNamesById.get(categoryId) ?? firstString(transaction.categoryName, transaction.name) ?? "Unknown Category",
      amount,
      source: "transaction",
    });
  }
  return contributions;
}

function importedBudgetMonthCategoryActivityContributions(
  registers: Record<string, AccountRegisterView>,
): Record<string, Record<string, BudgetActivityContribution[]>> {
  const contributions: Record<string, Record<string, BudgetActivityContribution[]>> = {};
  for (const register of Object.values(registers)) {
    for (const transaction of register.transactions) {
      const month = monthKey(transaction.date);
      if (!month) continue;
      if (transaction.splitLines && transaction.splitLines.length > 0) {
        for (const splitLine of transaction.splitLines) {
          const categoryName = splitLine.category || "Unknown Category";
          addActivityContribution(contributions, month, {
            id: splitLine.id,
            date: transaction.date,
            accountName: register.accountName,
            payee: transaction.payee,
            memo: splitLine.memo ?? transaction.memo ?? null,
            categoryId: splitLine.categoryId ?? null,
            categoryName,
            amount: roundMoney(splitLine.inflow - splitLine.outflow),
            source: "split",
          });
        }
        continue;
      }
      const categoryName = transaction.category || "Unknown Category";
      addActivityContribution(contributions, month, {
        id: transaction.id,
        date: transaction.date,
        accountName: register.accountName,
        payee: transaction.payee,
        memo: transaction.memo ?? null,
        categoryId: transaction.categoryId ?? null,
        categoryName,
        amount: roundMoney(transaction.inflow - transaction.outflow),
        source: "transaction",
      });
    }
  }
  return contributions;
}

function addActivityContribution(
  contributions: Record<string, Record<string, BudgetActivityContribution[]>>,
  month: string,
  contribution: BudgetActivityContribution,
): void {
  const monthContributions = contributions[month] ?? {};
  const key = categoryAuditKey(contribution.categoryName);
  const categoryContributions = monthContributions[key] ?? [];
  categoryContributions.push({ ...contribution, amount: roundMoney(contribution.amount) });
  categoryContributions.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  monthContributions[key] = categoryContributions;
  contributions[month] = monthContributions;
}

function appendActivityContributionBreakdown(
  lines: string[],
  audit: Ynab4LauncherImportAccuracyAuditResult,
  row: BudgetMonthCategoryDifference,
): void {
  if (Math.abs(row.delta.activity) <= MONEY_AUDIT_TOLERANCE) return;
  const sourceContributions = audit.source.budgetMonthCategoryActivityContributions[row.month]?.[row.categoryKey] ?? [];
  const importedContributions = audit.imported.budgetMonthCategoryActivityContributions[row.month]?.[row.categoryKey] ?? [];
  const sourceTransactionActivity = roundMoney(sourceContributions.reduce((sum, contribution) => sum + contribution.amount, 0));
  const importedTransactionActivity = roundMoney(importedContributions.reduce((sum, contribution) => sum + contribution.amount, 0));
  const transactionDelta = roundMoney(importedTransactionActivity - sourceTransactionActivity);

  lines.push(`    Transaction Activity: source=${sourceTransactionActivity.toFixed(2)}, imported=${importedTransactionActivity.toFixed(2)}, delta=${transactionDelta.toFixed(2)}`);
  appendContributionList(lines, "Source Transactions", sourceContributions);
  appendContributionList(lines, "Imported Transactions", importedContributions);
}

function appendContributionList(lines: string[], label: string, contributions: BudgetActivityContribution[]): void {
  lines.push(`    ${label}:`);
  if (contributions.length === 0) {
    lines.push("      none");
    return;
  }
  for (const contribution of contributions.slice(0, 10)) {
    const memo = contribution.memo ? ` memo=${contribution.memo}` : "";
    lines.push(`      ${contribution.date} ${contribution.accountName} ${contribution.payee} ${contribution.amount.toFixed(2)} [${contribution.source}]${memo}`);
  }
  if (contributions.length > 10) {
    lines.push(`      ... ${contributions.length - 10} more`);
  }
}

function sumBudgetMonthCategoryValues(values: BudgetMonthTotals[]): BudgetMonthTotals {
  return {
    assigned: roundMoney(values.reduce((sum, row) => sum + row.assigned, 0)),
    activity: roundMoney(values.reduce((sum, row) => sum + row.activity, 0)),
    available: roundMoney(values.reduce((sum, row) => sum + row.available, 0)),
  };
}

function categoryNameById(categoryGroups: RecordMap[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const group of categoryGroups) {
    for (const category of toRecords(group.subCategories)) {
      const name = firstString(category.name, category.categoryName, category.displayName);
      if (!name) continue;
      for (const id of sourceIds(category, `category:${names.size + 1}`)) {
        names.set(id, name);
      }
    }
  }
  return names;
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
        assigned: roundMoney((importedValues?.assigned ?? 0) - (sourceValues?.assigned ?? 0)),
        activity: roundMoney((importedValues?.activity ?? 0) - (sourceValues?.activity ?? 0)),
        available: roundMoney((importedValues?.available ?? 0) - (sourceValues?.available ?? 0)),
      };
      return {
        month,
        categoryKey,
        categoryName: importedValues?.categoryName ?? sourceValues?.categoryName ?? categoryKey,
        sourceCategoryId: sourceValues?.categoryId ?? null,
        importedCategoryId: importedValues?.categoryId ?? null,
        source: sourceValues,
        imported: importedValues,
        delta,
      };
    })
    .filter((difference) =>
      Math.abs(difference.delta.assigned) > MONEY_AUDIT_TOLERANCE
      || Math.abs(difference.delta.activity) > MONEY_AUDIT_TOLERANCE
      || Math.abs(difference.delta.available) > MONEY_AUDIT_TOLERANCE,
    )
    .sort((a, b) => differenceMagnitude(b) - differenceMagnitude(a) || a.month.localeCompare(b.month) || a.categoryName.localeCompare(b.categoryName));
}

function allBudgetMonthCategoryDifferences(audit: Ynab4LauncherImportAccuracyAuditResult): BudgetMonthCategoryDifference[] {
  const months = new Set([
    ...Object.keys(audit.source.budgetMonthCategoryValues),
    ...Object.keys(audit.imported.budgetMonthCategoryValues),
  ]);
  return [...months].flatMap((month) =>
    budgetMonthCategoryDifferences(
      audit.source.budgetMonthCategoryValues[month] ?? {},
      audit.imported.budgetMonthCategoryValues[month] ?? {},
      month,
    ),
  ).sort((a, b) => differenceMagnitude(b) - differenceMagnitude(a) || a.month.localeCompare(b.month) || a.categoryName.localeCompare(b.categoryName));
}

function differenceMagnitude(difference: BudgetMonthCategoryDifference): number {
  return Math.abs(difference.delta.assigned) + Math.abs(difference.delta.activity) + Math.abs(difference.delta.available);
}

function categoryAuditKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatOptionalMoney(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "missing";
}

function compareCount(mismatches: string[], label: string, source: number, imported: number): void {
  if (source !== imported) {
    mismatches.push(`${label} mismatch: source=${source}, imported=${imported}.`);
  }
}

const MONEY_AUDIT_TOLERANCE = 0.015;

function compareMoney(mismatches: string[], label: string, source: number, imported: number): void {
  if (Math.abs(source - imported) > MONEY_AUDIT_TOLERANCE) {
    mismatches.push(`${label} mismatch: source=${source.toFixed(2)}, imported=${imported.toFixed(2)}.`);
  }
}

function readJson<T>(storage: KeyValueStoragePort, key: string, fallback: T): T {
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readActiveYnab4BudgetData(entries: Ynab4PackageEntry[]): RecordMap | null {
  const normalisedEntries = entries.map((entry) => ({ path: normalisePath(entry.path), text: entry.text }));
  const metadataEntry = normalisedEntries.find((entry) => entry.path.endsWith("/Budget.ymeta") || entry.path === "Budget.ymeta");
  if (!metadataEntry) return null;

  let metadata: RecordMap;
  try {
    metadata = JSON.parse(metadataEntry.text) as RecordMap;
  } catch {
    return null;
  }

  const relativeDataFolderName = firstString(metadata.relativeDataFolderName);
  if (!relativeDataFolderName) return null;

  const packageRoot = inferPackageRoot(metadataEntry.path);
  const activeDataFolderPath = packageRoot ? `${packageRoot}/${relativeDataFolderName}` : relativeDataFolderName;
  const activePrefix = `${activeDataFolderPath}/`;
  const budgetDataEntry = normalisedEntries
    .filter((entry) => entry.path.startsWith(activePrefix))
    .find((entry) => entry.path.endsWith("/Budget.yfull") || entry.path.endsWith("/Budget.json"));

  if (!budgetDataEntry) return null;

  try {
    const parsed = JSON.parse(budgetDataEntry.text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sourceMonthKey(month: RecordMap): string {
  return monthKey(firstString(month.month, month.date, month.monthName)) ?? "unknown-month";
}

function amountToDisplayUnits(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value * 100) / 100;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[$,]/g, ""));
      if (Number.isFinite(parsed)) return Math.round(parsed * 100) / 100;
    }
  }
  return null;
}

function sourceIds(record: RecordMap, fallback: string): string[] {
  const ids = [
    firstString(record.entityId),
    firstString(record.id),
    firstString(record.accountId),
    firstString(record.categoryId),
    firstString(record.masterCategoryId),
    firstString(record.payeeId),
  ].filter((value): value is string => Boolean(value));
  return ids.length > 0 ? ids : [fallback];
}

function isClosed(record: RecordMap): boolean {
  return record.isTombstone === true || record.closed === true;
}

function isDeleted(record: RecordMap): boolean {
  return record.isTombstone === true || record.deleted === true;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
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

function normalisePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function inferPackageRoot(path: string): string | null {
  const parts = normalisePath(path).split("/");
  return parts.length > 1 ? parts[0] || null : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
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
    budgetMonthTotals: {},
    budgetMonthCategoryValues: {},
    budgetMonthCategoryActivityContributions: {},
    transactionsByAccountName: {},
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
  };
}
