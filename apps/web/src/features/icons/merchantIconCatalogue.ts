export interface MerchantIconCatalogueEntry {
  readonly key: string;
  readonly name: string;
  readonly regions: readonly string[];
  readonly aliases: readonly string[];
  readonly assetPath: string;
}

export const MERCHANT_ICON_CATALOGUE: readonly MerchantIconCatalogueEntry[] = [
  { key: "coles-au", name: "Coles", regions: ["AU"], aliases: ["Coles Supermarkets", "Coles Express", "Coles Online"], assetPath: "seed/coles-au.svg" },
  { key: "woolworths-au", name: "Woolworths", regions: ["AU"], aliases: ["Woolworths Metro", "Woolworths Online"], assetPath: "seed/woolworths-au.svg" },
  { key: "aldi-au", name: "ALDI", regions: ["AU"], aliases: ["Aldi Australia"], assetPath: "seed/aldi-au.svg" },
  { key: "bunnings-au", name: "Bunnings", regions: ["AU"], aliases: ["Bunnings Warehouse"], assetPath: "seed/bunnings-au.svg" },
  { key: "amazon-global", name: "Amazon", regions: ["GLOBAL"], aliases: ["Amazon Marketplace", "Amazon.com.au"], assetPath: "seed/amazon-global.svg" },
  { key: "netflix-global", name: "Netflix", regions: ["GLOBAL"], aliases: [], assetPath: "seed/netflix-global.svg" },
  { key: "spotify-global", name: "Spotify", regions: ["GLOBAL"], aliases: [], assetPath: "seed/spotify-global.svg" },
  { key: "mcdonalds-global", name: "McDonald's", regions: ["GLOBAL"], aliases: ["McDonalds", "McDonald's Australia"], assetPath: "seed/mcdonalds-global.svg" },
] as const;

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

export function merchantIconAssetUrl(entryOrKey: MerchantIconCatalogueEntry | string): string | undefined {
  const entry = typeof entryOrKey === "string" ? getMerchantIconEntry(entryOrKey) : entryOrKey;
  return entry ? `/merchant-icons/${entry.assetPath}` : undefined;
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
