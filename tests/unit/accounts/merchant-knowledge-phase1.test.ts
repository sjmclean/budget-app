import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMerchantIdentity } from "../../../apps/web/src/features/accounts/merchantIdentityResolver.js";
import {
  discoverManifestUrl,
  discoverMerchantArtworkCandidates,
} from "../../../apps/web/src/features/icons/merchantFirstPartyAssetDiscovery.js";
import { validateMerchantIconBytes } from "../../../apps/web/src/features/icons/merchantIconContentStore.js";

describe("Phase 1 merchant identity", () => {
  it("resolves exact aliases and explicit bank descriptor prefixes", () => {
    assert.equal(resolveMerchantIdentity("Leaptel")?.merchant.officialDomains[0], "leaptel.com.au");
    assert.equal(resolveMerchantIdentity("WILSONS PARKING MELBOURNE")?.merchant.id, "wilson-parking");
    assert.equal(resolveMerchantIdentity("CWH GREENSBOROUGH PLAZA 0123")?.merchant.id, "chemist-warehouse");
    assert.equal(resolveMerchantIdentity("WOOLIES METRO 1042")?.merchant.id, "woolworths-au");
    assert.equal(resolveMerchantIdentity("ELITE ELEVEN DONCASTER")?.merchant.officialDomains[0], "eliteelevensporting.com");
    assert.equal(resolveMerchantIdentity("AMAZON MARKETPLACE AU")?.merchant.officialDomains[0], "amazon.com");
  });

  it("does not assume an Australian identity for region-ambiguous names", () => {
    assert.equal(resolveMerchantIdentity("Woolworths"), undefined);
    assert.equal(resolveMerchantIdentity("Kmart"), undefined);
    assert.equal(resolveMerchantIdentity("Target"), undefined);
    assert.equal(resolveMerchantIdentity("The Mexican Kitchen"), undefined);
  });

  it("does not invent identities for unknown or merely similar names", () => {
    assert.equal(resolveMerchantIdentity("Sculli Brothers"), undefined);
    assert.equal(resolveMerchantIdentity("Targeted Consulting"), undefined);
    assert.equal(resolveMerchantIdentity("BPAY PAYMENT"), undefined);
    assert.equal(resolveMerchantIdentity("Wilson Plumbing"), undefined);
  });
});

describe("first-party brand artwork discovery", () => {
  it("auto-accepts a merchant-matching structured organisation logo", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Example Market Australia",
            "logo": { "@type": "ImageObject", "url": "/brand/example-logo.png" }
          }
        </script>
        <link rel="icon" href="/favicon.ico">
      </head></html>`;
    const candidates = discoverMerchantArtworkCandidates({
      html,
      pageUrl: "https://example.com/",
      merchantName: "Example Market",
    });
    assert.equal(candidates[0].kind, "structured-logo");
    assert.equal(candidates[0].url, "https://example.com/brand/example-logo.png");
    assert.equal(candidates[0].confidence, "high");
    assert.equal(candidates[0].autoAccept, true);
    const favicon = candidates.find(({ url }) => url === "https://example.com/favicon.ico");
    assert.equal(favicon?.autoAccept, false);
  });

  it("auto-accepts explicit itemprop logo evidence", () => {
    const candidates = discoverMerchantArtworkCandidates({
      html: '<img itemprop="logo" src="/logo.png" alt="Example Market logo">',
      pageUrl: "https://example.com/",
      merchantName: "Example Market",
    });
    assert.equal(candidates[0].kind, "logo-image");
    assert.equal(candidates[0].confidence, "high");
    assert.equal(candidates[0].autoAccept, true);
  });

  it("keeps favicon, touch, manifest, and social artwork as evidence only", () => {
    const html = `
      <html><head>
        <link rel="icon" sizes="32x32" href="/favicon-32.png">
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch.png">
        <link rel="manifest" href="/site.webmanifest">
        <meta property="og:image" content="/social-card.jpg">
      </head></html>`;
    const manifestUrl = discoverManifestUrl(html, "https://example.com/shop");
    assert.equal(manifestUrl, "https://example.com/site.webmanifest");
    const candidates = discoverMerchantArtworkCandidates({
      html,
      pageUrl: "https://example.com/shop",
      merchantName: "Example Market",
      manifestUrl,
      manifest: {
        icons: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
      },
    });
    assert.equal(candidates.some(({ autoAccept }) => autoAccept), false);
    assert.equal(candidates.find(({ url }) => url.endsWith("/favicon-32.png"))?.confidence, "medium");
    assert.equal(candidates.find(({ url }) => url.endsWith("/favicon.ico"))?.confidence, "low");
    assert.equal(candidates.find(({ kind }) => kind === "apple-touch-icon")?.confidence, "low");
    assert.equal(candidates.find(({ kind }) => kind === "manifest-icon")?.confidence, "low");
    assert.equal(candidates.find(({ kind }) => kind === "og-image")?.confidence, "low");
  });

  it("deduplicates repeated artwork URLs while preserving stronger evidence", () => {
    const candidates = discoverMerchantArtworkCandidates({
      html: '<img itemprop="logo" src="/favicon.ico" alt="Example Market logo"><link rel="icon" href="/favicon.ico">',
      pageUrl: "https://example.com/",
      merchantName: "Example Market",
    });
    assert.equal(candidates.filter(({ url }) => url === "https://example.com/favicon.ico").length, 1);
    const candidate = candidates.find(({ url }) => url === "https://example.com/favicon.ico");
    assert.equal(candidate?.kind, "logo-image");
    assert.equal(candidate?.confidence, "high");
    assert.equal(candidate?.autoAccept, true);
  });
});

describe("merchant icon byte validation", () => {
  it("accepts supported image signatures and rejects disguised responses", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0, 0]);
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]);
    const ico = Uint8Array.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]);
    const html = new TextEncoder().encode("<html>not an image</html>");
    assert.equal(validateMerchantIconBytes(png, "image/png"), "image/png");
    assert.equal(validateMerchantIconBytes(jpeg, "image/jpeg"), "image/jpeg");
    assert.equal(validateMerchantIconBytes(webp, "image/webp"), "image/webp");
    assert.equal(validateMerchantIconBytes(ico, "image/x-icon"), "image/x-icon");
    assert.equal(validateMerchantIconBytes(html, "image/png"), undefined);
  });
});
