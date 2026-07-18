import {
  recordMerchantAliasEvidence,
  writeMerchantKnowledge,
  type MerchantKnowledgeStore,
} from "./merchantKnowledge";

export function persistMerchantKnowledge(
  store: MerchantKnowledgeStore,
): MerchantKnowledgeStore {
  writeMerchantKnowledge(store);
  return store;
}

export function acceptMerchantAlias({
  store,
  sourceValue,
  preferredName,
  observedAt,
}: {
  store: MerchantKnowledgeStore;
  sourceValue: string;
  preferredName: string;
  observedAt?: string;
}): MerchantKnowledgeStore {
  const nextStore = recordMerchantAliasEvidence({
    store,
    sourceValue,
    preferredName,
    observedAt,
  });

  return persistMerchantKnowledge(nextStore);
}
