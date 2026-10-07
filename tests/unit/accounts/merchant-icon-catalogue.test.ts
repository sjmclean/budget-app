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

  it("normalises punctuation and Unicode without broad fuzzy matching", () => {
    assert.equal(normaliseMerchantIconIdentity("L'Oréal & Co."), "loréal and co");
    assert.equal(normaliseMerchantIconIdentity("東京電力（TEPCO）"), "東京電力 tepcO".toLocaleLowerCase());
    assert.equal(findMerchantIconByPayeeName("Qantas Airways"), undefined);
  });

  it("keeps independently sourced planning identities live", () => {
    assert.equal(getMerchantIconEntry("banyule-city-council-au")?.category, "local-government");
    assert.equal(getMerchantIconEntry("stan-au")?.category, "streaming-video");
    assert.equal(getMerchantIconEntry("kayo-sports-au")?.category, "streaming-sport");
    assert.equal(getMerchantIconEntry("medibank-au")?.category, "health-insurance");
    assert.equal(getMerchantIconEntry("qantas-global")?.category, "airline");
  });

  it("keeps reviewed and generated provenance internally consistent", () => {
    const generatedFallbacks = MERCHANT_ICON_CATALOGUE.filter(
      ({ provenance }) => provenance?.kind === "generated" && provenance.reviewed === false,
    );
    assert.ok(generatedFallbacks.length > 0);
    assert.ok(MERCHANT_ICON_CATALOGUE.every(({ provenance }) => !provenance || !("source" in provenance)));
    assert.ok(
      MERCHANT_ICON_CATALOGUE.every(
        ({ provenance }) => provenance?.kind !== "generated" || provenance.reviewed === false,
      ),
    );
  });

  it("protects independently sourced high-value merchants from reverting to generated tiles", () => {
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
    ];

    for (const key of keys) {
      const entry = getMerchantIconEntry(key);
      assert.ok(entry, `Missing high-value merchant ${key}`);
      assert.equal(entry.provenance?.reviewed, true, `${key} must keep reviewed artwork`);
      assert.notEqual(entry.provenance?.kind, "generated", `${key} must not use a generated tile`);
      if (entry.asset.kind === "sprite") {
        assert.ok(!entry.asset.spritePath.startsWith("major-expansion-"), `${key} points at a fallback sprite`);
      }
    }
  });

  it("keeps independently sourced Australian fuel artwork reviewed", () => {
    for (const key of [
      "ampol-au",
      "shell-au",
      "mobil-au",
      "metro-petroleum-au",
      "otr-au",
      "reddy-express-au",
      "pearl-energy-au",
    ]) {
      const entry = getMerchantIconEntry(key);
      assert.ok(entry, `Missing fuel merchant ${key}`);
      assert.equal(entry?.provenance?.kind, "community");
      assert.equal(entry?.provenance?.reviewed, true);
      assert.equal(entry?.asset.kind, "image");
    }
  });

  it("keeps the generic brand expansion reviewed, lazy and exact-match-only", () => {
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
});
