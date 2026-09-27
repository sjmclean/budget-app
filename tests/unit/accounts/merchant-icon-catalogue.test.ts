import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MERCHANT_ICON_CATALOGUE,
  findMerchantIconByPayeeName,
  getMerchantIconEntry,
  merchantIconAssetUrl,
  normaliseMerchantIconIdentity,
  searchMerchantIcons,
} from "../../../apps/web/src/features/icons/merchantIconCatalogue.js";

describe("merchant icon catalogue", () => {
  it("keeps stable unique keys and asset paths", () => {
    const keys = MERCHANT_ICON_CATALOGUE.map(({ key }) => key);
    const paths = MERCHANT_ICON_CATALOGUE.map(({ assetPath }) => assetPath);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(new Set(paths).size, paths.length);
    assert.ok(MERCHANT_ICON_CATALOGUE.length > 0);
  });

  it("matches only exact canonical merchant identities automatically", () => {
    assert.equal(findMerchantIconByPayeeName("Woolworths")?.key, "woolworths-au");
    assert.equal(findMerchantIconByPayeeName("  WOOLWORTHS METRO ")?.key, "woolworths-au");
    assert.equal(findMerchantIconByPayeeName("Woolworths 1234"), undefined);
    assert.equal(findMerchantIconByPayeeName("My Woolworths purchase"), undefined);
  });

  it("normalises punctuation without broad fuzzy matching", () => {
    assert.equal(normaliseMerchantIconIdentity("McDonald's"), "mcdonalds");
    assert.equal(findMerchantIconByPayeeName("McDonalds")?.key, "mcdonalds-global");
  });

  it("provides lazy public asset URLs and bounded search", () => {
    assert.equal(getMerchantIconEntry("coles-au")?.name, "Coles");
    assert.equal(merchantIconAssetUrl("coles-au"), "/merchant-icons/seed/coles-au.svg");
    assert.equal(merchantIconAssetUrl("missing"), undefined);
    assert.deepEqual(searchMerchantIcons("netflix", 5).map(({ key }) => key), ["netflix-global"]);
    assert.ok(searchMerchantIcons("", 3).length <= 3);
  });
});
