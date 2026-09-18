import assert from "node:assert/strict";
import test from "node:test";
import { LocalBudgetMutationContext } from "../../../apps/web/src/features/persistence/localFirst/engine/mutationContext";

function memoryStorage(initial = new Map<string, string>()) {
  return {
    getItem: (key: string) => initial.get(key) ?? null,
    setItem: (key: string, value: string) => { initial.set(key, value); },
    values: initial,
  };
}

test("engine mutation context allocates persisted monotonic device sequences", () => {
  const storage = memoryStorage();
  const options = {
    storage,
    deviceId: "device-a",
    currentSyncEpoch: () => "epoch-a",
    currentBaseCursor: () => 7,
  };
  const firstRuntime = new LocalBudgetMutationContext(options);
  const first = firstRuntime.createMutation("budget-a", "transactions", "one", "upsert", {});
  const second = firstRuntime.createMutation("budget-a", "transactions", "two", "upsert", {});
  const reloaded = new LocalBudgetMutationContext(options)
    .createMutation("budget-a", "transactions", "three", "upsert", {});

  assert.deepEqual([first.deviceSequence, second.deviceSequence, reloaded.deviceSequence], [1, 2, 3]);
  assert.equal(reloaded.baseCursor, 7);
  assert.equal(reloaded.syncEpoch, "epoch-a");
});

test("engine mutation context preserves one group identity across ordered members", () => {
  const storage = memoryStorage();
  const runtime = new LocalBudgetMutationContext({
    storage,
    deviceId: "device-a",
    currentSyncEpoch: () => "epoch-a",
    currentBaseCursor: () => 11,
  });
  const group = { members: [
    { domain: "transactions" as const, entityId: "one", operation: "upsert" as const, payload: {} },
    { domain: "transactions" as const, entityId: "two", operation: "upsert" as const, payload: {} },
  ] };
  const first = runtime.createMutation("budget-a", "transactions", "one", "upsert", {}, "group-a", group);
  const second = runtime.createMutation("budget-a", "transactions", "two", "upsert", {}, "group-a", group);

  assert.equal(first.operationGroupId, "group-a");
  assert.equal(second.operationGroupId, "group-a");
  assert.deepEqual([first.deviceSequence, second.deviceSequence], [1, 2]);
});

test("engine mutation context owns allocation only and has no command-completion recorder", () => {
  const runtime = new LocalBudgetMutationContext({
    storage: memoryStorage(), deviceId: "device-a",
    currentSyncEpoch: () => "epoch-a", currentBaseCursor: () => 0,
  });
  const rejected = runtime.createMutation("budget-a", "accounts", "account-a", "delete", null);
  assert.equal(rejected.deviceSequence, 1, "the failed worker attempt may leave a monotonic sequence gap");
  assert.equal("beginCommand" in runtime, false);
  assert.equal("commitCommand" in runtime, false);
  assert.equal("abortCommand" in runtime, false);
  assert.equal("discardFailedMutation" in runtime, false);
});
