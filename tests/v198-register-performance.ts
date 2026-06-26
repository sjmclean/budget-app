import assert from "node:assert/strict";
import { buildPayeeRegisterSummaries } from "../apps/web/src/features/accounts/payeeRegisterSummaries";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import type { PayeeView } from "../apps/web/src/features/accounts/payeeService";

function makePayee(index: number): PayeeView {
  return {
    id: `payee-${index}`,
    name: `Payee ${index}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-01-01T00:00:00.000Z",
    useCount: 0,
  };
}

function makeTransaction(index: number): RegisterTransactionView {
  const payeeIndex = index % 250;
  const day = `${(index % 28) + 1}`.padStart(2, "0");

  return {
    id: `transaction-${index}`,
    date: `2026-06-${day}`,
    flag: null,
    attachmentCount: 0,
    attachments: [],
    payee: `Payee ${payeeIndex}`,
    payeeId: index % 2 === 0 ? `payee-${payeeIndex}` : undefined,
    category: "Groceries",
    categoryId: "cat-groceries",
    memo: "",
    inflow: 0,
    outflow: 10,
    runningBalance: 0,
    cleared: false,
    reconciled: false,
  };
}

const payees = Array.from({ length: 250 }, (_, index) => makePayee(index));
const transactions = Array.from({ length: 10_000 }, (_, index) => makeTransaction(index));

const summaries = buildPayeeRegisterSummaries(payees, transactions);

assert.equal(summaries.length, 250);
assert.equal(summaries[0].registerTransactionCount, 40);
assert.equal(summaries[0].lastUsed, "2026-06-27");
assert.equal(summaries[1].registerTransactionCount, 40);
assert.equal(summaries[1].lastUsed, "2026-06-28");

const fallbackSummary = buildPayeeRegisterSummaries(
  [
    {
      id: "fallback-payee",
      name: "  Mixed   Spacing  ",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: "2026-01-01T00:00:00.000Z",
      useCount: 0,
    },
  ],
  [
    {
      id: "fallback-transaction",
      date: "2026-07-14",
      flag: null,
      attachmentCount: 0,
      attachments: [],
      payee: "mixed spacing",
      category: "Groceries",
      categoryId: "cat-groceries",
      memo: "",
      inflow: 0,
      outflow: 10,
      runningBalance: 0,
      cleared: false,
      reconciled: false,
    },
  ],
);

assert.equal(fallbackSummary[0].registerTransactionCount, 1);
assert.equal(fallbackSummary[0].lastUsed, "2026-07-14");

const idWinsOverNameSummary = buildPayeeRegisterSummaries(
  [
    makePayee(1),
    {
      ...makePayee(999),
      name: "Payee 1",
    },
  ],
  [
    {
      ...makeTransaction(1),
      payeeId: "payee-999",
      payee: "Payee 1",
      date: "2026-08-01",
    },
  ],
);

assert.equal(idWinsOverNameSummary[0].registerTransactionCount, 0);
assert.equal(idWinsOverNameSummary[1].registerTransactionCount, 1);
assert.equal(idWinsOverNameSummary[1].lastUsed, "2026-08-01");

console.log("v1.98 register performance checks passed");
