import assert from "node:assert/strict";
import test from "node:test";
import type { BudgetMonthView } from "../../../apps/web/src/features/budget/budgetViewTypes.js";
import { applyGoalRecommendedAssignment } from "../../../apps/web/src/features/budget/goalRecommendedAssignment.js";
import { createBudgetAssignmentEditSession } from "../../../apps/web/src/features/budget/budgetAssignmentEditing.js";
import { createBudgetAssignmentChangesCommand } from "../../../apps/web/src/features/budget/budgetAssignmentEditing.js";
import { adaptBudgetCommandToApplicationHistory } from "../../../apps/web/src/features/budget/budgetApplicationHistory.js";
import { applyCategoryAssignedValues } from "../../../apps/web/src/features/budget/budgetMoneyMovement.js";
import { ApplicationHistoryService, type ApplicationHistoryContext } from "../../../apps/web/src/features/history/applicationHistory.js";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.js";

function view(
  assigned: number,
  recommendation: number | null,
  type: "monthly-funding" | "target-balance-by-date" = "monthly-funding",
): BudgetMonthView {
  return {
    budgetId: "budget-1", budgetName: "Budget", monthLabel: "March 2027", currencyCode: "AUD",
    readyToAssign: 1000, totalAssigned: assigned, totalActivity: 0, totalAvailable: assigned,
    categoryGroups: [{
      id: "group-1", name: "Bills", previousAvailable: 0, assigned, activity: 0, available: assigned,
      categories: [{
        id: "category-1", name: "Car Rego", previousAvailable: 0, assigned, activity: 0,
        available: assigned, isOverspent: false, isArchived: false, note: "",
        goal: {
          goal: {
            id: "goal-1", budgetId: "budget-1", categoryId: "category-1", type,
            targetAmount: 500, targetMonth: type === "target-balance-by-date" ? "2027-03" : null,
            createdAt: "created", updatedAt: "updated",
          },
          progressAmount: assigned, remainingAmount: recommendation ?? 0,
          recommendedAssignment: recommendation, percentComplete: 50, status: "underfunded",
        },
      }],
    }],
  };
}

test("flushes a pending inline edit before rereading and adds the fresh recommendation to authoritative Assigned", async () => {
  const events: string[] = [];
  const session = createBudgetAssignmentEditSession();
  session.record({
    categoryId: "category-1", categoryName: "Car Rego",
    originalAssigned: 300, finalAssigned: 350,
  });
  let authoritative = view(300, 200);
  let command: unknown;

  const result = await applyGoalRecommendedAssignment(
    { categoryId: "category-1", month: "2027-03" },
    {
      async flushPendingAssignments() {
        events.push("flush");
        const pending = session.consume();
        assert.equal(pending[0]?.finalAssigned, 350);
        authoritative = view(350, 150);
        return { performed: true, action: "execute", commandId: "inline-edit", label: "assignment" };
      },
      async readBudgetView() { events.push("read"); return authoritative; },
      async executeAssignment(input) {
        events.push("execute");
        command = input;
        return { performed: true, action: "execute", commandId: "command-1", label: "assignment" };
      },
    },
  );

  assert.equal(result.performed, true);
  assert.deepEqual(events, ["flush", "read", "execute", "read"]);
  assert.deepEqual(command, {
    month: "2027-03",
    changes: [{
      categoryId: "category-1", categoryName: "Car Rego",
      originalAssigned: 350, finalAssigned: 500,
    }],
  });
});

test("uses final-total semantics for monthly, dated, and overdue recommendations in the selected month", async () => {
  const cases = [
    { name: "monthly", current: 350, recommendation: 150, expected: 500, type: "monthly-funding" as const },
    { name: "dated", current: 40, recommendation: 100, expected: 140, type: "target-balance-by-date" as const },
    { name: "overdue dated", current: 25, recommendation: 600, expected: 625, type: "target-balance-by-date" as const },
  ];

  for (const scenario of cases) {
    let submitted: { month: string; changes: Array<{ finalAssigned: number }> } | undefined;
    await applyGoalRecommendedAssignment(
      { categoryId: "category-1", month: "2027-03" },
      {
        async flushPendingAssignments() { return null; },
        async readBudgetView() { return view(scenario.current, scenario.recommendation, scenario.type); },
        async executeAssignment(input) {
          submitted = input;
          return { performed: true, action: "execute", commandId: scenario.name, label: "assignment" };
        },
      },
    );
    assert.equal(submitted?.month, "2027-03");
    assert.equal(submitted?.changes[0]?.finalAssigned, scenario.expected);
    assert.notEqual(submitted?.changes[0]?.finalAssigned, scenario.recommendation);
  }
});

test("does not execute when pending edits fail or the authoritative recommendation disappears", async () => {
  let executions = 0;
  const failedFlush = await applyGoalRecommendedAssignment(
    { categoryId: "category-1", month: "2027-03" },
    {
      async flushPendingAssignments() { return { performed: false, action: "execute", reason: "failed", error: "write failed" }; },
      async readBudgetView() { throw new Error("must not read"); },
      async executeAssignment() { executions += 1; throw new Error("must not execute"); },
    },
  );
  assert.deepEqual(failedFlush, { performed: false, reason: "failed", error: "write failed" });

  const disappeared = await applyGoalRecommendedAssignment(
    { categoryId: "category-1", month: "2027-03" },
    {
      async flushPendingAssignments() { return null; },
      async readBudgetView() { return view(200, null); },
      async executeAssignment() { executions += 1; throw new Error("must not execute"); },
    },
  );
  assert.equal(disappeared.performed, false);
  assert.equal(executions, 0);
});

test("surfaces assignment-command failure without doing a success refresh so retry remains possible", async () => {
  let reads = 0;
  let attempts = 0;
  const dependencies = {
    async flushPendingAssignments() { return null; },
    async readBudgetView() { reads += 1; return view(100, 50); },
    async executeAssignment() {
      attempts += 1;
      return attempts === 1
        ? { performed: false as const, action: "execute" as const, reason: "failed" as const, error: "temporary" }
        : { performed: true as const, action: "execute" as const, commandId: "command-2", label: "assignment" };
    },
  };

  const first = await applyGoalRecommendedAssignment({ categoryId: "category-1", month: "2027-03" }, dependencies);
  assert.deepEqual(first, { performed: false, reason: "failed", error: "temporary" });
  assert.equal(reads, 1);
  const retry = await applyGoalRecommendedAssignment({ categoryId: "category-1", month: "2027-03" }, dependencies);
  assert.equal(retry.performed, true);
  assert.equal(attempts, 2);
  assert.equal(reads, 3);
});

test("reuses Budget history so assign, undo, and redo preserve the Goal and apply normal financial effects", async () => {
  let current = view(350, 150);
  const originalGoal = structuredClone(current.categoryGroups[0]!.categories[0]!.goal!.goal);
  const budgetView = {
    async getBudgetMonthView() { return current; },
    async setCategoryAssignedValues(input: { assignments: Array<{ categoryId: string; assigned: number }> }) {
      current = applyCategoryAssignedValues(current, input.assignments);
      return current;
    },
  };
  const history = new ApplicationHistoryService<ApplicationHistoryContext>({
    getContext: (budgetId) => ({
      budgetId,
      persistence: { budgetView } as unknown as BudgetPersistenceProvider,
    }),
  });

  const result = await applyGoalRecommendedAssignment(
    { categoryId: "category-1", month: "2027-03" },
    {
      async flushPendingAssignments() { return null; },
      async readBudgetView() { return current; },
      executeAssignment: (input) => history.execute(
        "budget-1",
        adaptBudgetCommandToApplicationHistory(createBudgetAssignmentChangesCommand(input)),
      ),
    },
  );

  assert.equal(result.performed, true);
  assert.equal(current.categoryGroups[0]!.categories[0]!.assigned, 500);
  assert.equal(current.categoryGroups[0]!.categories[0]!.available, 500);
  assert.equal(current.readyToAssign, 850);
  assert.deepEqual(current.categoryGroups[0]!.categories[0]!.goal!.goal, originalGoal);

  await history.undo("budget-1");
  assert.equal(current.categoryGroups[0]!.categories[0]!.assigned, 350);
  assert.equal(current.readyToAssign, 1000);
  assert.deepEqual(current.categoryGroups[0]!.categories[0]!.goal!.goal, originalGoal);

  await history.redo("budget-1");
  assert.equal(current.categoryGroups[0]!.categories[0]!.assigned, 500);
  assert.equal(current.readyToAssign, 850);
  assert.deepEqual(current.categoryGroups[0]!.categories[0]!.goal!.goal, originalGoal);
});
