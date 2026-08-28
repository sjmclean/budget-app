import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPayeeMergeSelection,
  getPayeeMergeParticipantIds,
  switchPayeeMergeTarget,
} from "../../../apps/web/src/features/accounts/payeeMergeSelection.ts";

test("duplicate merge selection keeps the suggested keeper out of source ids", () => {
  assert.deepEqual(
    createPayeeMergeSelection(["coles", "coles-123"], "coles"),
    {
      targetPayeeId: "coles",
      sourcePayeeIds: ["coles-123"],
    },
  );
});

test("switching the keeper swaps roles without losing either payee", () => {
  const next = switchPayeeMergeTarget(["coles-123"], "coles", "coles-123");

  assert.deepEqual(next, {
    targetPayeeId: "coles-123",
    sourcePayeeIds: ["coles"],
  });
  assert.deepEqual(
    getPayeeMergeParticipantIds(next.sourcePayeeIds, next.targetPayeeId),
    ["coles-123", "coles"],
  );
});

test("switching the keeper in a three-payee merge preserves every participant", () => {
  const next = switchPayeeMergeTarget(
    ["coles-123", "coles-express"],
    "coles",
    "coles-123",
  );

  assert.deepEqual(next, {
    targetPayeeId: "coles-123",
    sourcePayeeIds: ["coles-express", "coles"],
  });
  assert.deepEqual(
    new Set(getPayeeMergeParticipantIds(next.sourcePayeeIds, next.targetPayeeId)),
    new Set(["coles", "coles-123", "coles-express"]),
  );
});

test("repeated keeper changes never put the keeper in the source list", () => {
  let selection = createPayeeMergeSelection(
    ["coles", "coles-123", "coles-express"],
    "coles",
  );

  for (const nextTarget of ["coles-123", "coles", "coles-123"]) {
    selection = switchPayeeMergeTarget(
      selection.sourcePayeeIds,
      selection.targetPayeeId,
      nextTarget,
    );

    assert.equal(selection.sourcePayeeIds.includes(selection.targetPayeeId), false);
    assert.deepEqual(
      new Set(getPayeeMergeParticipantIds(selection.sourcePayeeIds, selection.targetPayeeId)),
      new Set(["coles", "coles-123", "coles-express"]),
    );
  }
});

test("one source and one target is a valid two-payee merge shape", () => {
  const selection = createPayeeMergeSelection(["coles", "coles-123"], "coles");

  assert.equal(selection.sourcePayeeIds.length, 1);
  assert.equal(
    getPayeeMergeParticipantIds(selection.sourcePayeeIds, selection.targetPayeeId).length,
    2,
  );
});
