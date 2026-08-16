import { normaliseMerchant } from "./merchantNormalisation.js";

export interface MerchantIdentityDefinition {
  readonly id: string;
  readonly canonicalName: string;
  readonly officialDomains: readonly string[];
  readonly aliases: readonly string[];
  /**
   * Bank descriptors frequently append a store, suburb or channel after a brand.
   * Prefixes are intentionally explicit so Phase 1 never turns generic substring
   * matching into merchant identity.
   */
  readonly descriptorPrefixes?: readonly string[];
}

const definitions = [
  merchant("coles", "Coles", ["coles.com.au"], ["coles"], ["coles", "coles supermarket", "coles online", "coles heidelberg", "coles greensborough"]),
  merchant("coles-express", "Coles Express", ["colesexpress.com.au"], ["coles express"], ["coles express"]),
  merchant("woolworths", "Woolworths", ["woolworths.com.au"], ["woolworths", "woolies", "safeway"], ["woolworths", "woolies", "ww metro", "woolworths metro"]),
  merchant("bakers-delight", "Bakers Delight", ["bakersdelight.com.au"], ["bakers delight"], ["bakers delight"]),
  merchant("chemist-warehouse", "Chemist Warehouse", ["chemistwarehouse.com.au"], ["chemist warehouse", "cwh"], ["chemist warehouse", "cwh"]),
  merchant("aldi", "ALDI", ["aldi.com.au"], ["aldi"], ["aldi"]),
  merchant("kmart", "Kmart", ["kmart.com.au"], ["kmart"], ["kmart"]),
  merchant("mcdonalds", "McDonald's", ["mcdonalds.com.au"], ["mcdonalds", "mcdonald's", "maccas"], ["mcdonalds", "mcdonald's", "maccas"]),
  merchant("belong", "Belong", ["belong.com.au"], ["belong", "belong mobile"], ["belong"]),
  merchant("bunnings", "Bunnings", ["bunnings.com.au"], ["bunnings", "bunnings warehouse"], ["bunnings", "bunnings warehouse"]),
  merchant("paypal", "PayPal", ["paypal.com"], ["paypal"], ["paypal"]),
  merchant("netflix", "Netflix", ["netflix.com"], ["netflix"], ["netflix"]),
  merchant("officeworks", "Officeworks", ["officeworks.com.au"], ["officeworks"], ["officeworks"]),
  merchant("myki", "myki", ["transport.vic.gov.au"], ["myki"], ["myki"]),
  merchant("myer", "Myer", ["myer.com.au"], ["myer"], ["myer"]),
  merchant("amazon-au", "Amazon", ["amazon.com.au"], ["amazon", "amazon australia", "amazon marketplace"], ["amazon", "amazon marketplace"]),
  merchant("agl", "AGL", ["agl.com.au"], ["agl"], ["agl"]),
  merchant("seven-eleven", "7-Eleven", ["7eleven.com.au"], ["7 eleven", "7-eleven", "7eleven"], ["7 eleven", "7-eleven", "7eleven"]),
  merchant("costco", "Costco", ["costco.com.au"], ["costco", "costco fuel"], ["costco", "costco fuel"]),
  merchant("kfc", "KFC", ["kfc.com.au"], ["kfc"], ["kfc"]),
  merchant("apple", "Apple", ["apple.com"], ["apple", "itunes", "apple.com/bill"], ["apple", "itunes"]),
  merchant("ebay", "eBay", ["ebay.com.au"], ["ebay"], ["ebay"]),
  merchant("red-rooster", "Red Rooster", ["redrooster.com.au"], ["red rooster"], ["red rooster"]),
  merchant("liquorland", "Liquorland", ["liquorland.com.au"], ["liquorland", "liquor land"], ["liquorland", "liquor land"]),
  merchant("big-w", "BIG W", ["bigw.com.au"], ["big w", "bigw"], ["big w", "bigw"]),
  merchant("bp", "bp", ["bp.com"], ["bp"], ["bp"]),
  merchant("ticketek", "Ticketek", ["ticketek.com.au"], ["ticketek"], ["ticketek"]),
  merchant("rebel", "rebel", ["rebelsport.com.au"], ["rebel", "rebel sport"], ["rebel", "rebel sport"]),
  merchant("subway", "Subway", ["subway.com"], ["subway"], ["subway"]),
  merchant("vicroads", "VicRoads", ["vicroads.vic.gov.au"], ["vicroads", "vic roads"], ["vicroads", "vic roads"]),
  merchant("amaysim", "amaysim", ["amaysim.com.au"], ["amaysim"], ["amaysim"]),
  merchant("dan-murphys", "Dan Murphy's", ["danmurphys.com.au"], ["dan murphys", "dan murphy's"], ["dan murphys", "dan murphy's"]),
  merchant("racv", "RACV", ["racv.com.au"], ["racv", "racv car insurance"], ["racv"]),
  merchant("tgi-fridays", "TGI Fridays", ["tgifridays.com.au"], ["tgi fridays", "tgif"], ["tgi fridays", "tgif"]),
  merchant("leaptel", "Leaptel", ["leaptel.com.au"], ["leaptel"], ["leaptel"]),
  merchant("wilson-parking", "Wilson Parking", ["wilsonparking.com.au"], ["wilson parking", "wilsons parking"], ["wilson parking", "wilsons parking"]),
  merchant("elite-eleven", "Elite Eleven", ["eliteelevensporting.com"], ["elite eleven", "elite eleven sporting"], ["elite eleven", "elite eleven sporting"]),
  merchant("target-au", "Target", ["target.com.au"], ["target"], ["target"]),
  merchant("reject-shop", "The Reject Shop", ["rejectshop.com.au"], ["the reject shop", "reject shop"], ["the reject shop", "reject shop"]),
  merchant("watermarc", "WaterMarc", ["watermarcbanyule.com.au"], ["watermarc"], ["watermarc"]),
  merchant("watsonia-rsl", "Watsonia RSL", ["watsoniarsl.com.au"], ["watsonia rsl", "watsonia rsl sub branch"], ["watsonia rsl"]),
  merchant("mexican-kitchen", "The Mexican Kitchen", ["themexicankitchen.com.au"], ["the mexican kitchen", "mexican kitchen"], ["the mexican kitchen", "mexican kitchen"]),
  merchant("elite-eleven", "Elite Eleven", ["eliteelevensporting.com"], ["elite eleven"], ["elite eleven"]),
] as const satisfies readonly MerchantIdentityDefinition[];

export const MERCHANT_IDENTITY_CATALOGUE: readonly MerchantIdentityDefinition[] = dedupeDefinitions(definitions);

export interface MerchantIdentityCatalogueIndex {
  readonly byExactAlias: ReadonlyMap<string, MerchantIdentityDefinition>;
  readonly descriptorPrefixes: readonly {
    readonly normalisedPrefix: string;
    readonly merchant: MerchantIdentityDefinition;
  }[];
}

export function createMerchantIdentityCatalogueIndex(
  catalogue: readonly MerchantIdentityDefinition[] = MERCHANT_IDENTITY_CATALOGUE,
): MerchantIdentityCatalogueIndex {
  const byExactAlias = new Map<string, MerchantIdentityDefinition>();
  const descriptorPrefixes: Array<{
    normalisedPrefix: string;
    merchant: MerchantIdentityDefinition;
  }> = [];

  for (const merchant of catalogue) {
    const exactValues = new Set([merchant.canonicalName, ...merchant.aliases]);
    for (const value of exactValues) {
      const normalised = normaliseMerchant(value).canonical;
      if (!normalised) continue;
      const existing = byExactAlias.get(normalised);
      if (existing && existing.id !== merchant.id) {
        throw new TypeError(`Merchant alias collision for "${value}".`);
      }
      byExactAlias.set(normalised, merchant);
    }

    for (const prefix of merchant.descriptorPrefixes ?? []) {
      const normalisedPrefix = normaliseMerchant(prefix).canonical;
      if (!normalisedPrefix) continue;
      descriptorPrefixes.push({ normalisedPrefix, merchant });
    }
  }

  descriptorPrefixes.sort(
    (left, right) =>
      right.normalisedPrefix.length - left.normalisedPrefix.length ||
      left.merchant.id.localeCompare(right.merchant.id),
  );

  return { byExactAlias, descriptorPrefixes };
}

function merchant(
  id: string,
  canonicalName: string,
  officialDomains: readonly string[],
  aliases: readonly string[],
  descriptorPrefixes?: readonly string[],
): MerchantIdentityDefinition {
  return { id, canonicalName, officialDomains, aliases, descriptorPrefixes };
}

function dedupeDefinitions(
  values: readonly MerchantIdentityDefinition[],
): readonly MerchantIdentityDefinition[] {
  const byId = new Map<string, MerchantIdentityDefinition>();
  for (const value of values) {
    const existing = byId.get(value.id);
    if (!existing) {
      byId.set(value.id, value);
      continue;
    }
    byId.set(value.id, {
      ...existing,
      officialDomains: [...new Set([...existing.officialDomains, ...value.officialDomains])],
      aliases: [...new Set([...existing.aliases, ...value.aliases])],
      descriptorPrefixes: [
        ...new Set([...(existing.descriptorPrefixes ?? []), ...(value.descriptorPrefixes ?? [])]),
      ],
    });
  }
  return [...byId.values()];
}
