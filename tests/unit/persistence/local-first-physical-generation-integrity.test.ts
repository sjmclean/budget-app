import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workerSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

const clientSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.ts",
    import.meta.url,
  ),
  "utf8",
);

const contractsSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/contracts.ts",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(
  source: string,
  name: string,
  nextName: string,
): string {
  const start = source.indexOf(`${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);

  const end = source.indexOf(`${nextName}(`, start);
  assert.notEqual(end, -1, `${name} must have a detectable end`);

  return source.slice(start, end);
}

test("worker open accepts an explicitly selected physical database file", () => {
  assert.match(
    contractsSource,
    /type:\s*"open"[\s\S]*?physicalFilename\?:\s*string/,
    "open requests must be able to select the durable active physical file",
  );

  const openBody = functionBody(
    workerSource,
    "async function openBudget",
    "async function prepareBaselineExport",
  );

  assert.match(
    openBody,
    /request\.physicalFilename\s*\?\?\s*safeFilename\(request\.budgetId\)/,
    "legacy canonical filenames may only be the fallback when no pointer exists",
  );
});

test("replacement commits promote to unique physical files instead of overwriting the active file", () => {
  const baselineBody = functionBody(
    workerSource,
    "async function commitBaselineReplacement",
    "async function abortBaselineReplacement",
  );

  assert.doesNotMatch(
    baselineBody,
    /activeFilename\s*=\s*safeFilename\(current\.budgetId\)/,
    "baseline replacement must not overwrite the legacy canonical filename",
  );

  assert.match(
    baselineBody,
    /createPhysicalGenerationFilename\s*\(\s*current\.budgetId\s*\)/,
    "baseline replacement must publish through a unique physical generation",
  );

  const stagedBody = functionBody(
    workerSource,
    "async function commitStagedImport",
    "async function rollbackStagedImport",
  );

  assert.match(
    stagedBody,
    /const\s+targetFilename\s*=\s*createPhysicalGenerationFilename\s*\(\s*stage\.budgetId\s*\)/,
    "staged import promotion must select a unique physical generation",
  );

  assert.match(
    stagedBody,
    /copyOpfsDatabase\s*\(\s*stage\.filename\s*,\s*targetFilename\s*\)/,
    "staged import may copy into its unique physical candidate",
  );

  assert.doesNotMatch(
    stagedBody,
    /targetFilename\s*=\s*safeFilename\s*\(\s*stage\.budgetId\s*\)/,
    "staged import must never target the legacy authoritative filename",
  );
});

test("successful promotion returns the physical file identity", () => {
  assert.match(
    contractsSource,
    /physicalFilename:\s*string/,
    "a promoted manifest must identify the complete physical SQLite generation",
  );

  assert.match(
    workerSource,
    /physicalFilename:\s*activeFilename/,
    "worker manifests must return the selected physical generation",
  );
});

test("database client durably publishes the returned physical generation", () => {
  assert.match(
    clientSource,
    /LOCAL_DATABASE_FILE_KEY_PREFIX/,
    "the client needs a durable per-budget active-file pointer",
  );

  assert.match(
    clientSource,
    /storage\.setItem\s*\([\s\S]*?physicalFilename/,
    "the complete replacement must be published by updating the durable pointer",
  );

  assert.match(
    clientSource,
    /storage\.getItem\s*\(\s*databaseFilePointerKey\s*\(\s*input\.budgetId\s*\)\s*\)/,
    "open must recover the previously published physical generation",
  );

  assert.match(
    clientSource,
    /function\s+databaseFilePointerKey[\s\S]*?LOCAL_DATABASE_FILE_KEY_PREFIX/,
    "the pointer helper must use the durable per-budget database-file prefix",
  );
});

test("physical pointer publication happens only after worker promotion completes", () => {
  const baselineMethod = functionBody(
    clientSource,
    "commitBaselineReplacement",
    "abortBaselineReplacement",
  );

  assert.match(
    baselineMethod,
    /await[\s\S]*commitBaselineReplacement[\s\S]*storage\.setItem/,
    "baseline file pointer may only change after worker commit succeeds",
  );

  const stagedMethod = functionBody(
    clientSource,
    "commitStagedImport",
    "rollbackStagedImport",
  );

  assert.match(
    stagedMethod,
    /await[\s\S]*commitStagedImport[\s\S]*storage\.setItem/,
    "staged-import file pointer may only change after worker commit succeeds",
  );
});
