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

function functionBody(name: string, nextName: string): string {
  const start = workerSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name}() must exist`);

  const end = workerSource.indexOf(`function ${nextName}(`, start);
  assert.notEqual(end, -1, `${name}() must have a detectable end`);

  return workerSource.slice(start, end);
}

test("import register batches are refused outside an active staged import", () => {
  const body = functionBody("importRegisterBatch", "importEntityBatch");

  assert.match(
    body,
    /assertActiveStagedImport\s*\(\s*\)/,
    "register import batches must require an active staged import",
  );
});

test("import entity batches are refused outside an active staged import", () => {
  const start = workerSource.indexOf("function importEntityBatch(");
  assert.notEqual(start, -1);

  const end = workerSource.indexOf(
    "async function removeOpfsFile(",
    start,
  );
  assert.notEqual(end, -1);

  const body = workerSource.slice(start, end);

  assert.match(
    body,
    /assertActiveStagedImport\s*\(\s*\)/,
    "entity import batches must require an active staged import",
  );
});

test("SAH staged import never reuses and deletes the active canonical filename", () => {
  const start = workerSource.indexOf("async function beginStagedImport(");
  assert.notEqual(start, -1);

  const end = workerSource.indexOf(
    "async function copyOpfsDatabase(",
    start,
  );
  assert.notEqual(end, -1);

  const body = workerSource.slice(start, end);

  assert.doesNotMatch(
    body,
    /persistentBackend === "opfs-sahpool"\s*\?\s*safeFilename\(request\.budgetId\)/,
    "SAH staging must not directly reuse the canonical budget filename",
  );

  assert.match(
    body,
    /createStagedImportFilename\s*\(\s*request\.budgetId\s*\)/,
    "all backends must use a dedicated staged import filename",
  );
});

test("begin staged import establishes recovery state before closing the previous database", () => {
  const start = workerSource.indexOf("async function beginStagedImport(");
  assert.notEqual(start, -1);

  const end = workerSource.indexOf(
    "async function copyOpfsDatabase(",
    start,
  );
  assert.notEqual(end, -1);

  const body = workerSource.slice(start, end);
  const recoveryState = body.indexOf("stagedImport = stage;");
  const previousClose = body.indexOf("database?.close();");

  assert.notEqual(
    recoveryState,
    -1,
    "begin must establish staged recovery state",
  );
  assert.notEqual(previousClose, -1, "begin must close the previous database");
  assert.ok(
    recoveryState < previousClose,
    "recovery state must exist before the previous database is closed",
  );

  assert.match(
    body,
    /catch\s*\([^)]*\)\s*\{[\s\S]*?restorePreviousDatabaseFromStage/,
    "a failed begin must restore the previously active database",
  );
});

test("failed staged promotion preserves and reopens the previous physical database", () => {
  const commitStart = workerSource.indexOf(
    "async function commitStagedImport(",
  );
  assert.notEqual(commitStart, -1);

  const commitEnd = workerSource.indexOf(
    "async function rollbackStagedImport(",
    commitStart,
  );
  assert.notEqual(commitEnd, -1);

  const commitBody = workerSource.slice(commitStart, commitEnd);

  assert.match(
    commitBody,
    /const\s+targetFilename\s*=\s*createPhysicalGenerationFilename\s*\(\s*stage\.budgetId\s*\)/,
    "staged promotion must write to a unique physical generation",
  );

  assert.doesNotMatch(
    commitBody,
    /backupFilename/,
    "copy-on-write promotion must not require a backup of the authoritative database",
  );

  assert.match(
    commitBody,
    /catch\s*\(error\)[\s\S]*?removeOpfsFile\s*\(\s*targetFilename\s*\)[\s\S]*?restorePreviousDatabaseFromStage\s*\(\s*stage\s*\)/,
    "failed promotion must discard only the candidate and reopen the untouched previous database",
  );
});
