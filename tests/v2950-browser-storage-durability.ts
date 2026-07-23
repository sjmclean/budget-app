import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSerializedWriteCoordinator } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

async function testWritesAreSerialized() {
  const coordinator = createSerializedWriteCoordinator();
  const events: string[] = [];
  let releaseFirstWrite: (() => void) | null = null;

  coordinator.queue(
    () =>
      new Promise<void>((resolve) => {
        events.push("first:start");
        releaseFirstWrite = () => {
          events.push("first:end");
          resolve();
        };
      }),
  );
  coordinator.queue(async () => {
    events.push("second:start");
    events.push("second:end");
  });

  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);
  assert.ok(releaseFirstWrite);
  releaseFirstWrite();
  await coordinator.flush();

  assert.deepEqual(events, [
    "first:start",
    "first:end",
    "second:start",
    "second:end",
  ]);
}

async function testFailureIsReportedAndQueueRecovers() {
  const coordinator = createSerializedWriteCoordinator();
  const events: string[] = [];

  coordinator.queue(async () => {
    events.push("failed");
    throw new Error("expected write failure");
  });
  coordinator.queue(async () => {
    events.push("recovered");
  });

  await assert.rejects(
    coordinator.flush(),
    /expected write failure/,
  );
  assert.deepEqual(events, ["failed", "recovered"]);

  coordinator.queue(async () => {
    events.push("later");
  });
  await coordinator.flush();
  assert.deepEqual(events, ["failed", "recovered", "later"]);
}

const storageSource = readFileSync(
  "apps/web/src/features/persistence/keyValueStoragePort.ts",
  "utf8",
);
const mainSource = readFileSync("apps/web/src/main.tsx", "utf8");

assert.match(
  storageSource,
  /await putIndexedDbValue\(key, value\);\s*window\.localStorage\.setItem\(key, LOCAL_STORAGE_POINTER_VALUE\)/,
  "the IndexedDB pointer must only be written after the durable write commits",
);
assert.match(
  storageSource,
  /removeDanglingIndexedDbPointers\(\)/,
  "hydration should remove pointers whose IndexedDB values are missing",
);
assert.match(
  storageSource,
  /window\.addEventListener\("pagehide", flushPendingWrites\)/,
  "browser storage should request a best-effort flush on pagehide",
);
assert.match(
  storageSource,
  /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/,
  "browser storage should request a best-effort flush when hidden",
);
assert.match(
  mainSource,
  /const persistenceProvider = getBudgetPersistenceProvider\(\)/,
  "application bootstrap should resolve the active persistence provider",
);

assert.match(
  mainSource,
  /await persistenceProvider\.initialize\?\.\(\)/,
  "application bootstrap should initialise the active persistence provider",
);

assert.match(
  mainSource,
  /installPersistenceProviderLifecycle\(persistenceProvider\)/,
  "application bootstrap should install provider lifecycle flushing",
);

await testWritesAreSerialized();
await testFailureIsReportedAndQueueRecovers();

console.log("v2.95.0 browser storage durability regression checks passed");
