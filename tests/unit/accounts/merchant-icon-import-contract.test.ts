import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const importer = readFileSync("tools/merchant-icons/import-catalogue-batch.ts", "utf8");

test("merchant batch importer is deterministic and rejects unsafe catalogue inputs", () => {
  assert.match(importer, /--source <directory> --manifest <manifest\.json>/);
  assert.match(importer, /\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$/);
  assert.match(importer, /Duplicate merchant key in batch/);
  assert.match(importer, /Unsupported merchant image format/);
  assert.match(importer, /metadata\.size <= 0/);
  assert.match(importer, /entry\.include !== false/);
  assert.match(importer, /copyFile\(inputPath/);
  assert.match(importer, /merchantIconImportedBatch\.ts/);
  assert.doesNotMatch(importer, /fuzzy|levenshtein|similarity/i);
});
