import assert from "node:assert/strict";
import test from "node:test";
import { resolveFutureReadyToAssignPlan } from "../../../apps/web/src/features/budget/budgetFutureCommitments";

test("future assignments reserve Ready to Assign in an earlier month", () => {
  assert.deepEqual(
    resolveFutureReadyToAssignPlan(3000, [
      { month: "2026-10", assigned: 1000 },
      { month: "2026-11", assigned: 500 },
    ]),
    {
      planningReadyToAssign: 1500,
      futureAssigned: 1500,
      futureOvercommitment: 0,
    },
  );
});

test("future overcommitment clamps displayed RTA and exposes the deficit", () => {
  assert.deepEqual(
    resolveFutureReadyToAssignPlan(3000, [
      { month: "2026-10", assigned: 1000 },
      { month: "2026-11", assigned: 500 },
      { month: "2026-12", assigned: 2000 },
    ]),
    {
      planningReadyToAssign: 0,
      futureAssigned: 3500,
      futureOvercommitment: 500,
    },
  );
});

test("a current-month deficit remains negative instead of being hidden", () => {
  assert.deepEqual(
    resolveFutureReadyToAssignPlan(-200, [
      { month: "2026-10", assigned: 300 },
    ]),
    {
      planningReadyToAssign: -200,
      futureAssigned: 300,
      futureOvercommitment: 300,
    },
  );
});

test("future negative assignments never manufacture current-month RTA", () => {
  assert.deepEqual(
    resolveFutureReadyToAssignPlan(500, [
      { month: "2026-10", assigned: -100 },
    ]),
    {
      planningReadyToAssign: 500,
      futureAssigned: 0,
      futureOvercommitment: 0,
    },
  );
});
