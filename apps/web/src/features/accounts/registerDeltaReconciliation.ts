import type { AccountRegisterSummary, AccountTransactionRow } from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import type { AccountRegisterMutationDelta } from "../persistence/accountRegisterMutationDelta";
import type { RegisterViewQuery } from "./useAccountRegister";

export interface LoadedRegisterPage {
  readonly summary: AccountRegisterSummary;
  readonly rows: readonly AccountTransactionRow[];
  readonly totalCount: number;
}

export type RegisterReconciliation =
  | { readonly mode: "refresh-required" }
  | { readonly mode: "patch"; readonly page: LoadedRegisterPage; readonly refillLimit: number; readonly refillOffset: number };

/** SQLite BINARY date/id order. Non-date/filter/search modes deliberately refresh. */
export function canReconcileRegisterQuery(query: RegisterViewQuery): boolean {
  return !query.search?.query.trim() && query.categoryFilter === "all" && query.sort.column === "date";
}

export function compareRegisterDateRows(left: AccountTransactionRow, right: AccountTransactionRow, direction: "ascending" | "descending"): number {
  const factor = direction === "ascending" ? 1 : -1;
  if (left.date !== right.date) return (left.date < right.date ? -1 : 1) * factor;
  if (left.id !== right.id) return (left.id < right.id ? -1 : 1) * factor;
  return 0;
}

export function reconcileRegisterDelta(input: {
  readonly accountId: string;
  readonly query: RegisterViewQuery;
  readonly page: LoadedRegisterPage;
  readonly delta: AccountRegisterMutationDelta;
}): RegisterReconciliation {
  const { accountId, query, page, delta } = input;
  if (delta.mode !== "patch" || !canReconcileRegisterQuery(query)) return { mode: "refresh-required" };
  const summary = delta.summaries.find((candidate) => candidate.accountId === accountId);
  if (!summary) return delta.affectedAccountIds.includes(accountId)
    ? { mode: "refresh-required" }
    : { mode: "patch", page, refillLimit: 0, refillOffset: page.rows.length };
  const before = delta.beforeRows.filter((entry) => entry.accountId === accountId);
  const after = delta.afterRows.filter((entry) => entry.accountId === accountId);
  const changedIds = new Set([...before, ...after].map(({ row }) => row.id));
  const oldTail = page.rows.at(-1);
  const fullyLoadedBefore = page.rows.length >= page.totalCount;
  const totalCount = Math.max(0, page.totalCount - before.length + after.length);
  const desired = Math.min(totalCount, Math.max(150, page.rows.length));
  const retained = page.rows.filter(({ id }) => !changedIds.has(id));
  for (const { row } of after) {
    // A temporarily short window can occur while several committed
    // publications are being reconciled before one final boundary refill.
    // Rows known to sort within the currently materialised boundary can be
    // applied immediately. Rows beyond an incomplete boundary are left for the
    // authoritative local refill to decide.
    if (fullyLoadedBefore || !oldTail || compareRegisterDateRows(row, oldTail, query.sort.direction) <= 0) {
      retained.push(row);
    }
  }
  retained.sort((left, right) => compareRegisterDateRows(left, right, query.sort.direction));
  const rows = retained.slice(0, desired);
  return {
    mode: "patch",
    page: { summary, rows, totalCount },
    refillLimit: Math.max(0, desired - rows.length),
    refillOffset: rows.length,
  };
}
