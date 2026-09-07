import assert from "node:assert/strict";
import test from "node:test";
import type {
  RegisterTransactionView,
} from "../../../apps/web/src/features/accounts/accountRegisterTypes";
import type {
  TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport";
import {
  findHistoricalRegisterPayeeMatches,
  markImportReviewFieldEdited,
  propagateImportReviewField,
} from "../../../apps/web/src/features/accounts/transactionImportReviewPropagation";

function candidate({
  id,
  rawPayee,
  payee = rawPayee,
  categoryName = "Dining",
  status = "new",
  transferAccountName = null,
  split = false,
}: {
  id: string;
  rawPayee: string;
  payee?: string;
  categoryName?: string | null;
  status?: TransactionImportCandidate["status"];
  transferAccountName?: string | null;
  split?: boolean;
}): TransactionImportCandidate {
  return {
    id,
    parsed: {
      rowNumber: Number(id.replace(/\D/g, "")) || 1,
      date: "2026-09-01",
      payee: rawPayee,
      outflow: 10,
      inflow: 0,
    },
    status,
    reason: "",
    selected: false,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 1,
        date: "2026-09-01",
        rawPayee,
        outflow: 10,
        inflow: 0,
      },
      merchant: {
        canonicalPayee: payee,
        suggestedCategoryName: categoryName,
        transferAccountName,
      },
      proposal: {
        payee,
        categoryName: split ? "Split" : categoryName,
        transferAccountName,
        splitLines: split
          ? [
              { id: `${id}-a`, category: "Food", outflow: 5, inflow: 0 },
              { id: `${id}-b`, category: "Other", outflow: 5, inflow: 0 },
            ]
          : undefined,
      },
    },
  } as TransactionImportCandidate;
}

function registerTransaction(
  overrides: Partial<RegisterTransactionView> & Pick<RegisterTransactionView, "id" | "payee">,
): RegisterTransactionView {
  return {
    date: "2026-08-01",
    attachmentCount: 0,
    category: "Dining",
    inflow: 0,
    outflow: 10,
    runningBalance: 0,
    cleared: true,
    reconciled: false,
    ...overrides,
  };
}

test("payee correction propagates by normalised raw bank identity", () => {
  const candidates = [
    candidate({ id: "row-1", rawPayee: "XYZ PTY LTD" }),
    candidate({ id: "row-2", rawPayee: "xyz   pty-ltd" }),
    candidate({ id: "row-3", rawPayee: "Different Shop" }),
  ];
  const manualEdits = markImportReviewFieldEdited({}, "row-1", "payee");

  const updated = propagateImportReviewField({
    candidates,
    sourceCandidateId: "row-1",
    field: "payee",
    value: "XXX YYY",
    manualEdits,
  });

  assert.equal(updated[0].lifecycle.proposal.payee, "XXX YYY");
  assert.equal(updated[1].lifecycle.proposal.payee, "XXX YYY");
  assert.equal(updated[2].lifecycle.proposal.payee, "Different Shop");
});

test("same-file propagation never overwrites another explicit field edit", () => {
  const candidates = [
    candidate({ id: "row-1", rawPayee: "XYZ PTY LTD" }),
    candidate({ id: "row-2", rawPayee: "XYZ PTY LTD", payee: "Special Refund" }),
  ];
  let manualEdits = markImportReviewFieldEdited({}, "row-1", "payee");
  manualEdits = markImportReviewFieldEdited(manualEdits, "row-2", "payee");

  const updated = propagateImportReviewField({
    candidates,
    sourceCandidateId: "row-1",
    field: "payee",
    value: "XXX YYY",
    manualEdits,
  });

  assert.equal(updated[0].lifecycle.proposal.payee, "XXX YYY");
  assert.equal(updated[1].lifecycle.proposal.payee, "Special Refund");
});

test("category correction propagates only to compatible untouched import rows", () => {
  const candidates = [
    candidate({ id: "row-1", rawPayee: "XYZ PTY LTD" }),
    candidate({ id: "row-2", rawPayee: "XYZ PTY LTD" }),
    candidate({ id: "row-3", rawPayee: "XYZ PTY LTD", transferAccountName: "Savings" }),
    candidate({ id: "row-4", rawPayee: "XYZ PTY LTD", split: true }),
    candidate({ id: "row-5", rawPayee: "XYZ PTY LTD", categoryName: "Fuel" }),
  ];
  let manualEdits = markImportReviewFieldEdited({}, "row-1", "category");
  manualEdits = markImportReviewFieldEdited(manualEdits, "row-5", "category");

  const updated = propagateImportReviewField({
    candidates,
    sourceCandidateId: "row-1",
    field: "category",
    value: "Groceries",
    manualEdits,
  });

  assert.equal(updated[0].lifecycle.proposal.categoryName, "Groceries");
  assert.equal(updated[1].lifecycle.proposal.categoryName, "Groceries");
  assert.equal(updated[2].lifecycle.proposal.transferAccountName, "Savings");
  assert.equal(updated[3].lifecycle.proposal.categoryName, "Split");
  assert.equal(updated[4].lifecycle.proposal.categoryName, "Fuel");
});

test("same-file propagation does not silently edit matched register candidates", () => {
  const candidates = [
    candidate({ id: "row-1", rawPayee: "XYZ PTY LTD" }),
    candidate({ id: "row-2", rawPayee: "XYZ PTY LTD", status: "exact-match" }),
  ];
  const manualEdits = markImportReviewFieldEdited({}, "row-1", "payee");

  const updated = propagateImportReviewField({
    candidates,
    sourceCandidateId: "row-1",
    field: "payee",
    value: "XXX YYY",
    manualEdits,
  });

  assert.equal(updated[1].lifecycle.proposal.payee, "XYZ PTY LTD");
});

test("historical register payee matches require rawPayee and exclude protected rows", () => {
  const transactions = [
    registerTransaction({ id: "eligible", payee: "Old Display", rawPayee: "XYZ PTY LTD" }),
    registerTransaction({ id: "normalised", payee: "Other Display", rawPayee: "xyz  pty-ltd" }),
    registerTransaction({ id: "display-only", payee: "XYZ PTY LTD" }),
    registerTransaction({ id: "reconciled", payee: "Old Display", rawPayee: "XYZ PTY LTD", reconciled: true }),
    registerTransaction({ id: "transfer", payee: "Transfer: Savings", rawPayee: "XYZ PTY LTD", transferAccountId: "savings" }),
    registerTransaction({ id: "already", payee: "XXX YYY", rawPayee: "XYZ PTY LTD" }),
    registerTransaction({ id: "different", payee: "Old Display", rawPayee: "ABC STORE" }),
  ];

  const matches = findHistoricalRegisterPayeeMatches(
    transactions,
    "XYZ PTY LTD",
    "XXX YYY",
  );

  assert.deepEqual(matches.eligible.map(({ transaction }) => transaction.id), [
    "eligible",
    "normalised",
  ]);
  assert.equal(matches.reconciledExcluded, 1);
  assert.ok(matches.eligible.every(({ payee }) => payee === "XXX YYY"));
  assert.ok(matches.eligible.every(({ transaction }) => transaction.category === "Dining"));
});
