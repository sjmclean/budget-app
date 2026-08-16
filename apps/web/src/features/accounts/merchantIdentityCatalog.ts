import { normaliseMerchant } from "./merchantNormalisation.js";

export interface MerchantIdentityDefinition {
  readonly id: string;
  readonly canonicalName: string;
  readonly officialDomains: readonly string[];
  readonly aliases: readonly string[];
  /**
   * HTTPS asset hosts that the merchant's official site explicitly uses for
   * brand artwork. These do not participate in identity resolution and are
   * scoped to the owning merchant rather than becoming global proxy allowlists.
   */
  readonly trustedArtworkHosts?: readonly string[];
  /**
   * Bank descriptors frequently append a store, suburb or channel after a brand.
   * Prefixes are intentionally explicit so Phase 1 never turns generic substring
   * matching into merchant identity.
   */
  readonly descriptorPrefixes?: readonly string[];
}

const definitions = [
  merchant("coles", "Coles", ["coles.com.au"], ["coles"], ["coles", "coles supermarket", "coles online"]),
  // Plain "Woolworths" is intentionally excluded from Phase 1 because the name
  // is region-ambiguous. Australian-specific descriptors remain safe enough.
  merchant("woolworths-au", "Woolworths Australia", ["woolworths.com.au"], ["woolies", "ww metro", "woolworths metro"], ["woolies", "ww metro", "woolworths metro"]),
  merchant("bakers-delight", "Bakers Delight", ["bakersdelight.com.au"], ["bakers delight"], ["bakers delight"]),
  merchant(
    "chemist-warehouse",
    "Chemist Warehouse",
    ["chemistwarehouse.com.au"],
    ["chemist warehouse", "cwh"],
    ["chemist warehouse", "cwh"],
    ["images.ctfassets.net"],
  ),
  merchant("aldi", "ALDI", ["aldi.com"], ["aldi"], ["aldi"]),
  // Kmart and Target are intentionally absent until market context is available.
  merchant("mcdonalds", "McDonald's", ["mcdonalds.com"], ["mcdonalds", "mcdonald's", "maccas"], ["mcdonalds", "mcdonald's", "maccas"]),
  merchant("belong-mobile", "Belong Mobile", ["belong.com.au"], ["belong mobile"], ["belong mobile"]),
  merchant("bunnings", "Bunnings", ["bunnings.com.au"], ["bunnings", "bunnings warehouse"], ["bunnings", "bunnings warehouse"]),
  merchant("paypal", "PayPal", ["paypal.com"], ["paypal"], ["paypal"]),
  merchant("netflix", "Netflix", ["netflix.com"], ["netflix"], ["netflix"]),
  merchant("officeworks", "Officeworks", ["officeworks.com.au"], ["officeworks"], ["officeworks"]),
  merchant("myer", "Myer", ["myer.com.au"], ["myer"], ["myer"]),
  merchant("amazon", "Amazon", ["amazon.com"], ["amazon", "amazon marketplace"], ["amazon", "amazon marketplace"]),
  merchant("agl", "AGL", ["agl.com.au"], ["agl"], ["agl"]),
  merchant("seven-eleven", "7-Eleven", ["7-eleven.com"], ["7 eleven", "7-eleven", "7eleven"], ["7 eleven", "7-eleven", "7eleven"]),
  merchant("costco", "Costco", ["costco.com"], ["costco", "costco fuel"], ["costco", "costco fuel"]),
  merchant("kfc", "KFC", ["kfc.com"], ["kfc"], ["kfc"]),
  merchant("apple", "Apple", ["apple.com"], ["apple"], ["apple"]),
  merchant("ebay", "eBay", ["ebay.com"], ["ebay"], ["ebay"]),
  merchant("red-rooster", "Red Rooster", ["redrooster.com.au"], ["red rooster"], ["red rooster"]),
  merchant("liquorland", "Liquorland", ["liquorland.com.au"], ["liquorland", "liquor land"], ["liquorland", "liquor land"]),
  merchant("big-w", "BIG W", ["bigw.com.au"], ["big w", "bigw"], ["big w", "bigw"]),
  merchant("bp", "bp", ["bp.com"], ["bp"], ["bp"]),
  merchant("ticketek", "Ticketek", ["ticketek.com.au"], ["ticketek"], ["ticketek"]),
  merchant("rebel-sport-au", "rebel sport", ["rebelsport.com.au"], ["rebel sport"], ["rebel sport"]),
  merchant("subway", "Subway", ["subway.com"], ["subway"], ["subway"]),
  merchant("vicroads", "VicRoads", ["vicroads.vic.gov.au"], ["vicroads", "vic roads"], ["vicroads", "vic roads"]),
  merchant("amaysim", "amaysim", ["amaysim.com.au"], ["amaysim"], ["amaysim"]),
  merchant("dan-murphys", "Dan Murphy's", ["danmurphys.com.au"], ["dan murphys", "dan murphy's"], ["dan murphys", "dan murphy's"]),
  merchant("racv", "RACV", ["racv.com.au"], ["racv", "racv car insurance"], ["racv"]),
  merchant("tgi-fridays", "TGI Fridays", ["tgifridays.com"], ["tgi fridays", "tgif"], ["tgi fridays", "tgif"]),
  merchant("leaptel", "Leaptel", ["leaptel.com.au"], ["leaptel"], ["leaptel"]),
  merchant("wilson-parking", "Wilson Parking", ["wilsonparking.com.au"], ["wilson parking", "wilsons parking"], ["wilson parking", "wilsons parking"]),
  merchant("elite-eleven", "Elite Eleven", ["eliteelevensporting.com"], ["elite eleven", "elite eleven sporting"], ["elite eleven", "elite eleven sporting"]),
  merchant("reject-shop", "The Reject Shop", ["rejectshop.com.au"], ["the reject shop", "reject shop"], ["the reject shop", "reject shop"]),
  merchant("watermarc", "WaterMarc", ["watermarcbanyule.com.au"], ["watermarc"], ["watermarc"]),
  merchant("watsonia-rsl", "Watsonia RSL", ["watsoniarsl.com.au"], ["watsonia rsl", "watsonia rsl sub branch"], ["watsonia rsl"]),
] as const satisfies readonly MerchantIdentityDefinition[];

export const MERCHANT_IDENTITY_CATALOGUE: readonly MerchantIdentityDefinition[] = definitions;

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
    // Only explicit aliases are matchable. canonicalName is presentation data and
    // may intentionally include market qualifiers that normalisation removes
    // (for example "Woolworths Australia" -> "woolworths"). Automatically
    // indexing canonicalName would silently defeat regional ambiguity guards.
    const exactValues = new Set(merchant.aliases);
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
  trustedArtworkHosts?: readonly string[],
): MerchantIdentityDefinition {
  return { id, canonicalName, officialDomains, aliases, descriptorPrefixes, trustedArtworkHosts };
}
