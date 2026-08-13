import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRegisterTransactionsFromImport,
  type TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport.js";

function candidate(): TransactionImportCandidate {
  return {
    id: "row-2",
    parsed: {
      rowNumber: 2,
      date: "2026-08-05",
      payee: "Coffee Shop",
      inflow: 0,
      outflow: 5,
      raw: {},
    },
    status: "new",
    reason: "reviewed as a new transaction",
    selected: true,
    reviewDecision: "import-as-new",
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 2,
        date: "2026-08-05",
        rawPayee: "Coffee Shop",
        inflow: 0,
        outflow: 5,
      },
      merchant: {
        canonicalPayee: "Coffee Shop",
        suggestedCategoryName: null,
        transferAccountName: null,
      },
      proposal: {
        payee: "Coffee Shop",
        categoryName: null,
        transferAccountName: null,
      },
    },
  };
}

function build(identityScope: string) {
  const [transaction] = buildRegisterTransactionsFromImport(
    [candidate()],
    { identityScope },
  );
  assert.ok(transaction?.id);
  return transaction;
}

test("identical transactions from different source files receive different persistence IDs", () => {
  const first = build("sha256:file-a");
  const second = build("sha256:file-b");

  assert.notEqual(
    first.id,
    second.id,
    "separate source files must not target the same persisted transaction record",
  );
});

test("retrying the same source transaction keeps the same persistence ID", () => {
  const first = build("sha256:file-a");
  const retry = build("sha256:file-a");

  assert.equal(
    first.id,
    retry.id,
    "retrying the same source file must retain deterministic transaction identity",
  );
});

test("building selected imports without a source identity is rejected", () => {
  assert.throws(
    () => buildRegisterTransactionsFromImport([candidate()]),
    /stable source identity/i,
  );
});
