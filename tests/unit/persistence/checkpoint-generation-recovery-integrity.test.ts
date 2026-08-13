import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const engineSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/replicationEngine.ts",
    import.meta.url,
  ),
  "utf8",
);

const storageSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localDatabaseKeyValueStorage.ts",
    import.meta.url,
  ),
  "utf8",
);

test("generation-change checkpoint recovery captures only unpushed local journal intent", () => {
  const generationChangeStart = engineSource.indexOf(
    "if (state.generationId && state.generationId !== remote.generationId)",
  );
  assert.notEqual(
    generationChangeStart,
    -1,
    "generation-change recovery branch must exist",
  );

  const branchEnd = engineSource.indexOf(
    "const localConflictAfterSequence",
    generationChangeStart,
  );
  assert.notEqual(branchEnd, -1, "generation-change branch must have an end");

  const body = engineSource.slice(generationChangeStart, branchEnd);

  assert.match(
    body,
    /readPendingJournalOperations\s*\([\s\S]*?state\.pushedLocalSequence/,
    "generation recovery must capture only journal operations newer than the old pushed cursor",
  );

  assert.match(
    body,
    /restoreCheckpoint\s*\(\s*checkpoint,\s*pendingLocalOperations,\s*options\.budgetId,?\s*\)/,
    "captured local journal operations must be supplied to checkpoint restore",
  );

  assert.doesNotMatch(
    body,
    /restoreCheckpoint\s*\(\s*checkpoint,\s*\[\],\s*options\.budgetId\s*\)/,
    "generation recovery must not destructively restore an empty local suffix",
  );
});

test("checkpoint restore retains later operations in the journal atomically", () => {
  const start = storageSource.indexOf("function restoreDatabaseFromCheckpoint(");
  assert.notEqual(start, -1, "restoreDatabaseFromCheckpoint() must exist");

  const end = storageSource.indexOf(
    "\nfunction checkpointMetadataKey(",
    start,
  );
  assert.notEqual(end, -1, "checkpoint restore helper must have an end");

  const body = storageSource.slice(start, end);

  assert.match(
    body,
    /laterOperations:\s*readonly OperationJournalEntry\[\]/,
    "checkpoint restore transaction must receive the operations that survive restore",
  );

  assert.match(
    body,
    /for\s*\(\s*const entry of laterOperations\s*\)[\s\S]*?journal\.put\(entry\)/,
    "surviving local operations must be restored to the journal in the checkpoint transaction",
  );

  assert.match(
    body,
    /if\s*\(\s*!cursor\s*\)\s*\{[\s\S]*?for\s*\(\s*const entry of laterOperations\s*\)[\s\S]*?journal\.put\(entry\)/,
    "scoped restore must reinsert surviving operations only after scoped journal deletion reaches the end",
  );
});
