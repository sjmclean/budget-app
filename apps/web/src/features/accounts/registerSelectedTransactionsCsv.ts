import type { RegisterTransactionView } from "./accountRegisterTypes";
import type { AccountTransactionRow } from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import { sortRegisterTransactions, type RegisterSortState } from "./registerSorting";

export const REGISTER_TRANSACTION_CSV_HEADERS = [
  "Date", "Payee", "Category", "Memo", "Check Number", "Outflow", "Inflow",
  "Cleared", "Reconciled", "Tags", "Transfer Account", "Split",
] as const;

export function encodeCsvField(value: string): string {
  return /[,"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function decimal(value: number): string {
  return value === 0 ? "" : value.toFixed(2);
}

export function buildSelectedTransactionsCsv(input: {
  transactions: readonly RegisterTransactionView[];
  tagNamesById?: ReadonlyMap<string, string>;
  accountNamesById?: ReadonlyMap<string, string>;
}): string {
  const rows: string[][] = [REGISTER_TRANSACTION_CSV_HEADERS.slice()];
  for (const transaction of input.transactions) {
    const tags = (transaction.tagIds ?? [])
      .map((id) => input.tagNamesById?.get(id) ?? id)
      .join("; ");
    const lines = transaction.splitLines?.length
      ? transaction.splitLines
      : [null];
    for (const split of lines) {
      const transferAccountId = split?.transferAccountId ?? transaction.transferAccountId;
      rows.push([
        transaction.date,
        transaction.payee,
        split?.category ?? transaction.category,
        split?.memo ?? transaction.memo ?? "",
        transaction.checkNumber ?? "",
        decimal(split?.outflow ?? transaction.outflow),
        decimal(split?.inflow ?? transaction.inflow),
        transaction.cleared ? "Yes" : "No",
        transaction.reconciled ? "Yes" : "No",
        tags,
        transferAccountId
          ? input.accountNamesById?.get(transferAccountId) ?? transaction.payee
          : "",
        split ? "Yes" : "No",
      ]);
    }
  }
  return `${rows.map((row) => row.map(encodeCsvField).join(",")).join("\r\n")}\r\n`;
}

export function buildSortedSelectedTransactionsCsv(input: {
  transactions: readonly RegisterTransactionView[];
  sort: RegisterSortState;
  tagNamesById?: ReadonlyMap<string, string>;
  accountNamesById?: ReadonlyMap<string, string>;
}): string {
  return buildSelectedTransactionsCsv({
    ...input,
    transactions: sortRegisterTransactions(input.transactions, input.sort),
  });
}

export async function loadSelectedAccountTransactionRows(input: {
  selectedIds: readonly string[];
  loadByIds: (ids: readonly string[]) => Promise<readonly AccountTransactionRow[]>;
  batchSize?: number;
}): Promise<AccountTransactionRow[]> {
  const uniqueSelectedIds = [...new Set(input.selectedIds)];
  const rows: AccountTransactionRow[] = [];
  const batchSize = Math.min(250, Math.max(1, input.batchSize ?? 250));
  for (let offset = 0; offset < uniqueSelectedIds.length; offset += batchSize) {
    rows.push(...await input.loadByIds(uniqueSelectedIds.slice(offset, offset + batchSize)));
  }
  const returnedIds = new Set(rows.map((row) => row.id));
  if (returnedIds.size !== uniqueSelectedIds.length ||
      uniqueSelectedIds.some((id) => !returnedIds.has(id))) {
    throw new Error("One or more selected transactions no longer exist. Nothing was exported.");
  }
  return rows;
}

export function createSelectedTransactionsFilename(
  accountName: string,
  isoDate: string,
): string {
  const safeAccount = accountName.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-") || "account";
  return `${safeAccount}-transactions-${isoDate}.csv`;
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
