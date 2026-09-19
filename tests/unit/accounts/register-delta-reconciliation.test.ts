import assert from "node:assert/strict";
import test from "node:test";
import { reconcileRegisterDelta, compareRegisterDateRows } from "../../../apps/web/src/features/accounts/registerDeltaReconciliation.js";
import { mapSqliteTransactions } from "../../../apps/web/src/features/accounts/useAccountRegister.js";
import type { AccountRegisterSummary, AccountTransactionRow } from "../../../packages/application/src/accountRegister/AccountRegisterQueryPort.js";
import type { AccountRegisterMutationDelta } from "../../../apps/web/src/features/persistence/accountRegisterMutationDelta.js";

const budgetId = "delta-budget";
const accountId = "checking";
const query = { search: null, categoryFilter: "all" as const, sort: { column: "date" as const, direction: "descending" as const } };
const summary: AccountRegisterSummary = { budgetId, accountId, accountName: "Checking", accountType: "checking", participation: "on-budget", currencyCode: "USD", openingBalance: 0, clearedBalance: 0, unclearedBalance: 0, workingBalance: 0, transactionCount: 0 };
function row(id: string, date: string, amount = -100): AccountTransactionRow {
  return { id, date, amount, memo: null, checkNumber: null, clearedStatus: "uncleared", payeeId: null, payeeName: null, categoryId: null, categoryName: null, transferAccountId: null, transferTransactionId: null, splitLines: [] };
}
function patch(beforeRows: AccountTransactionRow[], afterRows: AccountTransactionRow[], nextSummary = summary): AccountRegisterMutationDelta {
  return { mode: "patch", budgetId, affectedAccountIds: [accountId], beforeRows: beforeRows.map((value) => ({ accountId, row: value })), afterRows: afterRows.map((value) => ({ accountId, row: value })), summaries: [nextSummary] };
}

test("date/id ordering equals SQLite BINARY order in both directions", () => {
  const rows = [row("b", "2026-09-01"), row("a", "2026-09-01"), row("c", "2026-09-02")];
  assert.deepEqual([...rows].sort((a, b) => compareRegisterDateRows(a, b, "descending")).map(({ id }) => id), ["c", "b", "a"]);
  assert.deepEqual([...rows].sort((a, b) => compareRegisterDateRows(a, b, "ascending")).map(({ id }) => id), ["a", "b", "c"]);
});

test("in-place amount edit uses committed summary for running balances", () => {
  const before = row("b", "2026-09-02", -100);
  const after = row("b", "2026-09-02", -300);
  const nextSummary = { ...summary, workingBalance: -400, transactionCount: 2 };
  const result = reconcileRegisterDelta({ accountId, query, page: { summary, rows: [before, row("a", "2026-09-01")], totalCount: 2 }, delta: patch([before], [after], nextSummary) });
  assert.equal(result.mode, "patch");
  if (result.mode !== "patch") return;
  assert.deepEqual(result.page.rows.map(({ id }) => id), ["b", "a"]);
  assert.equal(result.refillLimit, 0);
  assert.equal(mapSqliteTransactions(result.page.rows, result.page.summary.workingBalance)[0]?.runningBalance, -4);
});

test("delete from a full window requests exactly one boundary row", () => {
  const rows = Array.from({ length: 150 }, (_, index) => row(`id-${String(150 - index).padStart(3, "0")}`, "2026-09-01"));
  const deleted = rows[4]!;
  const result = reconcileRegisterDelta({ accountId, query, page: { summary, rows, totalCount: 151 }, delta: patch([deleted], [], { ...summary, transactionCount: 150 }) });
  assert.equal(result.mode, "patch");
  if (result.mode !== "patch") return;
  assert.equal(result.page.rows.length, 149);
  assert.equal(result.refillLimit, 1);
  assert.equal(result.refillOffset, 149);
  assert.equal(result.page.totalCount, 150);
});

test("insertion into a full window trims the tail and increases total", () => {
  const rows = Array.from({ length: 150 }, (_, index) => row(`id-${String(150 - index).padStart(3, "0")}`, "2026-09-01"));
  const inserted = row("new", "2026-09-02");
  const result = reconcileRegisterDelta({ accountId, query, page: { summary, rows, totalCount: 150 }, delta: patch([], [inserted], { ...summary, transactionCount: 151 }) });
  assert.equal(result.mode, "patch");
  if (result.mode !== "patch") return;
  assert.equal(result.page.rows.length, 150);
  assert.equal(result.page.rows[0]?.id, "new");
  assert.equal(result.refillLimit, 0);
  assert.equal(result.page.totalCount, 151);
});

test("date edit moves a loaded row and an account move removes it", () => {
  const original = row("b", "2026-09-01");
  const later = row("b", "2026-09-03");
  const page = { summary, rows: [row("c", "2026-09-02"), original, row("a", "2026-08-31")], totalCount: 3 };
  const moved = reconcileRegisterDelta({ accountId, query, page, delta: patch([original], [later], { ...summary, transactionCount: 3 }) });
  assert.equal(moved.mode, "patch");
  if (moved.mode !== "patch") return;
  assert.deepEqual(moved.page.rows.map(({ id }) => id), ["b", "c", "a"]);
  const removed = reconcileRegisterDelta({ accountId, query, page: moved.page, delta: patch([later], [], { ...summary, transactionCount: 2 }) });
  assert.equal(removed.mode, "patch");
  if (removed.mode !== "patch") return;
  assert.deepEqual(removed.page.rows.map(({ id }) => id), ["c", "a"]);
  assert.equal(removed.page.totalCount, 2);
  assert.equal(removed.refillLimit, 0);
});

test("filtered and non-date queries request authoritative refresh", () => {
  const page = { summary, rows: [row("a", "2026-09-01")], totalCount: 1 };
  assert.equal(reconcileRegisterDelta({ accountId, query: { ...query, categoryFilter: "uncategorised" }, page, delta: patch([], []) }).mode, "refresh-required");
  assert.equal(reconcileRegisterDelta({ accountId, query: { ...query, sort: { column: "payee", direction: "ascending" } }, page, delta: patch([], []) }).mode, "refresh-required");
  assert.equal(reconcileRegisterDelta({ accountId, query: { ...query, search: { query: "abc", scope: "all" } }, page, delta: patch([], []) }).mode, "refresh-required");
});

test("an affected account without its committed summary refreshes rather than retaining stale rows", () => {
  const page = { summary, rows: [row("a", "2026-09-01")], totalCount: 1 };
  const incomplete = { ...patch([], []), summaries: [] };
  assert.equal(reconcileRegisterDelta({ accountId, query, page, delta: incomplete }).mode, "refresh-required");
});
