import type {
  MerchantIconAssetResponse,
  MerchantIconNetworkPort,
  MerchantIconPageResponse,
} from "./merchantIconIngestion.js";
import type { MerchantManifestDocument } from "./merchantFirstPartyAssetDiscovery.js";

const DEV_FETCH_ENDPOINT = "/__merchant-icon-fetch";

/**
 * Browser adapter for the Phase 1 ingestion network port.
 *
 * In development this talks to the tightly-scoped Vite middleware registered in
 * vite.config.ts. Production intentionally has no implicit arbitrary-web proxy;
 * the hosted/local server adapter remains a separate deployment boundary.
 */
export function createSameOriginMerchantIconNetworkPort(): MerchantIconNetworkPort {
  let activeDomain = "";

  return {
    async fetchOfficialPage(domain: string): Promise<MerchantIconPageResponse> {
      activeDomain = normaliseDomain(domain);
      const response = await fetch(
        `${DEV_FETCH_ENDPOINT}?kind=page&domain=${encodeURIComponent(activeDomain)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error(`Merchant page fetch failed (${response.status}).`);
      const value = await response.json() as Partial<MerchantIconPageResponse>;
      if (typeof value.url !== "string" || typeof value.html !== "string") {
        throw new Error("Merchant page response was invalid.");
      }
      return { url: value.url, html: value.html };
    },

    async fetchManifest(url: string): Promise<MerchantManifestDocument | null> {
      if (!activeDomain) throw new Error("Merchant page must be fetched before its manifest.");
      const response = await fetch(proxyUrl("manifest", activeDomain, url), {
        headers: { Accept: "application/json" },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Merchant manifest fetch failed (${response.status}).`);
      const value = await response.json();
      return value && typeof value === "object" ? value as MerchantManifestDocument : null;
    },

    async fetchAsset(url: string): Promise<MerchantIconAssetResponse> {
      if (!activeDomain) throw new Error("Merchant page must be fetched before its assets.");
      const response = await fetch(proxyUrl("asset", activeDomain, url), {
        headers: { Accept: "image/*" },
      });
      if (!response.ok) throw new Error(`Merchant asset fetch failed (${response.status}).`);
      return {
        url: response.headers.get("X-Merchant-Final-Url") ?? url,
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("Content-Type"),
      };
    },
  };
}

function proxyUrl(kind: "manifest" | "asset", domain: string, target: string): string {
  const params = new URLSearchParams({ kind, domain, target });
  return `${DEV_FETCH_ENDPOINT}?${params.toString()}`;
}

function normaliseDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./u, "");
}
