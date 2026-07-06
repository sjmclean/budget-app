import assert from "node:assert/strict";
import {
  createTransactionPayeeAlias,
  suggestTransactionPayeeAliases,
  type TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport";
import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes";

function registerTransaction(overrides: Partial<RegisterTransactionView>): RegisterTransactionView {
  return {
    id: "tx-existing-1",
    date: "2026-06-26",
    flag: null,
    attachmentCount: 0,
    payee: "Aldi",
    category: "Groceries",
    inflow: 0,
    outflow: 23.45,
    runningBalance: 100,
    cleared: true,
    reconciled: false,
    ...overrides,
  };
}

function importCandidate(overrides: Partial<TransactionImportCandidate>): TransactionImportCandidate {
  return {
    id: "candidate-1",
    parsed: {
      rowNumber: 2,
      date: "2026-06-27",
      payee: "ALDI 1234",
      outflow: 12.3,
      inflow: 0,
      raw: {},
    },
    status: "new",
    reason: "No matching transaction found in this register.",
    selected: true,
    errors: [],
    ...overrides,
  };
}

const suggestions = suggestTransactionPayeeAliases({
  candidates: [importCandidate({})],
  existingTransactions: [registerTransaction({})],
  aliases: [],
});

assert.equal(suggestions.length, 1);
assert.equal(suggestions[0].sourcePayee, "ALDI 1234");
assert.equal(suggestions[0].suggestedTargetPayee, "Aldi");
assert.equal(suggestions[0].normalisedSource, "aldi");
assert.match(suggestions[0].reason, /existing payee Aldi/);

const repeatedSuggestions = suggestTransactionPayeeAliases({
  candidates: [
    importCandidate({ id: "candidate-1" }),
    importCandidate({
      id: "candidate-2",
      parsed: {
        rowNumber: 3,
        date: "2026-06-28",
        payee: "ALDI 5678",
        outflow: 9.2,
        inflow: 0,
        raw: {},
      },
    }),
  ],
  existingTransactions: [registerTransaction({})],
  aliases: [],
});

assert.equal(repeatedSuggestions.length, 1);
assert.equal(repeatedSuggestions[0].occurrenceCount, 2);
assert.match(repeatedSuggestions[0].reason, /Found 2 imported rows/);

const existingAlias = createTransactionPayeeAlias({
  sourcePayee: "ALDI 9999",
  targetPayee: "Aldi",
});

const suppressedSuggestions = suggestTransactionPayeeAliases({
  candidates: [importCandidate({})],
  existingTransactions: [registerTransaction({})],
  aliases: [existingAlias],
});

assert.equal(
  suppressedSuggestions.length,
  0,
  "existing aliases should suppress duplicate alias suggestions",
);

console.log("v2.62.5 transaction intake alias suggestion checks passed");
