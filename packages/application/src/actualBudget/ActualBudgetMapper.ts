import type {
  BankImportIssue,
  FullBudgetImportPreviewAccount,
  FullBudgetImportPreviewCategory,
  FullBudgetImportPreviewCategoryGroup,
  FullBudgetImportPreviewPayee,
  FullBudgetImportPreviewSplitLine,
  FullBudgetImportPreviewTransaction,
  FullBudgetImportPreviewBudgetMonth,
} from "../../../types/src/index.js";
import type { ActualSQLiteRepository, ActualSQLiteTableRow, ActualSQLiteValue } from "./ActualSQLiteRepository.js";

export interface ActualBudgetMappingResult {
  accounts: FullBudgetImportPreviewAccount[];
  categoryGroups: FullBudgetImportPreviewCategoryGroup[];
  categories: FullBudgetImportPreviewCategory[];
  payees: FullBudgetImportPreviewPayee[];
  transactions: FullBudgetImportPreviewTransaction[];
  budgetMonths: FullBudgetImportPreviewBudgetMonth[];
  transferCount: number;
  issues: BankImportIssue[];
}

const ACTUAL_TABLES = {
  accounts: "accounts",
  categoryGroups: "category_groups",
  categories: "categories",
  payees: "payees",
  transactions: "transactions",
  budgetMonths: "zero_budgets",
} as const;

export function mapActualSQLiteRepositoryToFullBudgetPreview(repository: ActualSQLiteRepository): ActualBudgetMappingResult {
  const issues: BankImportIssue[] = [];
  const accountsRead = readTable(repository, ACTUAL_TABLES.accounts, issues);
  const categoryGroupsRead = readTable(repository, ACTUAL_TABLES.categoryGroups, issues);
  const categoriesRead = readTable(repository, ACTUAL_TABLES.categories, issues);
  const payeesRead = readTable(repository, ACTUAL_TABLES.payees, issues);
  const transactionsRead = readTable(repository, ACTUAL_TABLES.transactions, issues);
  const budgetMonthsRead = readTable(repository, ACTUAL_TABLES.budgetMonths, issues);

  const accounts = accountsRead.map((row, index) => mapAccount(row, index));
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const categoryGroups = categoryGroupsRead.map((row, index) => mapCategoryGroup(row, index));
  const categoryGroupById = new Map(categoryGroups.map((group) => [group.id, group]));

  const categories = categoriesRead.map((row, index) => mapCategory(row, index, categoryGroupById));
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const payees = payeesRead.map((row, index) => mapPayee(row, index, accountById));
  const payeeById = new Map(payees.map((payee) => [payee.id, payee]));
  const transferAccountByPayeeId = new Map(
    payeesRead
      .map((row, index): [string, string] | null => {
        const id = readString(row, ["id"], `actual-payee-${index + 1}`);
        const transferAccountId = readOptionalString(row, ["transfer_acct", "transferAcct", "transferAccountId"]);
        return id && transferAccountId ? [id, transferAccountId] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );

  const budgetMonths = budgetMonthsRead.map((row, index) => mapBudgetMonth(row, index, categoryById));

  const mappedTransactionRows = transactionsRead.map((row, index) =>
    mapTransaction(row, index, accountById, categoryById, payeeById, transferAccountByPayeeId),
  );
  const splitLinesByParentId = new Map<string, FullBudgetImportPreviewSplitLine[]>();

  for (const transaction of mappedTransactionRows) {
    if (transaction.isChild && transaction.parentId) {
      const splitLine = mapSplitLineFromChildTransaction(transaction);
      splitLinesByParentId.set(transaction.parentId, [
        ...(splitLinesByParentId.get(transaction.parentId) ?? []),
        splitLine,
      ]);
    }
  }

  const transactions = mappedTransactionRows
    .filter((transaction) => !transaction.isChild)
    .map((transaction) => {
      const splitLines = splitLinesByParentId.get(transaction.id) ?? [];
      return stripActualTransactionMetadata({
        ...transaction,
        splitLines: splitLines.length > 0 ? splitLines : undefined,
      });
    });

  for (const transaction of transactions) {
    if (transaction.accountId && !accountById.has(transaction.accountId)) {
      issues.push({ rowNumber: null, severity: "warning", code: "ActualUnknownAccountReference", message: `Actual transaction ${transaction.id} references unknown account ${transaction.accountId}.` });
    }
    if (transaction.categoryId && !categoryById.has(transaction.categoryId)) {
      issues.push({ rowNumber: null, severity: "warning", code: "ActualUnknownCategoryReference", message: `Actual transaction ${transaction.id} references unknown category ${transaction.categoryId}.` });
    }
    if (transaction.payeeId && !payeeById.has(transaction.payeeId)) {
      issues.push({ rowNumber: null, severity: "warning", code: "ActualUnknownPayeeReference", message: `Actual transaction ${transaction.id} references unknown payee ${transaction.payeeId}.` });
    }
  }

  const orphanSplitLineCount = [...splitLinesByParentId.keys()].filter(
    (parentId) => !mappedTransactionRows.some((transaction) => transaction.id === parentId),
  ).length;
  if (orphanSplitLineCount > 0) {
    issues.push({
      rowNumber: null,
      severity: "warning",
      code: "ActualOrphanSplitChildren",
      message: `${orphanSplitLineCount} Actual split parent references could not be resolved and were not imported as split lines.`,
    });
  }

  return {
    accounts,
    categoryGroups,
    categories,
    payees,
    transactions,
    budgetMonths,
    transferCount: transactions.filter((transaction) => transaction.isTransfer).length,
    issues,
  };
}

function readTable(repository: ActualSQLiteRepository, tableName: string, issues: BankImportIssue[]): ActualSQLiteTableRow[] {
  const result = repository.readTableRows(tableName);
  for (const issue of result.issues) {
    issues.push({ rowNumber: null, severity: "warning", code: "ActualSQLiteTableReadWarning", message: issue });
  }
  return result.rows;
}

function mapAccount(row: ActualSQLiteTableRow, index: number): FullBudgetImportPreviewAccount {
  const id = readString(row, ["id"], `actual-account-${index + 1}`);
  return {
    id,
    name: readString(row, ["name"], id),
    type: readOptionalString(row, ["type", "accountType"]),
    closed: readBoolean(row, ["closed", "is_closed", "isClosed"]),
    offBudget: readBoolean(row, ["offbudget", "offBudget", "off_budget"]),
  };
}

function mapCategoryGroup(row: ActualSQLiteTableRow, index: number): FullBudgetImportPreviewCategoryGroup {
  const id = readString(row, ["id"], `actual-category-group-${index + 1}`);
  return {
    id,
    name: readString(row, ["name"], id),
    hidden: readBoolean(row, ["hidden", "is_hidden", "isHidden"]),
    isIncome: readBoolean(row, ["is_income", "isIncome", "income"]),
    sortOrder: readOptionalNumber(row, ["sort_order", "sortOrder", "sort"]),
  };
}

function mapCategory(row: ActualSQLiteTableRow, index: number, categoryGroupById: Map<string, FullBudgetImportPreviewCategoryGroup>): FullBudgetImportPreviewCategory {
  const id = readString(row, ["id"], `actual-category-${index + 1}`);
  const groupId = readOptionalString(row, ["cat_group", "group", "groupId", "categoryGroupId"]);
  return {
    id,
    name: readString(row, ["name"], id),
    groupId,
    groupName: groupId ? categoryGroupById.get(groupId)?.name ?? null : null,
    hidden: readBoolean(row, ["hidden", "is_hidden", "isHidden"]),
    isIncome: readBoolean(row, ["is_income", "isIncome", "income"]),
    sortOrder: readOptionalNumber(row, ["sort_order", "sortOrder", "sort"]),
  };
}


function mapBudgetMonth(
  row: ActualSQLiteTableRow,
  index: number,
  categoryById: Map<string, FullBudgetImportPreviewCategory>,
): FullBudgetImportPreviewBudgetMonth {
  const categoryId = readOptionalString(row, ["category", "categoryId", "cat"]);
  return {
    id: readString(row, ["id"], `actual-budget-month-${index + 1}`),
    month: readActualMonth(row, ["month"]),
    categoryId,
    assigned: readOptionalNumber(row, ["amount"]),
    carryover: readOptionalNumber(row, ["carryover"]),
  };
}

function mapPayee(
  row: ActualSQLiteTableRow,
  index: number,
  accountById: Map<string, FullBudgetImportPreviewAccount>,
): FullBudgetImportPreviewPayee {
  const id = readString(row, ["id"], `actual-payee-${index + 1}`);
  const explicitName = readOptionalString(row, ["name"]);
  const transferAccountId = readOptionalString(row, ["transfer_acct", "transferAcct", "transferAccountId"]);
  const transferAccountName = transferAccountId ? accountById.get(transferAccountId)?.name ?? null : null;
  return {
    id,
    name: explicitName ?? (transferAccountName ? `Transfer: ${transferAccountName}` : id),
  };
}

function mapTransaction(
  row: ActualSQLiteTableRow,
  index: number,
  accountById: Map<string, FullBudgetImportPreviewAccount>,
  categoryById: Map<string, FullBudgetImportPreviewCategory>,
  payeeById: Map<string, FullBudgetImportPreviewPayee>,
  transferAccountByPayeeId: Map<string, string>,
): ActualMappedTransaction {
  const id = readString(row, ["id"], `actual-transaction-${index + 1}`);
  const accountId = readOptionalString(row, ["acct", "account", "accountId"]);
  const categoryId = readOptionalString(row, ["category", "categoryId", "cat"]);
  const payeeId = readOptionalString(row, ["payee", "payeeId", "description"]);
  const transferAccountId = payeeId ? transferAccountByPayeeId.get(payeeId) ?? null : null;
  const importedPayee = readOptionalString(row, ["imported_payee", "importedPayee", "imported_description", "importedDescription"]);
  return {
    id,
    accountId,
    accountName: accountId ? accountById.get(accountId)?.name ?? null : null,
    date: readActualDate(row, ["date"]),
    amount: readOptionalNumber(row, ["amount"]),
    payeeId,
    payeeName: resolveTransactionPayeeName(payeeId, payeeById, importedPayee),
    categoryId,
    categoryName: categoryId ? categoryById.get(categoryId)?.name ?? null : null,
    memo: readOptionalString(row, ["notes", "note", "memo"]),
    cleared: readOptionalBoolean(row, ["cleared", "is_cleared", "isCleared"]),
    transferId: transferAccountId,
    isTransfer: Boolean(transferAccountId),
    isParent: readBoolean(row, ["isParent", "is_parent", "is_parent_transaction"]),
    isChild: readBoolean(row, ["isChild", "is_child", "is_split_child"]),
    parentId: readOptionalString(row, ["parent_id", "parentId", "parent"]),
  };
}

interface ActualMappedTransaction extends FullBudgetImportPreviewTransaction {
  isParent: boolean;
  isChild: boolean;
  parentId: string | null;
}

function mapSplitLineFromChildTransaction(transaction: ActualMappedTransaction): FullBudgetImportPreviewSplitLine {
  return {
    id: transaction.id,
    categoryId: transaction.categoryId,
    categoryName: transaction.categoryName,
    memo: transaction.memo,
    amount: transaction.amount,
  };
}

function stripActualTransactionMetadata(transaction: ActualMappedTransaction): FullBudgetImportPreviewTransaction {
  const { isParent: _isParent, isChild: _isChild, parentId: _parentId, ...previewTransaction } = transaction;
  return previewTransaction;
}

function resolveTransactionPayeeName(
  payeeId: string | null,
  payeeById: Map<string, FullBudgetImportPreviewPayee>,
  importedPayee: string | null,
): string | null {
  if (!payeeId) return importedPayee;
  const resolvedPayeeName = payeeById.get(payeeId)?.name ?? null;
  if (!resolvedPayeeName || resolvedPayeeName === payeeId) return importedPayee ?? resolvedPayeeName;
  return resolvedPayeeName;
}


function readActualMonth(row: ActualSQLiteTableRow, names: string[]): string {
  const raw = readOptionalValue(row, names);
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const text = String(Math.trunc(raw));
    if (/^\d{6}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}`;
  }
  if (typeof raw === "string") {
    if (/^\d{6}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}`;
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  }
  return "1970-01";
}

function readActualDate(row: ActualSQLiteTableRow, names: string[]): string | null {
  const raw = readOptionalValue(row, names);
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const text = String(raw);
    if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  if (typeof raw === "string") {
    if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  }
  return null;
}

function readString(row: ActualSQLiteTableRow, names: string[], fallback: string): string {
  return readOptionalString(row, names) ?? fallback;
}

function readOptionalString(row: ActualSQLiteTableRow, names: string[]): string | null {
  const value = readOptionalValue(row, names);
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readOptionalNumber(row: ActualSQLiteTableRow, names: string[]): number | null {
  const value = readOptionalValue(row, names);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function readBoolean(row: ActualSQLiteTableRow, names: string[]): boolean {
  return readOptionalBoolean(row, names) ?? false;
}

function readOptionalBoolean(row: ActualSQLiteTableRow, names: string[]): boolean | null {
  const value = readOptionalValue(row, names);
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "cleared"].includes(normalized)) return true;
    if (["false", "no", "0", "uncleared"].includes(normalized)) return false;
  }
  return null;
}

function readOptionalValue(row: ActualSQLiteTableRow, names: string[]): ActualSQLiteValue | undefined {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row.values, name)) return row.values[name];
  }
  return undefined;
}
