import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSharedServerKeyValueStorage } from "../apps/web/src/features/persistence/sharedServerKeyValueStorage.js";
import {
  createSharedServerStorageClient,
  type SharedServerEventSource,
} from "../apps/web/src/features/persistence/sharedServerStorageClient.js";

let serverRevision = 30;
let serverEntries: Record<string, string> = {
  "budget-app.example": "initial",
};
let snapshotLoads = 0;
let healthChecks = 0;
let eventSourceUrl = "";

class FakeEventSource implements SharedServerEventSource {
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  private revisionListener: (event: { data: string }) => void = () => undefined;

  addEventListener(
    type: "revision",
    listener: (event: { data: string }) => void,
  ) {
    assert.equal(type, "revision");
    this.revisionListener = listener;
  }

  emitRevision(revision: number) {
    this.revisionListener({ data: JSON.stringify({ revision }) });
  }

  close() {
    this.closed = true;
  }
}

const fakeEventSource = new FakeEventSource();

const client = createSharedServerStorageClient({
  baseUrl: "http://budget.test/",
  eventSourceFactory(url) {
    eventSourceUrl = url;
    return fakeEventSource;
  },
  fetch: async (input) => {
    const url = String(input);
    if (url.endsWith("/api/shared-budget/storage")) {
      snapshotLoads += 1;
      return Response.json({
        revision: serverRevision,
        entries: { ...serverEntries },
      });
    }

    if (url.endsWith("/api/health")) {
      healthChecks += 1;
      return Response.json({
        status: "ok",
        storage: "sqlite",
        revision: serverRevision,
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  },
});

const storage = createSharedServerKeyValueStorage({
  client,
  pollIntervalMs: 5,
});
await storage.initialize();
assert.equal(snapshotLoads, 1);

let notifications = 0;
const stopWatching = storage.watch(() => {
  notifications += 1;
});

assert.equal(
  eventSourceUrl,
  "http://budget.test/api/shared-budget/events",
  "watching should open the server-sent events endpoint",
);
fakeEventSource.emitRevision(serverRevision);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(snapshotLoads, 1, "the initial current-revision event should not reload");
assert.equal(notifications, 0);

serverRevision += 1;
serverEntries["budget-app.example"] = "updated by another device";
fakeEventSource.emitRevision(serverRevision);

for (let attempt = 0; attempt < 20 && notifications === 0; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1));
}

assert.equal(notifications, 1, "a newer revision event should notify watchers");
assert.equal(snapshotLoads, 2, "a newer revision event should load one snapshot");
assert.equal(
  storage.getItem("budget-app.example"),
  "updated by another device",
);
assert.equal(
  healthChecks,
  0,
  "SSE should avoid health polling while the live connection is available",
);

stopWatching();
assert.equal(fakeEventSource.closed, true, "stopping the watch should close EventSource");

const serverSource = readFileSync("apps/server/src/server.mjs", "utf8");
assert.match(serverSource, /\/api\/shared-budget\/events/);
assert.match(serverSource, /text\/event-stream/);
assert.match(serverSource, /event: revision/);
assert.match(serverSource, /broadcastRevision\(revision\)/);
assert.match(serverSource, /X-Accel-Buffering/);
assert.match(serverSource, /keep-alive/);

const storageSource = readFileSync(
  "apps/web/src/features/persistence/sharedServerKeyValueStorage.ts",
  "utf8",
);
assert.match(storageSource, /client\.subscribeToRevisions/);
assert.match(storageSource, /falling back to polling/);

console.log("v1.55 shared budget server-sent events validation passed");
