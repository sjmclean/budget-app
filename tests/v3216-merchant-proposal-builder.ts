import assert from "node:assert/strict";
import type { MerchantKnowledgeStore } from "../apps/web/src/features/accounts/merchantKnowledge";
import {
  buildTransactionImportMerchantProposal,
  normaliseSuggestedImportCategory,
  resolveTransactionImportMerchant,
} from "../apps/web/src/features/accounts/transactionImportMerchantProposal";

const now = "2026-07-18T00:00:00.000Z";
const store: MerchantKnowledgeStore = {
  merchants: [
    {
      id: "aldi",
      preferredName: "Aldi",
      normalisedName: "aldi",
      occurrenceCount: 4,
      firstSeenAt: now,
      lastSeenAt: now,
      aliases: [
        {
          sourceValue: "Aldi 123",
          normalisedSource: "aldi 123",
          occurrenceCount: 2,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      ],
      categoryUsage: [
        {
          categoryId: "groceries",
          categoryName: "Groceries",
          occurrenceCount: 4,
          firstUsedAt: now,
          lastUsedAt: now,
        },
      ],
      accountUsage: [],
      transferUsage: [],
    },
    {
      id: "transfer-savings",
      preferredName: "Savings Transfer",
      normalisedName: "savings transfer",
      occurrenceCount: 3,
      firstSeenAt: now,
      lastSeenAt: now,
      aliases: [],
      categoryUsage: [],
      accountUsage: [],
      transferUsage: [
        {
          accountId: "savings",
          accountName: "Savings",
          occurrenceCount: 3,
          firstUsedAt: now,
          lastUsedAt: now,
        },
      ],
    },
  ],
};

assert.deepEqual(resolveTransactionImportMerchant(store, "Aldi 123"), {
  canonicalPayee: "Aldi",
  suggestedCategoryName: "Groceries",
  transferAccountName: null,
});

const merchantProposal = buildTransactionImportMerchantProposal({
  store,
  rawPayee: "Aldi 123",
  transaction: { inflow: 0, outflow: 20 },
});
assert.deepEqual(merchantProposal.proposal, {
  payee: "Aldi",
  categoryName: "Groceries",
  transferAccountName: null,
});

const explicitTransfer = buildTransactionImportMerchantProposal({
  store,
  rawPayee: "Transfer: Savings",
  transaction: { inflow: 0, outflow: 50 },
  fallbackCategoryName: "Groceries",
});
assert.deepEqual(explicitTransfer.proposal, {
  payee: "Transfer: Savings",
  categoryName: null,
  transferAccountName: "Savings",
});

const learnedTransfer = buildTransactionImportMerchantProposal({
  store,
  rawPayee: "Savings Transfer",
  transaction: { inflow: 0, outflow: 50 },
});
assert.deepEqual(learnedTransfer.proposal, {
  payee: "Transfer: Savings",
  categoryName: null,
  transferAccountName: "Savings",
});

assert.equal(
  normaliseSuggestedImportCategory("Ready to Assign", {
    inflow: 0,
    outflow: 10,
  }),
  undefined,
);
assert.equal(
  normaliseSuggestedImportCategory("Ready to Assign", {
    inflow: 10,
    outflow: 0,
  }),
  "Ready to Assign",
);

const fallback = buildTransactionImportMerchantProposal({
  store: { merchants: [] },
  rawPayee: "Unknown Shop",
  transaction: { inflow: 0, outflow: 10 },
  fallbackCategoryName: "Household",
});
assert.deepEqual(fallback.proposal, {
  payee: "Unknown Shop",
  categoryName: "Household",
  transferAccountName: null,
});

console.log("v3.21.6 merchant proposal builder checks passed");
