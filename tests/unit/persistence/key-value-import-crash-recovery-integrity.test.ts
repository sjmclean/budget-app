import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/keyValueImportStage.ts",
    import.meta.url,
  ),
  "utf8",
);

test("staged import manifest durably records promotion recovery data", () => {
  const manifestStart = source.indexOf("interface StageManifest");
  assert.notEqual(manifestStart, -1);

  const manifestEnd = source.indexOf(
    "export interface KeyValueImportStageOptions",
    manifestStart,
  );
  assert.notEqual(manifestEnd, -1);

  const manifest = source.slice(manifestStart, manifestEnd);

  assert.match(
    manifest,
    /promotedKeys:\s*readonly\s+string\[\]/,
    "the manifest must durably identify keys already promoted to live storage",
  );

  assert.match(
    manifest,
    /overwrittenValues:\s*Readonly<Record<string,\s*string>>/,
    "the manifest must durably retain overwritten live values for crash rollback",
  );
});

test("promotion recovery state is persisted before staged copies are released", () => {
  const start = source.indexOf("private async commitInBatches(");
  assert.notEqual(start, -1);

  const body = source.slice(start);

  assert.match(
    body,
    /promotedKeys\.add[\s\S]*?writeManifest\(\)[\s\S]*?flush\?\.\(\)[\s\S]*?stagedKeys\.delete/,
    "promotion recovery metadata must be durable before the staged rollback copy is released",
  );
});

test("abandoned committing stages restore promoted live keys instead of only deleting stage data", () => {
  const start = source.indexOf(
    "export async function cleanupAbandonedImportStage(",
  );
  assert.notEqual(start, -1);

  const body = source.slice(start);

  assert.match(
    body,
    /manifest\.state\s*===\s*"committing"/,
    "cleanup must distinguish an interrupted commit from ordinary abandoned staging",
  );

  assert.match(
    body,
    /manifest\.promotedKeys/,
    "cleanup must inspect the durable set of already promoted keys",
  );

  assert.match(
    body,
    /manifest\.overwrittenValues/,
    "cleanup must restore overwritten target values",
  );
});
