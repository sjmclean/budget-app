import { createBudgetScopedStorage } from "../budget/budgetDataScope.js";
import { parsePayeeIconReference } from "../icons/payeeIconReference.js";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage.js";
import { resolveMerchantIdentity } from "./merchantIdentityResolver.js";
import type { MerchantArtworkCandidateKind } from "../icons/merchantFirstPartyAssetDiscovery.js";

const STORAGE_KEY = "budget-app.merchant-icon-knowledge.v1";

export interface MerchantIconKnowledgeRecord {
  readonly merchantId: string;
  readonly canonicalName: string;
  readonly domain: string;
  readonly contentRef: string;
  readonly sourceUrl: string;
  readonly artworkKind: MerchantArtworkCandidateKind;
  readonly acquiredAt: string;
}

interface MerchantIconKnowledgeStore {
  readonly formatVersion: 1;
  readonly merchants: readonly MerchantIconKnowledgeRecord[];
}

export function recordMerchantIconKnowledge(
  record: MerchantIconKnowledgeRecord,
): void {
  const parsed = parsePayeeIconReference(record.contentRef);
  if (parsed.kind !== "content") {
    throw new TypeError("Automatic merchant artwork must use a content:v1 reference.");
  }
  const current = readStore();
  const next: MerchantIconKnowledgeStore = {
    formatVersion: 1,
    merchants: [
      ...current.merchants.filter(({ merchantId }) => merchantId !== record.merchantId),
      record,
    ].sort((left, right) => left.merchantId.localeCompare(right.merchantId)),
  };
  getStorage().setItem(STORAGE_KEY, JSON.stringify(next));
}

export function findMerchantIconKnowledge(
  merchantId: string,
): MerchantIconKnowledgeRecord | undefined {
  return readStore().merchants.find((record) => record.merchantId === merchantId);
}

export function resolveAutomaticMerchantIconContentHash(
  payeeName: string,
): string | undefined {
  const identity = resolveMerchantIdentity(payeeName);
  if (!identity) return undefined;
  const knowledge = findMerchantIconKnowledge(identity.merchant.id);
  if (!knowledge) return undefined;
  const parsed = parsePayeeIconReference(knowledge.contentRef);
  return parsed.kind === "content" ? parsed.contentHash : undefined;
}

export function clearMerchantIconKnowledge(merchantId: string): void {
  const current = readStore();
  const merchants = current.merchants.filter((record) => record.merchantId !== merchantId);
  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify({ formatVersion: 1, merchants }));
  } catch {
    // Automatic artwork must never make financial workflows unavailable.
  }
}

function readStore(): MerchantIconKnowledgeStore {
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<MerchantIconKnowledgeStore>;
    if (parsed.formatVersion !== 1 || !Array.isArray(parsed.merchants)) return emptyStore();
    const merchants = parsed.merchants.filter(isKnowledgeRecord);
    return { formatVersion: 1, merchants };
  } catch {
    return emptyStore();
  }
}

function isKnowledgeRecord(value: unknown): value is MerchantIconKnowledgeRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.merchantId === "string" &&
    typeof record.canonicalName === "string" &&
    typeof record.domain === "string" &&
    typeof record.contentRef === "string" &&
    parsePayeeIconReference(record.contentRef).kind === "content" &&
    typeof record.sourceUrl === "string" &&
    isArtworkKind(record.artworkKind) &&
    typeof record.acquiredAt === "string"
  );
}

function isArtworkKind(value: unknown): value is MerchantArtworkCandidateKind {
  return value === "structured-logo" ||
    value === "logo-image" ||
    value === "apple-touch-icon" ||
    value === "icon" ||
    value === "manifest-icon" ||
    value === "og-image";
}

function emptyStore(): MerchantIconKnowledgeStore {
  return { formatVersion: 1, merchants: [] };
}

function getStorage() {
  return createBudgetScopedStorage(getActiveKeyValueStorage());
}
