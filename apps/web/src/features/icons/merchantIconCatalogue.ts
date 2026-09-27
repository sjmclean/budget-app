import { IMPORTED_MERCHANT_ICON_BATCH } from "./merchantIconImportedBatch.js";

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

export type MerchantIconProvenanceKind = "official" | "user-supplied" | "generated";

export interface MerchantIconProvenance {
  readonly kind: MerchantIconProvenanceKind;
  readonly source?: string;
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

const USER_SEED_SPRITE = (spritePath: string, symbolId: string): MerchantIconAsset => ({
  kind: "sprite",
  spritePath,
  symbolId,
});

const SEED_MERCHANT_ICONS: readonly MerchantIconCatalogueEntry[] = [
  { key: "coles-au", name: "Coles", regions: ["AU"], aliases: ["Coles Supermarkets", "Coles Online"], asset: USER_SEED_SPRITE("user-seed-03.svg", "coles-au") },
  { key: "woolworths-au", name: "Woolworths", regions: ["AU"], aliases: ["Woolworths Metro", "Woolworths Online"], asset: USER_SEED_SPRITE("user-seed-08.svg", "woolworths-au") },
  { key: "aldi-au", name: "ALDI", regions: ["AU"], aliases: ["Aldi Australia"], asset: USER_SEED_SPRITE("user-seed-01.svg", "aldi-au") },
  { key: "bunnings-au", name: "Bunnings", regions: ["AU"], aliases: ["Bunnings Warehouse"], asset: USER_SEED_SPRITE("user-seed-03.svg", "bunnings-au") },
  { key: "amazon-global", name: "Amazon", regions: ["GLOBAL"], aliases: ["Amazon Marketplace", "Amazon.com.au"], asset: USER_SEED_SPRITE("user-seed-01.svg", "amazon-global") },
  { key: "netflix-global", name: "Netflix", regions: ["GLOBAL"], aliases: [], asset: USER_SEED_SPRITE("user-seed-06.svg", "netflix-global") },
  { key: "spotify-global", name: "Spotify", regions: ["GLOBAL"], aliases: [], asset: USER_SEED_SPRITE("user-seed-07.svg", "spotify-global") },
  { key: "mcdonalds-global", name: "McDonald's", regions: ["GLOBAL"], aliases: ["McDonalds", "McDonald's Australia"], asset: USER_SEED_SPRITE("user-seed-05.svg", "mcdonalds-global") },
] as const;

export const MERCHANT_ICON_CATALOGUE: readonly MerchantIconCatalogueEntry[] = [
  ...SEED_MERCHANT_ICONS,
  ...IMPORTED_MERCHANT_ICON_BATCH,
];

const entriesByKey = new Map(MERCHANT_ICON_CATALOGUE.map((entry) => [entry.key, entry] as const));
const entriesByIdentity = new Map<string, MerchantIconCatalogueEntry>();

for (const entry of MERCHANT_ICON_CATALOGUE) {
  for (const identity of [entry.name, ...entry.aliases]) {
    const normalised = normaliseMerchantIconIdentity(identity);
    if (!normalised || entriesByIdentity.has(normalised)) continue;
    entriesByIdentity.set(normalised, entry);
  }
}

export function normaliseMerchantIconIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’']/gu, "")
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isMerchantIconKey(key: string): boolean {
  return entriesByKey.has(key);
}

export function getMerchantIconEntry(key: string): MerchantIconCatalogueEntry | undefined {
  return entriesByKey.get(key);
}

export function findMerchantIconByPayeeName(name: string): MerchantIconCatalogueEntry | undefined {
  const normalised = normaliseMerchantIconIdentity(name);
  return normalised ? entriesByIdentity.get(normalised) : undefined;
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
