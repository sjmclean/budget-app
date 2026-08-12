import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSqliteBudgetViewService } from "../apps/web/src/features/persistence/createSqliteBudgetViewService";
import type { AccountRegisterQueryClient } from "../apps/web/src/features/persistence/accountRegisterQueryContracts";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes";

const view: BudgetMonthView = {
  budgetId: "budget",
  budgetName: "Budget",
  monthLabel: "August 2026",
  currencyCode: "AUD",
  readyToAssign: 0,
  carriedForwardReadyToAssign: 0,
  previousOverspending: 0,
  incomeForMonth: 0,
  totalAssigned: 30,
  totalActivity: -30,
  totalAvailable: 50,
  categoryGroups: [{
    id: "group", name: "Group", previousAvailable: 50,
    assigned: 30, activity: -30, available: 50, note: "",
    categories: [
      { id: "source", name: "Source", previousAvailable: 50, assigned: 20, activity: -20, available: 50, isOverspent: false, isArchived: false, overspendingHandling: "reduce-next-month", note: "" },
      { id: "target", name: "Target", previousAvailable: 0, assigned: 10, activity: -10, available: 0, isOverspent: false, isArchived: false, overspendingHandling: "reduce-next-month", note: "" },
    ],
  }],
};

const assignmentWrites: unknown[] = [];
const hosted = {
  async getBudgetStatus() {
    return { capabilities: { budgetMonths: true } };
  },
  async getBudgetMonthView() { return view; },
  async setCategoryAssignedValues(input: unknown) {
    assignmentWrites.push(input);
    return view;
  },
  async getBudgetCategoryOptions() { return []; },
} as unknown as AccountRegisterQueryClient;

const service = createSqliteBudgetViewService(hosted);
assert.equal(await service.getBudgetMonthView({ budgetId: "budget", month: "2026-08" }), view);
await service.coverOverspending({
  budgetId: "budget", month: "2026-08",
  coveringCategoryId: "source", overspentCategoryId: "target", amount: 25,
});
assert.deepEqual(assignmentWrites, [{
  budgetId: "budget",
  month: "2026-08",
  assignments: [
    { categoryId: "source", assigned: -5 },
    { categoryId: "target", assigned: 35 },
  ],
}]);

await assert.rejects(
  createSqliteBudgetViewService(undefined).getBudgetMonthView({
    budgetId: "legacy", month: "2026-08",
  }),
  /active local-first SQLite budget generation/,
);

const provider = readFileSync(
  "apps/web/src/features/persistence/createKeyValueBudgetPersistenceProvider.ts",
  "utf8",
);
assert.doesNotMatch(provider, /budgetViewService|createBudgetViewService/);
assert.match(provider, /createSqliteBudgetViewService/);

console.log("Milestone 4 Phase 3 SQLite-only Budget service contracts passed.");
