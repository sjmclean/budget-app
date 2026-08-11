import assert from "node:assert/strict";
import fs from "node:fs";
import { resolvePayeeRecognition } from "../apps/web/src/features/accounts/payeeRecognition";
import { findMatchingTransactionPayeeAlias } from "../apps/web/src/features/accounts/transactionImport";
import { resolveTransactionImportMerchant } from "../apps/web/src/features/accounts/transactionImportMerchantProposal";
import { reconcileTransactionImportCandidate } from "../apps/web/src/features/accounts/transactionImportReconciliation";
import { summariseTransactionImportOutcomes, verifyPersistedImportTransactions } from "../apps/web/src/features/accounts/transactionImportVerification";
import { buildParsedImportTransaction, buildRegisterTransaction } from "./support/builders/importMatchingBuilders";
import { suggestMerchantKnowledge } from "../apps/web/src/features/accounts/merchantKnowledge";

const payee = (overrides: Record<string, unknown>) => ({
  id: "payee", name: "Payee", createdAt: "", lastUsedAt: "", useCount: 0, ...overrides,
}) as never;

// Explicit rules are authoritative and their matching operators retain their
// exact semantics.
const ruleTarget = payee({ id: "rule", name: "Woolworths", importRules: [{ id: "r", matchType: "contains", text: "WOOLWORTHS" }] });
const aliasTarget = payee({ id: "alias", name: "Other", aliases: [{ id: "a", value: "WOOLWORTHS METRO" }] });
assert.equal(resolvePayeeRecognition("WOOLWORTHS METRO", [aliasTarget, ruleTarget]).match?.payee.id, "rule");

// A learned identity is exact. It cannot swallow a person's name merely
// because one side contains a short token from the other.
const aliases = [{ id: "a", sourcePayee: "J E", targetPayee: "J E Hardware", normalisedSource: "j e", useCount: 1, createdAt: "", updatedAt: "" }];
assert.equal(findMatchingTransactionPayeeAlias("J E Smith", aliases), undefined);

const now = "2026-08-11T00:00:00.000Z";
const store = { merchants: [{
  id: "m", preferredName: "Smith", normalisedName: "smith", occurrenceCount: 10,
  firstSeenAt: now, lastSeenAt: now, aliases: [], categoryUsage: [], accountUsage: [], transferUsage: [],
}] };
assert.equal(resolveTransactionImportMerchant(store, "J E Smith"), undefined,
  "single-token merchant substrings are not automatic recognition");

const surnameStore = { merchants: [{
  id: "johnson", preferredName: "J E Johnson", normalisedName: "johnson",
  occurrenceCount: 20, firstSeenAt: now, lastSeenAt: now,
  aliases: [], categoryUsage: [{
    categoryId: "private", categoryName: "Private category", occurrenceCount: 20,
    firstUsedAt: now, lastUsedAt: now,
  }], accountUsage: [], transferUsage: [],
}] };
const surnameDescription = "Sally Thatcher Transfer Ref 123 JOHNSON";
assert.equal(suggestMerchantKnowledge(surnameStore, surnameDescription), undefined);
assert.equal(resolveTransactionImportMerchant(surnameStore, surnameDescription), undefined,
  "a repeated >=7-character surname must not canonicalise or inherit category");

// Same signed amount and nearby date are only candidates when the merchant is
// different; they must not be auto-matched or removed as overlap.
const imported = buildParsedImportTransaction({ date: "2026-08-05", payee: "GroupTogether payout", outflow: 6 });
const differentPayee = buildRegisterTransaction({ id: "other", date: "2026-08-05", payee: "Coffee Shop", outflow: 6 });
const weak = reconcileTransactionImportCandidate({
  parsed: imported,
  existingTransactions: [
    differentPayee,
    buildRegisterTransaction({ id: "other-2", date: "2026-08-06", payee: "Bus Fare", outflow: 6 }),
  ],
});
assert.equal(weak.status, "new");
assert.equal(weak.recommendation, "import");
assert.equal(weak.candidates.length, 2, "weak candidates remain visible for manual review");
assert.equal(weak.selectedCandidate, undefined);

const exact = reconcileTransactionImportCandidate({
  parsed: imported,
  existingTransactions: [buildRegisterTransaction({ id: "same", date: "2026-08-05", payee: "GroupTogether payout", outflow: 6 })],
});
assert.equal(exact.status, "exact-match");
assert.equal(exact.selectedCandidate?.transaction.id, "same");

// Trusted recognition preserves the canonical entity identity even when the
// imported bank description and the register display text are different.
const trustedCanonical = reconcileTransactionImportCandidate({
  parsed: buildParsedImportTransaction({
    date: "2026-08-05",
    payee: "STATE GOVT PAYMENT REF 83920",
    outflow: 84.2,
  }),
  existingTransactions: [buildRegisterTransaction({
    id: "trusted-register-row",
    date: "2026-08-05",
    payee: "Department payment",
    payeeId: "government-department",
    outflow: 84.2,
  })],
  merchantResolution: {
    canonicalPayee: "Government Department",
    canonicalPayeeId: "government-department",
    suggestedCategoryName: "Government charges",
    transferAccountName: null,
    recognitionProvenance: "explicit-rule",
  },
});
assert.equal(trustedCanonical.status, "exact-match");
assert.equal(
  trustedCanonical.selectedCandidate?.transaction.id,
  "trusted-register-row",
);
assert.match(
  trustedCanonical.selectedCandidate?.evidence.find(
    (entry) => entry.label === "Merchant",
  )?.detail ?? "",
  /trusted canonical payee/i,
);

assert.deepEqual(
  summariseTransactionImportOutcomes({
    total: 6,
    imported: 2,
    matched: 1,
    skipped: 1,
    failed: 1,
    alreadyPresent: 1,
  }),
  {
    total: 6,
    imported: 2,
    matched: 1,
    skipped: 1,
    failed: 1,
    alreadyPresent: 1,
  },
);
assert.throws(() =>
  summariseTransactionImportOutcomes({
    total: 6,
    imported: 2,
    matched: 1,
    skipped: 1,
    failed: 0,
    alreadyPresent: 1,
  }),
);

verifyPersistedImportTransactions([
  { id: "import-1", date: "2026-08-05", rawPayee: "GROUPTOGETHER 123", payee: "GroupTogether", category: "Gifts", inflow: 6, outflow: 0 },
], [buildRegisterTransaction({ id: "import-1", date: "2026-08-05", rawPayee: "GROUPTOGETHER 123", payee: "GroupTogether", category: "Gifts", inflow: 6, outflow: 0 })]);

const dialogSource = fs.readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
assert.doesNotMatch(
  dialogSource,
  /candidate\.matchCandidates!\[0\]\.transaction\.id/,
  "opening weak-match review must not select the first candidate",
);
assert.match(dialogSource, /setWeakMatchReviewCandidateId\(candidate\.id\)/);
assert.match(dialogSource, /Review possible register matches/);
assert.match(dialogSource, /No transaction is selected/);
for (const label of ["Date", "Payee", "Amount", "Category", "Memo", "Cleared"]) {
  assert.match(dialogSource, new RegExp(`<dt>${label}<\\/dt>`));
}
assert.match(dialogSource, /Choose this transaction/);
assert.match(dialogSource, /setWeakMatchReviewCandidateId\(null\)/);
assert.doesNotMatch(
  dialogSource,
  /weakMatchReviewCandidateId === candidate\.id[\s\S]{0,400}transaction-import-register-match-options/,
  "weak matches must open a dedicated visible dialog, not an absolutely positioned inline list",
);
assert.match(dialogSource, /loadTransactionsByIds\(accountId, ids\)/);
assert.doesNotMatch(
  dialogSource,
  /persisted = await loadAccountTransactions\(selectedAccountId\)/,
  "verification must not scan the first register page",
);

const historicalRows = Array.from({ length: 301 }, (_, index) =>
  buildRegisterTransaction({
    id: index === 300 ? "old-import" : `existing-${index}`,
    date: index === 300 ? "2001-01-01" : "2026-08-05",
    rawPayee: index === 300 ? "OLD BANK TEXT" : undefined,
    payee: index === 300 ? "Old Merchant" : "Existing",
    inflow: index === 300 ? 1 : 0,
    outflow: index === 300 ? 0 : 1,
  }),
);
verifyPersistedImportTransactions(
  [{
    id: "old-import", date: "2001-01-01", rawPayee: "OLD BANK TEXT",
    payee: "Old Merchant", category: "Uncategorised", inflow: 1, outflow: 0,
  }],
  historicalRows.filter((row) => row.id === "old-import"),
);

console.log("Milestone 4 transaction import hardening contracts passed.");
