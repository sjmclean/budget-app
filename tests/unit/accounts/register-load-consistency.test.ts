import assert from "node:assert/strict";
import test from "node:test";

import { loadRegisterAfterScheduledGeneration } from "../../../apps/web/src/features/accounts/registerLoadConsistency.js";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test("register read waits for scheduled generation to settle", async () => {
  const generation = deferred<void>();
  const order: string[] = [];

  const loading = loadRegisterAfterScheduledGeneration({
    generateScheduledTransactions: async () => {
      order.push("generation-start");
      await generation.promise;
      order.push("generation-finished");
    },
    reloadRegister: async () => {
      order.push("register-read");
    },
  });

  await Promise.resolve();
  assert.deepEqual(order, ["generation-start"]);

  generation.resolve();
  await loading;

  assert.deepEqual(order, [
    "generation-start",
    "generation-finished",
    "register-read",
  ]);
});

test("scheduled generation failure remains non-fatal but still precedes register read", async () => {
  const failure = new Error("scheduled generation failed");
  const order: string[] = [];
  let reported: unknown;

  await loadRegisterAfterScheduledGeneration({
    generateScheduledTransactions: async () => {
      order.push("generation");
      throw failure;
    },
    reloadRegister: async () => {
      order.push("register-read");
    },
    onGenerationError: (error) => {
      reported = error;
      order.push("generation-error");
    },
  });

  assert.equal(reported, failure);
  assert.deepEqual(order, [
    "generation",
    "generation-error",
    "register-read",
  ]);
});
