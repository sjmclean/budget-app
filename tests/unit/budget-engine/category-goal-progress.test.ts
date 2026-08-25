import assert from "node:assert/strict";
import test from "node:test";
import { calculateCategoryGoalProgress } from "../../../packages/budget-engine/src/services/calculateCategoryGoalProgress.js";
import { CategoryGoal } from "../../../packages/types/src/CategoryGoal.js";

function goal(overrides: Partial<CategoryGoal> = {}): CategoryGoal {
  return {
    id: "goal-1",
    budgetId: "budget-1",
    categoryId: "category-1",
    type: "monthly-funding",
    targetAmount: 500,
    targetMonth: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function calculate(
  categoryGoal: CategoryGoal,
  values: { selectedMonth?: string; assigned?: number; available?: number } = {},
) {
  return calculateCategoryGoalProgress({
    goal: categoryGoal,
    selectedMonth: values.selectedMonth ?? "2026-08",
    assigned: values.assigned ?? 0,
    available: values.available ?? 0,
  });
}

test("monthly funding uses selected-month Assigned and ignores Available", () => {
  const categoryGoal = goal();

  assert.deepEqual(calculate(categoryGoal), {
    goal: categoryGoal,
    progressAmount: 0,
    remainingAmount: 500,
    recommendedAssignment: 500,
    percentComplete: 0,
    status: "underfunded",
  });

  const partial = calculate(categoryGoal, { assigned: 350, available: 900 });
  assert.equal(partial.progressAmount, 350);
  assert.equal(partial.remainingAmount, 150);
  assert.equal(partial.recommendedAssignment, 150);
  assert.equal(partial.percentComplete, 70);
  assert.equal(partial.status, "underfunded");

  assert.equal(calculate(categoryGoal, { assigned: 500 }).status, "funded");
  const aboveTarget = calculate(categoryGoal, { assigned: 650 });
  assert.equal(aboveTarget.remainingAmount, 0);
  assert.equal(aboveTarget.recommendedAssignment, 0);
  assert.equal(aboveTarget.percentComplete, 100);
});

test("monthly funding remains funded after spending reduces Available", () => {
  const result = calculate(goal(), { assigned: 500, available: -200 });

  assert.equal(result.progressAmount, 500);
  assert.equal(result.remainingAmount, 0);
  assert.equal(result.status, "funded");
});

test("target balance uses Available and never recommends an assignment", () => {
  const categoryGoal = goal({ type: "target-balance", targetAmount: 1_000 });

  const zero = calculate(categoryGoal, { available: 0 });
  assert.equal(zero.progressAmount, 0);
  assert.equal(zero.remainingAmount, 1_000);
  assert.equal(zero.recommendedAssignment, null);

  const partial = calculate(categoryGoal, { available: 620 });
  assert.equal(partial.progressAmount, 620);
  assert.equal(partial.remainingAmount, 380);
  assert.equal(partial.percentComplete, 62);
  assert.equal(partial.status, "underfunded");

  assert.equal(calculate(categoryGoal, { available: 1_000 }).status, "funded");
  const aboveTarget = calculate(categoryGoal, { available: 1_250 });
  assert.equal(aboveTarget.remainingAmount, 0);
  assert.equal(aboveTarget.percentComplete, 100);
  assert.equal(aboveTarget.status, "funded");
});

test("target balance handles negative Available and becomes underfunded after spending", () => {
  const categoryGoal = goal({ type: "target-balance", targetAmount: 1_000 });
  const negative = calculate(categoryGoal, { available: -100 });

  assert.equal(negative.progressAmount, 0);
  assert.equal(negative.remainingAmount, 1_100);
  assert.equal(negative.percentComplete, 0);
  assert.equal(negative.status, "underfunded");

  assert.equal(calculate(categoryGoal, { available: 1_000 }).status, "funded");
  assert.equal(calculate(categoryGoal, { available: 900 }).status, "underfunded");
});

test("dated balance counts funding months inclusively", () => {
  const sameMonth = goal({
    type: "target-balance-by-date",
    targetAmount: 300,
    targetMonth: "2026-08",
  });
  assert.equal(calculate(sameMonth).recommendedAssignment, 300);

  const oneFutureMonth = goal({
    type: "target-balance-by-date",
    targetAmount: 300,
    targetMonth: "2026-09",
  });
  assert.equal(calculate(oneFutureMonth).recommendedAssignment, 150);

  const multipleFutureMonths = goal({
    type: "target-balance-by-date",
    targetAmount: 300,
    targetMonth: "2026-10",
  });
  assert.equal(calculate(multipleFutureMonths).recommendedAssignment, 100);
});

test("dated balance crosses year and multi-year boundaries without day arithmetic", () => {
  const decemberToJanuary = goal({
    type: "target-balance-by-date",
    targetAmount: 200,
    targetMonth: "2027-01",
  });
  assert.equal(
    calculate(decemberToJanuary, { selectedMonth: "2026-12" }).recommendedAssignment,
    100,
  );

  const multiYear = goal({
    type: "target-balance-by-date",
    targetAmount: 250,
    targetMonth: "2028-01",
  });
  assert.equal(
    calculate(multiYear, { selectedMonth: "2026-12" }).recommendedAssignment,
    17.86,
  );
});

test("dated balance uses Available for completion and negative progress", () => {
  const categoryGoal = goal({
    type: "target-balance-by-date",
    targetAmount: 1_000,
    targetMonth: "2026-10",
  });

  const complete = calculate(categoryGoal, { available: 1_000 });
  assert.equal(complete.status, "funded");
  assert.equal(complete.recommendedAssignment, 0);

  assert.equal(calculate(categoryGoal, { available: 1_100 }).status, "funded");

  const negative = calculate(categoryGoal, { available: -200 });
  assert.equal(negative.progressAmount, 0);
  assert.equal(negative.remainingAmount, 1_200);
  assert.equal(negative.recommendedAssignment, 400);
  assert.equal(negative.percentComplete, 0);
});

test("dated balance is overdue after its target month and recommends the full remainder", () => {
  const categoryGoal = goal({
    type: "target-balance-by-date",
    targetAmount: 1_000,
    targetMonth: "2026-07",
  });

  const overdue = calculate(categoryGoal, { available: 250 });
  assert.equal(overdue.remainingAmount, 750);
  assert.equal(overdue.recommendedAssignment, 750);
  assert.equal(overdue.status, "overdue");

  const funded = calculate(categoryGoal, { available: 1_000 });
  assert.equal(funded.recommendedAssignment, 0);
  assert.equal(funded.status, "funded");
});

test("dated balance rounds recommendations upward to the next cent", () => {
  const categoryGoal = goal({
    type: "target-balance-by-date",
    targetAmount: 10,
    targetMonth: "2026-10",
  });

  assert.equal(calculate(categoryGoal).recommendedAssignment, 3.34);
});

test("validates target months by Goal type and calendar month", () => {
  assert.throws(
    () => calculate(goal({ type: "target-balance-by-date", targetMonth: null })),
    /requires a target month/,
  );
  assert.throws(
    () => calculate(goal({ type: "monthly-funding", targetMonth: "2026-08" })),
    /cannot have a target month/,
  );

  for (const targetMonth of ["2026-00", "2026-13", "2026-8", "August 2026"]) {
    assert.throws(
      () => calculate(goal({ type: "target-balance-by-date", targetMonth })),
      /Invalid budget month/,
    );
  }

  assert.throws(
    () => calculate(goal(), { selectedMonth: "2026-13" }),
    /Invalid budget month/,
  );
});

test("clamps percentage and calculates monetary results in minor units", () => {
  const categoryGoal = goal({ targetAmount: 0.03 });

  assert.equal(calculate(categoryGoal, { assigned: -1 }).percentComplete, 0);
  const result = calculate(categoryGoal, { assigned: 0.01 });
  assert.equal(result.remainingAmount, 0.02);
  assert.equal(result.recommendedAssignment, 0.02);
  assert.equal(calculate(categoryGoal, { assigned: 1 }).percentComplete, 100);
});

test("rounds sub-cent and extra-decimal amounts deterministically", () => {
  assert.throws(
    () => calculate(goal({ targetAmount: 0.004 })),
    /greater than zero/,
  );

  const halfCent = calculate(goal({ targetAmount: 0.005 }));
  assert.equal(halfCent.remainingAmount, 0.01);
  assert.equal(halfCent.recommendedAssignment, 0.01);

  const aboveHalfCent = calculate(goal({ targetAmount: 0.006 }));
  assert.equal(aboveHalfCent.remainingAmount, 0.01);

  const extraDecimals = calculate(goal({ targetAmount: 10.004 }), {
    assigned: 1.005,
  });
  assert.equal(extraDecimals.progressAmount, 1);
  assert.equal(extraDecimals.remainingAmount, 9);
  assert.equal(extraDecimals.recommendedAssignment, 9);
});

test("rounds fractional-cent dated recommendations upward", () => {
  const categoryGoal = goal({
    type: "target-balance-by-date",
    targetAmount: 0.02,
    targetMonth: "2026-10",
  });

  assert.equal(calculate(categoryGoal).recommendedAssignment, 0.01);
});

test("rejects non-positive and non-finite monetary inputs", () => {
  assert.throws(() => calculate(goal({ targetAmount: 0 })), /greater than zero/);
  assert.throws(() => calculate(goal({ targetAmount: Number.NaN })), /finite amount/);
  assert.throws(() => calculate(goal(), { assigned: Number.POSITIVE_INFINITY }), /finite amount/);
  assert.throws(() => calculate(goal(), { available: Number.NaN }), /finite amount/);
  assert.throws(
    () => calculate(goal({ targetAmount: Number.MAX_SAFE_INTEGER })),
    /safe integer minor units/,
  );
  assert.throws(
    () => calculate(goal(), { assigned: Number.MAX_SAFE_INTEGER }),
    /safe integer minor units/,
  );
  assert.throws(
    () => calculate(goal(), { available: -Number.MAX_SAFE_INTEGER }),
    /safe integer minor units/,
  );
});

test("does not mutate Goal input and is deterministic", () => {
  const categoryGoal = Object.freeze(goal({
    type: "target-balance-by-date",
    targetMonth: "2026-10",
  }));
  const before = structuredClone(categoryGoal);
  const input = { goal: categoryGoal, selectedMonth: "2026-08", assigned: 100, available: 125 };

  const first = calculateCategoryGoalProgress(input);
  const second = calculateCategoryGoalProgress(input);

  assert.deepEqual(categoryGoal, before);
  assert.deepEqual(first, second);
});
