import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import {
  DEFAULT_REGISTER_SORT,
  nextRegisterSort,
  sortRegisterTransactions,
} from "../apps/web/src/features/accounts/registerSorting";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";

const row = (input: Partial<RegisterTransactionView> & Pick<RegisterTransactionView, "id" | "date" | "payee" | "category">): RegisterTransactionView => ({
  attachmentCount: 0,
  inflow: 0,
  outflow: 0,
  runningBalance: 0,
  cleared: false,
  reconciled: false,
  ...input,
});

const transactions = [
  row({ id: "b", date: "2026-07-02", payee: "Zulu", category: "Food", memo: "Beta", outflow: 20 }),
  row({ id: "a", date: "2026-07-03", payee: "alpha", category: "Bills", memo: "Alpha", inflow: 100 }),
  row({ id: "c", date: "2026-07-01", payee: "Bravo", category: "Food", memo: undefined, outflow: 5 }),
];

assert.deepEqual(sortRegisterTransactions(transactions, DEFAULT_REGISTER_SORT).map(({ id }) => id), ["a", "b", "c"]);
assert.deepEqual(sortRegisterTransactions(transactions, { column: "payee", direction: "ascending" }).map(({ id }) => id), ["a", "c", "b"]);
assert.deepEqual(sortRegisterTransactions(transactions, { column: "category", direction: "ascending" }).map(({ id }) => id), ["a", "b", "c"]);
assert.deepEqual(sortRegisterTransactions(transactions, { column: "memo", direction: "ascending" }).map(({ id }) => id), ["c", "a", "b"]);
assert.deepEqual(sortRegisterTransactions(transactions, { column: "outflow", direction: "descending" }).map(({ id }) => id), ["b", "c", "a"]);
assert.deepEqual(sortRegisterTransactions(transactions, { column: "inflow", direction: "descending" }).map(({ id }) => id), ["a", "b", "c"]);

assert.deepEqual(nextRegisterSort(DEFAULT_REGISTER_SORT, "date"), { column: "date", direction: "ascending" });
assert.deepEqual(nextRegisterSort(DEFAULT_REGISTER_SORT, "payee"), { column: "payee", direction: "ascending" });

const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
assert(page.includes('sortableHeader("date", "Date")'));
assert(page.includes('sortableHeader("outflow", "Outflow")'));
assert(page.includes('sortableHeader("inflow", "Inflow")'));
assert(page.includes("writeRegisterSort(registerSortScopeId, next)"));

console.log("v3.07 register column sorting checks passed.");
