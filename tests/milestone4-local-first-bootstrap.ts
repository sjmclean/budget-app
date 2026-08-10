import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  decideBootstrap,
  type RelayBootstrap,
  type RelayBaselineManifest,
} from "../apps/web/src/features/persistence/localFirst/relayTransport";
import { emptyDomainCounts } from "../apps/web/src/features/persistence/localFirst/contracts";

const manifest: RelayBaselineManifest = {
  budgetId: "budget",
  syncEpoch: "epoch-2",
  schemaVersion: 1,
  counts: emptyDomainCounts(),
  chunkCount: 2,
  totalBytes: 10,
  contentHash: `sha256:${"a".repeat(64)}`,
  baseCursor: 0,
  previousBaselineId: null,
};
const remote: RelayBootstrap = {
  protocolVersion: 2,
  budgetId: "budget",
  syncEpoch: "epoch-2",
  schemaVersion: 1,
  latestCursor: 7,
  baseline: {
    baselineId: "baseline",
    manifest,
    committedAt: new Date().toISOString(),
  },
};

assert.equal(
  decideBootstrap({
    remote,
    localSyncEpoch: null,
    localBaselineHash: null,
    pulledCursor: 0,
  }).type,
  "download-baseline",
);
assert.deepEqual(
  decideBootstrap({
    remote,
    localSyncEpoch: "epoch-1",
    localBaselineHash: manifest.contentHash,
    pulledCursor: 7,
  }),
  {
    type: "rebuild",
    previousSyncEpoch: "epoch-1",
    syncEpoch: "epoch-2",
    baselineId: "baseline",
    manifest,
  },
);
assert.deepEqual(
  decideBootstrap({
    remote,
    localSyncEpoch: "epoch-2",
    localBaselineHash: manifest.contentHash,
    pulledCursor: 5,
  }),
  { type: "continue", syncEpoch: "epoch-2", afterCursor: 5 },
);
assert.equal(
  decideBootstrap({
    remote: { ...remote, baseline: null },
    localSyncEpoch: null,
    localBaselineHash: null,
    pulledCursor: 0,
  }).type,
  "await-baseline",
);

const server = await readFile(
  new URL("../apps/server/src/server.mjs", import.meta.url),
  "utf8",
);
assert.match(server, /authStore\.requireBudgetRole\([\s\S]*localFirstBudgetId/);
assert.match(server, /\/api\/local-first\/bootstrap/);
assert.match(server, /\/api\/local-first\/epoch\/reset/);
assert.match(server, /LOCAL_FIRST_MAX_CHUNK_BYTES/);

console.log(
  "Milestone 4 local-first bootstrap passed: new-device download, stale-device rebuild, current-device continuation, and authenticated routes.",
);
