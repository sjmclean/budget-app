import assert from "node:assert/strict";
import test from "node:test";
import { createRestorePointCoordinator } from "../../../apps/web/src/features/budget/restorePointCoordinator";
import { retainRestorePoints, RESTORE_POINT_INTERVAL_MS as INTERVAL } from "../../../apps/web/src/features/budget/restorePointRetention";
import { createRestorePointStore, type RestorePointFiles } from "../../../apps/web/src/features/budget/restorePointStore";
import type { RestorePointMetadata, RestorePointReason } from "../../../apps/web/src/features/budget/restorePointTypes";
import { emptyDomainCounts } from "../../../apps/web/src/features/persistence/localFirst/contracts";

const NOW = Date.parse("2026-09-03T12:05:00Z");
function point(id: string, age: number, reason: RestorePointReason = "timed"): RestorePointMetadata {
  return {
    schema: "sqlite-restore-point.v1", id, budgetId: "budget-A", budgetName: "A",
    createdAt: new Date(NOW - age).toISOString(), reason, syncEpoch: "epoch-A",
    localRevision: 1, mutationCount: 1, totalBytes: 512,
    contentHash: `sha256:${"a".repeat(64)}`, counts: emptyDomainCounts(),
  };
}

test("successful mutations coalesce, isolate budgets, and create only one overdue point", async () => {
  let now = NOW;
  const coordinator = createRestorePointCoordinator(() => now);
  const captured: string[] = [];
  const capture = async (id: string, count: number) => {
    captured.push(`${id}:${count}`);
    return point("captured", 0);
  };
  await coordinator.reevaluate("budget-A", capture);
  assert.deepEqual(captured, []);
  for (let index = 0; index < 50; index++) coordinator.mutation("budget-A");
  coordinator.mutation("budget-B");
  now += INTERVAL - 1;
  await coordinator.reevaluate("budget-A", capture);
  assert.deepEqual(captured, []);
  now += 1;
  await coordinator.reevaluate("budget-A", capture);
  assert.deepEqual(captured, ["budget-A:50"]);
  now += 40 * 60_000;
  await coordinator.reevaluate("budget-A", capture);
  assert.equal(captured.length, 1);
  await coordinator.reevaluate("budget-B", capture);
  await coordinator.reevaluate("budget-B", capture);
  assert.deepEqual(captured, ["budget-A:50", "budget-B:1"]);
});

test("failed and concurrent captures retain dirtiness without duplicating the pending request", async () => {
  let now = NOW;
  const coordinator = createRestorePointCoordinator(() => now);
  coordinator.mutation("A");
  now += INTERVAL;
  await assert.rejects(coordinator.reevaluate("A", async () => { throw new Error("quota"); }));
  assert.equal(coordinator.count("A"), 1);
  let complete!: (value: RestorePointMetadata) => void;
  let calls = 0;
  const capture = () => {
    calls++;
    return new Promise<RestorePointMetadata>((resolve) => { complete = resolve; });
  };
  const first = coordinator.reevaluate("A", capture);
  const second = coordinator.reevaluate("A", capture);
  coordinator.mutation("A");
  complete(point("p", 0));
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(coordinator.count("A"), 1);
});

test("an admitted capture clears through its actual mutation version without clearing later queued writes", async () => {
  let now = NOW;
  const coordinator = createRestorePointCoordinator(() => now);
  coordinator.mutation("A");
  now += INTERVAL;
  await coordinator.reevaluate("A", async () => {
    // This mutation was admitted ahead of capture, after the heartbeat fired.
    coordinator.mutation("A");
    const capturedVersion = coordinator.version("A");
    coordinator.checkpoint("A", capturedVersion);
    coordinator.mutation("A");
    return point("captured", 0);
  });
  assert.equal(coordinator.count("A"), 1);
});

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
test("all 36 recent ten-minute buckets survive and equal buckets are isolated by budget", () => {
  const points = Array.from({ length: 36 }, (_, index) => point(`p-${index}`, index * INTERVAL));
  assert.equal(retainRestorePoints(points, NOW).retained.length, 36);
  const anotherBudget = { ...points[0], id: "other", budgetId: "budget-B" };
  assert.equal(retainRestorePoints([...points, anotherBudget], NOW).retained.length, 37);
});
for (const [tier, age, spacing] of [
  ["ten-minute", HOUR, INTERVAL], ["hourly", 8 * HOUR, HOUR],
  ["daily", 3 * DAY, DAY], ["weekly", 15 * DAY, 7 * DAY],
  ["monthly", 70 * DAY, 31 * DAY],
] as const) {
  test(`${tier} retention thins timed points and protects semantic boundaries`, () => {
    const newest = point("new", age);
    const duplicate = point("duplicate", age + 1_000);
    const previous = point("previous", age + spacing);
    const semantic = point("safety", age + 1_000, "before-restore");
    const manual = point("manual", age + 1_000, "manual");
    const result = retainRestorePoints([previous, duplicate, semantic, manual, newest], NOW);
    assert.deepEqual(result.pruned.map(({ id }) => id), ["duplicate"]);
    assert.equal(result.retained.length, 4);
  });
}

function memoryFiles() {
  const entries = new Map<string, File>();
  const operations: string[] = [];
  let failWrite: string | null = null;
  let failRemove = false;
  const files: RestorePointFiles = {
    async names() { return [...entries.keys()]; },
    async read(name) {
      const value = entries.get(name);
      if (!value) throw new Error("missing");
      return value;
    },
    async write(name, chunks) {
      const parts: Uint8Array<ArrayBuffer>[] = [];
      for await (const chunk of chunks) parts.push(Uint8Array.from(chunk));
      if (failWrite === "empty-manifest" && name.endsWith(".json")) {
        entries.set(name, new File([], name));
        throw new Error("metadata close failed");
      }
      if (failWrite && name.endsWith(failWrite)) throw new Error("quota");
      entries.set(name, new File(parts, name));
      operations.push(`write:${name}`);
    },
    async remove(name) {
      if (failRemove) throw new Error("cleanup denied");
      operations.push(`remove:${name}`);
      entries.delete(name);
    },
  };
  return { files, entries, operations,
    failWrite: (suffix: string) => { failWrite = suffix; },
    failRemove: () => { failRemove = true; },
  };
}

function sqliteBytes() {
  const bytes = new Uint8Array(512);
  bytes.set(new TextEncoder().encode("SQLite format 3\0"));
  bytes[16] = 2;
  return bytes;
}

test("payload completion and verification precede metadata; pruning removes metadata before payload", async () => {
  const memory = memoryFiles();
  const store = createRestorePointStore(memory.files);
  const bytes = sqliteBytes();
  const old = await store.capture({ ...point("ignored", 1000), localRevision: 1 }, 512, async () => bytes);
  const next = await store.capture({ ...point("ignored", 0), localRevision: 2 }, 512, async () => bytes);
  assert.deepEqual(memory.operations, [
    `write:${old.id}.sqlite3`, `write:${old.id}.json`,
    `write:${next.id}.sqlite3`, `write:${next.id}.json`,
    `remove:${old.id}.json`, `remove:${old.id}.sqlite3`,
  ]);
  assert.equal((await store.read("budget-A", next.id)).file.size, 512);
  await assert.rejects(store.read("budget-B", next.id), /budget mismatch/);
});

test("incomplete/corrupt payload and metadata failures never publish a point", async () => {
  for (const failure of ["short", "corrupt", "payload", "metadata", "empty-manifest"]) {
    const memory = memoryFiles();
    const store = createRestorePointStore(memory.files);
    if (failure === "payload") memory.failWrite(".sqlite3");
    if (failure === "metadata") memory.failWrite(".json");
    if (failure === "empty-manifest") memory.failWrite("empty-manifest");
    await assert.rejects(store.capture(point("ignored", 0), 512, async () =>
      failure === "short" ? new Uint8Array(10) : failure === "corrupt" ? new Uint8Array(512) : sqliteBytes()));
    assert.equal((await store.list("budget-A")).length, 0);
    assert.equal(memory.entries.size, 0);
  }
});

test("pruning failure preserves the newly published point and equivalent safety points deduplicate", async () => {
  const memory = memoryFiles();
  const store = createRestorePointStore(memory.files);
  await store.capture(point("ignored", 1000), 512, async () => sqliteBytes());
  memory.failRemove();
  const next = await store.capture({ ...point("ignored", 0), localRevision: 2 }, 512, async () => sqliteBytes());
  assert.equal((await store.read("budget-A", next.id)).point.id, next.id);
  const safety = await store.capture(point("ignored", 0, "before-restore"), 512, async () => sqliteBytes());
  const duplicate = await store.capture(point("ignored", 0, "before-restore"), 512, async () => { throw new Error("must not copy"); });
  assert.equal(duplicate.id, safety.id);
});

test("uncertain metadata publication never removes a potentially published payload", async () => {
  const memory = memoryFiles();
  let unreadable = true;
  const store = createRestorePointStore({
    ...memory.files,
    async write(name, chunks) {
      await memory.files.write(name, chunks);
      if (name.endsWith(".json")) throw new Error("lost close acknowledgement");
    },
    async read(name) {
      if (name.endsWith(".json") && unreadable) throw new Error("temporary read failure");
      return memory.files.read(name);
    },
  });
  await assert.rejects(store.capture(point("ignored", 0), 512, async () => sqliteBytes()));
  assert.equal(memory.entries.size, 2);
  unreadable = false;
  const [completed] = await store.list("budget-A");
  assert.ok(completed);
  assert.equal((await store.read("budget-A", completed.id)).file.size, 512);
});
