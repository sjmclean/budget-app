import assert from "node:assert/strict";
import test from "node:test";
import { createRestorePointCoordinator } from "../../../apps/web/src/features/budget/restorePointCoordinator";
import { retainRestorePoints, RESTORE_POINT_INTERVAL_MS as INTERVAL } from "../../../apps/web/src/features/budget/restorePointRetention";
import { createRestorePointStore, opfsRestorePointFiles, restorePointBudgetDirectory, RESTORE_POINT_DIRECTORY, RESTORE_POINT_CHUNK_BYTES as CHUNK } from "../../../apps/web/src/features/budget/restorePointStore";
import type { RestorePointMetadata, RestorePointReason } from "../../../apps/web/src/features/budget/restorePointTypes";
import { emptyDomainCounts } from "../../../apps/web/src/features/persistence/localFirst/contracts";

const NOW = Date.parse("2026-09-03T12:05:00Z");
function point(id: string, age: number, reason: RestorePointReason = "timed"): RestorePointMetadata {
  return {
    schema: "sqlite-restore-point.v2", id, budgetId: "budget-A", budgetName: "A",
    createdAt: new Date(NOW - age).toISOString(), reason, syncEpoch: "epoch-A",
    localRevision: 1, mutationCount: 1, totalBytes: 512,
    databaseHash: "a".repeat(64), chunks: [{ hash: "a".repeat(64), length: 512 }], newBytesStored: 512, newChunkCount: 1, counts: emptyDomainCounts(),
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


import { memoryRestorePointFiles, collectRestorePointBytes as collect } from "../../helpers/restorePointFiles";

function sqliteBytes(size = CHUNK * 3 + 8192) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (Math.floor(i / CHUNK) * 31 + i) % 251;
  bytes.set(new TextEncoder().encode("SQLite format 3\0"));
  bytes[16] = 32; bytes[17] = 0;
  return bytes;
}

function harness() {
  const memory = memoryRestorePointFiles();
  const store = createRestorePointStore(memory.forBudget);
  const capture = (data = sqliteBytes(), revision = 1, reason: RestorePointReason = "manual", budgetId = "budget-A") =>
    store.capture({ ...point("unused", 0, reason), createdAt: new Date(NOW + revision * 1000).toISOString(), localRevision: revision, budgetId }, data.length,
      async (offset, length) => data.subarray(offset, offset + length));
  return { memory, store, capture, a: memory.budget("budget-A") };
}

test("identical images across metadata/reasons reuse every immutable chunk; exact reconstruction", async () => {
  const { capture, a, store } = harness();
  const data = sqliteBytes();
  const first = await capture(data);
  const before = [...a.entries].filter(([path]) => path.endsWith(".bin"));
  const second = await capture(data, 2, "before-restore");
  assert.notEqual(first.id, second.id);
  assert.deepEqual(second.chunks, first.chunks);
  assert.equal(second.databaseHash, first.databaseHash);
  assert.equal(second.newBytesStored, 0);
  assert.equal(second.newChunkCount, 0);
  assert.deepEqual([...a.entries].filter(([path]) => path.endsWith(".bin")), before);
  assert.deepEqual(await store.read("budget-A", first.id, collect), Buffer.from(data));
  assert.deepEqual(await store.read("budget-A", second.id, collect), Buffer.from(data));
});

test("one changed chunk adds only its bytes; reused data and manifests are not overwritten", async () => {
  const { capture, a } = harness();
  const data = sqliteBytes();
  const first = await capture(data);
  const manifest = a.entries.get(`manifests/${first.id}.json`);
  a.operations.length = 0;
  data[CHUNK + 700]++;
  const next = await capture(data, 2);
  assert.equal(next.newChunkCount, 1);
  assert.equal(next.newBytesStored, CHUNK);
  assert.equal(next.chunks.filter((chunk, i) => chunk.hash === first.chunks[i].hash).length, first.chunks.length - 1);
  assert.equal(a.operations.filter((op) => op.startsWith("write:chunks/") && op.endsWith(".bin")).length, 1);
  assert.equal(a.entries.get(`manifests/${first.id}.json`), manifest);
});

test("duplicate content within a snapshot is physically stored once", async () => {
  const { capture, a } = harness();
  const data = sqliteBytes(CHUNK * 3);
  data.set(data.subarray(CHUNK, CHUNK * 2), CHUNK * 2);
  const p = await capture(data);
  assert.equal(p.newChunkCount, 2);
  assert.equal(p.newBytesStored, CHUNK * 2);
  assert.equal([...a.entries.keys()].filter((key) => key.endsWith(".bin")).length, 2);
});

for (const failure of ["missing", "corrupt", "length", "database-hash", "malformed", "wrong-reference-length", "wrong-budget", "wrong-id"]) {
  test(`restore fails closed: ${failure}`, async () => {
    const { capture, a, store } = harness();
    const p = await capture();
    const path = `chunks/${p.chunks[1].hash}.bin`;
    const manifestPath = `manifests/${p.id}.json`;
    if (failure === "missing") a.entries.delete(path);
    if (failure === "corrupt") a.entries.set(path, new File([new Uint8Array(CHUNK)], path));
    if (failure === "length") a.entries.set(path, new File([new Uint8Array(512)], path));
    if (failure === "malformed") a.entries.set(manifestPath, new File(["{broken"], manifestPath));
    if (failure === "database-hash") a.entries.set(manifestPath, new File([JSON.stringify({ ...p, databaseHash: "b".repeat(64) })], manifestPath));
    if (failure === "wrong-reference-length") a.entries.set(manifestPath, new File([JSON.stringify({ ...p, chunks: [{ ...p.chunks[0], length: 1 }, ...p.chunks.slice(1)] })], manifestPath));
    if (failure === "wrong-budget") a.entries.set(manifestPath, new File([JSON.stringify({ ...p, budgetId: "B" })], manifestPath));
    if (failure === "wrong-id") a.entries.set(manifestPath, new File([JSON.stringify({ ...p, id: "../escape" })], manifestPath));
    await assert.rejects(store.read("budget-A", p.id, collect));
  });
}

for (const failure of ["partial", "final", "manifest", "empty-manifest"]) {
  test(`failed ${failure} publication exposes no restore point; GC reclaims unreferenced files`, async () => {
    const { capture, a, store } = harness();
    a.faults.beforeWrite = (path) => {
      if ((failure === "partial" && path.endsWith(".partial")) ||
          (failure === "final" && path.endsWith(".bin")) ||
          ((failure === "manifest" || failure === "empty-manifest") && path.startsWith("manifests/"))) {
        if (failure === "empty-manifest" || failure === "partial") a.entries.set(path, new File([], path));
        throw new Error("quota");
      }
    };
    await assert.rejects(capture(), /quota/);
    assert.deepEqual(await store.list("budget-A"), []);
    a.faults.beforeWrite = undefined;
    await store.collectGarbage("budget-A");
    assert.equal([...a.entries.keys()].filter((key) => key.startsWith("chunks/")).length, 0);
  });
}

test("pre-existing valid chunk and interrupted temporary files are safe; incomplete final identity is not reused", async () => {
  const { capture, a, store } = harness();
  const first = await capture();
  a.entries.delete(`manifests/${first.id}.json`);
  a.entries.set("chunks/interrupted.partial", new File([new Uint8Array(13)], "interrupted.partial"));
  const second = await capture(sqliteBytes(), 2);
  assert.equal(second.newBytesStored, 0);
  assert.equal(a.entries.has("chunks/interrupted.partial"), false);
  const path = `chunks/${second.chunks[0].hash}.bin`;
  a.entries.set(path, new File([], path));
  await assert.rejects(capture(sqliteBytes(), 3), /length mismatch/);
  assert.equal((await store.list("budget-A")).length, 1);
});

test("lost chunk/manifest close acknowledgements are verified before reporting success", async () => {
  const { capture, a, store } = harness();
  a.faults.afterWrite = (path) => { if (path.endsWith(".bin") || path.endsWith(".json")) throw new Error("lost acknowledgement"); };
  const p = await capture();
  assert.deepEqual(await store.read("budget-A", p.id, collect), Buffer.from(sqliteBytes()));
});

test("invalid unreferenced final handle from interruption is recovered, never silently reused", async () => {
  const { capture, a, store } = harness();
  const p = await capture();
  a.entries.delete(`manifests/${p.id}.json`);
  a.entries.set(`chunks/${p.chunks[0].hash}.bin`, new File([], "interrupted-final"));
  const recovered = await capture(sqliteBytes(), 2);
  assert.equal(recovered.newChunkCount, 1);
  assert.equal(recovered.newBytesStored, p.chunks[0].length);
  assert.deepEqual(await store.read("budget-A", recovered.id, collect), Buffer.from(sqliteBytes()));
});

for (const extension of [".partial", ".bin"]) {
  test(`written ${extension} corruption is detected before manifest publication`, async () => {
    const { capture, a, store } = harness();
    a.faults.afterWrite = (path) => {
      if (path.endsWith(extension)) a.entries.set(path, new File([new Uint8Array(CHUNK)], path));
    };
    await assert.rejects(capture(), /integrity validation/);
    assert.deepEqual(await store.list("budget-A"), []);
  });
}

test("unexpected catalogue corruption during cleanup preserves completed capture and all chunks", async () => {
  const { capture, a, store } = harness();
  a.faults.afterWrite = (path) => {
    if (path.endsWith(".json")) a.entries.set("manifests/corrupt.json", new File(["{broken"], "corrupt.json"));
  };
  const p = await capture();
  assert.deepEqual(await store.read("budget-A", p.id, collect), Buffer.from(sqliteBytes()));
  assert.equal(a.operations.some((op) => op.startsWith("remove:chunks/") && op.endsWith(".bin")), false);
  await assert.rejects(store.collectGarbage("budget-A"));
});

test("uncertain unreadable manifest publication leaks safely; later recovery can read it", async () => {
  const { capture, a, store } = harness();
  a.faults.afterWrite = (path) => {
    if (path.endsWith(".json")) {
      a.faults.beforeRead = (path) => { if (path.endsWith(".json")) throw new Error("unreadable"); };
      throw new Error("lost acknowledgement");
    }
  };
  await assert.rejects(capture(), /lost acknowledgement/);
  const count = a.entries.size;
  await assert.rejects(store.collectGarbage("budget-A"), /unreadable/);
  assert.equal(a.entries.size, count);
  a.faults.beforeRead = undefined;
  const [p] = await store.list("budget-A");
  assert.deepEqual(await store.read("budget-A", p.id, collect), Buffer.from(sqliteBytes()));
});

test("retention removes manifests first; shared chunks survive until last reference disappears", async () => {
  const { capture, store, a } = harness();
  const first = await capture(sqliteBytes(), 1, "timed");
  const other = await capture(sqliteBytes(), 2, "manual");
  const data = sqliteBytes(); data[CHUNK + 100]++;
  const next = await capture(data, 3, "timed");
  assert.equal(a.entries.has(`manifests/${first.id}.json`), false);
  assert.equal(a.entries.has(`chunks/${first.chunks[1].hash}.bin`), true, "manual still references old chunk");
  assert.deepEqual(await store.read("budget-A", other.id, collect), Buffer.from(sqliteBytes()));
  a.entries.delete(`manifests/${other.id}.json`);
  await store.collectGarbage("budget-A");
  assert.equal(a.entries.has(`chunks/${first.chunks[1].hash}.bin`), false);
  assert.deepEqual(await store.read("budget-A", next.id, collect), Buffer.from(data));
});

for (const failure of ["prune", "gc"]) {
  test(`${failure} failure does not invalidate newly published snapshot`, async () => {
    const { capture, a, store } = harness();
    await capture(sqliteBytes(), 1, "timed");
    a.faults.beforeRemove = (path) => { if (failure === "prune" ? path.endsWith(".json") : path.endsWith(".bin")) throw new Error("cleanup denied"); };
    const data = sqliteBytes(); data[CHUNK]++;
    const next = await capture(data, 2, "timed");
    assert.deepEqual(await store.read("budget-A", next.id, collect), Buffer.from(data));
  });
}

for (const failure of ["malformed", "unreadable"]) {
  test(`Budget B ${failure} catalogue cannot affect A listing/capture/read/GC; own corrupt catalogue prevents all GC deletes`, async () => {
    const { memory, capture, a, store } = harness();
    const b = memory.budget("B");
    b.entries.set("manifests/broken.json", new File(["{broken"], "broken.json"));
    b.entries.set(`chunks/${"c".repeat(64)}.bin`, new File([new Uint8Array(512)], "orphan"));
    if (failure === "unreadable") b.faults.beforeRead = () => { throw new Error("unreadable"); };
    const original = [...b.entries];
    await capture(sqliteBytes(), 1, "timed");
    const next = await capture(sqliteBytes(), 2, "timed");
    await store.list("budget-A");
    await store.read("budget-A", next.id, collect);
    await store.collectGarbage("budget-A");
    assert.deepEqual(b.operations, []);
    assert.deepEqual([...b.entries], original);
    await assert.rejects(store.collectGarbage("B"));
    await assert.rejects(store.list("B"));
    await assert.rejects(capture(sqliteBytes(), 1, "manual", "B"));
    assert.deepEqual([...b.entries], original);
    assert.equal(b.operations.some((op) => op.startsWith("remove:")), false);
    assert.ok(a.operations.some((op) => op.startsWith("remove:manifests/")));
  });
}

test("capture/read locks exclude GC until publication/stream verification completes across store instances", async () => {
  const { capture, a, memory, store } = harness();
  const other = createRestorePointStore(memory.forBudget);
  let release!: () => void;
  let entered!: () => void;
  let gate = new Promise<void>((resolve) => { release = resolve; });
  let started = new Promise<void>((resolve) => { entered = resolve; });
  a.faults.beforeWrite = async (path) => { if (path.endsWith(".json")) { entered(); await gate; } };
  const capturing = capture();
  await started;
  let cleaned = false;
  const cleaning = other.collectGarbage("budget-A").then(() => { cleaned = true; });
  await Promise.resolve(); assert.equal(cleaned, false);
  release(); const p = await capturing; await cleaning;
  gate = new Promise<void>((resolve) => { release = resolve; });
  started = new Promise<void>((resolve) => { entered = resolve; });
  const reading = store.read("budget-A", p.id, async (_p, chunks) => {
    entered(); await gate; return collect(_p, chunks);
  });
  await started; cleaned = false;
  const cleaningAgain = other.collectGarbage("budget-A").then(() => { cleaned = true; });
  await Promise.resolve(); assert.equal(cleaned, false);
  release(); await reading; await cleaningAgain;
});

test("concurrent identical captures deduplicate and incomplete stream consumption fails", async () => {
  const { capture, a, store } = harness();
  const [first, second] = await Promise.all([capture(), capture(sqliteBytes(), 2)]);
  assert.equal(second.newBytesStored, 0);
  assert.equal([...a.entries.keys()].filter((key) => key.endsWith(".bin")).length, first.chunks.length);
  await assert.rejects(store.read("budget-A", first.id, async () => null), /not completely verified/);
});

test("SQLite header/page length, manifest filename and restore ID validation are preserved", async () => {
  const { capture, a, store } = harness();
  await assert.rejects(capture(new Uint8Array(CHUNK)), /complete SQLite/);
  await assert.rejects(capture(sqliteBytes(CHUNK + 1)), /complete SQLite/);
  const p = await capture();
  a.entries.set("manifests/wrong.json", a.entries.get(`manifests/${p.id}.json`)!);
  await assert.rejects(store.list("budget-A"), /filename mismatch/);
  await assert.rejects(store.read("budget-A", "../escape", collect), /Invalid restore point id/);
});

test("OPFS namespaces and locks are deterministic, budget-scoped and cannot escape", async () => {
  const ids = ["budget-A", "budget-B", "../escape", "..", "/", "\\", "%2f", "é", "é", "😀", "\ud800", "\ufffd", "\0"];
  const encoded = ids.map(restorePointBudgetDirectory);
  assert.equal(new Set(encoded).size, ids.length);
  for (const name of encoded) assert.match(name, /^budget-(?:[a-f0-9]{4})+$/);
  assert.throws(() => restorePointBudgetDirectory(""), /Invalid/);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const calls: string[] = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    locks: { async request(name: string, operation: () => Promise<unknown>) { calls.push(name); return operation(); } },
    storage: { async getDirectory() { return {
      async getDirectoryHandle(parent: string) {
        assert.equal(parent, RESTORE_POINT_DIRECTORY);
        return { async getDirectoryHandle(budget: string) {
          assert.ok(encoded.includes(budget));
          return { async getDirectoryHandle(kind: string) {
            assert.ok(["chunks", "manifests"].includes(kind)); calls.push(`${budget}/${kind}`);
            return {
              async *keys() { yield "entry"; },
              async getFileHandle(name: string) { return {
                async getFile() { return new File([budget], name); },
                async createWritable() { return { async write() {}, async close() {}, async abort() {} }; },
              }; },
              async removeEntry() {},
            };
          } };
        } };
      },
    }; } },
  } });
  try {
    for (let i = 0; i < ids.length; i++) {
      const files = opfsRestorePointFiles(ids[i]);
      await files.exclusive(async () => {
        await files.names("manifests");
        await files.read("chunks", "point.bin");
        await files.write("chunks", "point.partial", (async function* () { yield sqliteBytes(); })());
        await files.remove("chunks", "point.partial");
      });
      assert.deepEqual(calls.splice(0), [`${RESTORE_POINT_DIRECTORY}:${encoded[i]}`,
        `${encoded[i]}/manifests`, ...Array(3).fill(`${encoded[i]}/chunks`)]);
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
