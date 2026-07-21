import assert from "node:assert/strict";
import type { TransactionImportCandidate } from "../apps/web/src/features/accounts/transactionImport";
import {
  buildRegisterTransactionsFromImport as buildFromFacade,
} from "../apps/web/src/features/accounts/transactionImport";
import {
  buildRegisterTransactionsFromImport,
} from "../apps/web/src/features/accounts/transactionImportCommit";

function candidate(
  overrides: Partial<TransactionImportCandidate> & {
    parsed?: Partial<TransactionImportCandidate["parsed"]>;
  } = {},
): TransactionImportCandidate {
  const { parsed: parsedOverrides, ...candidateOverrides } = overrides;
  const parsed = {
    rowNumber: 2,
    date: "2026-07-16",
    payee: "Example",
    outflow: 12.34,
    inflow: 0,
    raw: {},
    ...parsedOverrides,
  };
  const transferAccountName = parsed.transferAccountName?.trim() || null;
  const proposedPayee = transferAccountName
    ? `Transfer: ${transferAccountName}`
    : parsed.payee;

  return {
    id: "row-2",
    parsed,
    status: "new",
    reason: "New transaction.",
    selected: true,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: parsed.rowNumber,
        date: parsed.date,
        rawPayee: parsed.payee,
        memo: parsed.memo,
        importedCategoryName: parsed.importedCategoryName,
        transferAccountName: parsed.transferAccountName,
        outflow: parsed.outflow,
        inflow: parsed.inflow,
      },
      merchant: {
        canonicalPayee: proposedPayee,
        suggestedCategoryName: parsed.importedCategoryName?.trim() || null,
        transferAccountName,
      },
      proposal: {
        payee: proposedPayee,
        categoryName: parsed.importedCategoryName?.trim() || null,
        transferAccountName,
      },
    },
    ...candidateOverrides,
  };
}

const candidates = [
  candidate(),
  candidate({
    id: "row-3",
    parsed: {
      rowNumber: 3,
      payee: "Employer",
      outflow: 0,
      inflow: 1500,
    },
  }),
  candidate({
    id: "row-4",
    parsed: {
      rowNumber: 4,
      payee: "Internal transfer",
      transferAccountName: "Savings",
      outflow: 250,
      inflow: 0,
    },
  }),
  candidate({ id: "row-5", selected: false }),
  candidate({ id: "row-6", status: "possible-match" }),
];

const expected = [
  {
    date: "2026-07-16",
    payee: "Example",
    category: "Uncategorised",
    categoryId: undefined,
    memo: undefined,
    outflow: 12.34,
    inflow: 0,
  },
  {
    date: "2026-07-16",
    payee: "Employer",
    category: "Ready to Assign",
    categoryId: "__ready_to_assign__",
    memo: undefined,
    outflow: 0,
    inflow: 1500,
  },
  {
    date: "2026-07-16",
    payee: "Transfer: Savings",
    category: "Transfer",
    categoryId: undefined,
    memo: undefined,
    outflow: 250,
    inflow: 0,
  },
];

assert.deepEqual(buildRegisterTransactionsFromImport(candidates), expected);
assert.deepEqual(buildFromFacade(candidates), expected);

console.log("v3.16.0 import commit extraction checks passed");
