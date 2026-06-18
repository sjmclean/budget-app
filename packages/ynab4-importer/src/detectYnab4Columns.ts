import { Ynab4ImportIssue } from "../../types/src/Ynab4Import.js";

export interface Ynab4ColumnDetectionResult {
  kind: "accounts" | "register" | "budget" | "unknown";
  headers: string[];
  issues: Ynab4ImportIssue[];
}

const normalize = (value: string) => value.trim().toLowerCase();

export function detectYnab4Columns(
  headers: string[],
  source = "csv",
): Ynab4ColumnDetectionResult {
  const normalized = new Set(headers.map(normalize));
  const has = (name: string) => normalized.has(normalize(name));

  const issues: Ynab4ImportIssue[] = [];

  if (
    has("Account") &&
    has("Date") &&
    has("Payee") &&
    (has("Outflow") || has("Inflow"))
  ) {
    return { kind: "register", headers, issues };
  }

  if (
    (has("Account") || has("Account Name")) &&
    (has("Balance") || has("Current Balance") || has("Type"))
  ) {
    return { kind: "accounts", headers, issues };
  }

  if (
    (has("Category") || has("Master Category") || has("Sub Category")) &&
    (has("Budgeted") || has("Outflows") || has("Balance"))
  ) {
    return { kind: "budget", headers, issues };
  }

  issues.push({
    severity: "warning",
    code: "YNAB4_UNKNOWN_COLUMNS",
    message: `Could not confidently identify ${source} as a YNAB4 accounts, register, or budget CSV.`,
    source,
  });

  return { kind: "unknown", headers, issues };
}
