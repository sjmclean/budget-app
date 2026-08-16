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
    assert.equal(resolveMerchantIdentity("WOOLWORTHS/CNR ST HELENA")?.merchant.id, "woolworths");
    assert.equal(resolveMerchantIdentity("ELITE ELEVEN DONCASTER")?.merchant.officialDomains[0], "eliteelevensporting.com");
    assert.equal(resolveMerchantIdentity("THE MEXICAN KITCHEN TEMPLESTOWE")?.merchant.officialDomains[0], "themexicankitchen.com.au");
  });

  it("does not invent identities for unknown or merely similar names", () => {
    assert.equal(resolveMerchantIdentity("Sculli Brothers"), undefined);
    assert.equal(resolveMerchantIdentity("Targeted Consulting"), undefined);
    assert.equal(resolveMerchantIdentity("BPAY PAYMENT"), undefined);
    assert.equal(resolveMerchantIdentity("Wilson Plumbing"), undefined);
  });
});

describe("first-party artwork discovery", () => {
  it("ranks declared touch and manifest icons ahead of generic page imagery", () => {
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
      manifestUrl,
      manifest: {
        icons: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
      },
    });
    assert.deepEqual(candidates.map(({ kind }) => kind), [
      "apple-touch-icon",
      "manifest-icon",
      "icon",
      "og-image",
    ]);
    assert.equal(candidates[0].url, "https://example.com/apple-touch.png");
  });

  it("deduplicates repeated declarations", () => {
    const candidates = discoverMerchantArtworkCandidates({
      html: '<link rel="icon" href="/favicon.png"><link rel="shortcut icon" href="/favicon.png">',
      pageUrl: "https://example.com/",
    });
    assert.equal(candidates.length, 1);
  });
});

describe("merchant icon byte validation", () => {
  it("accepts supported image signatures and rejects disguised responses", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0, 0]);
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]);
    const html = new TextEncoder().encode("<html>not an image</html>");
    assert.equal(validateMerchantIconBytes(png, "image/png"), "image/png");
    assert.equal(validateMerchantIconBytes(jpeg, "image/jpeg"), "image/jpeg");
    assert.equal(validateMerchantIconBytes(webp, "image/webp"), "image/webp");
    assert.equal(validateMerchantIconBytes(html, "image/png"), undefined);
  });
});
