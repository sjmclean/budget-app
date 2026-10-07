import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
  MERCHANT_ICON_CATALOGUE,
  findMerchantIconByPayeeName,
  getMerchantIconEntry,
  normaliseMerchantIconIdentity,
  preloadExtendedMerchantIconCatalogue,
  resolveMerchantIconAsset,
  searchMerchantIcons,
} from "../../../apps/web/src/features/icons/merchantIconCatalogue.js";
import { GOVERNMENT_MERCHANT_ICON_EXPANSION } from "../../../apps/web/src/features/icons/merchantIconGovernmentExpansion.js";

describe("merchant icon catalogue", () => {
  before(async () => {
    await preloadExtendedMerchantIconCatalogue();
  });
  it("keeps stable unique keys across the catalogue", () => {
    const keys = MERCHANT_ICON_CATALOGUE.map(({ key }) => key);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(MERCHANT_ICON_CATALOGUE.length > 1000);
  });

  it("matches only exact canonical merchant identities automatically", () => {
    assert.equal(findMerchantIconByPayeeName("Qantas")?.key, "qantas-global");
    assert.equal(findMerchantIconByPayeeName("  QANTAS ")?.key, "qantas-global");
    assert.equal(findMerchantIconByPayeeName("Qantas 1234"), undefined);
    assert.equal(findMerchantIconByPayeeName("My Qantas purchase"), undefined);
  });

  it("normalises punctuation without broad fuzzy matching", () => {
    assert.equal(normaliseMerchantIconIdentity("L'Oréal & Co."), "loréal and co");
    assert.equal(findMerchantIconByPayeeName("Qantas Airways")?.key, undefined);
  });

  it("preserves Unicode identities and resolves regional ambiguity only with a hint", () => {
    assert.equal(normaliseMerchantIconIdentity("Crédit Agricole"), "crédit agricole");
    assert.equal(normaliseMerchantIconIdentity("L'Oréal & Co."), "loréal and co");
    assert.equal(normaliseMerchantIconIdentity("東京電力（TEPCO）"), "東京電力 tepcO".toLocaleLowerCase());
  });

  it("turns planning identities into live entries rather than counting manifests", () => {
    assert.equal(getMerchantIconEntry("banyule-city-council-au")?.category, "local-government");
    assert.equal(getMerchantIconEntry("stan-au")?.category, "streaming-video");
    assert.equal(getMerchantIconEntry("kayo-sports-au")?.category, "streaming-sport");
    assert.equal(getMerchantIconEntry("medibank-au")?.category, "health-insurance");
    assert.equal(getMerchantIconEntry("qantas-global")?.category, "airline");
  });

  it("keeps reviewed and generated provenance internally consistent", () => {
    const generatedFallbacks = MERCHANT_ICON_CATALOGUE.filter(({ provenance }) =>
      provenance?.kind === "generated" && provenance.reviewed === false
    );
    assert.ok(generatedFallbacks.length > 0);
    assert.ok(MERCHANT_ICON_CATALOGUE.every(({ provenance }) => !provenance || !("source" in provenance)));
    assert.ok(MERCHANT_ICON_CATALOGUE.every(({ provenance }) => provenance?.kind !== "generated" || provenance.reviewed === false));
  });

  it("protects high-priority merchants from reverting to generated tiles", () => {
    const keys = [
      "qantas-global",
      "commonwealth-bank-au",
      "telstra-au",
      "origin-energy-au",
      "medibank-au",
      "stan-au",
      "disney-plus-global",
      "david-jones-global",
      "hertz-global",
      "wilson-parking-global",
      "banyule-city-council-au",
      "jd-sports-global",
      "shein-global",
      "chatgpt-global",
    ];

    for (const key of keys) {
      const entry = getMerchantIconEntry(key);
      assert.ok(entry, `Missing high-priority merchant ${key}`);
      assert.equal(entry.provenance?.reviewed, true, `${key} must keep reviewed artwork`);
      assert.notEqual(entry.provenance?.kind, "generated", `${key} must not use a generated tile`);
      if (entry.asset.kind === "sprite") {
        assert.ok(!entry.asset.spritePath.startsWith("major-expansion-"), `${key} points at a fallback sprite`);
      }
    }
  });


    for (const key of [
      "bp-au", "ampol-au", "shell-au", "mobil-au", "metro-petroleum-au",
      "otr-au", "reddy-express-au", "pearl-energy-au",
    ]) {
      const entry = getMerchantIconEntry(key)!;
      assert.equal(entry.provenance?.kind, "community");
      assert.equal(entry.provenance?.reviewed, true);
      assert.equal(entry.asset.kind, "image");
    }
  });


  it("keeps the generated brand expansion reviewed, lazy and exact-match-only", () => {
    const afterpay = getMerchantIconEntry("si-afterpay-global");
    assert.equal(afterpay?.name, "Afterpay");
    assert.equal(afterpay?.provenance?.kind, "community");
    assert.equal(afterpay?.provenance?.reviewed, true);
    assert.deepEqual(afterpay?.asset, {
      kind: "sprite",
      spritePath: "community-simple-icons-02.svg",
      symbolId: "si-afterpay",
    });
    assert.equal(findMerchantIconByPayeeName("Afterpay 1234"), undefined);
  });

  it("provides bounded search from independently sourced catalogue entries", () => {
    assert.equal(resolveMerchantIconAsset("missing"), undefined);
    assert.deepEqual(searchMerchantIcons("qantas", 5).map(({ key }) => key), ["qantas-global"]);
    assert.ok(searchMerchantIcons("", 3).length <= 3);
  });
    assert.equal(resolveMerchantIconAsset("missing"), undefined);
    assert.deepEqual(searchMerchantIcons("netflix", 5).map(({ key }) => key), ["netflix-global"]);
    assert.deepEqual(searchMerchantIcons("Teachers Health", 5).map(({ key }) => key), ["teachers-health-au"]);
    assert.ok(searchMerchantIcons("", 3).length <= 3);
  });
});
