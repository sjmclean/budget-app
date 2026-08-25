import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import type { CategoryGoalProjection } from "../../../packages/types/src/CategoryGoalProjection.js";
import type { BudgetCategoryView } from "../../../apps/web/src/features/budget/budgetViewTypes.js";
import {
  CategoryGoalRowStatus,
  formatCategoryGoalRowStatus,
} from "../../../apps/web/src/features/budget/BudgetWorkspaceGroup.js";

const requireFromWeb = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { createElement } = requireFromWeb("react") as { createElement: (...args: unknown[]) => unknown };
const { renderToStaticMarkup } = requireFromWeb("react-dom/server") as {
  renderToStaticMarkup: (element: unknown) => string;
};

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

function category(goal?: CategoryGoalProjection): BudgetCategoryView {
  return {
    id: "category-1", name: "Car Rego", previousAvailable: 0, assigned: 350,
    activity: 0, available: 350, isOverspent: false, isArchived: false, note: "",
    ...(goal ? { goal } : {}),
  };
}

function render(goal?: CategoryGoalProjection, managed = false): string {
  return renderToStaticMarkup(createElement(CategoryGoalRowStatus, {
    category: category(goal), currencyCode: "AUD", managed,
  }));
}

test("monthly Goal rows render canonical progress and progressbar", () => {
  const html = render(projection());
  assert.match(html, /\$350\.00 \/ \$500\.00/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="70"/);
  const funded = formatCategoryGoalRowStatus(projection({
      progressAmount: 500, remainingAmount: 0, recommendedAssignment: 0,
      percentComplete: 100, status: "funded",
    }), "AUD");
  assert.equal(funded.copy, "$500.00 / $500.00 ✓");
  assert.equal(funded.percentComplete, 100);
});

test("target balance rows render canonical progress over target", () => {
  const underfunded = projection({
    goal: { ...projection().goal, type: "target-balance", targetAmount: 10000 },
    progressAmount: 6200, remainingAmount: 3800, recommendedAssignment: null,
    percentComplete: 62,
  });
  const status = formatCategoryGoalRowStatus(underfunded, "AUD");
  assert.match(status.copy, /\$6,200\.00 \/ \$10,000\.00/);
  assert.equal(status.percentComplete, 62);
  assert.doesNotMatch(status.copy, /needed|remaining/i);
  assert.equal(formatCategoryGoalRowStatus({
    ...underfunded, progressAmount: 10000, remainingAmount: 0,
    percentComplete: 100, status: "funded",
  }, "AUD").copy, "$10,000.00 / $10,000.00 ✓");
});

test("dated rows use canonical progress, compact target month, and status", () => {
  const dated = projection({
    goal: {
      ...projection().goal, type: "target-balance-by-date",
      targetAmount: 2400, targetMonth: "2027-07",
    },
    progressAmount: 1200, remainingAmount: 1200, recommendedAssignment: 100,
    percentComplete: 50,
  });
  const status = formatCategoryGoalRowStatus(dated, "AUD");
  assert.equal(status.copy, "$1,200.00 / $2,400.00 · Jul 2027");
  assert.equal(status.percentComplete, 50);
  assert.equal(formatCategoryGoalRowStatus({
    ...dated,
    goal: { ...dated.goal, targetMonth: "2026-03" },
    remainingAmount: 600, recommendedAssignment: 600, status: "overdue",
    progressAmount: 1800, percentComplete: 75,
  }, "AUD").copy, "$1,800.00 / $2,400.00 · Mar 2026 · Overdue");
});

test("no Goal and managed categories render no row status", () => {
  assert.equal(render(), "");
  assert.equal(render(projection(), true), "");
});

test("subtitle click delegates to existing category selection without becoming an action", () => {
  let selections = 0;
  let propagationStopped = false;
  const element = CategoryGoalRowStatus({
    category: category(projection()),
    currencyCode: "AUD",
    onSelect: () => { selections += 1; },
  }) as { type: unknown; props: { onClick: (event: { stopPropagation(): void }) => void } };
  assert.equal(element.type, "span");
  element.props.onClick({ stopPropagation: () => { propagationStopped = true; } });
  assert.equal(selections, 1);
  assert.equal(propagationStopped, true);
});

test("row Goal status adds no nested action or Budget column", () => {
  const source = readFileSync(new URL(
    "../../../apps/web/src/features/budget/BudgetWorkspaceGroup.tsx", import.meta.url,
  ), "utf8");
  const budgetPage = readFileSync(new URL(
    "../../../apps/web/src/pages/BudgetPage.tsx", import.meta.url,
  ), "utf8");
  const statusComponent = source.slice(
    source.indexOf("export function formatCategoryGoalRowStatus"),
    source.indexOf("function EditableAssignedCell"),
  );
  assert.doesNotMatch(statusComponent, /<button|role="button"|tabIndex=/);
  assert.match(statusComponent, /onSelect\(\)/);
  assert.match(statusComponent, /projection\.progressAmount/);
  assert.match(statusComponent, /projection\.goal\.targetAmount/);
  assert.match(statusComponent, /projection\.percentComplete/);
  assert.doesNotMatch(statusComponent, /category\.(assigned|available)|recommendedAssignment/);
  const columns = budgetPage.slice(
    budgetPage.indexOf("const BUDGET_COLUMN_DEFINITIONS"),
    budgetPage.indexOf("function CategoryInspector"),
  );
  assert.deepEqual([...columns.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]), [
    "category", "assigned", "activity", "available",
  ]);
});
