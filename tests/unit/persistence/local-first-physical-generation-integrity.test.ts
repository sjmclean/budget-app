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
    /await[\s\S]*commitBaselineReplacement[\s\S]*await\s+publishDatabaseFilePointer/,
    "baseline file pointer may only change after worker commit succeeds",
  );

  const stagedMethod = functionBody(
    clientSource,
    "commitStagedImport",
    "rollbackStagedImport",
  );

  assert.match(
    stagedMethod,
    /await[\s\S]*commitStagedImport[\s\S]*await\s+publishDatabaseFilePointer/,
    "staged-import file pointer may only change after worker commit succeeds",
  );

  const publicationHelper = functionBody(
    clientSource,
    "async function publishDatabaseFilePointer",
    "async function restoreDatabaseFilePointer",
  );

  assert.match(
    publicationHelper,
    /storage\.setItem[\s\S]*await\s+storage\.flush\?\.\(\)/,
    "pointer publication must await durable storage flush after updating the pointer",
  );
});

test("superseded physical generations are retired only after durable pointer publication", () => {
  for (const [methodName, nextMethodName] of [
    ["commitBaselineReplacement", "abortBaselineReplacement"],
    ["commitStagedImport", "rollbackStagedImport"],
  ] as const) {
    const body = functionBody(clientSource, methodName, nextMethodName);

    const publication = body.indexOf("await publishDatabaseFilePointer");
    const retirement = body.lastIndexOf('type: "retirePhysicalDatabaseFile"');

    assert.notEqual(
      publication,
      -1,
      `${methodName} must publish a durable physical-file pointer`,
    );
    assert.notEqual(
      retirement,
      -1,
      `${methodName} must retire a superseded physical generation`,
    );
    assert.ok(
      retirement > publication,
      `${methodName} may retire the old physical generation only after pointer publication`,
    );
  }
});

test("the worker retirement contract refuses to unlink an open active generation", () => {
  assert.match(
    contractsSource,
    /type:\s*"retirePhysicalDatabaseFile"[\s\S]*?budgetId:\s*string[\s\S]*?physicalFilename:\s*string/,
    "physical generation retirement must be an explicit worker contract",
  );

  assert.match(
    workerSource,
    /request\.physicalFilename\s*===\s*activeFilename\s*&&[\s\S]*?database[\s\S]*?ACTIVE_PHYSICAL_DATABASE_FILE/,
    "an open active generation must never be retired",
  );
});

test("SAH-backed generation creation reserves transient file capacity", () => {
  assert.match(
    workerSource,
    /SAH_TRANSIENT_SPARE_CAPACITY\s*=\s*4/,
    "the SAH pool must retain explicit transient headroom for database sidecars",
  );

  const capacityHelper = functionBody(
    workerSource,
    "async function reservePersistentDatabaseCapacity",
    "function openPersistentDatabase",
  );

  assert.match(
    capacityHelper,
    /reserveMinimumCapacity/,
    "SAH capacity management must use reserveMinimumCapacity",
  );
  assert.match(
    capacityHelper,
    /getFileCount\(\)/,
    "SAH capacity must be based on currently allocated files",
  );
  assert.match(
    capacityHelper,
    /SAH_TRANSIENT_SPARE_CAPACITY/,
    "SAH capacity must include transient database sidecar headroom",
  );

  const stagedBeginBody = functionBody(
    workerSource,
    "async function beginStagedImport",
    "async function copyOpfsDatabase",
  );

  assert.match(
    stagedBeginBody,
    /ensurePersistentSqlite\(\)[\s\S]*?reservePersistentDatabaseCapacity\(\)/,
    "staged database creation must reserve SAH capacity before opening a new SQLite file",
  );

  const stagedCommitBody = functionBody(
    workerSource,
    "async function commitStagedImport",
    "async function rollbackStagedImport",
  );

  assert.match(
    stagedCommitBody,
    /reservePersistentDatabaseCapacity\(\)[\s\S]*?copyOpfsDatabase/,
    "staged promotion must reserve capacity before creating its physical generation",
  );

  const baselineCommitBody = functionBody(
    workerSource,
    "async function commitBaselineReplacement",
    "async function abortBaselineReplacement",
  );

  assert.match(
    baselineCommitBody,
    /reservePersistentDatabaseCapacity\(\)[\s\S]*?importPersistentDatabase/,
    "baseline promotion must reserve capacity before creating its physical generation",
  );
});
