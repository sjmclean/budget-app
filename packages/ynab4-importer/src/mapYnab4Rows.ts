import {
  Ynab4TransactionPreview,
  Ynab4AccountPreview,
  Ynab4BudgetMonthPreview,
} from "../../types/src/Ynab4Import.js";
import { parseYnabAmount } from "./parseYnabAmount.js";

function value(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const exact = row[key];
    if (exact !== undefined && exact !== "") return exact;
    const found = Object.entries(row).find(
      ([candidate]) =>
        candidate.trim().toLowerCase() === key.trim().toLowerCase(),
    );
    if (found && found[1] !== "") return found[1];
  }
  return "";
}

export function normalizeYnabDate(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch)
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (!slashMatch) return trimmed;

  const first = Number(slashMatch[1]);
  const second = Number(slashMatch[2]);
  const rawYear = slashMatch[3];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

  // YNAB4 exports commonly follow the user's locale. Prefer dd/mm/yyyy when the first part is > 12,
  // otherwise preserve a deterministic mm/dd/yyyy interpretation until user-selectable locale import exists.
  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function mapYnab4RegisterRow(
  row: Record<string, string>,
  rowNumber = 0,
): Ynab4TransactionPreview {
  const outflow = parseYnabAmount(value(row, "Outflow"));
  const inflow = parseYnabAmount(value(row, "Inflow"));
  const amount = inflow > 0 ? inflow : -Math.abs(outflow);
  const payee = value(row, "Payee");
  const category = value(row, "Category") || null;
  const clearedRaw = value(row, "Cleared").toUpperCase();
  const transferMatch = /^Transfer\s*:\s*(.+)$/i.exec(payee);

  return {
    rowNumber,
    accountName: value(row, "Account") || null,
    date: normalizeYnabDate(value(row, "Date")),
    payee,
    category,
    memo: value(row, "Memo") || null,
    amount,
    cleared:
      clearedRaw === "R"
        ? "reconciled"
        : clearedRaw === "C"
          ? "cleared"
          : "uncleared",
    flag: value(row, "Flag") || null,
    isTransfer: Boolean(transferMatch),
    transferAccountName: transferMatch?.[1]?.trim() ?? null,
    isSplit:
      (category ?? "").toLowerCase().includes("split") ||
      payee.toLowerCase().includes("split"),
  };
}

export function mapYnab4AccountRow(
  row: Record<string, string>,
): Ynab4AccountPreview {
  const name = value(row, "Account", "Account Name", "Name");
  const type = value(row, "Type", "Account Type") || null;
  const budgeted = value(row, "Budget", "On Budget", "On-Budget").toLowerCase();
  const closed = value(row, "Closed", "Hidden").toLowerCase();

  return {
    name,
    type,
    onBudget: budgeted
      ? ["true", "yes", "on budget", "budget"].includes(budgeted)
      : null,
    balance: value(row, "Balance", "Current Balance")
      ? parseYnabAmount(value(row, "Balance", "Current Balance"))
      : null,
    closed: ["true", "yes", "closed"].includes(closed),
  };
}

export function splitCategoryName(category: string): {
  groupName: string | null;
  name: string;
  fullName: string;
} {
  const trimmed = category.trim();
  const separator = trimmed.includes(":")
    ? ":"
    : trimmed.includes("/")
      ? "/"
      : null;
  if (!separator) return { groupName: null, name: trimmed, fullName: trimmed };
  const [groupName, ...rest] = trimmed.split(separator);
  const name = rest.join(separator).trim();
  return {
    groupName: groupName.trim() || null,
    name: name || trimmed,
    fullName: trimmed,
  };
}

export function mapYnab4BudgetRow(
  row: Record<string, string>,
): Ynab4BudgetMonthPreview {
  const month = value(row, "Month", "Date") || "unknown";
  const category = value(row, "Category", "Sub Category", "SubCategory");
  return {
    month,
    category,
    budgeted: parseYnabAmount(value(row, "Budgeted")),
    outflows: parseYnabAmount(value(row, "Outflows", "Activity")),
    balance: parseYnabAmount(value(row, "Balance", "Available")),
  };
}
