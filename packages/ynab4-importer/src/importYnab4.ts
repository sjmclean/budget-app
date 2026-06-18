import {
  Ynab4AccountPreview,
  Ynab4BudgetMonthPreview,
  Ynab4CategoryGroupPreview,
  Ynab4CategoryPreview,
  Ynab4ImportIssue,
  Ynab4ImportPreview,
  Ynab4ImportSummary,
  Ynab4PayeePreview,
  Ynab4TransactionPreview
} from "../../types/src/Ynab4Import.js";
import { detectYnab4Columns } from "./detectYnab4Columns.js";
import { parseCsvWithHeaders } from "./parseCsv.js";
import { mapYnab4AccountRow, mapYnab4BudgetRow, mapYnab4RegisterRow, splitCategoryName } from "./mapYnab4Rows.js";

export interface Ynab4ImportInput {
  accountsCsv?: string;
  registerCsv?: string;
  budgetCsv?: string;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const itemKey = key(item);
    if (!itemKey || seen.has(itemKey)) continue;
    seen.add(itemKey);
    result.push(item);
  }
  return result;
}

function issue(severity: Ynab4ImportIssue["severity"], code: string, message: string, source?: string, rowNumber?: number): Ynab4ImportIssue {
  return { severity, code, message, source, rowNumber };
}

export function previewYnab4Import(input: Ynab4ImportInput): Ynab4ImportPreview {
  const issues: Ynab4ImportIssue[] = [];
  const accountCsv = input.accountsCsv ? parseCsvWithHeaders(input.accountsCsv) : { headers: [], rows: [] };
  const registerCsv = input.registerCsv ? parseCsvWithHeaders(input.registerCsv) : { headers: [], rows: [] };
  const budgetCsv = input.budgetCsv ? parseCsvWithHeaders(input.budgetCsv) : { headers: [], rows: [] };

  if (!input.accountsCsv && !input.registerCsv && !input.budgetCsv) {
    issues.push(issue("error", "YNAB4_NO_INPUT", "No YNAB4 CSV input was supplied."));
  }

  if (input.accountsCsv) issues.push(...detectYnab4Columns(accountCsv.headers, "accountsCsv").issues);
  if (input.registerCsv) issues.push(...detectYnab4Columns(registerCsv.headers, "registerCsv").issues);
  if (input.budgetCsv) issues.push(...detectYnab4Columns(budgetCsv.headers, "budgetCsv").issues);

  const accounts = uniqueBy(
    accountCsv.rows.map(mapYnab4AccountRow).filter((account) => account.name),
    (account) => account.name.toLowerCase()
  );

  const transactions = registerCsv.rows.map((row, index) => mapYnab4RegisterRow(row, index + 2));

  for (const transaction of transactions) {
    if (!transaction.date) issues.push(issue("error", "YNAB4_TRANSACTION_MISSING_DATE", "Transaction is missing a date.", "registerCsv", transaction.rowNumber));
    if (transaction.amount === 0) issues.push(issue("warning", "YNAB4_TRANSACTION_ZERO_AMOUNT", "Transaction has a zero amount.", "registerCsv", transaction.rowNumber));
    if (!transaction.accountName) issues.push(issue("warning", "YNAB4_TRANSACTION_MISSING_ACCOUNT", "Transaction is missing an account name.", "registerCsv", transaction.rowNumber));
  }

  const inferredAccounts = uniqueBy(
    transactions
      .map((transaction) => transaction.accountName)
      .filter((name): name is string => Boolean(name))
      .map<Ynab4AccountPreview>((name) => ({ name, type: null, onBudget: null, balance: null, closed: false })),
    (account) => account.name.toLowerCase()
  );

  const allAccounts = uniqueBy([...accounts, ...inferredAccounts], (account) => account.name.toLowerCase());

  const budgetMonths = budgetCsv.rows.map(mapYnab4BudgetRow).filter((row) => row.category || row.month !== "unknown");

  const categoryNames = [
    ...transactions.map((transaction) => transaction.category).filter((category): category is string => Boolean(category)),
    ...budgetMonths.map((row) => row.category).filter(Boolean)
  ];

  const categories: Ynab4CategoryPreview[] = uniqueBy(
    categoryNames.map(splitCategoryName).filter((category) => category.name),
    (category) => category.fullName.toLowerCase()
  );

  const categoryGroups: Ynab4CategoryGroupPreview[] = uniqueBy(
    categories
      .map((category) => category.groupName)
      .filter((name): name is string => Boolean(name))
      .map((name) => ({ name })),
    (group) => group.name.toLowerCase()
  );

  const payees: Ynab4PayeePreview[] = uniqueBy(
    transactions
      .map((transaction) => transaction.payee)
      .filter(Boolean)
      .filter((payee) => !/^Transfer\s*:/i.test(payee))
      .map((name) => ({ name })),
    (payee) => payee.name.toLowerCase()
  );

  const summary: Ynab4ImportSummary = {
    accounts: allAccounts.length,
    categoryGroups: categoryGroups.length,
    categories: categories.length,
    payees: payees.length,
    transactions: transactions.length,
    splitTransactions: transactions.filter((transaction) => transaction.isSplit).length,
    transfers: transactions.filter((transaction) => transaction.isTransfer).length,
    scheduledTransactions: 0,
    budgetMonths: uniqueBy(budgetMonths, (row) => `${row.month}:${row.category}`).length,
    issues,
    notes: [
      "v1.2 importer foundation: parses YNAB4 CSV exports, builds a preview, detects transfers/splits, and reports import issues.",
      "Actual database write/import transaction is intentionally deferred to the next v1.2.x step."
    ]
  };

  return {
    summary,
    accounts: allAccounts,
    categoryGroups,
    categories,
    payees,
    transactions,
    budgetMonths
  };
}

export function importYnab4(input: Ynab4ImportInput): Ynab4ImportSummary {
  return previewYnab4Import(input).summary;
}
