import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSharedServerKeyValueStorage } from "../apps/web/src/features/persistence/sharedServerKeyValueStorage.js";
import {
  createSharedServerStorageClient,
  SharedServerStorageConflictError,
  type SharedServerStorageClient,
  type SharedServerStorageOperation,
} from "../apps/web/src/features/persistence/sharedServerStorageClient.js";

const conflictResponse = new Response(
  JSON.stringify({
    code: "REVISION_CONFLICT",
    message: "Shared budget changed on another device.",
    expectedRevision: 7,
    actualRevision: 8,
  }),
  {
    status: 409,
    headers: { "Content-Type": "application/json" },
  },
);

let capturedRequestBody: unknown = null;
const httpClient = createSharedServerStorageClient({
  fetch: async (_input, init) => {
    capturedRequestBody = JSON.parse(String(init?.body)) as unknown;
    return conflictResponse;
  },
});

await assert.rejects(
  () => httpClient.applyOperations(
    [{ type: "set", key: "budget-app.example", value: "new" }],
    7,
  ),
  (error: unknown) => {
    assert.ok(error instanceof SharedServerStorageConflictError);
    assert.equal(error.status, 409);
    assert.equal(error.expectedRevision, 7);
    assert.equal(error.actualRevision, 8);
    return true;
  },
);

assert.deepEqual(capturedRequestBody, {
  operations: [{ type: "set", key: "budget-app.example", value: "new" }],
  expectedRevision: 7,
});

let serverRevision = 20;
let serverEntries: Record<string, string> = {
  "budget-app.example": "initial",
};

function createInMemoryClient(): SharedServerStorageClient {
  return {
    async loadSnapshot() {
      return {
        revision: serverRevision,
        entries: { ...serverEntries },
      };
    },

    async applyOperations(
      operations: readonly SharedServerStorageOperation[],
      expectedRevision: number,
    ) {
      if (expectedRevision !== serverRevision) {
        throw new SharedServerStorageConflictError(
          "Shared budget changed on another device.",
          expectedRevision,
          serverRevision,
          {
            code: "REVISION_CONFLICT",
            expectedRevision,
            actualRevision: serverRevision,
          },
        );
      }

      for (const operation of operations) {
        if (operation.type === "set") {
          serverEntries[operation.key] = operation.value;
        } else {
          delete serverEntries[operation.key];
        }
      }

      serverRevision += 1;
      return { revision: serverRevision };
    },

    async bootstrap(entries) {
      serverEntries = { ...entries };
      serverRevision += 1;
      return {
        revision: serverRevision,
        importedKeys: Object.keys(entries).length,
      };
    },

    async getHealth() {
      return { status: "ok", storage: "sqlite", revision: serverRevision };
    },
  };
}

const firstDevice = createSharedServerKeyValueStorage({
  client: createInMemoryClient(),
});
const secondDevice = createSharedServerKeyValueStorage({
  client: createInMemoryClient(),
});

await firstDevice.initialize();
await secondDevice.initialize();
assert.equal(firstDevice.getRevision(), 20);
assert.equal(secondDevice.getRevision(), 20);

firstDevice.setItem("budget-app.example", "first device wins");
await firstDevice.flush();
assert.equal(serverRevision, 21);
assert.equal(serverEntries["budget-app.example"], "first device wins");

let secondDeviceNotifications = 0;
const stopWatching = secondDevice.watch(() => {
  secondDeviceNotifications += 1;
});

secondDevice.setItem("budget-app.example", "stale second-device write");
await assert.rejects(
  () => secondDevice.flush(),
  (error: unknown) => {
    assert.ok(error instanceof SharedServerStorageConflictError);
    assert.equal(error.expectedRevision, 20);
    assert.equal(error.actualRevision, 21);
    return true;
  },
);

assert.equal(
  serverEntries["budget-app.example"],
  "first device wins",
  "the stale write must not overwrite the winning server value",
);
assert.equal(
  secondDevice.getItem("budget-app.example"),
  "first device wins",
  "the losing device must replace its mirror with the latest snapshot",
);
assert.equal(secondDevice.getRevision(), 21);
assert.ok(
  secondDeviceNotifications >= 1,
  "a conflict refresh must notify the provider lifecycle",
);

secondDevice.setItem("budget-app.example", "second device after refresh");
await secondDevice.flush();
stopWatching();

assert.equal(serverRevision, 22);
assert.equal(serverEntries["budget-app.example"], "second device after refresh");

const serverSource = readFileSync("apps/server/src/server.mjs", "utf8");
assert.match(serverSource, /class RevisionConflictError extends Error/);
assert.match(serverSource, /body\.expectedRevision/);
assert.match(serverSource, /response, 409/);
assert.match(serverSource, /code: "REVISION_CONFLICT"/);

console.log("v1.54 shared budget optimistic concurrency validation passed");
