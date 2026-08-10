import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const engine = await readFile(
  "apps/web/src/features/persistence/replicationEngine.ts",
  "utf8",
);
const service = await readFile(
  "apps/web/src/features/persistence/replicationService.ts",
  "utf8",
);
const trace = await readFile(
  "apps/web/src/features/persistence/replicationTrace.ts",
  "utf8",
);
const importer = await readFile(
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
  "utf8",
);

assert.match(importer, /replaceAccountEntities\(createFixedBudgetScopedStorage\(storage, plan\.budgetId\), plan\.accounts\)/);
assert.doesNotMatch(importer, /writeScopedJson\(storage, plan\.budgetId, YNAB4_ACCOUNTS_STORAGE_KEY/);
assert.match(engine, /type: "journal\.operations-read"/);
assert.match(engine, /type: "push\.batch-started"/);
assert.match(engine, /acceptedCount: pushResult\.acceptedCount/);
assert.match(engine, /type: "pull\.batch-finished"/);
assert.match(engine, /type: "pull\.operations-applied"/);
assert.match(engine, /type: "replication\.finished"/);
assert.match(engine, /key: operation\.mutation\.key/);
assert.doesNotMatch(engine, /value: operation\.mutation\.value/);
assert.match(service, /onTrace: recordReplicationTraceEvent/);
assert.match(trace, /MAX_TRACE_EVENTS = 500/);
assert.match(trace, /serialiseReplicationTraceEvents/);

console.log("v490 replication pipeline trace validation passed.");
