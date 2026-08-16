import { normaliseMerchant } from "./merchantNormalisation.js";
import {
  createMerchantIdentityCatalogueIndex,
  type MerchantIdentityCatalogueIndex,
  type MerchantIdentityDefinition,
} from "./merchantIdentityCatalog.js";

export type MerchantIdentityResolutionKind = "exact-alias" | "descriptor-prefix";

export interface MerchantIdentityResolution {
  readonly merchant: MerchantIdentityDefinition;
  readonly kind: MerchantIdentityResolutionKind;
  readonly sourcePayee: string;
  readonly normalisedSource: string;
  readonly matchedValue: string;
}

const defaultIndex = createMerchantIdentityCatalogueIndex();

/**
 * Phase 1 intentionally resolves only deterministic catalogue matches. It does
 * not use GPS, country inference, fuzzy edit distance, arbitrary web search, or
 * generic substring matching. Ambiguous inputs stay unresolved.
 */
export function resolveMerchantIdentity(
  sourcePayee: string,
  index: MerchantIdentityCatalogueIndex = defaultIndex,
): MerchantIdentityResolution | undefined {
  const normalisedSource = normaliseMerchant(sourcePayee).canonical;
  if (!normalisedSource) return undefined;

  const exact = index.byExactAlias.get(normalisedSource);
  if (exact) {
    return {
      merchant: exact,
      kind: "exact-alias",
      sourcePayee,
      normalisedSource,
      matchedValue: normalisedSource,
    };
  }

  const candidates = index.descriptorPrefixes.filter(({ normalisedPrefix }) =>
    descriptorStartsWith(normalisedSource, normalisedPrefix),
  );
  if (candidates.length === 0) return undefined;

  const longestLength = candidates[0].normalisedPrefix.length;
  const equallySpecific = candidates.filter(
    ({ normalisedPrefix }) => normalisedPrefix.length === longestLength,
  );
  const merchantIds = new Set(equallySpecific.map(({ merchant }) => merchant.id));
  if (merchantIds.size !== 1) return undefined;

  const selected = equallySpecific[0];
  return {
    merchant: selected.merchant,
    kind: "descriptor-prefix",
    sourcePayee,
    normalisedSource,
    matchedValue: selected.normalisedPrefix,
  };
}

function descriptorStartsWith(source: string, prefix: string): boolean {
  return source === prefix || source.startsWith(`${prefix} `);
}
