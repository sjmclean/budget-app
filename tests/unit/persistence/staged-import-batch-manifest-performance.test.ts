import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workerSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

const clientSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.ts",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(
  source: string,
  startNeedle: string,
  endNeedle: string,
): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${startNeedle} should exist`);

  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);

  return source.slice(start, end);
}

test("staged register batches do not recount the whole manifest after every batch", () => {
  const body = functionBody(
    workerSource,
    "function importRegisterBatch(",
    "\nfunction importEntityBatch(",
  );

  assert.doesNotMatch(
    body,
    /return currentManifest\(\)/,
    "intermediate register import batches should not recount the growing staged database",
  );
});

test("staged entity batches do not recount the whole manifest after every batch", () => {
  const body = functionBody(
    workerSource,
    "function importEntityBatch(",
    "\nasync function removeOpfsFile(",
  );

  assert.doesNotMatch(
    body,
    /return currentManifest\(\)/,
    "intermediate entity import batches should not recount the growing staged database",
  );
});

test("staged batch client methods expose void results", () => {
  assert.match(
    clientSource,
    /importRegisterBatch\([^)]*\): Promise<void>/,
    "register import batches should expose a void result",
  );

  assert.match(
    clientSource,
    /importEntityBatch\([^)]*\): Promise<void>/,
    "entity import batches should expose a void result",
  );
});

test("final staged import commit still returns a validated manifest", () => {
  assert.match(
    clientSource,
    /commitStagedImport\([\s\S]*?\): Promise<LocalBudgetManifest>/,
    "final staged import commit must continue returning the promoted manifest",
  );

  assert.match(
    workerSource,
    /async function commitStagedImport\([\s\S]*?const manifest = currentManifest\(\)/,
    "final staged import commit must retain pre-promotion manifest validation",
  );

  assert.match(
    workerSource,
    /const promotedManifest = currentManifest\(\)/,
    "final staged import commit must retain post-promotion manifest validation",
  );
});
