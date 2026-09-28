import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const generator = readFileSync("tools/merchant-icons/generate-simple-icons-expansion.ts", "utf8");
const manifest = JSON.parse(
  readFileSync("tools/merchant-icons/manifests/simple-icons-expansion.json", "utf8"),
) as { version: number; entries: Array<{ key: string; title: string; slug: string; source: string; shard: number }> };

test("Simple Icons expansion has a frozen 1,750-brand reviewed-source inventory", () => {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.entries.length, 1750);
  assert.equal(new Set(manifest.entries.map(({ key }) => key)).size, 1750);
  assert.ok(manifest.entries.every(({ source }) => source.startsWith("https://")));
  assert.ok(manifest.entries.every(({ shard }) => shard >= 1 && shard <= 44));
});

test("Simple Icons generator produces lazy static sprites and compact runtime metadata", () => {
  assert.match(generator, /import \* as simpleIcons from "simple-icons"/u);
  assert.match(generator, /community-simple-icons-/u);
  assert.match(generator, /merchantIconSimpleBrands\.ts/u);
  assert.match(generator, /reviewed-simple-icons-assets\.json/u);
  assert.match(generator, /--check/u);
  assert.doesNotMatch(generator, /data:image|;base64,/u);
});
