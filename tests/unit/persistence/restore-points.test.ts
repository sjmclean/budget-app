import assert from "node:assert/strict";
import test from "node:test";
import { createRestorePointCoordinator } from "../../../apps/web/src/features/budget/restorePointCoordinator";
import { retainRestorePoints, RESTORE_POINT_INTERVAL_MS as INTERVAL } from "../../../apps/web/src/features/budget/restorePointRetention";
import { createRestorePointStore, opfsRestorePointFiles, restorePointBudgetDirectory, RESTORE_POINT_DIRECTORY, type RestorePointFiles } from "../../../apps/web/src/features/budget/restorePointStore";
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

test("recent safety events all survive independently of timed buckets", () => {
  const points = [point("timed", HOUR), point("switch", HOUR, "before-switch"),
    point("import", HOUR + 1000, "before-import"), point("reset", DAY - 1, "before-reset")];
  assert.equal(retainRestorePoints(points, NOW).retained.length, points.length);
});

for (const [tier, age, spacing] of [
  ["daily", 3 * DAY, DAY], ["weekly", 15 * DAY, 7 * DAY], ["monthly", 70 * DAY, 31 * DAY],
] as const) {
  test(`old safety events thin ${tier}, independently of timed, manual, initial and other budgets`, () => {
    const latest = point("latest", age, "before-switch");
    const older = point("older", age + 1000, "before-reset");
    const previous = point("previous", age + spacing, "before-import");
    const points = [older, previous, latest, point("timed", age),
      { ...older, id: "other-budget", budgetId: "budget-B" },
      point("manual-1", age, "manual"), point("manual-2", age + 1000, "manual"),
      point("initial-1", age, "initial-import"), point("initial-2", age + 1000, "initial-import")];
    const result = retainRestorePoints(points, NOW);
    assert.deepEqual(result.pruned.map(({ id }) => id), ["older"]);
    assert.equal(result.retained.length, points.length - 1);
    assert.deepEqual(retainRestorePoints([...points].reverse(), NOW), result);
  });
}

test("tier boundaries, Monday weeks and calendar months are UTC-stable", () => {
  for (const [reason, ages] of [
    ["timed", [6 * HOUR, DAY, 7 * DAY, 35 * DAY]],
    ["before-restore", [DAY, 7 * DAY, 35 * DAY]],
  ] as const) {
    for (const age of ages) {
      const result = retainRestorePoints([point("new-tier", age, reason), point("old-tier", age - 1, reason)], NOW);
      assert.equal(result.retained.length, 2, `${reason}: tiers do not collide at ${age}`);
    }
  }
  for (const reason of ["timed", "before-switch"] as const) {
    const dated = (id: string, date: string) => ({ ...point(id, 0, reason), createdAt: date });
    const points = [dated("sunday", "2026-08-16T23:59:59Z"), dated("monday", "2026-08-17T00:00:00Z"),
      dated("june", "2026-06-30T23:59:59Z"), dated("july", "2026-07-01T00:00:00Z")];
    assert.equal(retainRestorePoints(points, NOW).retained.length, 4);
  }
});

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
  const catalogues = new Map<string, RestorePointFiles>([["budget-A", files]]);
  const forBudget = (budgetId: string) => {
    if (!catalogues.has(budgetId)) catalogues.set(budgetId, memoryFiles().files);
    return catalogues.get(budgetId)!;
  };
  return { files, forBudget, entries, operations,
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
  const store = createRestorePointStore(memory.forBudget);
  const bytes = sqliteBytes();
  const old = await store.capture({ ...point("ignored", 1000), localRevision: 1 }, 512, async () => bytes);
  const next = await store.capture({ ...point("ignored", 0), localRevision: 2 }, 512, async () => bytes);
  assert.deepEqual(memory.operations, [
    `write:${old.id}.sqlite3`, `write:${old.id}.json`,
    `write:${next.id}.sqlite3`, `write:${next.id}.json`,
    `remove:${old.id}.json`, `remove:${old.id}.sqlite3`,
  ]);
  assert.equal((await store.read("budget-A", next.id)).file.size, 512);
  await assert.rejects(store.read("budget-B", next.id), /missing/);
});

test("incomplete/corrupt payload and metadata failures never publish a point", async () => {
  for (const failure of ["short", "corrupt", "payload", "metadata", "empty-manifest"]) {
    const memory = memoryFiles();
    const store = createRestorePointStore(memory.forBudget);
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
  const store = createRestorePointStore(memory.forBudget);
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
  const store = createRestorePointStore(() => ({
    ...memory.files,
    async write(name, chunks) {
      await memory.files.write(name, chunks);
      if (name.endsWith(".json")) throw new Error("lost close acknowledgement");
    },
    async read(name) {
      if (name.endsWith(".json") && unreadable) throw new Error("temporary read failure");
      return memory.files.read(name);
    },
  }));
  await assert.rejects(store.capture(point("ignored", 0), 512, async () => sqliteBytes()));
  assert.equal(memory.entries.size, 2);
  unreadable = false;
  const [completed] = await store.list("budget-A");
  assert.ok(completed);
  assert.equal((await store.read("budget-A", completed.id)).file.size, 512);
});

for (const corrupt of ["malformed", "unreadable"] as const) {
  test(`${corrupt} Budget B catalogue cannot affect A listing, capture, restore read or pruning`, async () => {
    const memory = memoryFiles();
    const budgetB = memoryFiles();
    budgetB.entries.set("broken.json", new File(["{broken"], "broken.json"));
    budgetB.entries.set("broken.sqlite3", new File([sqliteBytes()], "broken.sqlite3"));
    const originalB = [...budgetB.entries];
    const inspected: string[] = [];
    const store = createRestorePointStore((budgetId) => {
      inspected.push(budgetId);
      if (budgetId === "budget-A") return memory.files;
      assert.equal(budgetId, "budget-B");
      return { ...budgetB.files, async read(name) {
        if (corrupt === "unreadable") throw new Error("catalogue unreadable");
        return budgetB.files.read(name);
      } };
    });
    const old = await store.capture(point("ignored", 1000), 512, async () => sqliteBytes());
    assert.deepEqual((await store.list("budget-A")).map(({ id }) => id), [old.id]);
    const next = await store.capture({ ...point("ignored", 0), localRevision: 2 }, 512, async () => sqliteBytes());
    assert.deepEqual((await store.list("budget-A")).map(({ id }) => id), [next.id]);
    assert.equal((await store.read("budget-A", next.id)).file.size, 512);
    assert.ok(memory.operations.includes(`remove:${old.id}.sqlite3`));
    assert.ok(inspected.every((budgetId) => budgetId === "budget-A"));
    assert.deepEqual([...budgetB.entries], originalB);
    assert.deepEqual(budgetB.operations, []);
    await assert.rejects(store.list("budget-B"), corrupt === "unreadable" ? /catalogue unreadable/ : SyntaxError);
    await assert.rejects(store.capture({ ...point("ignored", 0), budgetId: "budget-B" }, 512, async () => {
      assert.fail("must surface own catalogue corruption before copying");
    }));
  });
}

test("catalogue identity and payload integrity validation remain strict", async () => {
  const memory = memoryFiles();
  const store = createRestorePointStore(memory.forBudget);
  const captured = await store.capture(point("ignored", 0), 512, async () => sqliteBytes());
  const name = `${captured.id}.json`;
  memory.entries.set("wrong.json", memory.entries.get(name)!);
  await assert.rejects(store.list("budget-A"), /filename mismatch/);
  memory.entries.delete("wrong.json");
  memory.entries.set(name, new File([JSON.stringify({ ...captured, budgetId: "budget-B" })], name));
  await assert.rejects(store.list("budget-A"), /budget mismatch/);
  await assert.rejects(store.read("budget-A", captured.id), /budget mismatch/);
  memory.entries.set(name, new File([JSON.stringify(captured)], name));
  const modified = sqliteBytes();
  modified[100] = 1;
  memory.entries.set(`${captured.id}.sqlite3`, new File([modified], `${captured.id}.sqlite3`));
  await assert.rejects(store.read("budget-A", captured.id), /integrity validation/);
  await assert.rejects(store.read("budget-A", "../escape"), /Invalid restore point id/);
  memory.entries.set(name, new File([JSON.stringify({ ...captured, id: "../escape" })], name));
  await assert.rejects(store.list("budget-A"), /Invalid SQLite restore point metadata/);
});

test("OPFS adapter enters only the encoded budget child, never enumerating the global directory", async () => {
  const ids = ["budget-A", "budget-B", "../escape", "..", "/", "\\", "%2f", "a/b", "a\\b", "é", "é", "😀", "\ud800", "\ufffd", "\0"];
  const encoded = ids.map(restorePointBudgetDirectory);
  assert.equal(new Set(encoded).size, ids.length);
  for (let index = 0; index < ids.length; index++) {
    assert.match(encoded[index], /^budget-(?:[a-f0-9]{4})+$/);
    assert.equal(restorePointBudgetDirectory(ids[index]), encoded[index]);
  }
  assert.throws(() => restorePointBudgetDirectory(""), /Invalid/);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const calls: string[] = [];
  const contents = new Map(encoded.map((name) => [name, [`${name}.json`]]));
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { storage: {
    async getDirectory() { return {
      async getDirectoryHandle(parent: string) {
        assert.equal(parent, RESTORE_POINT_DIRECTORY);
        return { async getDirectoryHandle(child: string) {
          calls.push(child);
          assert.ok(contents.has(child));
          return {
            async *keys() { yield* contents.get(child)!; },
            async getFileHandle(name: string) { return {
              async getFile() { return new File([child], name); },
              async createWritable() { return {
                async write(chunk: Uint8Array) { assert.deepEqual(chunk, sqliteBytes()); },
                async close() {}, async abort() {},
              }; },
            }; },
            async removeEntry(name: string) { assert.equal(name, "obsolete.json"); },
          };
        } };
      },
    }; },
  } } });
  try {
    for (let index = 0; index < ids.length; index++) {
      const files = opfsRestorePointFiles(ids[index]);
      assert.deepEqual(await files.names(), contents.get(encoded[index]));
      assert.equal(await (await files.read("point.json")).text(), encoded[index]);
      await files.write("point.sqlite3", (async function* () { yield sqliteBytes(); })());
      await files.remove("obsolete.json");
      assert.deepEqual(calls.splice(0), Array(4).fill(encoded[index]));
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
