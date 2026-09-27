import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normaliseMerchantIconIdentity } from "../../../apps/web/src/features/icons/merchantIconCatalogue.js";

interface ExpansionEntry {
  key: string;
  name: string;
  regions: string[];
  aliases: string[];
  category: string;
  provenance: { kind: string; reviewed: boolean };
}

const manifest = JSON.parse(
  readFileSync("tools/merchant-icons/manifests/expansion-2-local-government-streaming.json", "utf8"),
) as { version: number; entries: ExpansionEntry[] };

const allowedCategories = new Set([
  "streaming-video",
  "streaming-music",
  "streaming-sport",
  "gaming-subscription",
  "digital",
  "local-government",
]);

test("local government and streaming expansion inventory is internally consistent", () => {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.entries.length, 123);

  const keys = new Set<string>();
  const identities = new Map<string, string>();

  for (const entry of manifest.entries) {
    assert.match(entry.key, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.ok(entry.name.trim());
    assert.ok(entry.regions.length > 0);
    assert.ok(allowedCategories.has(entry.category), `unexpected category: ${entry.category}`);
    assert.equal(entry.provenance.kind, "generated");
    assert.equal(entry.provenance.reviewed, false);
    assert.ok(!keys.has(entry.key), `duplicate key: ${entry.key}`);
    keys.add(entry.key);

    for (const identity of [entry.name, ...entry.aliases]) {
      const canonical = normaliseMerchantIconIdentity(identity);
      assert.ok(canonical);
      const owner = identities.get(canonical);
      assert.ok(!owner || owner === entry.key, `duplicate canonical identity: ${canonical}`);
      identities.set(canonical, entry.key);
    }
  }
});

test("expansion includes both council and streaming coverage", () => {
  assert.ok(manifest.entries.some(({ key }) => key === "banyule-city-council-au"));
  assert.ok(manifest.entries.some(({ key }) => key === "yarra-city-council-au"));
  assert.ok(manifest.entries.some(({ key }) => key === "auckland-council-nz"));
  assert.ok(manifest.entries.some(({ key }) => key === "stan-au"));
  assert.ok(manifest.entries.some(({ key }) => key === "kayo-sports-au"));
  assert.ok(manifest.entries.some(({ key }) => key === "disney-plus-global"));
  assert.ok(manifest.entries.some(({ key }) => key === "apple-music-global"));
  assert.ok(manifest.entries.some(({ key }) => key === "xbox-game-pass-global"));
});
