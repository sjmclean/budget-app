import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return fs.readFileSync(
    new URL(`../../../${relativePath}`, import.meta.url),
    "utf8",
  );
}

const contracts = read(
  "apps/web/src/features/persistence/localFirst/contracts.ts",
);

const client = read(
  "apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
);

const localBudgetClient = read(
  "apps/web/src/features/persistence/localFirst/localBudgetClient.ts",
);

const worker = read(
  "apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
);

const relayStore = read(
  "apps/server/src/localFirstRelayStore.mjs",
);

test("local-first mutations can carry an optional logical operation group", () => {
  const start = contracts.indexOf(
    "export interface LocalBudgetMutation",
  );
  const end = contracts.indexOf(
    "\n}",
    start,
  );

  assert.ok(start >= 0 && end > start);

  const body = contracts.slice(start, end);

  assert.match(
    body,
    /readonly operationGroupId\?: string/,
    "mutations need an optional logical operation group identifier",
  );
});

test("the durable local outbox preserves operation group identifiers", () => {
  assert.match(
    worker,
    /operation_group_id TEXT/,
    "the outbox must persist operation groups across restart/offline sync",
  );

  assert.match(
    worker,
    /operation_group_id[\s\S]*mutation\.operationGroupId/,
    "insertOutbox must persist the mutation operation group",
  );

  assert.match(
    worker,
    /operation_group_id AS operationGroupId/,
    "readOutbox must restore the operation group",
  );

  assert.match(
    localBudgetClient,
    /readonly operationGroupId\?: string \| null/,
    "the worker client outbox shape must expose the persisted group",
  );
});

test("outbox upload restores the operation group onto relay mutations", () => {
  assert.match(
    client,
    /operationGroupId:\s*row\.operationGroupId\s*\?\?\s*undefined/,
    "draining the outbox must preserve a grouped operation",
  );
});

test("transaction mutation creation accepts an operation group", () => {
  const start = client.indexOf(
    "function mutation(",
  );
  const end = client.indexOf(
    "\n  function ",
    start + 1,
  );

  assert.ok(start >= 0 && end > start);

  const body = client.slice(start, end);

  assert.match(
    body,
    /operationGroupId\?: string/,
    "mutation() must accept an optional logical operation group",
  );

  assert.match(
    body,
    /operationGroupId/,
    "mutation() must copy the logical group into the mutation",
  );
});

test("paired transaction writes share one logical operation group", () => {
  assert.match(
    client,
    /function transactionWrites\(/,
    "paired transaction records need a grouping-aware write helper",
  );

  assert.match(
    client,
    /const operationGroupId = createRuntimeUuid\(\)/,
    "each paired transfer operation should receive one fresh group ID",
  );

  assert.match(
    client,
    /transactionWrite\(record,\s*operationGroupId,\s*operationGroup\)/,
    "both transfer legs must receive the same complete operation group",
  );
});

test("relay storage preserves the full grouped mutation JSON", () => {
  assert.match(
    relayStore,
    /JSON\.stringify\(mutation\)/,
    "relay storage must retain the complete mutation envelope",
  );

  assert.match(
    relayStore,
    /mutation:\s*JSON\.parse\(row\.payloadJson\)/,
    "relay pull must restore the complete mutation envelope",
  );
});

test("the durable outbox preserves the complete logical operation snapshot", () => {
  assert.match(
    worker,
    /operation_group_json TEXT/,
    "the outbox must persist the complete grouped operation",
  );

  assert.match(
    worker,
    /operation_group_json[\s\S]*JSON\.stringify\(mutation\.operationGroup\)/,
    "insertOutbox must serialize the complete grouped operation",
  );

  assert.match(
    worker,
    /operation_group_json AS operationGroupJson/,
    "readOutbox must restore the grouped operation snapshot",
  );

  assert.match(
    localBudgetClient,
    /readonly operationGroupJson\?: string \| null/,
    "the worker client outbox shape must expose the grouped operation snapshot",
  );

  assert.match(
    client,
    /operationGroup:\s*row\.operationGroupJson[\s\S]*JSON\.parse\(row\.operationGroupJson\)/,
    "outbox upload must reconstruct the complete grouped operation",
  );
});
