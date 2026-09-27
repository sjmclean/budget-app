import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  MERCHANT_ICON_CATALOGUE,
  normaliseMerchantIconIdentity,
} from "../../../apps/web/src/features/icons/merchantIconCatalogue.js";

test("merchant catalogue entries have unique identities and real lazy assets", () => {
  const keys = new Set<string>();
  const symbols = new Set<string>();
  const identities = new Map<string, string>();
  const spriteCache = new Map<string, string>();

  for (const entry of MERCHANT_ICON_CATALOGUE) {
    assert.match(entry.key, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.ok(entry.name.trim());
    assert.ok(entry.regions.length > 0);
    assert.ok(!keys.has(entry.key), `duplicate key: ${entry.key}`);
    keys.add(entry.key);

    if (entry.asset.kind === "image") {
      assert.ok(
        existsSync(resolve("apps/web/public/merchant-icons", entry.asset.assetPath)),
        `missing merchant icon asset: ${entry.asset.assetPath}`,
      );
    } else {
      const spritePath = resolve("apps/web/public/merchant-icons", entry.asset.spritePath);
      assert.ok(existsSync(spritePath), `missing merchant sprite: ${entry.asset.spritePath}`);
      const sprite = spriteCache.get(spritePath) ?? readFileSync(spritePath, "utf8");
      spriteCache.set(spritePath, sprite);
      assert.match(
        sprite,
        new RegExp(`<symbol\\s+id=["']${entry.asset.symbolId}["'](?:\\s|>)`, "u"),
        `missing sprite symbol: ${entry.asset.symbolId}`,
      );
      assert.ok(!symbols.has(entry.asset.symbolId), `duplicate sprite symbol: ${entry.asset.symbolId}`);
      symbols.add(entry.asset.symbolId);
    }

    for (const identity of [entry.name, ...entry.aliases]) {
      const canonical = normaliseMerchantIconIdentity(identity);
      assert.ok(canonical);
      const existing = identities.get(canonical);
      assert.ok(!existing || existing === entry.key, `ambiguous merchant identity "${canonical}"`);
      identities.set(canonical, entry.key);
    }
  }

  assert.equal(spriteCache.size, 8);
});
