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
    assert.ok(MERCHANT_ICON_CATALOGUE.length >= 600 && MERCHANT_ICON_CATALOGUE.length <= 800);
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

  it("keeps reviewed legacy artwork distinct from generated fallback marks", () => {
    const reviewed = MERCHANT_ICON_CATALOGUE.filter(({ provenance }) => provenance?.reviewed);
    const generatedFallbacks = MERCHANT_ICON_CATALOGUE.filter(({ provenance }) =>
      provenance?.kind === "generated" && provenance.reviewed === false
    );
    assert.equal(reviewed.length, 110);
    assert.equal(generatedFallbacks.length, 650);
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
