import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import type { CategoryGoalProjection } from "../../../packages/types/src/CategoryGoalProjection.js";
import {
  CategoryGoalInspectorSection,
  categoryGoalConfigurationFromDraft,
} from "../../../apps/web/src/features/goals/CategoryGoalInspectorSection.js";
import type { BudgetCategoryView } from "../../../apps/web/src/features/budget/budgetViewTypes.js";

const requireFromWeb = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { createElement } = requireFromWeb("react") as { createElement: (...args: unknown[]) => unknown };
const { renderToStaticMarkup } = requireFromWeb("react-dom/server") as {
  renderToStaticMarkup: (element: unknown) => string;
};

function category(goal?: CategoryGoalProjection, overrides: Partial<BudgetCategoryView> = {}): BudgetCategoryView {
  return {
    id: "category-1", name: "Car Rego", previousAvailable: 0, assigned: 350,
    activity: 0, available: 6200, isOverspent: false, isArchived: false, note: "",
    ...(goal ? { goal } : {}), ...overrides,
  };
}

function projection(overrides: Partial<CategoryGoalProjection> = {}): CategoryGoalProjection {
  return {
    goal: {
      id: "goal-1", budgetId: "budget-1", categoryId: "category-1",
      type: "monthly-funding", targetAmount: 500, targetMonth: null,
      createdAt: "created", updatedAt: "updated",
    },
    progressAmount: 350, remainingAmount: 150, recommendedAssignment: 150,
    percentComplete: 70, status: "underfunded", ...overrides,
  };
}

function render(value: BudgetCategoryView, managed = false): string {
  return renderToStaticMarkup(createElement(CategoryGoalInspectorSection, {
    budgetId: "budget-1", category: value, currencyCode: "AUD", managed,
    onAssignRecommendation: async () => ({ performed: false, reason: "failed" }),
  }));
}

test("eligible no-Goal state offers Set Goal while archived and managed states suppress it", () => {
  assert.match(render(category()), /No goal set for this category/);
  assert.match(render(category()), />Set a goal</);
  assert.doesNotMatch(render(category(undefined, { isArchived: true })), />Set a goal</);
  assert.equal(render(category(), true), "");
});

test("monthly, balance, dated, funded, and overdue projections render canonical read-model values", () => {
  const monthly = render(category(projection()));
  assert.match(monthly, /Fund .*500.* every month/);
  assert.match(monthly, /Assigned this month/);
  assert.match(monthly, /Still needed/);
  assert.match(monthly, /role="progressbar"/);
  assert.match(monthly, /70% complete/);
  assert.match(monthly, />Assign .*150/);

  const balance = render(category(projection({
    goal: { ...projection().goal, type: "target-balance", targetAmount: 10000 },
    progressAmount: 6200, remainingAmount: 3800, recommendedAssignment: null, percentComplete: 62,
  })));
  assert.match(balance, /Build balance to/);
  assert.match(balance, /Available/);
  assert.match(balance, /Remaining/);
  assert.doesNotMatch(balance, /Needed this month/);
  assert.doesNotMatch(balance, />Assign /);

  const dated = render(category(projection({
    goal: { ...projection().goal, type: "target-balance-by-date", targetAmount: 2400, targetMonth: "2027-07" },
    progressAmount: 1200, remainingAmount: 1200, recommendedAssignment: 120, percentComplete: 50,
  })));
  assert.match(dated, /Reach .*2,400.* by July 2027/);
  assert.match(dated, /Needed this month/);
  assert.match(dated, />Assign .*120/);

  const funded = render(category(projection({ remainingAmount: 0, recommendedAssignment: 0, percentComplete: 100, status: "funded" })));
  assert.match(funded, /Goal funded/);
  assert.doesNotMatch(funded, />Assign /);
  assert.match(render(category(projection({
    goal: { ...projection().goal, type: "target-balance-by-date", targetMonth: "2026-07" },
    status: "overdue",
  }))), />Overdue</);
});

test("archived retained Goal is informational and has no mutation controls", () => {
  const html = render(category(projection()));
  assert.match(html, />Edit goal</);
  const archived = render(category(projection(), { isArchived: true }));
  assert.match(archived, /Restore this category to edit its goal/);
  assert.doesNotMatch(archived, />Edit goal</);
  assert.doesNotMatch(archived, />Delete goal</);
  assert.doesNotMatch(archived, />Assign /);
});

test("Goal form configuration validates amount/month and canonicalises targetMonth by type", () => {
  assert.deepEqual(categoryGoalConfigurationFromDraft("monthly-funding", 25, "2027-01"), {
    type: "monthly-funding", targetAmount: 25, targetMonth: null,
  });
  assert.deepEqual(categoryGoalConfigurationFromDraft("target-balance", 100, "2027-01"), {
    type: "target-balance", targetAmount: 100, targetMonth: null,
  });
  assert.deepEqual(categoryGoalConfigurationFromDraft("target-balance-by-date", 100, "2027-01"), {
    type: "target-balance-by-date", targetAmount: 100, targetMonth: "2027-01",
  });
  assert.throws(() => categoryGoalConfigurationFromDraft(null, 100, ""), /Choose/);
  assert.throws(() => categoryGoalConfigurationFromDraft("monthly-funding", 0, ""), /greater than zero/);
  assert.throws(() => categoryGoalConfigurationFromDraft("target-balance-by-date", 100, "2027-13"), /valid target month/);
});

test("Goal UI wiring uses MoneyInput, confirmation, and history facade without changing Budget columns", () => {
  const source = readFileSync(new URL(
    "../../../apps/web/src/features/goals/CategoryGoalInspectorSection.tsx", import.meta.url,
  ), "utf8");
  const budgetPage = readFileSync(new URL(
    "../../../apps/web/src/pages/BudgetPage.tsx", import.meta.url,
  ), "utf8");
  assert.match(source, /<MoneyInput/);
  assert.match(source, /confirmDialog\(/);
  assert.match(source, /categoryGoalHistory\.createNewCategoryGoal/);
  assert.match(source, /categoryGoalHistory\.updateCategoryGoalConfiguration/);
  assert.match(source, /categoryGoalHistory\.deleteCategoryGoal/);
  assert.doesNotMatch(source, /replaceCategoryGoalHistoryState|accountRegisterQueries|local_category_goals/);
  const columns = budgetPage.slice(
    budgetPage.indexOf("const BUDGET_COLUMN_DEFINITIONS"),
    budgetPage.indexOf("function CategoryInspector"),
  );
  assert.deepEqual([...columns.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]), [
    "category", "assigned", "activity", "available",
  ]);
});
