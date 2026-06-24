import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

const ACCOUNTS_STORAGE_KEY = "budget-app.accounts.v1";
const REGISTERS_STORAGE_KEY = "budget-app.account-registers.v1";
const BUDGET_VIEW_STORAGE_PREFIX = "budget-app.budget-view.v1";
const MONEY_TOLERANCE = 0.01;

export interface YnabBudgetCsvRow {
  month: string;
  categoryGroup: string;
  category: string;
  budgeted: number;
  activity: number;
  balance: number;
}

export interface Ynab4ReconciliationAuditInput {
  storage: KeyValueStoragePort;
  budgetId: string;
  budgetCsvText: string;
  month: string;
}

export interface Ynab4ReconciliationBudgetRow {
  month: string;
  categoryGroup: string;
  category: string;
  source: {
    budgeted: number;
    activity: number;
    balance: number;
  };
  imported: {
    budgeted: number | null;
    activity: number | null;
    balance: number | null;
  };
  status: "pass" | "fail" | "imported-missing";
}

export interface Ynab4ReconciliationCategoryStructureRow {
  categoryGroup: string;
  category: string;
  status: "pass" | "missing-imported";
}

export interface Ynab4ReconciliationAccountRow {
  accountName: string;
  sourceBalance: number | null;
  importedBalance: number | null;
  difference: number | null;
  sourceTransactionCount: number | null;
  importedTransactionCount: number | null;
  status: "pass" | "fail" | "source-missing" | "imported-missing";
}

export interface Ynab4ReconciliationAuditResult {
  status: "pass" | "fail";
  accounts: Ynab4ReconciliationAccountRow[];
  budgetRows: Ynab4ReconciliationBudgetRow[];
  categoryStructureRows: Ynab4ReconciliationCategoryStructureRow[];
  warnings: string[];
}

interface ImportedBudgetRow {
  categoryGroup: string;
  category: string;
  budgeted: number;
  activity: number;
  balance: number;
}

interface StoredAccount {
  id?: unknown;
  name?: unknown;
  balance?: unknown;
  closedAt?: unknown;
}

interface StoredRegister {
  accountId?: unknown;
  accountName?: unknown;
  transactions?: Array<{ amount?: unknown }>;
}

interface StoredBudgetViewCategory {
  name?: unknown;
  assigned?: unknown;
  budgeted?: unknown;
  activity?: unknown;
  available?: unknown;
  balance?: unknown;
}

interface StoredBudgetViewGroup {
  name?: unknown;
  categories?: StoredBudgetViewCategory[];
}

interface StoredBudgetView {
  categoryGroups?: StoredBudgetViewGroup[];
}

export function parseYnabBudgetCsv(csvText: string): YnabBudgetCsvRow[] {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) return [];

  const header = rows[0].map((cell) => cell.trim());
  const index = new Map(header.map((name, position) => [name, position] as const));

  return rows.slice(1).map((row) => {
    const categoryGroup = cell(row, index, "Master Category");
    const category = cell(row, index, "Sub Category");

    return {
      month: normaliseMonth(cell(row, index, "Month")),
      categoryGroup,
      category,
      budgeted: parseMoney(cell(row, index, "Budgeted")),
      activity: parseMoney(cell(row, index, "Outflows")),
      balance: parseMoney(cell(row, index, "Category Balance")),
    };
  });
}

export function createYnab4ReconciliationAudit(
  input: Ynab4ReconciliationAuditInput,
): Ynab4ReconciliationAuditResult {
  const sourceRows = parseYnabBudgetCsv(input.budgetCsvText).filter((row) => row.month === input.month);
  const importedRows = readImportedBudgetRows(input.storage, input.budgetId, input.month);
  const importedByKey = new Map(importedRows.map((row) => [budgetRowKey(row.categoryGroup, row.category), row]));

  const budgetRows: Ynab4ReconciliationBudgetRow[] = sourceRows.map((source) => {
    const imported = importedByKey.get(budgetRowKey(source.categoryGroup, source.category));
    if (!imported) {
      return {
        month: source.month,
        categoryGroup: source.categoryGroup,
        category: source.category,
        source: {
          budgeted: source.budgeted,
          activity: source.activity,
          balance: source.balance,
        },
        imported: {
          budgeted: null,
          activity: null,
          balance: null,
        },
        status: "imported-missing",
      };
    }

    const status = moneyMatches(source.budgeted, imported.budgeted)
      && moneyMatches(source.activity, imported.activity)
      && moneyMatches(source.balance, imported.balance)
      ? "pass"
      : "fail";

    return {
      month: source.month,
      categoryGroup: source.categoryGroup,
      category: source.category,
      source: {
        budgeted: source.budgeted,
        activity: source.activity,
        balance: source.balance,
      },
      imported: {
        budgeted: imported.budgeted,
        activity: imported.activity,
        balance: imported.balance,
      },
      status,
    };
  });

  const categoryStructureRows: Ynab4ReconciliationCategoryStructureRow[] = sourceRows.map((source) => ({
    categoryGroup: source.categoryGroup,
    category: source.category,
    status: importedByKey.has(budgetRowKey(source.categoryGroup, source.category)) ? "pass" : "missing-imported",
  }));

  const accounts = readImportedAccounts(input.storage, input.budgetId);
  const warnings: string[] = [];
  if (accounts.length > 0) {
    warnings.push("No YNAB4 package entries were provided; account source balances are unavailable.");
  }

  const hasBudgetFailures = budgetRows.some((row) => row.status !== "pass");
  const hasCategoryFailures = categoryStructureRows.some((row) => row.status !== "pass");

  return {
    status: hasBudgetFailures || hasCategoryFailures ? "fail" : "pass",
    accounts,
    budgetRows,
    categoryStructureRows,
    warnings,
  };
}

export function formatYnab4ReconciliationAuditReport(audit: Ynab4ReconciliationAuditResult): string {
  const lines: string[] = [];
  lines.push("v1.72.4 Account & Budget Reconciliation Audit");
  lines.push(`Status: ${audit.status.toUpperCase()}`);
  lines.push("");

  lines.push("Accounts");
  if (audit.accounts.length === 0) {
    lines.push("  No imported accounts found.");
  } else {
    for (const account of audit.accounts) {
      lines.push(
        `  ${account.accountName}: source=${formatNullableMoney(account.sourceBalance)}, imported=${formatNullableMoney(account.importedBalance)}, diff=${formatNullableMoney(account.difference)}, tx=${formatNullableCount(account.sourceTransactionCount)}/${formatNullableCount(account.importedTransactionCount)}, ${account.status}`,
      );
    }
  }
  lines.push("");

  lines.push("Budget Rows");
  if (audit.budgetRows.length === 0) {
    lines.push("  No source budget rows found for requested month.");
  } else {
    for (const row of audit.budgetRows) {
      lines.push(
        `  ${row.month} ${row.categoryGroup} > ${row.category}: budgeted ${row.source.budgeted.toFixed(2)} / ${formatNullableMoney(row.imported.budgeted)}, activity ${row.source.activity.toFixed(2)} / ${formatNullableMoney(row.imported.activity)}, balance ${row.source.balance.toFixed(2)} / ${formatNullableMoney(row.imported.balance)}, ${row.status}`,
      );
    }
  }
  lines.push("");

  lines.push("Category Structure");
  const categoryIssues = audit.categoryStructureRows.filter((row) => row.status !== "pass");
  if (categoryIssues.length === 0) {
    lines.push("  No category structure mismatches detected.");
  } else {
    for (const row of categoryIssues) {
      lines.push(`  ${row.categoryGroup} > ${row.category}: ${row.status}`);
    }
  }

  if (audit.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings");
    for (const warning of audit.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join("\n");
}

function readImportedBudgetRows(
  storage: KeyValueStoragePort,
  budgetId: string,
  month: string,
): ImportedBudgetRow[] {
  const view = readJson<StoredBudgetView | null>(storage, `${BUDGET_VIEW_STORAGE_PREFIX}.${budgetId}.${month}`, null);
  if (!view || !Array.isArray(view.categoryGroups)) return [];

  const rows: ImportedBudgetRow[] = [];
  for (const group of view.categoryGroups) {
    const categoryGroup = typeof group.name === "string" ? group.name : "";
    for (const category of Array.isArray(group.categories) ? group.categories : []) {
      if (typeof category.name !== "string") continue;

      rows.push({
        categoryGroup,
        category: category.name,
        // BudgetMonthView values are already app display-unit values. Do not divide by 1000 here.
        budgeted: normaliseAppMoney(category.assigned ?? category.budgeted),
        activity: normaliseAppMoney(category.activity),
        balance: normaliseAppMoney(category.available ?? category.balance),
      });
    }
  }

  return rows;
}

function readImportedAccounts(
  storage: KeyValueStoragePort,
  budgetId: string,
): Ynab4ReconciliationAccountRow[] {
  const accounts = readJson<StoredAccount[]>(
    storage,
    `budget-app.budgets.${budgetId}.${ACCOUNTS_STORAGE_KEY}`,
    [],
  );
  const registers = readJson<Record<string, StoredRegister>>(
    storage,
    `budget-app.budgets.${budgetId}.${REGISTERS_STORAGE_KEY}`,
    {},
  );

  return accounts.map((account) => {
    const id = typeof account.id === "string" ? account.id : "";
    const name = typeof account.name === "string" ? account.name : id || "Unknown Account";
    const register = id ? registers[id] : undefined;
    const importedTransactionCount = Array.isArray(register?.transactions) ? register.transactions.length : 0;

    return {
      accountName: name,
      sourceBalance: null,
      importedBalance: normaliseAppMoney(account.balance),
      difference: null,
      sourceTransactionCount: null,
      importedTransactionCount,
      status: "source-missing",
    };
  });
}

function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function cell(row: string[], index: Map<string, number>, header: string): string {
  const position = index.get(header);
  return position === undefined ? "" : row[position] ?? "";
}

function parseMoney(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const negativeByParens = trimmed.startsWith("(") && trimmed.endsWith(")");
  const cleaned = trimmed
    .replace(/[()", $]/g, "")
    .replace(/\$/g, "")
    .replace(/,/g, "");

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;

  return roundMoney(negativeByParens ? -Math.abs(parsed) : parsed);
}

function normaliseAppMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return roundMoney(value);
  }

  if (typeof value === "string" && value.trim()) {
    return parseMoney(value);
  }

  return 0;
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

function budgetRowKey(categoryGroup: string, category: string): string {
  return `${categoryGroup.trim().toLowerCase()}::${category.trim().toLowerCase()}`;
}

function moneyMatches(left: number, right: number): boolean {
  return Math.abs(left - right) <= MONEY_TOLERANCE;
}

function formatNullableMoney(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(2);
}

function formatNullableCount(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function normaliseMonth(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 7);

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
