import { recordMerchantIconKnowledge } from "../accounts/merchantIconKnowledge.js";
import { resolveMerchantIdentity } from "../accounts/merchantIdentityResolver.js";
import {
  discoverManifestUrl,
  discoverMerchantArtworkCandidates,
  type MerchantManifestDocument,
} from "./merchantFirstPartyAssetDiscovery.js";
import {
  storeMerchantIconContent,
  validateMerchantIconBytes,
  type StoredMerchantIconContent,
} from "./merchantIconContentStore.js";

export interface MerchantIconPageResponse {
  readonly url: string;
  readonly html: string;
}

export interface MerchantIconAssetResponse {
  readonly url: string;
  readonly bytes: Uint8Array;
  readonly contentType?: string | null;
}

/**
 * Networking is intentionally behind a port. Browsers cannot reliably inspect
 * arbitrary merchant sites because of CORS; hosted/local server adapters can
 * implement this port without coupling identity logic to a third-party logo API.
 */
export interface MerchantIconNetworkPort {
  fetchOfficialPage(domain: string): Promise<MerchantIconPageResponse>;
  fetchManifest(url: string): Promise<MerchantManifestDocument | null>;
  fetchAsset(url: string): Promise<MerchantIconAssetResponse>;
}

export interface MerchantIconIngestionSuccess {
  readonly status: "cached";
  readonly merchantId: string;
  readonly canonicalName: string;
  readonly domain: string;
  readonly identityKind: "exact-alias" | "descriptor-prefix";
  readonly artworkKind: "apple-touch-icon" | "icon" | "manifest-icon" | "og-image";
  readonly sourceUrl: string;
  readonly content: StoredMerchantIconContent;
}

export type MerchantIconIngestionResult =
  | MerchantIconIngestionSuccess
  | { readonly status: "unresolved-merchant" }
  | {
      readonly status: "no-usable-first-party-artwork";
      readonly merchantId: string;
      readonly canonicalName: string;
      readonly domain: string;
    };

export async function ingestMerchantIconPhase1({
  payeeName,
  network,
}: {
  readonly payeeName: string;
  readonly network: MerchantIconNetworkPort;
}): Promise<MerchantIconIngestionResult> {
  const identity = resolveMerchantIdentity(payeeName);
  if (!identity) return { status: "unresolved-merchant" };

  for (const domain of identity.merchant.officialDomains) {
    let page: MerchantIconPageResponse;
    try {
      page = await network.fetchOfficialPage(domain);
    } catch {
      continue;
    }

    let manifest: MerchantManifestDocument | null = null;
    let manifestUrl: string | undefined;
    try {
      manifestUrl = discoverManifestUrl(page.html, page.url);
      if (manifestUrl) manifest = await network.fetchManifest(manifestUrl);
    } catch {
      manifest = null;
    }

    const candidates = discoverMerchantArtworkCandidates({
      html: page.html,
      pageUrl: page.url,
      manifest,
      manifestUrl,
    });

    for (const candidate of candidates) {
      let asset: MerchantIconAssetResponse;
      try {
        asset = await network.fetchAsset(candidate.url);
      } catch {
        continue;
      }
      if (!validateMerchantIconBytes(asset.bytes, asset.contentType)) continue;

      try {
        const acquiredAt = new Date().toISOString();
        const content = await storeMerchantIconContent({
          bytes: asset.bytes,
          contentType: asset.contentType,
          sourceDomain: domain,
          sourceUrl: asset.url,
          acquiredAt,
        });
        recordMerchantIconKnowledge({
          merchantId: identity.merchant.id,
          canonicalName: identity.merchant.canonicalName,
          domain,
          contentRef: content.contentRef,
          sourceUrl: asset.url,
          artworkKind: candidate.kind,
          acquiredAt,
        });
        return {
          status: "cached",
          merchantId: identity.merchant.id,
          canonicalName: identity.merchant.canonicalName,
          domain,
          identityKind: identity.kind,
          artworkKind: candidate.kind,
          sourceUrl: asset.url,
          content,
        };
      } catch {
        continue;
      }
    }
  }

  return {
    status: "no-usable-first-party-artwork",
    merchantId: identity.merchant.id,
    canonicalName: identity.merchant.canonicalName,
    domain: identity.merchant.officialDomains[0] ?? "",
  };
}
