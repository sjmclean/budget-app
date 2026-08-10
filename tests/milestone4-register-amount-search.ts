import assert from "node:assert/strict";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes.ts";
import {
  parseRegisterAmountSearchCents,
  transactionMatchesSearch,
} from "../apps/web/src/features/accounts/registerSearch.ts";

function transaction(id: string, outflow: number, inflow = 0): RegisterTransactionView {
  return {
    id,
    date: "2026-08-06",
    payee: "Test payee",
    category: "Testing",
    outflow,
    inflow,
    runningBalance: 0,
    attachmentCount: 0,
    cleared: false,
    reconciled: false,
  };
}

for (const query of ["6", "6.0", "6.00", "$6.00", "-$6.00", "AUD 6.00", "(6.00)"]) {
  assert.equal(parseRegisterAmountSearchCents(query), 600, query);
}
assert.equal(parseRegisterAmountSearchCents("six dollars"), null);

const sixDollarOutflow = transaction("six-out", 6);
const sixDollarInflow = transaction("six-in", 0, 6);
const sixtyDollarOutflow = transaction("sixty", 60);
const sixteenDollarOutflow = transaction("sixteen", 16);

for (const query of ["6", "6.00", "$6.00", "-$6.00"]) {
  const search = { query, scope: "amount" as const, label: query };
  assert.equal(transactionMatchesSearch(sixDollarOutflow, search), true);
  assert.equal(transactionMatchesSearch(sixDollarInflow, search), true);
  assert.equal(transactionMatchesSearch(sixtyDollarOutflow, search), false);
  assert.equal(transactionMatchesSearch(sixteenDollarOutflow, search), false);
}

console.log("Milestone 4 register amount search passed: currency-formatted queries match exact inflows and outflows in minor units.");
