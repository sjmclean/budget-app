import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const catalogue = readFileSync("apps/web/src/features/icons/merchantIconCatalogue.ts", "utf8");
const expansion = readFileSync("apps/web/src/features/icons/merchantIconMajorExpansion.ts", "utf8");
const fuelExpansion = readFileSync("apps/web/src/features/icons/merchantIconFuelExpansion.ts", "utf8");
const planning = JSON.parse(readFileSync("tools/merchant-icons/manifests/expansion-2-local-government-streaming.json", "utf8")) as { entries: unknown[] };

test("catalogue references lazy static assets without bundling image payloads", () => {
  assert.doesNotMatch(catalogue + expansion + fuelExpansion, /data:image|;base64,/u);
  assert.doesNotMatch(expansion, /import .*\.(?:png|webp|svg)/u);
  assert.match(expansion, /major-expansion-01\.svg/u);
  assert.match(fuelExpansion, /fuel\/ampol\.png/u);
});

test("live catalogue expansion is distinct from planning manifest inventory", async () => {
  const { MAJOR_MERCHANT_ICON_EXPANSION } = await import("../../../apps/web/src/features/icons/merchantIconMajorExpansion.js");
  assert.equal(planning.entries.length, 123);
  assert.equal(MAJOR_MERCHANT_ICON_EXPANSION.length, 650);
  assert.notEqual(MAJOR_MERCHANT_ICON_EXPANSION.length, planning.entries.length);
  const { FUEL_MERCHANT_ICON_EXPANSION } = await import("../../../apps/web/src/features/icons/merchantIconFuelExpansion.js");
  assert.equal(FUEL_MERCHANT_ICON_EXPANSION.length, 9);
});
