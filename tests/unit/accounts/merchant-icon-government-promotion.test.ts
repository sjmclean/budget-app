import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const promotion = readFileSync("tools/merchant-icons/promote-government-artwork.ts", "utf8");
const approval = JSON.parse(readFileSync("tools/merchant-icons/manifests/government-reviewed-batch-01.json", "utf8")) as {
  readonly entries: readonly {
    readonly key: string;
    readonly assetSource: string;
    readonly assetPath: string;
  }[];
};
const catalogue = readFileSync("apps/web/src/features/icons/merchantIconCatalogue.ts", "utf8");
const governmentExpansion = readFileSync("apps/web/src/features/icons/merchantIconGovernmentExpansion.ts", "utf8");

test("government promotion is explicit, source-locked and agency-specific only", () => {
  assert.equal(approval.entries.length, 12);
  assert.equal(new Set(approval.entries.map(({ key }) => key)).size, approval.entries.length);
  assert.ok(approval.entries.every(({ assetSource }) => assetSource.startsWith("https://")));
  assert.ok(approval.entries.every(({ assetPath }) => assetPath.startsWith("official/government/")));
  assert.match(promotion, /candidate-agency-specific/u);
  assert.match(promotion, /candidate\.assetSource !== approval\.assetSource/u);
  assert.match(promotion, /Artwork source changed/u);
  assert.match(promotion, /2_000_000/u);
  assert.match(promotion, /validateBytes/u);
  assert.match(promotion, /reviewed-official-assets\.json/u);
  assert.match(promotion, /provenance: \{ kind: "official", reviewed: true \}/u);
});

test("government catalogue hook is inert until reviewed assets are promoted", () => {
  assert.match(catalogue, /GOVERNMENT_MERCHANT_ICON_EXPANSION/u);
  assert.match(governmentExpansion, /= \[\] as const/u);
});
