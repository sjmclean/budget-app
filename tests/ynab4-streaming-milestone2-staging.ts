import assert from "node:assert/strict";
import type { ImportStage } from "../packages/ynab4-importer/src/source/importStaging";
import {
  cleanupAbandonedImportStage,
  KeyValueImportStage,
  listAbandonedImportStageIds,
  type StagedKeyValue,
} from "../apps/web/src/features/persistence/keyValueImportStage";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";
import type { KeyValueStorageMutation } from "../apps/web/src/features/persistence/keyValueStoragePort";

class MemoryStorage implements KeyValueStoragePort {
  readonly values = new Map<string, string>();
  batchCalls = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  listKeys() { return [...this.values.keys()]; }
  async flush() {}
  async applyMutations(mutations: readonly KeyValueStorageMutation[]) {
    this.batchCalls += 1;
    for (const mutation of mutations) {
      if (mutation.type === "set") this.values.set(mutation.key, mutation.value);
      else this.values.delete(mutation.key);
    }
  }
}

type CsvRow = { columns: readonly string[] };
type GenericContractIsUsable =
  ImportStage<CsvRow, { imported: number }> extends ImportStage<CsvRow, unknown>
    ? true
    : false;
const genericContractIsUsable: GenericContractIsUsable = true;
assert.equal(genericContractIsUsable, true);

const prefix = "budget-app.budgets.new-budget.";
const entries = (from: number, count: number): StagedKeyValue[] =>
  Array.from({ length: count }, (_, offset) => ({
    key: `${prefix}transaction.${from + offset}`,
    value: JSON.stringify({ id: from + offset }),
  }));

{
  const storage = new MemoryStorage();
  const stage = new KeyValueImportStage({ storage, id: "success", targetPrefix: prefix });
  await stage.begin();
  await stage.persistBatch(entries(0, 2));
  await stage.persistBatch(entries(2, 1));
  assert.deepEqual(stage.progress(), { state: "staging", batchesPersisted: 2, recordsPersisted: 3 });
  assert.equal([...storage.values.keys()].filter((key) => key.startsWith(prefix)).length, 0);
  assert.deepEqual(await stage.commit(), { id: "success", keysPromoted: 3, recordsPersisted: 3 });
  assert.equal([...storage.values.keys()].filter((key) => key.startsWith(prefix)).length, 3);
  assert.ok(storage.batchCalls <= 5, "persistence must use bounded batch transactions");
  assert.deepEqual(listAbandonedImportStageIds(storage), []);
}

{
  const storage = new MemoryStorage();
  const stage = new KeyValueImportStage({
    storage,
    id: "bounded-manifest",
    targetPrefix: prefix,
  });
  await stage.begin();
  await stage.persistBatch(entries(0, 1_000));
  const manifest = storage.getItem(
    "budget-app.import-stage.v1.bounded-manifest.manifest",
  );
  assert.ok(manifest);
  assert.ok(
    manifest.length < 500,
    "stage manifests must contain bounded counters, not every transaction key",
  );
  assert.equal(JSON.parse(manifest).stagedKeyCount, 1_000);
  await stage.commit();
  assert.ok(
    storage.batchCalls <= 4,
    "one thousand staged records must not become one thousand backend transactions",
  );
  assert.equal(
    storage.listKeys().some((key) =>
      key.startsWith("budget-app.import-stage.v1.bounded-manifest.")),
    false,
  );
}

{
  const storage = new MemoryStorage();
  storage.setItem(`${prefix}transaction.1`, "live");
  const stage = new KeyValueImportStage({ storage, id: "collision", targetPrefix: prefix });
  await stage.begin();
  await stage.persistBatch(entries(0, 3));
  await assert.rejects(stage.commit(), /Refusing to overwrite live import target/);
  assert.equal(storage.getItem(`${prefix}transaction.0`), null);
  assert.equal(storage.getItem(`${prefix}transaction.1`), "live");
  assert.equal(stage.progress().state, "rolled-back");
}

{
  const storage = new MemoryStorage();
  const sharedIndex = "budget-app.entity-replication.v1/budget-month-index";
  storage.setItem(sharedIndex, '["existing-budget:2026-06"]');
  storage.setItem(`${prefix}transaction.collision`, "live");
  const stage = new KeyValueImportStage({
    storage,
    id: "allowed-overwrite-rollback",
    targetPrefix: "budget-app.",
    allowOverwrite: (key) => key === sharedIndex,
  });
  await stage.begin();
  await stage.persistBatch([
    {
      key: sharedIndex,
      value: '["existing-budget:2026-06","new-budget:2026-07"]',
    },
    {
      key: `${prefix}transaction.collision`,
      value: "replacement",
    },
  ]);
  await assert.rejects(stage.commit(), /Refusing to overwrite live import target/);
  assert.equal(
    storage.getItem(sharedIndex),
    '["existing-budget:2026-06"]',
    "rollback must restore an explicitly overwritten shared index",
  );
  assert.equal(storage.getItem(`${prefix}transaction.collision`), "live");
}

{
  const storage = new MemoryStorage();
  const stage = new KeyValueImportStage({ storage, id: "cancel", targetPrefix: prefix });
  await stage.begin();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(stage.persistBatch(entries(0, 1), { signal: controller.signal }), { name: "AbortError" });
  await stage.rollback(controller.signal.reason);
  assert.deepEqual(listAbandonedImportStageIds(storage), ["cancel"]);
  await stage.cleanup();
  assert.deepEqual(listAbandonedImportStageIds(storage), []);
}

{
  const storage = new MemoryStorage();
  const stage = new KeyValueImportStage({ storage, id: "abandoned", targetPrefix: prefix });
  await stage.begin();
  await stage.persistBatch(entries(0, 1));
  assert.deepEqual(listAbandonedImportStageIds(storage), ["abandoned"]);
  assert.equal(await cleanupAbandonedImportStage(storage, "abandoned"), 2);
  assert.deepEqual(listAbandonedImportStageIds(storage), []);
}

console.log("Milestone 2 staged-persistence contract tests passed");
