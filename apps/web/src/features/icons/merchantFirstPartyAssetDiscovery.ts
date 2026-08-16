export type MerchantArtworkCandidateKind =
  | "structured-logo"
  | "logo-image"
  | "apple-touch-icon"
  | "icon"
  | "manifest-icon"
  | "og-image";

export type MerchantArtworkConfidence = "high" | "medium" | "low";

export interface MerchantArtworkCandidate {
  readonly kind: MerchantArtworkCandidateKind;
  readonly url: string;
  readonly declaredSizes?: readonly number[];
  readonly mimeType?: string;
  readonly score: number;
  readonly confidence: MerchantArtworkConfidence;
  readonly autoAccept: boolean;
  readonly reason: string;
}

export interface MerchantManifestDocument {
  readonly icons?: readonly {
    readonly src?: unknown;
    readonly type?: unknown;
    readonly sizes?: unknown;
    readonly purpose?: unknown;
  }[];
}

/**
 * Extracts merchant artwork evidence declared by an official merchant page.
 *
 * Automatic artwork requires stronger evidence than merely being a valid image
 * on the merchant's domain. Structured/logo-labelled brand signals can reach
 * high confidence. Favicons, installable-app icons, and social cards remain
 * useful candidates, but are not automatically accepted without corroboration.
 */
export function discoverMerchantArtworkCandidates({
  html,
  pageUrl,
  merchantName,
  manifest,
  manifestUrl,
}: {
  readonly html: string;
  readonly pageUrl: string;
  readonly merchantName?: string;
  readonly manifest?: MerchantManifestDocument | null;
  readonly manifestUrl?: string | null;
}): readonly MerchantArtworkCandidate[] {
  const candidates: MerchantArtworkCandidate[] = [];
  const normalisedMerchantName = normaliseIdentityText(merchantName ?? "");

  discoverStructuredLogoCandidates(
    candidates,
    html,
    pageUrl,
    normalisedMerchantName,
  );
  discoverExplicitLogoCandidates(
    candidates,
    html,
    pageUrl,
    normalisedMerchantName,
  );

  for (const tag of html.match(/<link\b[^>]*>/giu) ?? []) {
    const attributes = parseTagAttributes(tag);
    const rel = (attributes.rel ?? "").toLowerCase().split(/\s+/u);
    const href = attributes.href;
    if (!href) continue;

    if (rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed")) {
      const sizes = parseSizes(attributes.sizes);
      pushCandidate(candidates, {
        kind: "apple-touch-icon",
        url: resolveUrl(href, pageUrl),
        declaredSizes: sizes,
        mimeType: attributes.type,
        score: 400 + bestDeclaredSize(sizes),
        confidence: "low",
        autoAccept: false,
        reason: "Apple touch icon is app-install artwork and may differ from the merchant brand mark.",
      });
      continue;
    }

    if (rel.includes("icon")) {
      const sizes = parseSizes(attributes.sizes);
      pushCandidate(candidates, {
        kind: "icon",
        url: resolveUrl(href, pageUrl),
        declaredSizes: sizes,
        mimeType: attributes.type,
        score: 500 + bestDeclaredSize(sizes),
        confidence: "medium",
        autoAccept: false,
        reason: "Explicit site icon identifies the website, but is not sufficient proof of the merchant brand mark.",
      });
    }
  }

  // A conventional favicon is useful site-identity evidence, but Coles and
  // similar sites demonstrate that a valid favicon can be generic app/site UI.
  pushCandidate(candidates, {
    kind: "icon",
    url: resolveUrl("/favicon.ico", pageUrl),
    mimeType: "image/x-icon",
    score: 450,
    confidence: "low",
    autoAccept: false,
    reason: "Conventional favicon is first-party site identity only; brand identity is not verified.",
  });

  for (const tag of html.match(/<meta\b[^>]*>/giu) ?? []) {
    const attributes = parseTagAttributes(tag);
    const property = (attributes.property ?? attributes.name ?? "").toLowerCase();
    if (property !== "og:image" && property !== "og:image:url" && property !== "og:image:secure_url") {
      continue;
    }
    if (!attributes.content) continue;
    pushCandidate(candidates, {
      kind: "og-image",
      url: resolveUrl(attributes.content, pageUrl),
      score: 200,
      confidence: "low",
      autoAccept: false,
      reason: "OpenGraph artwork is commonly a social card and does not by itself verify a merchant logo.",
    });
  }

  if (manifest?.icons && manifestUrl) {
    for (const icon of manifest.icons) {
      if (typeof icon.src !== "string" || !icon.src.trim()) continue;
      const sizes = parseSizes(typeof icon.sizes === "string" ? icon.sizes : undefined);
      pushCandidate(candidates, {
        kind: "manifest-icon",
        url: resolveUrl(icon.src, manifestUrl),
        declaredSizes: sizes,
        mimeType: typeof icon.type === "string" ? icon.type : undefined,
        score: 350 + bestDeclaredSize(sizes),
        confidence: "low",
        autoAccept: false,
        reason: "Web-app manifest icon is installable-app artwork and may differ from the merchant brand mark.",
      });
    }
  }

  return candidates.sort(
    (left, right) =>
      confidenceRank(right.confidence) - confidenceRank(left.confidence) ||
      right.score - left.score ||
      left.url.localeCompare(right.url),
  );
}

export function discoverManifestUrl(html: string, pageUrl: string): string | undefined {
  for (const tag of html.match(/<link\b[^>]*>/giu) ?? []) {
    const attributes = parseTagAttributes(tag);
    const rel = (attributes.rel ?? "").toLowerCase().split(/\s+/u);
    if (!rel.includes("manifest") || !attributes.href) continue;
    return resolveUrl(attributes.href, pageUrl);
  }
  return undefined;
}

function discoverStructuredLogoCandidates(
  candidates: MerchantArtworkCandidate[],
  html: string,
  pageUrl: string,
  normalisedMerchantName: string,
): void {
  for (const script of html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/giu) ?? []) {
    const body = script.replace(/^<script\b[^>]*>/iu, "").replace(/<\/script>$/iu, "").trim();
    if (!body) continue;
    let value: unknown;
    try {
      value = JSON.parse(decodeHtmlAttribute(body));
    } catch {
      continue;
    }
    walkJsonLd(value, (entity) => {
      const logoUrl = extractLogoUrl(entity.logo);
      if (!logoUrl) return;
      const entityName = typeof entity.name === "string" ? normaliseIdentityText(entity.name) : "";
      const typeMatches = recognisedBrandEntityType(entity["@type"]);
      const nameMatches = identityNamesMatch(normalisedMerchantName, entityName);
      const confidence: MerchantArtworkConfidence = typeMatches && nameMatches ? "high" : "medium";
      pushCandidate(candidates, {
        kind: "structured-logo",
        url: resolveUrl(logoUrl, pageUrl),
        score: confidence === "high" ? 1000 : 820,
        confidence,
        autoAccept: confidence === "high",
        reason: confidence === "high"
          ? `JSON-LD brand/organisation logo matches merchant identity${entityName ? ` (${entity.name as string})` : ""}.`
          : "JSON-LD declares a logo, but merchant-name/type corroboration is incomplete.",
      });
    });
  }
}

function discoverExplicitLogoCandidates(
  candidates: MerchantArtworkCandidate[],
  html: string,
  pageUrl: string,
  normalisedMerchantName: string,
): void {
  for (const tag of html.match(/<(?:img|meta|link)\b[^>]*>/giu) ?? []) {
    const attributes = parseTagAttributes(tag);
    const itemprop = (attributes.itemprop ?? "").toLowerCase();
    const semanticText = [
      attributes.alt,
      attributes.title,
      attributes["aria-label"],
      attributes.class,
      attributes.id,
      attributes["data-testid"],
      attributes["data-test"],
    ].filter(Boolean).join(" ");
    const logoSemantic = itemprop.split(/\s+/u).includes("logo") || /(?:^|[^a-z])logo(?:[^a-z]|$)/iu.test(semanticText);
    if (!logoSemantic) continue;

    const source = attributes.src ?? attributes.content ?? attributes.href ?? firstSrcsetUrl(attributes.srcset);
    if (!source) continue;
    const semanticName = normaliseIdentityText(semanticText);
    const nameMatches = identityNamesMatch(normalisedMerchantName, semanticName);
    const itempropLogo = itemprop.split(/\s+/u).includes("logo");
    const confidence: MerchantArtworkConfidence = itempropLogo || nameMatches ? "high" : "medium";
    pushCandidate(candidates, {
      kind: "logo-image",
      url: resolveUrl(source, pageUrl),
      mimeType: attributes.type,
      score: confidence === "high" ? 950 : 780,
      confidence,
      autoAccept: confidence === "high",
      reason: itempropLogo
        ? "Page explicitly marks this asset with itemprop=logo."
        : nameMatches
          ? "Logo-labelled page asset also matches the merchant name."
          : "Page labels this asset as a logo, but merchant-name corroboration is incomplete.",
    });
  }
}

function walkJsonLd(
  value: unknown,
  visit: (entity: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) walkJsonLd(item, visit);
    return;
  }
  if (!value || typeof value !== "object") return;
  const entity = value as Record<string, unknown>;
  visit(entity);
  const graph = entity["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) walkJsonLd(item, visit);
  }
}

function extractLogoUrl(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return undefined;
  const logo = value as Record<string, unknown>;
  for (const key of ["url", "contentUrl", "@id"] as const) {
    const candidate = logo[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function recognisedBrandEntityType(value: unknown): boolean {
  const values = Array.isArray(value) ? value : [value];
  return values.some((item) =>
    typeof item === "string" && [
      "organization",
      "corporation",
      "brand",
      "localbusiness",
      "store",
      "onlinestore",
    ].includes(item.toLowerCase()),
  );
}

function identityNamesMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftTokens = left.split(" ").filter((token) => token.length >= 3);
  const rightTokens = new Set(right.split(" "));
  return leftTokens.length > 0 && leftTokens.every((token) => rightTokens.has(token));
}

function normaliseIdentityText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function firstSrcsetUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.split(",")[0]?.trim().split(/\s+/u)[0] || undefined;
}

function pushCandidate(
  candidates: MerchantArtworkCandidate[],
  candidate: MerchantArtworkCandidate,
): void {
  if (!candidate.url || !/^https?:\/\//iu.test(candidate.url)) return;
  const existingIndex = candidates.findIndex(({ url }) => url === candidate.url);
  if (existingIndex < 0) {
    candidates.push(candidate);
    return;
  }
  const existing = candidates[existingIndex];
  if (
    confidenceRank(candidate.confidence) > confidenceRank(existing.confidence) ||
    (candidate.confidence === existing.confidence && candidate.score > existing.score)
  ) {
    candidates[existingIndex] = candidate;
  }
}

function confidenceRank(value: MerchantArtworkConfidence): number {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}

function resolveUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function parseSizes(value: string | undefined): readonly number[] | undefined {
  if (!value) return undefined;
  const sizes = value
    .toLowerCase()
    .split(/\s+/u)
    .flatMap((token) => {
      if (token === "any") return [512];
      const match = /^(\d+)x(\d+)$/u.exec(token);
      if (!match) return [];
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (!Number.isFinite(width) || !Number.isFinite(height)) return [];
      return [Math.min(width, height)];
    })
    .filter((size) => size > 0 && size <= 4096);
  return sizes.length > 0 ? [...new Set(sizes)].sort((a, b) => b - a) : undefined;
}

function bestDeclaredSize(sizes: readonly number[] | undefined): number {
  if (!sizes?.length) return 0;
  return Math.min(256, sizes[0]);
}

function parseTagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of tag.matchAll(attributePattern)) {
    const key = match[1]?.toLowerCase();
    if (!key || key === "link" || key === "meta" || key === "img") continue;
    attributes[key] = decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
