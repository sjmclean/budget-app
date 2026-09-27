import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  MERCHANT_ICON_CATALOGUE,
  normaliseMerchantIconIdentity,
} from "../../../apps/web/src/features/icons/merchantIconCatalogue.js";

test("merchant catalogue entries have unique identities and real lazy assets", () => {
  const keys = new Set<string>();
  const paths = new Set<string>();
  const identities = new Map<string, string>();

  for (const entry of MERCHANT_ICON_CATALOGUE) {
    assert.match(entry.key, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.ok(entry.name.trim());
    assert.ok(entry.regions.length > 0);
    assert.ok(!keys.has(entry.key), `duplicate key: ${entry.key}`);
    assert.ok(!paths.has(entry.assetPath), `duplicate asset path: ${entry.assetPath}`);
    keys.add(entry.key);
    paths.add(entry.assetPath);

    assert.ok(
      existsSync(resolve("apps/web/public/merchant-icons", entry.assetPath)),
      `missing merchant icon asset: ${entry.assetPath}`,
    );

    for (const identity of [entry.name, ...entry.aliases]) {
      const canonical = normaliseMerchantIconIdentity(identity);
      assert.ok(canonical);
      const existing = identities.get(canonical);
      assert.ok(!existing || existing === entry.key, `ambiguous merchant identity "${canonical}"`);
      identities.set(canonical, entry.key);
    }
  }
});
