import assert from "node:assert/strict";
import {
  buildMerchantKnowledgeFromTransactions,
  createEmptyMerchantKnowledgeStore,
  suggestMerchantKnowledge,
} from "../apps/web/src/features/accounts/merchantKnowledge";

const store = buildMerchantKnowledgeFromTransactions({
  seedStore: createEmptyMerchantKnowledgeStore(),
  observations: [
    ...Array.from({ length: 5 }, (_, index) => ({
      accountId: "visa",
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      payee: "Netflix",
      categoryName: "Netflix",
    })),
    {
      accountId: "visa",
      date: "2026-07-10",
      payee: "Netflix",
      categoryName: "Entertainment",
    },
  ],
});

const suggestion = suggestMerchantKnowledge(store, "NETFLIX XYZ 12345");
assert.equal(suggestion?.preferredName, "Netflix");
assert.equal(suggestion?.categoryName, "Netflix");
assert.equal(suggestMerchantKnowledge(store, "Cafe 123")?.preferredName, undefined);

console.log("v3.18.4 merchant knowledge bootstrap checks passed");
