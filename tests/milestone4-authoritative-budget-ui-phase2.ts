import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAuthoritativeBudgetSummary } from "../apps/web/src/features/budget/authoritativeBudgetSummary";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes";

const complete = {
  budgetId: "budget",
  budgetName: "Budget",
  monthLabel: "August 2026",
  currencyCode: "AUD",
  readyToAssign: -100,
  carriedForwardReadyToAssign: 500,
  previousOverspending: -200,
  incomeForMonth: 100,
  totalAssigned: 500,
  totalActivity: 0,
  totalAvailable: 0,
  categoryGroups: [],
} satisfies BudgetMonthView;

assert.deepEqual(readAuthoritativeBudgetSummary(complete), {
  carriedForwardReadyToAssign: 500,
  previousOverspending: -200,
  incomeForMonth: 100,
});
assert.equal(
  readAuthoritativeBudgetSummary({ ...complete, previousOverspending: undefined }),
  null,
);

const workspace = readFileSync(
  "apps/web/src/features/budget/useBudgetWorkspace.ts",
  "utf8",
);
assert.doesNotMatch(workspace, /applyCategoryAssignedValues/);
assert.match(workspace, /previewCategoryAssignment/);

const assignmentPreview = readFileSync(
  "apps/web/src/features/budget/budgetAssignmentPreview.ts",
  "utf8",
);
assert.match(assignmentPreview, /presentation-only preview/);
assert.match(assignmentPreview, /SQLite budget engine remains authoritative/);
assert.doesNotMatch(
  assignmentPreview,
  /carriedForwardReadyToAssign|previousOverspending|incomeForMonth|rolloverSourceMonth/,
);

console.log("Milestone 4 Phase 2 authoritative Budget UI contracts passed.");
