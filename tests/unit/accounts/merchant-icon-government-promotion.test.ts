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
  assert.equal(approval.entries.length, 10);
  assert.equal(new Set(approval.entries.map(({ key }) => key)).size, approval.entries.length);
  assert.ok(approval.entries.every(({ assetSource }) => assetSource.startsWith("https://")));
  assert.ok(approval.entries.every(({ assetPath }) => assetPath.startsWith("official/government/")));
  assert.match(promotion, /candidate-agency-specific/u);
  assert.match(promotion, /candidate\.assetSource !== approval\.assetSource/u);
  assert.match(promotion, /artwork source changed; review required/u);
  assert.match(promotion, /2_000_000/u);
  assert.match(promotion, /validateBytes/u);
  assert.match(promotion, /reviewed-official-assets\.json/u);
  assert.match(promotion, /provenance: \{ kind: "official", reviewed: true \}/u);
  assert.match(promotion, /const promoted: ApprovalEntry\[\] = \[\]/u);
  assert.match(promotion, /const failures:/u);
  assert.match(promotion, /for \(const approval of promoted\)/u);
  assert.match(promotion, /const runtimeEntries = promoted\.map/u);
  assert.match(promotion, /process\.exitCode = 1/u);
});

test("government promotion preserves existing provenance order and owns the runtime expansion", () => {
  assert.match(catalogue, /GOVERNMENT_MERCHANT_ICON_EXPANSION/u);
  assert.match(governmentExpansion, /export const GOVERNMENT_MERCHANT_ICON_EXPANSION/u);
  assert.match(promotion, /official\.entries\.findIndex/u);
  assert.match(promotion, /official\.entries\.push/u);
  assert.doesNotMatch(promotion, /official\.entries = \[\.\.\.officialByKey\.values\(\)\]\.sort/u);
  assert.match(promotion, /merchantIconGovernmentExpansion\.ts/u);
});
