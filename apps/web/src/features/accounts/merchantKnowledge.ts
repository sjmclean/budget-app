import { createBudgetScopedStorage } from "../budget/budgetDataScope";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage";
import { normaliseMerchant } from "./merchantNormalisation";
import { readMerchantKnowledgeEntities, replaceMerchantKnowledgeEntities } from "./entities/importKnowledgeEntity";

export const MERCHANT_KNOWLEDGE_STORAGE_KEY =
  "budget-app.merchant-knowledge.v1";

export interface MerchantAliasEvidence {
  sourceValue: string;
  normalisedSource: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface MerchantCategoryEvidence {
  categoryId?: string;
  categoryName: string;
  occurrenceCount: number;
  firstUsedAt: string;
  lastUsedAt: string;
}

export interface MerchantAccountEvidence {
  accountId: string;
  occurrenceCount: number;
  firstUsedAt: string;
  lastUsedAt: string;
}

export interface MerchantTransferEvidence {
  accountId: string;
  accountName: string;
  occurrenceCount: number;
  firstUsedAt: string;
  lastUsedAt: string;
}

export interface MerchantKnowledgeRecord {
  id: string;
  preferredName: string;
  normalisedName: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  aliases: MerchantAliasEvidence[];
  categoryUsage: MerchantCategoryEvidence[];
  accountUsage: MerchantAccountEvidence[];
  transferUsage: MerchantTransferEvidence[];
}

export interface MerchantKnowledgeStore {
  merchants: MerchantKnowledgeRecord[];
}


export interface MerchantKnowledgeTransactionObservation {
  accountId: string;
  date: string;
  payee: string;
  categoryId?: string;
  categoryName?: string;
  transferAccountId?: string;
  transferAccountName?: string;
}

export interface MerchantKnowledgeSuggestion {
  preferredName: string;
  categoryId?: string;
  categoryName?: string;
  transferAccountId?: string;
  transferAccountName?: string;
}

export function buildMerchantKnowledgeFromTransactions({
  observations,
  seedStore = createEmptyMerchantKnowledgeStore(),
}: {
  observations: MerchantKnowledgeTransactionObservation[];
  seedStore?: MerchantKnowledgeStore;
}): MerchantKnowledgeStore {
  let store: MerchantKnowledgeStore = {
    merchants: seedStore.merchants.map((merchant) => ({
      ...merchant,
      occurrenceCount: 0,
      aliases: merchant.aliases.map((alias) => ({
        ...alias,
        occurrenceCount: 0,
      })),
      categoryUsage: [],
      accountUsage: [],
      transferUsage: [],
    })),
  };

  for (const observation of observations) {
    const payee = observation.payee.trim();
    if (!payee || payee.toLowerCase().startsWith("transfer:")) continue;

    const observedAt = observation.date
      ? `${observation.date}T00:00:00.000Z`
      : new Date().toISOString();
    store = recordMerchantAliasEvidence({
      store,
      sourceValue: payee,
      preferredName: payee,
      observedAt,
    });
    store = recordMerchantAccountEvidence({
      store,
      merchantName: payee,
      accountId: observation.accountId,
      observedAt,
    });
    if (observation.categoryName?.trim()) {
      store = recordMerchantCategoryEvidence({
        store,
        merchantName: payee,
        categoryId: observation.categoryId,
        categoryName: observation.categoryName,
        observedAt,
      });
    }
    if (observation.transferAccountId && observation.transferAccountName) {
      store = recordMerchantTransferEvidence({
        store,
        merchantName: payee,
        accountId: observation.transferAccountId,
        accountName: observation.transferAccountName,
        observedAt,
      });
    }
  }

  return store;
}

export function suggestMerchantKnowledge(
  store: MerchantKnowledgeStore,
  sourcePayee: string,
): MerchantKnowledgeSuggestion | undefined {
  const source = normaliseMerchant(sourcePayee);
  if (!source.canonical) return undefined;

  const candidates = store.merchants
    .map((merchant) => ({ merchant, score: merchantSuggestionScore(source.canonical, merchant) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      right.merchant.occurrenceCount - left.merchant.occurrenceCount ||
      right.merchant.lastSeenAt.localeCompare(left.merchant.lastSeenAt),
    );
  const merchant = candidates[0]?.merchant;
  if (!merchant) return undefined;
  const category = deriveMostUsedCategory(merchant);
  const transfer = deriveMostUsedTransferAccount(merchant);
  return {
    preferredName: merchant.preferredName,
    categoryId: category?.categoryId,
    categoryName: category?.categoryName,
    transferAccountId: transfer?.accountId,
    transferAccountName: transfer?.accountName,
  };
}

function merchantSuggestionScore(
  sourceCanonical: string,
  merchant: MerchantKnowledgeRecord,
): number {
  const values = [merchant.normalisedName, ...merchant.aliases.map((alias) => alias.normalisedSource)];
  let best = 0;
  for (const value of values) {
    if (!value) continue;
    if (value === sourceCanonical) best = Math.max(best, 100);
    else if (sourceCanonical.includes(value) || value.includes(sourceCanonical)) {
      const shorter = value.length <= sourceCanonical.length ? value : sourceCanonical;
      const tokens = shorter.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2 || (tokens[0]?.length ?? 0) >= 6) best = Math.max(best, 80);
    }
  }
  return best;
}

export function createEmptyMerchantKnowledgeStore(): MerchantKnowledgeStore {
  return { merchants: [] };
}

export function createMerchantKnowledgeRecord(
  preferredName: string,
  observedAt = new Date().toISOString(),
): MerchantKnowledgeRecord {
  const trimmedName = preferredName.trim();
  const normalisedName = normaliseMerchant(trimmedName).canonical;

  return {
    id: createMerchantKnowledgeId(normalisedName || trimmedName),
    preferredName: trimmedName,
    normalisedName,
    occurrenceCount: 0,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    aliases: [],
    categoryUsage: [],
    accountUsage: [],
    transferUsage: [],
  };
}

export function findMerchantKnowledge(
  store: MerchantKnowledgeStore,
  value: string,
): MerchantKnowledgeRecord | undefined {
  const normalised = normaliseMerchant(value).canonical;

  if (!normalised) return undefined;

  return store.merchants.find(
    (merchant) =>
      merchant.normalisedName === normalised ||
      merchant.aliases.some((alias) => alias.normalisedSource === normalised),
  );
}

export function recordMerchantAliasEvidence({
  store,
  sourceValue,
  preferredName,
  observedAt = new Date().toISOString(),
}: {
  store: MerchantKnowledgeStore;
  sourceValue: string;
  preferredName: string;
  observedAt?: string;
}): MerchantKnowledgeStore {
  const trimmedPreferredName = preferredName.trim();
  const normalisedPreferredName = normaliseMerchant(trimmedPreferredName).canonical;
  const normalisedSource = normaliseMerchant(sourceValue).canonical;

  if (!trimmedPreferredName || !normalisedPreferredName || !normalisedSource) {
    return store;
  }

  const existing = findMerchantKnowledge(store, trimmedPreferredName);
  const merchant = existing ??
    createMerchantKnowledgeRecord(trimmedPreferredName, observedAt);
  const nextAlias = upsertAliasEvidence(
    merchant.aliases,
    sourceValue,
    normalisedSource,
    observedAt,
  );
  const nextMerchant: MerchantKnowledgeRecord = {
    ...merchant,
    preferredName: trimmedPreferredName,
    normalisedName: normalisedPreferredName,
    occurrenceCount: merchant.occurrenceCount + 1,
    firstSeenAt: minIsoDate(merchant.firstSeenAt, observedAt),
    lastSeenAt: maxIsoDate(merchant.lastSeenAt, observedAt),
    aliases: nextAlias,
  };

  return {
    merchants: existing
      ? store.merchants.map((entry) =>
          entry.id === existing.id ? nextMerchant : entry,
        )
      : [...store.merchants, nextMerchant],
  };
}

export function recordMerchantCategoryEvidence({
  store,
  merchantName,
  categoryId,
  categoryName,
  observedAt = new Date().toISOString(),
}: {
  store: MerchantKnowledgeStore;
  merchantName: string;
  categoryId?: string;
  categoryName: string;
  observedAt?: string;
}): MerchantKnowledgeStore {
  const category = categoryName.trim();
  if (!category) return store;

  return updateMerchant(store, merchantName, observedAt, (merchant) => ({
    ...merchant,
    categoryUsage: upsertCategoryEvidence(
      merchant.categoryUsage,
      categoryId,
      category,
      observedAt,
    ),
  }));
}

export function recordMerchantAccountEvidence({
  store,
  merchantName,
  accountId,
  observedAt = new Date().toISOString(),
}: {
  store: MerchantKnowledgeStore;
  merchantName: string;
  accountId: string;
  observedAt?: string;
}): MerchantKnowledgeStore {
  if (!accountId.trim()) return store;

  return updateMerchant(store, merchantName, observedAt, (merchant) => ({
    ...merchant,
    accountUsage: upsertAccountEvidence(
      merchant.accountUsage,
      accountId,
      observedAt,
    ),
  }));
}

export function recordMerchantTransferEvidence({
  store,
  merchantName,
  accountId,
  accountName,
  observedAt = new Date().toISOString(),
}: {
  store: MerchantKnowledgeStore;
  merchantName: string;
  accountId: string;
  accountName: string;
  observedAt?: string;
}): MerchantKnowledgeStore {
  if (!accountId.trim() || !accountName.trim()) return store;

  return updateMerchant(store, merchantName, observedAt, (merchant) => ({
    ...merchant,
    transferUsage: upsertTransferEvidence(
      merchant.transferUsage,
      accountId,
      accountName,
      observedAt,
    ),
  }));
}

export function deriveMostUsedCategory(
  merchant: MerchantKnowledgeRecord,
): MerchantCategoryEvidence | undefined {
  return [...merchant.categoryUsage].sort(compareEvidence)[0];
}

export function deriveMostUsedTransferAccount(
  merchant: MerchantKnowledgeRecord,
): MerchantTransferEvidence | undefined {
  return [...merchant.transferUsage].sort(compareEvidence)[0];
}

function getMerchantKnowledgeStorage() {
  return createBudgetScopedStorage(getActiveKeyValueStorage());
}

export function readMerchantKnowledge(): MerchantKnowledgeStore {
  try {
    return { merchants: readMerchantKnowledgeEntities(getMerchantKnowledgeStorage()) };
  } catch {
    return createEmptyMerchantKnowledgeStore();
  }
}

export function writeMerchantKnowledge(store: MerchantKnowledgeStore): void {
  try {
    replaceMerchantKnowledgeEntities(getMerchantKnowledgeStorage(), store.merchants);
  } catch {
    // Merchant suggestions must not prevent register or import workflows when persistence is unavailable.
  }
}

function updateMerchant(
  store: MerchantKnowledgeStore,
  merchantName: string,
  observedAt: string,
  update: (merchant: MerchantKnowledgeRecord) => MerchantKnowledgeRecord,
): MerchantKnowledgeStore {
  const trimmedName = merchantName.trim();
  if (!trimmedName) return store;

  const existing = findMerchantKnowledge(store, trimmedName);
  const base = existing ?? createMerchantKnowledgeRecord(trimmedName, observedAt);
  const updated = update({
    ...base,
    occurrenceCount: base.occurrenceCount + 1,
    firstSeenAt: minIsoDate(base.firstSeenAt, observedAt),
    lastSeenAt: maxIsoDate(base.lastSeenAt, observedAt),
  });

  return {
    merchants: existing
      ? store.merchants.map((merchant) =>
          merchant.id === existing.id ? updated : merchant,
        )
      : [...store.merchants, updated],
  };
}

function upsertAliasEvidence(
  aliases: MerchantAliasEvidence[],
  sourceValue: string,
  normalisedSource: string,
  observedAt: string,
): MerchantAliasEvidence[] {
  const existing = aliases.find(
    (alias) => alias.normalisedSource === normalisedSource,
  );

  if (!existing) {
    return [
      ...aliases,
      {
        sourceValue: sourceValue.trim(),
        normalisedSource,
        occurrenceCount: 1,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      },
    ];
  }

  return aliases.map((alias) =>
    alias.normalisedSource === normalisedSource
      ? {
          ...alias,
          sourceValue: sourceValue.trim(),
          occurrenceCount: alias.occurrenceCount + 1,
          lastSeenAt: maxIsoDate(alias.lastSeenAt, observedAt),
        }
      : alias,
  );
}

function upsertCategoryEvidence(
  categories: MerchantCategoryEvidence[],
  categoryId: string | undefined,
  categoryName: string,
  observedAt: string,
): MerchantCategoryEvidence[] {
  const normalisedCategory = categoryName.trim().toLowerCase();
  const existing = categories.find(
    (entry) =>
      (categoryId && entry.categoryId === categoryId) ||
      entry.categoryName.trim().toLowerCase() === normalisedCategory,
  );

  if (!existing) {
    return [
      ...categories,
      {
        categoryId,
        categoryName,
        occurrenceCount: 1,
        firstUsedAt: observedAt,
        lastUsedAt: observedAt,
      },
    ];
  }

  return categories.map((entry) =>
    entry === existing
      ? {
          ...entry,
          categoryId: categoryId ?? entry.categoryId,
          categoryName,
          occurrenceCount: entry.occurrenceCount + 1,
          lastUsedAt: maxIsoDate(entry.lastUsedAt, observedAt),
        }
      : entry,
  );
}

function upsertAccountEvidence(
  accounts: MerchantAccountEvidence[],
  accountId: string,
  observedAt: string,
): MerchantAccountEvidence[] {
  const existing = accounts.find((entry) => entry.accountId === accountId);

  if (!existing) {
    return [
      ...accounts,
      {
        accountId,
        occurrenceCount: 1,
        firstUsedAt: observedAt,
        lastUsedAt: observedAt,
      },
    ];
  }

  return accounts.map((entry) =>
    entry.accountId === accountId
      ? {
          ...entry,
          occurrenceCount: entry.occurrenceCount + 1,
          lastUsedAt: maxIsoDate(entry.lastUsedAt, observedAt),
        }
      : entry,
  );
}

function upsertTransferEvidence(
  transfers: MerchantTransferEvidence[],
  accountId: string,
  accountName: string,
  observedAt: string,
): MerchantTransferEvidence[] {
  const existing = transfers.find((entry) => entry.accountId === accountId);

  if (!existing) {
    return [
      ...transfers,
      {
        accountId,
        accountName,
        occurrenceCount: 1,
        firstUsedAt: observedAt,
        lastUsedAt: observedAt,
      },
    ];
  }

  return transfers.map((entry) =>
    entry.accountId === accountId
      ? {
          ...entry,
          accountName,
          occurrenceCount: entry.occurrenceCount + 1,
          lastUsedAt: maxIsoDate(entry.lastUsedAt, observedAt),
        }
      : entry,
  );
}

function compareEvidence(
  left: { occurrenceCount: number; lastUsedAt: string },
  right: { occurrenceCount: number; lastUsedAt: string },
): number {
  if (left.occurrenceCount !== right.occurrenceCount) {
    return right.occurrenceCount - left.occurrenceCount;
  }

  return right.lastUsedAt.localeCompare(left.lastUsedAt);
}

function createMerchantKnowledgeId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "merchant";

  return `merchant-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function minIsoDate(left: string, right: string): string {
  return left.localeCompare(right) <= 0 ? left : right;
}

function maxIsoDate(left: string, right: string): string {
  return left.localeCompare(right) >= 0 ? left : right;
}
