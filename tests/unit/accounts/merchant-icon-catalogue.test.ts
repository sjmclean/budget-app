import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MERCHANT_ICON_CATALOGUE,
  findMerchantIconByPayeeName,
  getMerchantIconEntry,
  normaliseMerchantIconIdentity,
  resolveMerchantIconAsset,
  searchMerchantIcons,
} from "../../../apps/web/src/features/icons/merchantIconCatalogue.js";

describe("merchant icon catalogue", () => {
  it("keeps stable unique keys across the seed and imported batch", () => {
    const keys = MERCHANT_ICON_CATALOGUE.map(({ key }) => key);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(MERCHANT_ICON_CATALOGUE.length >= 700 && MERCHANT_ICON_CATALOGUE.length <= 1600);
  });

  it("matches only exact canonical merchant identities automatically", () => {
    assert.equal(findMerchantIconByPayeeName("Woolworths")?.key, "woolworths-au");
    assert.equal(findMerchantIconByPayeeName("  WOOLWORTHS METRO ")?.key, "woolworths-au");
    assert.equal(findMerchantIconByPayeeName("Woolworths 1234"), undefined);
    assert.equal(findMerchantIconByPayeeName("My Woolworths purchase"), undefined);
  });

  it("keeps Coles Express distinct from Coles", () => {
    assert.equal(findMerchantIconByPayeeName("Coles")?.key, "coles-au");
    assert.equal(findMerchantIconByPayeeName("Coles Express")?.key, "coles-express-au");
  });

  it("normalises punctuation without broad fuzzy matching", () => {
    assert.equal(normaliseMerchantIconIdentity("McDonald's"), "mcdonalds");
    assert.equal(findMerchantIconByPayeeName("McDonalds")?.key, "mcdonalds-global");
  });

  it("preserves Unicode identities and resolves regional ambiguity only with a hint", () => {
    assert.equal(normaliseMerchantIconIdentity("Crédit Agricole"), "crédit agricole");
    assert.equal(normaliseMerchantIconIdentity("L'Oréal & Co."), "loréal and co");
    assert.equal(normaliseMerchantIconIdentity("東京電力（TEPCO）"), "東京電力 tepcO".toLocaleLowerCase());
    assert.equal(findMerchantIconByPayeeName("ALDI"), undefined);
    assert.equal(findMerchantIconByPayeeName("ALDI", "AU")?.key, "aldi-au");
    assert.equal(findMerchantIconByPayeeName("ALDI", "GB")?.key, "aldi-uk");
  });

  it("turns planning identities into live entries rather than counting manifests", () => {
    assert.equal(getMerchantIconEntry("banyule-city-council-au")?.category, "local-government");
    assert.equal(getMerchantIconEntry("stan-au")?.category, "streaming-video");
    assert.equal(getMerchantIconEntry("kayo-sports-au")?.category, "streaming-sport");
    assert.equal(getMerchantIconEntry("medibank-au")?.category, "health-insurance");
    assert.equal(getMerchantIconEntry("qantas-global")?.category, "airline");
  });

  it("keeps reviewed artwork in the majority and fallbacks explicitly unreviewed", () => {
    const reviewed = MERCHANT_ICON_CATALOGUE.filter(({ provenance }) => provenance?.reviewed);
    const generatedFallbacks = MERCHANT_ICON_CATALOGUE.filter(({ provenance }) =>
      provenance?.kind === "generated" && provenance.reviewed === false
    );
    assert.equal(MERCHANT_ICON_CATALOGUE.length, 1523);
    assert.ok(reviewed.length > MERCHANT_ICON_CATALOGUE.length / 2);
    assert.equal(reviewed.length, 1265);
    assert.equal(generatedFallbacks.length, 258);
    assert.ok(MERCHANT_ICON_CATALOGUE.every(({ provenance }) => !provenance || !("source" in provenance)));
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


  it("repairs Anaconda artwork and provides broad Australian fuel coverage", () => {
    const anaconda = getMerchantIconEntry("anaconda-au");
    assert.deepEqual(anaconda?.asset, { kind: "image", assetPath: "user-supplied/anaconda-au.png" });
    assert.equal(anaconda?.provenance?.kind, "user-supplied");
    assert.equal(anaconda?.provenance?.reviewed, true);

    const fuelKeys = [
      "7-eleven-au", "apco-service-stations-au", "caltex-au", "coles-express-au",
      "united-petroleum-au", "bp-au", "ampol-au", "shell-au", "mobil-au",
      "metro-petroleum-au", "otr-au", "reddy-express-au", "pearl-energy-au",
      "x-convenience-au", "eg-ampol-au",
    ];
    for (const key of fuelKeys) {
      const entry = getMerchantIconEntry(key);
      assert.ok(entry, `Missing fuel merchant ${key}`);
      assert.equal(entry.category, "fuel", `${key} should be categorised as fuel`);
    }

    assert.deepEqual(getMerchantIconEntry("apco-service-stations-au")?.asset, {
      kind: "image",
      assetPath: "user-supplied/apco-service-stations-au.svg",
    });
    assert.deepEqual(getMerchantIconEntry("oom-energy-au")?.asset, {
      kind: "image",
      assetPath: "user-supplied/oom-energy-au.svg",
    });
    assert.deepEqual(getMerchantIconEntry("peter-alexander-au")?.asset, {
      kind: "image",
      assetPath: "user-supplied/peter-alexander-au.svg",
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


  it("adds the user-identified priority brands with reviewed artwork and conservative aliases", () => {
    assert.equal(findMerchantIconByPayeeName("JD Sports")?.key, "jd-sports-global");
    assert.equal(findMerchantIconByPayeeName("JD Sports Australia")?.key, "jd-sports-global");
    assert.equal(findMerchantIconByPayeeName("SHEIN")?.key, "shein-global");
    assert.equal(findMerchantIconByPayeeName("Chat GPT")?.key, "chatgpt-global");
    assert.equal(findMerchantIconByPayeeName("Glassons")?.key, "glassons-global");
    assert.equal(findMerchantIconByPayeeName("Afterpay")?.key, "si-afterpay-global");
    assert.equal(findMerchantIconByPayeeName("Booking.com")?.key, "si-bookingdotcom-global");

    for (const key of ["jd-sports-global", "shein-global", "glassons-global", "chatgpt-global"]) {
      const entry = getMerchantIconEntry(key);
      assert.ok(entry, `Missing priority merchant ${key}`);
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

  it("provides lazy sprite references and bounded search", () => {
    assert.equal(getMerchantIconEntry("coles-au")?.name, "Coles");
    assert.deepEqual(resolveMerchantIconAsset("coles-au"), {
      kind: "sprite",
      href: "/merchant-icons/user-seed-03.svg#coles-au",
    });
    assert.equal(resolveMerchantIconAsset("missing"), undefined);
    assert.deepEqual(searchMerchantIcons("netflix", 5).map(({ key }) => key), ["netflix-global"]);
    assert.deepEqual(searchMerchantIcons("Teachers Health", 5).map(({ key }) => key), ["teachers-health-au"]);
    assert.ok(searchMerchantIcons("", 3).length <= 3);
  });
});
