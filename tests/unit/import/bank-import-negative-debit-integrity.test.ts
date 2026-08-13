import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTransactionCsv,
} from "../../../apps/web/src/features/accounts/transactionImportParser.js";

test("CSV import preserves a negative value in an explicitly mapped outflow column", () => {
  const csv = [
    "Date,Payee,Debit,Credit",
    "2026-08-10,Coffee Shop,-12.34,",
  ].join("\n");

  const [transaction] = parseTransactionCsv(csv, {
    0: "date",
    1: "payee",
    2: "outflow",
    3: "inflow",
  });

  assert.ok(transaction);
  assert.equal(transaction.outflow, 12.34);
  assert.equal(transaction.inflow, 0);
});

test("CSV import preserves a negative value in an explicitly mapped inflow column", () => {
  const csv = [
    "Date,Payee,Debit,Credit",
    "2026-08-11,Refund,, -25.50",
  ].join("\n");

  const [transaction] = parseTransactionCsv(csv, {
    0: "date",
    1: "payee",
    2: "outflow",
    3: "inflow",
  });

  assert.ok(transaction);
  assert.equal(transaction.outflow, 0);
  assert.equal(transaction.inflow, 25.5);
});
