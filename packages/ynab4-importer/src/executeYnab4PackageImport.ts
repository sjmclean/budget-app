import { randomUUID } from "crypto";
import {
  accounts,
  budgetMonths,
  budgets,
  categories,
  categoryGroups,
  categoryMonths,
  importMaps,
  importRuns,
  payees,
  scheduledTransactions,
  transactionNotes,
  transactions,
} from "../../database/src/schema.js";
import { AccountType } from "../../types/src/AccountType.js";
import { BudgetParticipation } from "../../types/src/BudgetParticipation.js";
import { ClearedStatus } from "../../types/src/ClearedStatus.js";
import { ImportSource } from "../../types/src/ImportRun.js";
import { TransactionType } from "../../types/src/TransactionType.js";
import { normalizePayeeName } from "../../budget-engine/src/services/payeeNormalization.js";
import { discoverYnab4Package, type Ynab4PackageEntry } from "./analyzeYnab4Package.js";
import { proveYnab4TransferCreditCardMigration } from "./proveYnab4TransferCreditCardMigration.js";

export type Ynab4PackageImportExecutionOptions = {
  userId?: string;
  currency?: string;
  sourceFileName?: string | null;
  now?: Date;
};

export type Ynab4PackageImportExecutionResult = {
  budgetId: string;
  budgetName: string;
  importRunId: string;
  status: "completed";
  created: {
    budgets: number;
    accounts: number;
    categoryGroups: number;
    categories: number;
    payees: number;
    transactions: number;
    scheduledTransactions: number;
    budgetMonths: number;
    categoryMonths: number;
    transactionNotes: number;
    importMaps: number;
  };
  skipped: {
    transferPayeesAsOrdinaryPayees: number;
    transactions: number;
    scheduledTransactions: number;
    categoryMonths: number;
  };
  warnings: string[];
};

type Ynab4PackageMetadata = {
  relativeDataFolderName?: unknown;
};

type ImportContext = {
  db: any;
  budgetId: string;
  importRunId: string;
  now: Date;
  created: Ynab4PackageImportExecutionResult["created"];
  importMapRows: Array<typeof importMaps.$inferInsert>;
};

/**
 * v1.69 write-import entry point.
 *
 * This deliberately creates a brand-new budget. It does not replace or mutate the
 * active budget, and it does not include launcher/progress UI wiring yet.
 */
export function executeYnab4PackageImportToNewBudget(
  db: any,
  entries: Ynab4PackageEntry[],
  options: Ynab4PackageImportExecutionOptions = {},
): Ynab4PackageImportExecutionResult {
  const discovery = discoverYnab4Package(entries);
  if (!discovery.isYnab4Package || discovery.warnings.length > 0) {
    throw new Error(
      `Cannot execute YNAB4 import: ${discovery.warnings.join(" ") || "package discovery failed."}`,
    );
  }

  const transferCreditCardProof = proveYnab4TransferCreditCardMigration(entries);
  if (!transferCreditCardProof.canProceedToWriteImport) {
    throw new Error(
      `Cannot execute YNAB4 import: ${transferCreditCardProof.blockers.join(" ")}`,
    );
  }

  const { data, warnings } = readActiveBudgetData(entries);
  if (!data) {
    throw new Error(`Cannot execute YNAB4 import: ${warnings.join(" ")}`);
  }

  const importBody = () => importWithoutOuterTransaction(db, data, discovery.budgetName ?? "Imported YNAB4 Budget", entries, options, [
    ...discovery.warnings,
    ...transferCreditCardProof.warnings,
    ...warnings,
  ]);

  if (typeof db.transaction === "function") {
    return db.transaction((tx: any) =>
      importWithoutOuterTransaction(tx, data, discovery.budgetName ?? "Imported YNAB4 Budget", entries, options, [
        ...discovery.warnings,
        ...transferCreditCardProof.warnings,
        ...warnings,
      ]),
    );
  }

  return importBody();
}

function importWithoutOuterTransaction(
  db: any,
  data: Record<string, unknown>,
  budgetName: string,
  entries: Ynab4PackageEntry[],
  options: Ynab4PackageImportExecutionOptions,
  warnings: string[],
): Ynab4PackageImportExecutionResult {
  const now = options.now ?? new Date();
  const budgetId = randomUUID();
  const importRunId = randomUUID();
  const created: Ynab4PackageImportExecutionResult["created"] = {
    budgets: 0,
    accounts: 0,
    categoryGroups: 0,
    categories: 0,
    payees: 0,
    transactions: 0,
    scheduledTransactions: 0,
    budgetMonths: 0,
    categoryMonths: 0,
    transactionNotes: 0,
    importMaps: 0,
  };
  const skipped: Ynab4PackageImportExecutionResult["skipped"] = {
    transferPayeesAsOrdinaryPayees: 0,
    transactions: 0,
    scheduledTransactions: 0,
    categoryMonths: 0,
  };

  db.insert(budgets).values({
    id: budgetId,
    name: budgetName,
    currency: options.currency ?? "AUD",
    createdAt: now,
  }).run();
  created.budgets++;

  const ctx: ImportContext = { db, budgetId, importRunId, now, created, importMapRows: [] };
  const accountIdMap = importAccounts(ctx, toRecords(data.accounts));
  const categoryIdMap = importCategories(ctx, toRecords(data.masterCategories));
  const payeeIdMap = importPayees(ctx, toRecords(data.payees), accountIdMap, skipped);
  importTransactions(ctx, toRecords(data.transactions), accountIdMap, categoryIdMap, payeeIdMap, skipped);
  importScheduledTransactions(ctx, toRecords(data.scheduledTransactions), accountIdMap, categoryIdMap, payeeIdMap, skipped);
  importMonthlyBudgets(ctx, toRecords(data.monthlyBudgets), categoryIdMap, skipped);

  db.insert(importRuns).values({
    id: importRunId,
    budgetId,
    userId: options.userId ?? "local-user",
    source: ImportSource.YNAB4,
    sourceFileName: options.sourceFileName ?? inferSourceFileName(entries),
    startedAt: now,
    completedAt: new Date(now.getTime()),
    status: "completed",
    summaryJson: JSON.stringify({ created, skipped, warnings }),
  }).run();

  for (const row of ctx.importMapRows) {
    db.insert(importMaps).values(row).run();
  }

  return {
    budgetId,
    budgetName,
    importRunId,
    status: "completed",
    created,
    skipped,
    warnings,
  };
}

function importAccounts(ctx: ImportContext, ynabAccounts: Record<string, unknown>[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [sortIndex, account] of ynabAccounts.entries()) {
    const sourceId = firstString(account.entityId, account.id, account.accountId) ?? `account:${sortIndex}`;
    const name = firstString(account.accountName, account.name, account.displayName) ?? `Imported Account ${sortIndex + 1}`;
    const id = randomUUID();
    dbInsert(ctx.db, accounts, {
      id,
      budgetId: ctx.budgetId,
      name,
      type: mapAccountType(firstString(account.accountType, account.type)),
      participation: account.onBudget === false ? BudgetParticipation.OffBudget : BudgetParticipation.OnBudget,
      openingBalance: toMinorUnits(account.startingBalance, account.balance, account.clearedBalance) ?? 0,
      currentBalance: toMinorUnits(account.balance, account.clearedBalance, account.workingBalance) ?? 0,
    });
    map.set(sourceId, id);
    ctx.created.accounts++;
    addImportMap(ctx, "account", sourceId, "account", id);
  }
  return map;
}

function importCategories(ctx: ImportContext, groups: Record<string, unknown>[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [groupSort, group] of groups.entries()) {
    const groupSourceId = firstString(group.entityId, group.id, group.masterCategoryId) ?? `categoryGroup:${groupSort}`;
    const groupId = randomUUID();
    dbInsert(ctx.db, categoryGroups, {
      id: groupId,
      budgetId: ctx.budgetId,
      name: firstString(group.name, group.masterCategoryName, group.displayName) ?? `Imported Group ${groupSort + 1}`,
      sortOrder: firstNumber(group.sortOrder, group.sortableIndex) ?? groupSort,
    });
    ctx.created.categoryGroups++;
    addImportMap(ctx, "categoryGroup", groupSourceId, "categoryGroup", groupId);

    const subCategories = toRecords(group.subCategories);
    for (const [categorySort, category] of subCategories.entries()) {
      const sourceId = firstString(category.entityId, category.id, category.categoryId) ?? `category:${groupSort}:${categorySort}`;
      const id = randomUUID();
      dbInsert(ctx.db, categories, {
        id,
        groupId,
        name: firstString(category.name, category.categoryName, category.displayName) ?? `Imported Category ${categorySort + 1}`,
        sortOrder: firstNumber(category.sortOrder, category.sortableIndex) ?? categorySort,
      });
      map.set(sourceId, id);
      ctx.created.categories++;
      addImportMap(ctx, "category", sourceId, "category", id);
    }
  }
  return map;
}

function importPayees(
  ctx: ImportContext,
  ynabPayees: Record<string, unknown>[],
  accountIdMap: Map<string, string>,
  skipped: Ynab4PackageImportExecutionResult["skipped"],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [index, payee] of ynabPayees.entries()) {
    const sourceId = firstString(payee.entityId, payee.id, payee.payeeId) ?? `payee:${index}`;
    const targetAccountId = firstString(payee.targetAccountId, payee.transferAccountId);
    const transferAccountId = targetAccountId ? accountIdMap.get(targetAccountId) ?? null : null;
    const isTransfer = Boolean(targetAccountId || firstString(payee.name, payee.payeeName)?.toLowerCase().startsWith("transfer :"));
    const name = firstString(payee.name, payee.payeeName, payee.displayName) ?? `Imported Payee ${index + 1}`;

    const id = randomUUID();
    dbInsert(ctx.db, payees, {
      id,
      budgetId: ctx.budgetId,
      name,
      normalizedName: normalizePayeeName(name),
      isArchived: payee.isTombstone === true || payee.hidden === true,
      isTransfer,
      transferAccountId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
    map.set(sourceId, id);
    ctx.created.payees++;
    addImportMap(ctx, isTransfer ? "transferPayee" : "payee", sourceId, "payee", id);
    if (isTransfer) skipped.transferPayeesAsOrdinaryPayees++;
  }
  return map;
}

function importTransactions(
  ctx: ImportContext,
  ynabTransactions: Record<string, unknown>[],
  accountIdMap: Map<string, string>,
  categoryIdMap: Map<string, string>,
  payeeIdMap: Map<string, string>,
  skipped: Ynab4PackageImportExecutionResult["skipped"],
): void {
  for (const [index, transaction] of ynabTransactions.entries()) {
    const sourceId = firstString(transaction.entityId, transaction.id, transaction.transactionId) ?? `transaction:${index}`;
    const accountId = getMappedId(accountIdMap, transaction.accountId);
    if (!accountId) {
      skipped.transactions++;
      continue;
    }
    const id = randomUUID();
    const memo = firstString(transaction.memo, transaction.note, transaction.notes);
    const type = determineTransactionType(transaction, payeeIdMap);
    dbInsert(ctx.db, transactions, {
      id,
      budgetId: ctx.budgetId,
      accountId,
      payeeId: getMappedId(payeeIdMap, transaction.payeeId),
      categoryId: type === TransactionType.Transfer ? null : getMappedId(categoryIdMap, transaction.categoryId, transaction.subCategoryId),
      transferAccountId: getMappedId(accountIdMap, transaction.targetAccountId, transaction.transferAccountId),
      type,
      date: normaliseDate(firstString(transaction.date, transaction.acceptedDate, transaction.dateString)) ?? "1970-01-01",
      memo,
      checkNumber: firstString(transaction.checkNumber, transaction.check, transaction.number),
      amount: toMinorUnits(transaction.amount, transaction.amountMilliUnits, transaction.inflow, transaction.outflow) ?? 0,
      clearedStatus: mapClearedStatus(firstString(transaction.cleared, transaction.clearedStatus, transaction.accepted) ?? ""),
      isDeleted: transaction.isTombstone === true || transaction.deleted === true,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
    ctx.created.transactions++;
    addImportMap(ctx, "transaction", sourceId, "transaction", id);

    if (memo) {
      dbInsert(ctx.db, transactionNotes, {
        id: randomUUID(),
        transactionId: id,
        note: memo,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      });
      ctx.created.transactionNotes++;
    }
  }
}

function importScheduledTransactions(
  ctx: ImportContext,
  ynabScheduledTransactions: Record<string, unknown>[],
  accountIdMap: Map<string, string>,
  categoryIdMap: Map<string, string>,
  payeeIdMap: Map<string, string>,
  skipped: Ynab4PackageImportExecutionResult["skipped"],
): void {
  for (const [index, scheduled] of ynabScheduledTransactions.entries()) {
    const sourceId = firstString(scheduled.entityId, scheduled.id, scheduled.scheduledTransactionId) ?? `scheduledTransaction:${index}`;
    const accountId = getMappedId(accountIdMap, scheduled.accountId);
    if (!accountId) {
      skipped.scheduledTransactions++;
      continue;
    }
    const id = randomUUID();
    const type = determineTransactionType(scheduled, payeeIdMap);
    dbInsert(ctx.db, scheduledTransactions, {
      id,
      budgetId: ctx.budgetId,
      accountId,
      payeeId: getMappedId(payeeIdMap, scheduled.payeeId),
      categoryId: type === TransactionType.Transfer ? null : getMappedId(categoryIdMap, scheduled.categoryId, scheduled.subCategoryId),
      transferAccountId: getMappedId(accountIdMap, scheduled.targetAccountId, scheduled.transferAccountId),
      type,
      amount: toMinorUnits(scheduled.amount, scheduled.amountMilliUnits, scheduled.inflow, scheduled.outflow) ?? 0,
      memo: firstString(scheduled.memo, scheduled.note, scheduled.notes),
      nextDueDate: normaliseDate(firstString(scheduled.nextDueDate, scheduled.date, scheduled.dateString)) ?? "1970-01-01",
      frequency: firstString(scheduled.frequency, scheduled.repeat, scheduled.recurrence) ?? "monthly",
      isActive: scheduled.isTombstone !== true && scheduled.deleted !== true,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
    ctx.created.scheduledTransactions++;
    addImportMap(ctx, "scheduledTransaction", sourceId, "scheduledTransaction", id);
  }
}

function importMonthlyBudgets(
  ctx: ImportContext,
  ynabMonthlyBudgets: Record<string, unknown>[],
  categoryIdMap: Map<string, string>,
  skipped: Ynab4PackageImportExecutionResult["skipped"],
): void {
  for (const [index, monthlyBudget] of ynabMonthlyBudgets.entries()) {
    const sourceId = firstString(monthlyBudget.entityId, monthlyBudget.id, monthlyBudget.monthlyBudgetId) ?? `monthlyBudget:${index}`;
    const month = monthKey(firstString(monthlyBudget.month, monthlyBudget.date, monthlyBudget.monthName) ?? "");
    if (!month) continue;
    const budgetMonthId = randomUUID();
    const categoryRows = toRecords(monthlyBudget.monthlySubCategoryBudgets);
    const assigned = categoryRows.reduce((sum, row) => sum + (toMinorUnits(row.budgeted, row.assigned) ?? 0), 0);
    const activity = categoryRows.reduce((sum, row) => sum + (toMinorUnits(row.activity) ?? -Math.abs(toMinorUnits(row.outflows) ?? 0)), 0);
    dbInsert(ctx.db, budgetMonths, {
      id: budgetMonthId,
      budgetId: ctx.budgetId,
      month,
      income: toMinorUnits(monthlyBudget.income, monthlyBudget.incomeAvailable) ?? 0,
      assigned,
      activity,
      readyToBudget: toMinorUnits(monthlyBudget.availableToBudget, monthlyBudget.buffered) ?? 0,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
    ctx.created.budgetMonths++;
    addImportMap(ctx, "monthlyBudget", sourceId, "budgetMonth", budgetMonthId);

    for (const [categoryIndex, row] of categoryRows.entries()) {
      const sourceCategoryId = firstString(row.categoryId, row.subCategoryId);
      const categoryId = sourceCategoryId ? categoryIdMap.get(sourceCategoryId) : undefined;
      if (!categoryId) {
        skipped.categoryMonths++;
        continue;
      }
      const categoryMonthId = randomUUID();
      dbInsert(ctx.db, categoryMonths, {
        id: categoryMonthId,
        budgetMonthId,
        categoryId,
        previousAvailable: toMinorUnits(row.previousAvailable, row.balancePreviousMonth) ?? 0,
        assigned: toMinorUnits(row.budgeted, row.assigned) ?? 0,
        activity: toMinorUnits(row.activity) ?? -Math.abs(toMinorUnits(row.outflows) ?? 0),
        available: toMinorUnits(row.balance, row.available) ?? 0,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      });
      ctx.created.categoryMonths++;
      addImportMap(ctx, "monthlyCategoryBudget", firstString(row.entityId, row.id) ?? `${sourceId}:${categoryIndex}`, "categoryMonth", categoryMonthId);
    }
  }
}

function addImportMap(ctx: ImportContext, sourceEntityType: string, sourceEntityId: string, targetEntityType: string, targetEntityId: string): void {
  ctx.importMapRows.push({
    id: randomUUID(),
    importRunId: ctx.importRunId,
    sourceEntityType,
    sourceEntityId,
    targetEntityType,
    targetEntityId,
    createdAt: ctx.now,
  });
  ctx.created.importMaps++;
}

function determineTransactionType(row: Record<string, unknown>, payeeIdMap: Map<string, string>): TransactionType {
  if (firstString(row.targetAccountId, row.transferAccountId, row.transferTransactionId)) return TransactionType.Transfer;
  const payeeId = firstString(row.payeeId);
  if (payeeId && payeeIdMap.has(payeeId)) {
    const payeeName = firstString(row.payeeName, row.payee);
    if (payeeName?.toLowerCase().startsWith("transfer :")) return TransactionType.Transfer;
  }
  if (toRecords(row.subTransactions).length > 0) return TransactionType.Split;
  const amount = toMinorUnits(row.amount, row.amountMilliUnits, row.inflow, row.outflow) ?? 0;
  return amount > 0 ? TransactionType.Income : TransactionType.Standard;
}

function mapAccountType(value: string | null): AccountType {
  const normalized = (value ?? "").replace(/[\s_-]/g, "").toLowerCase();
  if (["creditcard", "credit", "card"].includes(normalized)) return AccountType.CreditCard;
  if (["savings", "saving"].includes(normalized)) return AccountType.Savings;
  if (["cash", "wallet"].includes(normalized)) return AccountType.Cash;
  if (["investment", "brokerage"].includes(normalized)) return AccountType.Investment;
  if (["asset"].includes(normalized)) return AccountType.Asset;
  if (["liability", "loan", "mortgage"].includes(normalized)) return AccountType.Liability;
  return AccountType.Checking;
}

function mapClearedStatus(value: string): ClearedStatus {
  const normalized = value.trim().toLowerCase();
  if (normalized === "reconciled" || normalized === "accepted") return ClearedStatus.Reconciled;
  if (normalized === "cleared" || normalized === "true") return ClearedStatus.Cleared;
  return ClearedStatus.Uncleared;
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

function inferSourceFileName(entries: Ynab4PackageEntry[]): string | null {
  const metadataPath = entries.find((entry) => normalisePath(entry.path).endsWith("Budget.ymeta"))?.path;
  return metadataPath ? normalisePath(metadataPath).split("/")[0] ?? null : null;
}

function getMappedId(map: Map<string, string>, ...values: unknown[]): string | null {
  for (const value of values) {
    const key = firstString(value);
    if (key && map.has(key)) return map.get(key)!;
  }
  return null;
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

function normaliseDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
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

function dbInsert(db: any, table: any, values: Record<string, unknown>): void {
  db.insert(table).values(values).run();
}
