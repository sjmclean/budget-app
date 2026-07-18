import assert from "node:assert/strict";
import {
  createEmptyMerchantKnowledgeStore,
  deriveMostUsedCategory,
  deriveMostUsedTransferAccount,
  findMerchantKnowledge,
  recordMerchantAccountEvidence,
  recordMerchantAliasEvidence,
  recordMerchantCategoryEvidence,
  recordMerchantTransferEvidence,
} from "../apps/web/src/features/accounts/merchantKnowledge";

const firstSeen = "2026-07-01T00:00:00.000Z";
const later = "2026-07-02T00:00:00.000Z";

let store = createEmptyMerchantKnowledgeStore();
store = recordMerchantAliasEvidence({
  store,
  sourceValue: "ALDI 123",
  preferredName: "Aldi",
  observedAt: firstSeen,
});
store = recordMerchantAliasEvidence({
  store,
  sourceValue: "ALDI 123",
  preferredName: "Aldi",
  observedAt: later,
});

const aldi = findMerchantKnowledge(store, "ALDI 999");
assert.ok(aldi, "normalised merchant identity should resolve known aliases");
assert.equal(aldi.preferredName, "Aldi");
assert.equal(aldi.aliases[0]?.occurrenceCount, 2);
assert.equal(aldi.occurrenceCount, 2);

store = recordMerchantCategoryEvidence({
  store,
  merchantName: "Aldi",
  categoryName: "Groceries",
  observedAt: firstSeen,
});
store = recordMerchantCategoryEvidence({
  store,
  merchantName: "Aldi",
  categoryName: "Groceries",
  observedAt: later,
});
store = recordMerchantCategoryEvidence({
  store,
  merchantName: "Aldi",
  categoryName: "Christmas",
  observedAt: later,
});
store = recordMerchantAccountEvidence({
  store,
  merchantName: "Aldi",
  accountId: "everyday",
  observedAt: later,
});
store = recordMerchantTransferEvidence({
  store,
  merchantName: "Visa Payment",
  accountId: "visa",
  accountName: "Visa Card",
  observedAt: later,
});

const updatedAldi = findMerchantKnowledge(store, "Aldi");
assert.ok(updatedAldi);
assert.equal(deriveMostUsedCategory(updatedAldi)?.categoryName, "Groceries");
assert.equal(updatedAldi.accountUsage[0]?.occurrenceCount, 1);

const visaPayment = findMerchantKnowledge(store, "Visa Payment");
assert.ok(visaPayment);
assert.equal(
  deriveMostUsedTransferAccount(visaPayment)?.accountName,
  "Visa Card",
);

assert.equal(
  "confidence" in updatedAldi,
  false,
  "merchant knowledge should store evidence rather than persisted confidence",
);

console.log("v3.16.7 merchant knowledge foundation checks passed");
