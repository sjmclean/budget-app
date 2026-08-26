import type {
  AccountTransactionPage,
  AccountTransactionQuery,
} from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})-/;

export function getRegisterMonthKey(date: string): string | null {
  const match = MONTH_KEY_PATTERN.exec(date);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : null;
}

export function getRegisterMonthDateRange(monthKey: string): {
  startDate: string;
  endDate: string;
} {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) {
    throw new Error("Invalid register month key.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    startDate: `${monthKey}-01`,
    endDate: `${monthKey}-${String(daysInMonth).padStart(2, "0")}`,
  };
}

export type RegisterMonthCheckboxState = "unchecked" | "checked" | "mixed";

export function getRegisterMonthCheckboxState(
  monthTransactionIds: readonly string[],
  selectedIds: readonly string[],
): RegisterMonthCheckboxState {
  if (monthTransactionIds.length === 0) return "unchecked";
  const selected = new Set(selectedIds);
  const count = monthTransactionIds.filter((id) => selected.has(id)).length;
  if (count === 0) return "unchecked";
  return count === monthTransactionIds.length ? "checked" : "mixed";
}

export async function loadRegisterTransactionIdsForMonth(input: {
  query: Omit<AccountTransactionQuery, "limit" | "offset" | "before" | "dateRange">;
  monthKey: string;
  queryPage: (query: AccountTransactionQuery) => Promise<AccountTransactionPage>;
  pageSize?: number;
}): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = Math.min(250, Math.max(1, input.pageSize ?? 250));
  let offset = 0;

  while (true) {
    const page = await input.queryPage({
      ...input.query,
      dateRange: getRegisterMonthDateRange(input.monthKey),
      limit: pageSize,
      offset,
    });
    ids.push(...page.rows.map((row) => row.id));
    if (!page.hasMore || page.rows.length === 0) return [...new Set(ids)];
    offset += page.rows.length;
  }
}
