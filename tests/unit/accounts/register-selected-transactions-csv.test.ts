import assert from "node:assert/strict";
import test from "node:test";
import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";
import type { AccountTransactionRow } from "../../../packages/application/src/accountRegister/AccountRegisterQueryPort.js";
import {
  buildSelectedTransactionsCsv,
  buildSortedSelectedTransactionsCsv,
  createSelectedTransactionsFilename,
  encodeCsvField,
  loadSelectedAccountTransactionRows,
} from "../../../apps/web/src/features/accounts/registerSelectedTransactionsCsv.js";

function transaction(overrides: Partial<RegisterTransactionView> = {}): RegisterTransactionView {
  return {
    id: "internal-id", date: "2026-08-19", attachmentCount: 0,
    payee: "Woolworths, Richmond", category: "Groceries",
    memo: "He said \"hello\"\nnext line", checkNumber: "", inflow: 0,
    outflow: 12.34, runningBalance: 987.65, cleared: true,
    reconciled: false, ...overrides,
  };
}

function row(id: string): AccountTransactionRow {
  return {
    id, date: "2026-08-19", amount: -1234, memo: null, checkNumber: null,
    clearedStatus: "uncleared", payeeId: null, payeeName: "Payee",
    categoryId: null, categoryName: null, transferAccountId: null,
    transferTransactionId: null, splitLines: [],
  };
}

test("CSV escaping handles comma, quote, CR and newline", () => {
  assert.equal(encodeCsvField("plain"), "plain");
  assert.equal(encodeCsvField("a,b"), '"a,b"');
  assert.equal(encodeCsvField('He said "hello"'), '"He said ""hello"""');
  assert.equal(encodeCsvField("a\r\nb"), '"a\r\nb"');
});

test("ordinary transaction exports intrinsic fields and decimal money only", () => {
  const csv = buildSelectedTransactionsCsv({ transactions: [transaction()] });
  assert.match(csv, /"Woolworths, Richmond"/);
  assert.match(csv, /12\.34,,Yes,No/);
  assert.doesNotMatch(csv, /internal-id|987\.65|runningBalance|budgetId|accountId/);
});

test("split transaction emits every split line with fallback memo and transfer account", () => {
  const csv = buildSelectedTransactionsCsv({
    transactions: [transaction({
      memo: "parent memo", outflow: 30, transferAccountId: undefined,
      tagIds: ["tag-1"],
      splitLines: [
        { id: "split-1", category: "Food", memo: "line memo", inflow: 0, outflow: 10 },
        { id: "split-2", category: "Transfer: Savings", inflow: 0, outflow: 20, transferAccountId: "savings" },
      ],
    })],
    tagNamesById: new Map([["tag-1", "Tax"]]),
    accountNamesById: new Map([["savings", "Savings"]]),
  });
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1]!, /Food,line memo.*10\.00.*Tax.*Yes$/);
  assert.match(lines[2]!, /Transfer: Savings,parent memo.*20\.00.*Savings,Yes$/);
});

test("inflow, reconciled state, blank optional fields and filename are deterministic", () => {
  const csv = buildSelectedTransactionsCsv({ transactions: [transaction({
    payee: "Salary", memo: undefined, checkNumber: undefined,
    outflow: 0, inflow: 500, cleared: true, reconciled: true,
  })] });
  assert.match(csv, /Salary,Groceries,,,,500\.00,Yes,Yes/);
  assert.equal(
    createSelectedTransactionsFilename('Everyday: "Main"', "2026-08-26"),
    "Everyday- -Main--transactions-2026-08-26.csv",
  );
});

test("authoritative loading batches off-page IDs and aborts rather than returning partial data", async () => {
  const selectedIds = Array.from({ length: 501 }, (_, index) => `id-${index}`);
  const batches: number[] = [];
  const rows = await loadSelectedAccountTransactionRows({
    selectedIds,
    loadByIds: async (ids) => {
      batches.push(ids.length);
      return ids.map(row);
    },
  });
  assert.equal(rows.length, 501);
  assert.deepEqual(batches, [250, 250, 1]);
  await assert.rejects(
    loadSelectedAccountTransactionRows({
      selectedIds: ["present", "deleted"],
      loadByIds: async () => [row("present")],
    }),
    /Nothing was exported/,
  );
});

test("export ordering follows register sort rather than selection/input order", () => {
  const csv = buildSortedSelectedTransactionsCsv({
    transactions: [
      transaction({ id: "older", date: "2026-07-01", payee: "Older" }),
      transaction({ id: "newer", date: "2026-08-01", payee: "Newer" }),
    ],
    sort: { column: "date", direction: "descending" },
  });
  assert.ok(csv.indexOf("Newer") < csv.indexOf("Older"));
});

test("CSV generation is read-only and leaves the caller's selection and transactions unchanged", () => {
  const selectedIds = ["one"];
  const transactions = [transaction({ id: "one" })];
  const before = structuredClone(transactions);
  buildSelectedTransactionsCsv({ transactions });
  assert.deepEqual(selectedIds, ["one"]);
  assert.deepEqual(transactions, before);
});
