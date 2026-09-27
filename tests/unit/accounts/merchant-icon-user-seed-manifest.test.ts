import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

interface SeedEntry {
  sourceFile: string;
  key: string;
  name: string;
  include?: boolean;
  reviewNote?: string;
}

const manifest = JSON.parse(
  readFileSync("tools/merchant-icons/manifests/user-seed.json", "utf8"),
) as { batch: string; entries: SeedEntry[] };

test("reviewed user seed manifest preserves the 112-source inventory", () => {
  assert.equal(manifest.batch, "user-seed");
  assert.equal(manifest.entries.length, 112);

  const included = manifest.entries.filter((entry) => entry.include !== false);
  const excluded = manifest.entries.filter((entry) => entry.include === false);
  assert.equal(included.length, 102);
  assert.equal(excluded.length, 10);
  assert.ok(excluded.every((entry) => entry.reviewNote?.trim()));

  const sourceFiles = manifest.entries.map(({ sourceFile }) => sourceFile);
  assert.equal(new Set(sourceFiles).size, 112);
});

test("excluded seed entries are deliberate duplicates or seed replacements", () => {
  const excluded = manifest.entries.filter((entry) => entry.include === false);
  assert.deepEqual(
    excluded.map(({ key }) => key).sort(),
    [
      "aldi-au",
      "amazon-au",
      "bunnings-au",
      "coles-au",
      "mcdonalds-au",
      "netflix-au",
      "red-rooster-au",
      "spotify-au",
      "ticketek-au",
      "woolworths-au",
    ].sort(),
  );
});
