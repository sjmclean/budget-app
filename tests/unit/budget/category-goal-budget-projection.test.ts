import assert from "node:assert/strict";
import test from "node:test";
import type { CategoryGoal } from "../../../packages/types/src/CategoryGoal.js";
import { projectCategoryGoalsOntoBudgetView } from "../../../apps/web/src/features/budget/categoryGoalBudgetProjection.js";
import type { BudgetCategoryView, BudgetMonthView } from "../../../apps/web/src/features/budget/budgetViewTypes.js";
import { createSqliteBudgetViewService } from "../../../apps/web/src/features/persistence/createSqliteBudgetViewService.js";
import type { AccountRegisterQueryClient } from "../../../apps/web/src/features/persistence/accountRegisterQueryContracts.js";

function category(id: string, overrides: Partial<BudgetCategoryView> = {}): BudgetCategoryView {
  return {
    id, name: id, previousAvailable: 25, assigned: 0, activity: 0,
    available: 0, isOverspent: false, isArchived: false, note: "",
    ...overrides,
  };
}

function view(categories: BudgetCategoryView[], overrides: Partial<BudgetMonthView> = {}): BudgetMonthView {
  return {
    budgetId: "budget-1", budgetName: "Budget", monthLabel: "August 2026", currencyCode: "AUD",
    readyToAssign: 700, totalAssigned: 0, totalActivity: 0, totalAvailable: 0,
    categoryGroups: [{
      id: "ordinary", name: "Ordinary", previousAvailable: 25,
      assigned: 0, activity: 0, available: 0, note: "", categories,
    }],
    ...overrides,
  };
}

function goal(overrides: Partial<CategoryGoal> = {}): CategoryGoal {
  return {
    id: "goal-1", budgetId: "budget-1", categoryId: "category-1",
    type: "monthly-funding", targetAmount: 500, targetMonth: null,
    createdAt: "created", updatedAt: "updated", ...overrides,
  };
}

function projectedCategory(
  source: BudgetMonthView,
  selectedMonth: string,
  goals: readonly CategoryGoal[] = [goal()],
  categoryId = "category-1",
) {
  return projectCategoryGoalsOntoBudgetView(source, selectedMonth, goals)
    .categoryGroups.flatMap(({ categories }) => categories)
    .find(({ id }) => id === categoryId)!;
}

test("no Goal leaves an ordinary category without a projection", () => {
  const result = projectedCategory(view([category("category-1")]), "2026-08", []);
  assert.equal(result.goal, undefined);
});

test("monthly Goal uses Assigned only across zero, partial, target, and over-target states", () => {
  for (const [assigned, available, remaining, status] of [
    [0, 900, 500, "underfunded"],
    [350, 900, 150, "underfunded"],
    [500, -50, 0, "funded"],
    [600, 0, 0, "funded"],
  ] as const) {
    const result = projectedCategory(view([category("category-1", { assigned, available })]), "2026-08");
    assert.equal(result.goal?.remainingAmount, remaining);
    assert.equal(result.goal?.recommendedAssignment, remaining);
    assert.equal(result.goal?.status, status);
  }
});

test("target balance uses Available, responds to spending, and never recommends assignment", () => {
  for (const [available, remaining, status] of [
    [6200, 3800, "underfunded"], [10000, 0, "funded"],
    [12000, 0, "funded"], [-50, 10050, "underfunded"],
    [5000, 5000, "underfunded"],
  ] as const) {
    const result = projectedCategory(
      view([category("category-1", { assigned: 9999, available })]),
      "2026-08", [goal({ type: "target-balance", targetAmount: 10000 })],
    );
    assert.equal(result.goal?.remainingAmount, remaining);
    assert.equal(result.goal?.recommendedAssignment, null);
    assert.equal(result.goal?.status, status);
  }
});

test("dated balance follows selected month across target, future, year boundary, and overdue", () => {
  const dated = goal({ type: "target-balance-by-date", targetAmount: 1200, targetMonth: "2027-01" });
  const source = view([category("category-1", { available: 600 })]);
  assert.equal(projectedCategory(source, "2027-01", [dated]).goal?.recommendedAssignment, 600);
  assert.equal(projectedCategory(source, "2026-11", [dated]).goal?.recommendedAssignment, 200);
  assert.equal(projectedCategory(source, "2026-12", [dated]).goal?.recommendedAssignment, 300);
  const overdue = projectedCategory(source, "2027-02", [dated]).goal;
  assert.equal(overdue?.recommendedAssignment, 600);
  assert.equal(overdue?.status, "overdue");
});

test("same monthly Goal recalculates independently for month-specific Assigned", () => {
  const july = projectedCategory(view([category("category-1", { assigned: 500 })]), "2026-07");
  const august = projectedCategory(view([category("category-1", { assigned: 100 })]), "2026-08");
  assert.equal(july.goal?.status, "funded");
  assert.equal(august.goal?.remainingAmount, 400);
});

test("Goal status and overspending remain independent", () => {
  const fundedOverspent = projectedCategory(view([category("category-1", {
    assigned: 300, activity: -350, available: -50, isOverspent: true,
  })]), "2026-08", [goal({ targetAmount: 300 })]);
  assert.equal(fundedOverspent.goal?.status, "funded");
  assert.equal(fundedOverspent.isOverspent, true);

  const underfunded = projectedCategory(view([category("category-1", {
    assigned: 250, activity: -100, available: 150, isOverspent: false,
  })]), "2026-08", [goal({ targetAmount: 300 })]);
  assert.equal(underfunded.goal?.remainingAmount, 50);
  assert.equal(underfunded.isOverspent, false);
});

test("Goal overlay leaves every financial field and aggregate unchanged", () => {
  const source = view([category("category-1", {
    previousAvailable: 10, assigned: 300, activity: -350, available: -40, isOverspent: true,
  })], { readyToAssign: 123, totalAssigned: 300, totalActivity: -350, totalAvailable: -40 });
  const projected = projectCategoryGoalsOntoBudgetView(source, "2026-08", [goal({ targetAmount: 300 })]);
  const { goal: _goal, ...projectedFinancialCategory } = projected.categoryGroups[0]!.categories[0]!;
  assert.deepEqual(projectedFinancialCategory, source.categoryGroups[0]!.categories[0]);
  assert.deepEqual({
    readyToAssign: projected.readyToAssign,
    totalAssigned: projected.totalAssigned,
    totalActivity: projected.totalActivity,
    totalAvailable: projected.totalAvailable,
  }, {
    readyToAssign: source.readyToAssign,
    totalAssigned: source.totalAssigned,
    totalActivity: source.totalActivity,
    totalAvailable: source.totalAvailable,
  });
  assert.equal(source.categoryGroups[0]!.categories[0]!.goal, undefined);
});

test("managed categories suppress corrupt Goal rows while archived categories retain projection", () => {
  const managedView = view([]);
  managedView.categoryGroups = [{
    id: "credit-card-payments", name: "Credit Card Payments", previousAvailable: 0,
    assigned: 0, activity: 0, available: 0, note: "",
    categories: [category("credit-card-payment-card-1")],
  }];
  assert.equal(projectedCategory(
    managedView, "2026-08", [goal({ categoryId: "credit-card-payment-card-1" })],
    "credit-card-payment-card-1",
  ).goal, undefined);

  const archived = projectedCategory(view([category("category-1", { isArchived: true })]), "2026-08");
  const restored = projectedCategory(view([category("category-1", { isArchived: false })]), "2026-08");
  assert.deepEqual(archived.goal, restored.goal);
});

test("Goals match stable category IDs without cross-category or unmatched leakage", () => {
  const result = projectCategoryGoalsOntoBudgetView(
    view([category("category-1"), category("category-2")]), "2026-08",
    [goal(), goal({ id: "goal-2", categoryId: "missing", targetAmount: 20 })],
  );
  const categories = result.categoryGroups[0]!.categories;
  assert.equal(categories[0]!.goal?.goal.id, "goal-1");
  assert.equal(categories[1]!.goal, undefined);
});

test("Budget service performs one budget-level Goal list read and refreshes on the next view read", async () => {
  let goals: readonly CategoryGoal[] = [];
  let monthReads = 0;
  let goalListReads = 0;
  const client = {
    async getBudgetStatus() { return { capabilities: { budgetMonths: true } }; },
    async getBudgetMonthView() { monthReads += 1; return view([category("category-1", { assigned: 100 })]); },
    async listCategoryGoals() { goalListReads += 1; return goals; },
  } as unknown as AccountRegisterQueryClient;
  const service = createSqliteBudgetViewService(client);
  assert.equal((await service.getBudgetMonthView({ budgetId: "budget-1", month: "2026-08" }))
    .categoryGroups[0]!.categories[0]!.goal, undefined);
  goals = [goal()];
  assert.equal((await service.getBudgetMonthView({ budgetId: "budget-1", month: "2026-08" }))
    .categoryGroups[0]!.categories[0]!.goal?.remainingAmount, 400);
  assert.equal(monthReads, 2);
  assert.equal(goalListReads, 2);
});
