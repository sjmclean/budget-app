import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const builder = readFileSync("tools/merchant-icons/build-government-candidates.ts", "utf8");
const probe = readFileSync("tools/merchant-icons/probe-government-artwork.ts", "utf8");

test("government candidates retain source websites for artwork discovery", () => {
  assert.match(builder, /readonly website\?: string/u);
  assert.match(builder, /Website:\\s\*\[\\s\\S\]\*\?<a/u);
  assert.match(builder, /web_url/u);
  assert.match(builder, /new URL\(match\[1\]/u);
});

test("government artwork probe only produces review candidates", () => {
  assert.match(probe, /government-promotion-queue\.json/u);
  assert.match(probe, /government-artwork-candidates\.json/u);
  assert.match(probe, /apple-touch-icon/u);
  assert.match(probe, /mask-icon/u);
  assert.match(probe, /no-declared-icon/u);
  assert.match(probe, /Artwork discovery only/u);
  assert.doesNotMatch(probe, /reviewed:\s*true/u);
});
