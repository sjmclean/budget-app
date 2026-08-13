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

test("failed staged promotion restores an existing canonical database from backup", () => {
  const start = workerSource.indexOf("async function commitStagedImport(");
  assert.notEqual(start, -1);

  const end = workerSource.indexOf(
    "async function rollbackStagedImport(",
    start,
  );
  assert.notEqual(end, -1);

  const body = workerSource.slice(start, end);

  assert.match(
    body,
    /backupFilename/,
    "existing-budget promotion must retain a canonical backup",
  );

  assert.match(
    body,
    /copyOpfsDatabase\s*\(\s*targetFilename,\s*backupFilename\s*\)[\s\S]*?copyOpfsDatabase\s*\(\s*stage\.filename,\s*targetFilename\s*\)/,
    "the valid canonical database must be backed up before it is overwritten",
  );

  assert.match(
    body,
    /catch\s*\([^)]*\)\s*\{[\s\S]*?copyOpfsDatabase\s*\(\s*backupFilename,\s*targetFilename\s*\)/,
    "a failed promotion must restore the canonical database from its backup",
  );
});
