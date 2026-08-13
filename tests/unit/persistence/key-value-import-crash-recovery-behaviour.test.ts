import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupAbandonedImportStage,
} from "../../../apps/web/src/features/persistence/keyValueImportStage";
import type {
  KeyValueStorageMutation,
  KeyValueStoragePort,
} from "../../../apps/web/src/features/persistence/keyValueStoragePort";

class MemoryStorage implements KeyValueStoragePort {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  listKeys(): string[] {
    return [...this.values.keys()];
  }

  async flush(): Promise<void> {}

  async applyMutations(
    mutations: readonly KeyValueStorageMutation[],
  ): Promise<void> {
    for (const mutation of mutations) {
      if (mutation.type === "set") {
        this.setItem(mutation.key, mutation.value);
      } else {
        this.removeItem(mutation.key);
      }
    }
  }
}

const id = "crash-test";
const prefix = `budget-app.import-stage.v1.${id}.`;
const manifestKey = `${prefix}manifest`;

test("abandoned committing stage restores overwritten and newly-created live keys", async () => {
  const storage = new MemoryStorage();

  const overwrittenKey = "budget-app.test.overwritten";
  const createdKey = "budget-app.test.created";

  storage.setItem(overwrittenKey, "new-value");
  storage.setItem(createdKey, "created-value");

  storage.setItem(
    manifestKey,
    JSON.stringify({
      version: 3,
      id,
      state: "committing",
      targetPrefix: "budget-app.",
      stagedKeyCount: 1,
      promotedKeyCount: 2,
      promotedKeys: [overwrittenKey, createdKey],
      overwrittenValues: {
        [overwrittenKey]: "old-value",
      },
      batchesPersisted: 1,
      recordsPersisted: 2,
    }),
  );

  storage.setItem(
    `${prefix}data.${encodeURIComponent("budget-app.test.not-yet-promoted")}`,
    "staged-value",
  );

  const removed = await cleanupAbandonedImportStage(storage, id);

  assert.equal(storage.getItem(overwrittenKey), "old-value");
  assert.equal(storage.getItem(createdKey), null);
  assert.equal(storage.getItem(manifestKey), null);

  assert.equal(
    storage.getItem(
      `${prefix}data.${encodeURIComponent("budget-app.test.not-yet-promoted")}`,
    ),
    null,
  );

  assert.ok(removed >= 2);
});

test("abandoned ordinary staging cleans isolated stage data without touching live keys", async () => {
  const storage = new MemoryStorage();

  const liveKey = "budget-app.test.live";
  storage.setItem(liveKey, "keep-me");

  storage.setItem(
    manifestKey,
    JSON.stringify({
      version: 3,
      id,
      state: "staging",
      targetPrefix: "budget-app.",
      stagedKeyCount: 1,
      promotedKeyCount: 0,
      promotedKeys: [],
      overwrittenValues: {},
      batchesPersisted: 1,
      recordsPersisted: 1,
    }),
  );

  storage.setItem(
    `${prefix}data.${encodeURIComponent(liveKey)}`,
    "staged-value",
  );

  await cleanupAbandonedImportStage(storage, id);

  assert.equal(storage.getItem(liveKey), "keep-me");
  assert.equal(storage.getItem(manifestKey), null);
});

test("abandoned recovery refuses promoted keys outside the declared target namespace", async () => {
  const storage = new MemoryStorage();

  storage.setItem(
    manifestKey,
    JSON.stringify({
      version: 3,
      id,
      state: "committing",
      targetPrefix: "budget-app.",
      stagedKeyCount: 0,
      promotedKeyCount: 1,
      promotedKeys: ["outside.namespace.key"],
      overwrittenValues: {},
      batchesPersisted: 1,
      recordsPersisted: 1,
    }),
  );

  await assert.rejects(
    cleanupAbandonedImportStage(storage, id),
    /outside target namespace/,
  );

  assert.notEqual(
    storage.getItem(manifestKey),
    null,
    "failed recovery must retain its manifest for later inspection/retry",
  );
});
