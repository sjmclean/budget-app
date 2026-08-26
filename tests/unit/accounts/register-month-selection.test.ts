import assert from "node:assert/strict";
import test from "node:test";
import type { AccountTransactionRow } from "../../../packages/application/src/accountRegister/AccountRegisterQueryPort.js";
import {
  getRegisterMonthCheckboxState,
  getRegisterMonthKey,
  loadRegisterTransactionIdsForMonth,
} from "../../../apps/web/src/features/accounts/registerMonthSelection.js";
import {
  addRegisterTransactionsToSelection,
  deselectRegisterTransactions,
  emptyRegisterSelectionState,
  pruneRegisterSelection,
  selectRegisterTransactions,
} from "../../../apps/web/src/features/accounts/registerSelection.js";

function row(id: string, date = "2026-08-01"): AccountTransactionRow {
  return {
    id, date, amount: -100, memo: null, checkNumber: null,
    clearedStatus: "uncleared", payeeId: null, payeeName: "Payee",
    categoryId: null, categoryName: null, transferAccountId: null,
    transferTransactionId: null, splitLines: [],
  };
}

test("month identity is derived directly from ISO date text without timezone conversion", () => {
  assert.equal(getRegisterMonthKey("2026-08-31"), "2026-08");
  assert.equal(getRegisterMonthKey("2026-01-01"), "2026-01");
  assert.equal(getRegisterMonthKey("2026-13-01"), null);
  assert.equal(getRegisterMonthKey("August 2026"), null);
});

test("month ID loading spans bounded pages and preserves active query scope", async () => {
  const calls: { offset?: number; search?: unknown; categoryFilter?: string; dateRange?: unknown }[] = [];
  const allRows = Array.from({ length: 505 }, (_, index) => row(`aug-${index}`));
  const ids = await loadRegisterTransactionIdsForMonth({
    monthKey: "2026-08",
    query: {
      budgetId: "budget-1", accountId: "account-1",
      search: { query: "Woolworths", scope: "payee" },
      categoryFilter: "uncategorised",
      sort: { column: "date", direction: "descending" },
    },
    queryPage: async (query) => {
      calls.push(query);
      const rows = allRows.slice(query.offset ?? 0, (query.offset ?? 0) + query.limit);
      return { rows, nextCursor: null, hasMore: (query.offset ?? 0) + rows.length < allRows.length };
    },
  });
  assert.equal(ids.length, 505);
  assert.deepEqual(calls.map((call) => call.offset), [0, 250, 500]);
  assert.deepEqual(calls[0]?.dateRange, { startDate: "2026-08-01", endDate: "2026-08-31" });
  assert.deepEqual(calls[0]?.search, { query: "Woolworths", scope: "payee" });
  assert.equal(calls[0]?.categoryFilter, "uncategorised");
});

test("month add/deselect uses the canonical selection and preserves other months", () => {
  const july = selectRegisterTransactions(["jul-1"]);
  const both = addRegisterTransactionsToSelection(july, ["aug-1", "aug-2"]);
  assert.deepEqual(both.selectedIds, ["jul-1", "aug-1", "aug-2"]);
  assert.deepEqual(
    deselectRegisterTransactions(both, ["aug-1", "aug-2"]).selectedIds,
    ["jul-1"],
  );
});

test("existing header select-all remains replacement/current-page semantics", () => {
  const monthSelection = addRegisterTransactionsToSelection(
    emptyRegisterSelectionState,
    ["off-page"],
  );
  assert.deepEqual(monthSelection.selectedIds, ["off-page"]);
  assert.deepEqual(
    selectRegisterTransactions(["visible-1", "visible-2"]).selectedIds,
    ["visible-1", "visible-2"],
  );
});

test("authoritative pruning retains valid selected IDs that are off the rendered page", () => {
  const selected = selectRegisterTransactions(["visible", "off-page"]);
  const { selectedIds } = pruneRegisterSelection(selected, ["visible", "off-page"]);
  assert.deepEqual(selectedIds, ["visible", "off-page"]);
});

test("month checkbox state distinguishes none, partial, and all", () => {
  const month = ["aug-1", "aug-2"];
  assert.equal(getRegisterMonthCheckboxState(month, []), "unchecked");
  assert.equal(getRegisterMonthCheckboxState(month, ["aug-1"]), "mixed");
  assert.equal(getRegisterMonthCheckboxState(month, ["aug-1", "aug-2", "jul-1"]), "checked");
  assert.deepEqual(emptyRegisterSelectionState.selectedIds, []);
});
