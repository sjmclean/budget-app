import assert from "node:assert/strict";
import test from "node:test";

import {
  loadConsistentRegisterSnapshot,
  RegisterRefreshRevisionChurnError,
} from "../../../apps/web/src/features/accounts/registerRefreshConsistency.js";

test("register refresh returns immediately when persistence revision stays stable", async () => {
  let loads = 0;
  const result = await loadConsistentRegisterSnapshot({
    readRevision: () => 7,
    load: async () => {
      loads += 1;
      return { value: "stable" };
    },
    now: () => 10,
  });

  assert.equal(loads, 1);
  assert.equal(result.revision, 7);
  assert.deepEqual(result.result, { value: "stable" });
  assert.deepEqual(result.attempts, []);
});

test("register refresh yields between revision-churn retries and accepts a later stable snapshot", async () => {
  let revision = 1;
  let loads = 0;
  let yields = 0;
  const churn: number[] = [];

  const result = await loadConsistentRegisterSnapshot({
    readRevision: () => revision,
    load: async () => {
      loads += 1;
      if (loads <= 2) revision += 1;
      return { load: loads };
    },
    yieldControl: async () => {
      yields += 1;
    },
    onRevisionChurn: ({ attempt }) => churn.push(attempt),
    now: () => loads * 10,
  });

  assert.equal(loads, 3);
  assert.equal(yields, 2);
  assert.deepEqual(churn, [1, 2]);
  assert.equal(result.revision, 3);
  assert.deepEqual(result.result, { load: 3 });
  assert.equal(result.attempts.length, 2);
});

test("register refresh stops after bounded revision churn instead of looping forever", async () => {
  let revision = 0;
  let loads = 0;
  let yields = 0;

  await assert.rejects(
    () =>
      loadConsistentRegisterSnapshot({
        readRevision: () => revision,
        load: async () => {
          loads += 1;
          revision += 1;
          return loads;
        },
        maxAttempts: 4,
        yieldControl: async () => {
          yields += 1;
        },
        now: () => loads,
      }),
    (error: unknown) => {
      assert.ok(error instanceof RegisterRefreshRevisionChurnError);
      assert.equal(error.attempts.length, 4);
      assert.deepEqual(
        error.attempts.map(({ beforeRevision, afterRevision }) => [
          beforeRevision,
          afterRevision,
        ]),
        [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
        ],
      );
      return true;
    },
  );

  assert.equal(loads, 4);
  assert.equal(yields, 3);
});
