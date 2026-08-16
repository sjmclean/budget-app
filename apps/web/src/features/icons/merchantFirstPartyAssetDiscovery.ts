export type MerchantArtworkCandidateKind =
  | "apple-touch-icon"
  | "icon"
  | "manifest-icon"
  | "og-image";

export interface MerchantArtworkCandidate {
  readonly kind: MerchantArtworkCandidateKind;
  readonly url: string;
  readonly declaredSizes?: readonly number[];
  readonly mimeType?: string;
  readonly score: number;
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
 * Extracts artwork declared by an official merchant page. Phase 1 deliberately
 * avoids scraping arbitrary inline images: only explicit site metadata is used.
 * When a site declares no icon metadata at all, the conventional /favicon.ico
 * path is tried as a final low-cost first-party fallback.
 */
export function discoverMerchantArtworkCandidates({
  html,
  pageUrl,
  manifest,
  manifestUrl,
}: {
  readonly html: string;
  readonly pageUrl: string;
  readonly manifest?: MerchantManifestDocument | null;
  readonly manifestUrl?: string | null;
}): readonly MerchantArtworkCandidate[] {
  const candidates: MerchantArtworkCandidate[] = [];

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
        score: 500 + bestDeclaredSize(sizes),
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
        score: 300 + bestDeclaredSize(sizes),
      });
    }
  }

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
      score: 150,
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
      });
    }
  }

  if (!candidates.some(({ kind }) => kind === "apple-touch-icon" || kind === "manifest-icon" || kind === "icon")) {
    pushCandidate(candidates, {
      kind: "icon",
      url: resolveUrl("/favicon.ico", pageUrl),
      mimeType: "image/x-icon",
      score: 250,
    });
  }

  return candidates.sort(
    (left, right) => right.score - left.score || left.url.localeCompare(right.url),
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

function pushCandidate(
  candidates: MerchantArtworkCandidate[],
  candidate: MerchantArtworkCandidate,
): void {
  if (!candidate.url || !/^https?:\/\//iu.test(candidate.url)) return;
  if (candidates.some(({ url }) => url === candidate.url)) return;
  candidates.push(candidate);
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
    if (!key || key === "link" || key === "meta") continue;
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
