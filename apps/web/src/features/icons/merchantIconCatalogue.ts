import { MAJOR_MERCHANT_ICON_EXPANSION } from "./merchantIconMajorExpansion.js";
import { FUEL_MERCHANT_ICON_EXPANSION, MERCHANT_ICON_ENTRY_OVERRIDES } from "./merchantIconFuelExpansion.js";
import { PRIORITY_MERCHANT_ICON_EXPANSION } from "./merchantIconPriorityExpansion.js";
import { GOVERNMENT_MERCHANT_ICON_EXPANSION } from "./merchantIconGovernmentExpansion.js";

export type MerchantIconAsset =
  | { readonly kind: "image"; readonly assetPath: string }
  | { readonly kind: "sprite"; readonly spritePath: string; readonly symbolId: string };

export type MerchantIconCategory =
  | "groceries" | "food" | "fuel" | "shopping" | "home" | "electronics"
  | "health" | "health-insurance" | "finance" | "bank" | "credit-union" | "insurance"
  | "utilities" | "water" | "gas" | "electricity" | "internet" | "mobile"
  | "telecom" | "government" | "parking" | "car-rental" | "airline"
  | "clothing" | "transport" | "travel" | "entertainment" | "sport" | "delivery"
  | "streaming-video" | "streaming-music" | "streaming-sport" | "gaming-subscription"
  | "digital" | "marketplace" | "automotive" | "services" | "local-government" | "other";

export type MerchantIconProvenanceKind = "official" | "community" | "generated";

export interface MerchantIconProvenance {
  readonly kind: MerchantIconProvenanceKind;
  readonly reviewed: boolean;
}

export interface MerchantIconCatalogueEntry {
  readonly key: string;
  readonly name: string;
  readonly regions: readonly string[];
  readonly aliases: readonly string[];
  readonly category?: MerchantIconCategory;
  readonly provenance?: MerchantIconProvenance;
  readonly asset: MerchantIconAsset;
}

function applyMerchantIconOverride(entry: MerchantIconCatalogueEntry): MerchantIconCatalogueEntry {
  const override = MERCHANT_ICON_ENTRY_OVERRIDES[entry.key];
  return override ? { ...entry, ...override } : entry;
}

const merchantIconCatalogue: MerchantIconCatalogueEntry[] = [
  ...MAJOR_MERCHANT_ICON_EXPANSION.map(applyMerchantIconOverride),
  ...PRIORITY_MERCHANT_ICON_EXPANSION,
  ...GOVERNMENT_MERCHANT_ICON_EXPANSION,
  ...FUEL_MERCHANT_ICON_EXPANSION,
];

export const MERCHANT_ICON_CATALOGUE: readonly MerchantIconCatalogueEntry[] = merchantIconCatalogue;

const entriesByKey = new Map(merchantIconCatalogue.map((entry) => [entry.key, entry] as const));
const entriesByIdentity = new Map<string, MerchantIconCatalogueEntry[]>();

function indexMerchantIconEntry(entry: MerchantIconCatalogueEntry): void {
  for (const identity of [entry.name, ...entry.aliases]) {
    const normalised = normaliseMerchantIconIdentity(identity);
    if (!normalised) continue;
    const matches = entriesByIdentity.get(normalised) ?? [];
    if (!matches.some(({ key }) => key === entry.key)) matches.push(entry);
    entriesByIdentity.set(normalised, matches);
  }
}

for (const entry of merchantIconCatalogue) indexMerchantIconEntry(entry);

let extendedCataloguePromise: Promise<void> | null = null;

export function preloadExtendedMerchantIconCatalogue(): Promise<void> {
  extendedCataloguePromise ??= import("./merchantIconSimpleBrands.js").then(({ SIMPLE_BRAND_ICON_EXPANSION }) => {
    for (const entry of SIMPLE_BRAND_ICON_EXPANSION) {
      if (entriesByKey.has(entry.key)) {
        throw new TypeError(`Extended merchant icon key collides with the core catalogue: ${entry.key}`);
      }
      merchantIconCatalogue.push(entry);
      entriesByKey.set(entry.key, entry);
      indexMerchantIconEntry(entry);
    }
  });
  return extendedCataloguePromise;
}

export function normaliseMerchantIconIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’']/gu, "")
    .replace(/&/gu, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isMerchantIconKey(key: string): boolean {
  return entriesByKey.has(key);
}

export function getMerchantIconEntry(key: string): MerchantIconCatalogueEntry | undefined {
  return entriesByKey.get(key);
}

export function findMerchantIconByPayeeName(name: string, region?: string): MerchantIconCatalogueEntry | undefined {
  const normalised = normaliseMerchantIconIdentity(name);
  if (!normalised) return undefined;
  const matches = entriesByIdentity.get(normalised) ?? [];
  if (matches.length === 1) return matches[0];
  if (!region) return undefined;
  const regional = matches.filter(({ regions }) => regions.includes(region) || regions.includes("GLOBAL"));
  return regional.length === 1 ? regional[0] : undefined;
}

export type ResolvedMerchantIconAsset =
  | { readonly kind: "image"; readonly src: string }
  | { readonly kind: "sprite"; readonly href: string };

export function resolveMerchantIconAsset(
  entryOrKey: MerchantIconCatalogueEntry | string,
): ResolvedMerchantIconAsset | undefined {
  const entry = typeof entryOrKey === "string" ? getMerchantIconEntry(entryOrKey) : entryOrKey;
  if (!entry) return undefined;
  if (entry.asset.kind === "image") {
    return { kind: "image", src: `/merchant-icons/${entry.asset.assetPath}` };
  }
  return {
    kind: "sprite",
    href: `/merchant-icons/${entry.asset.spritePath}#${entry.asset.symbolId}`,
  };
}

export function searchMerchantIcons(query: string, limit = 48): MerchantIconCatalogueEntry[] {
  const normalised = normaliseMerchantIconIdentity(query);
  if (!normalised) return MERCHANT_ICON_CATALOGUE.slice(0, limit);

  return MERCHANT_ICON_CATALOGUE
    .map((entry) => {
      const identities = [entry.name, ...entry.aliases].map(normaliseMerchantIconIdentity);
      const exact = identities.some((identity) => identity === normalised);
      const prefix = identities.some((identity) => identity.startsWith(normalised));
      const contains = identities.some((identity) => identity.includes(normalised));
      return { entry, score: exact ? 3 : prefix ? 2 : contains ? 1 : 0 };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name))
    .slice(0, limit)
    .map(({ entry }) => entry);
}
