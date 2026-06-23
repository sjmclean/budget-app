import assert from "node:assert/strict";
import { proveYnab4MonthlyBudgetMapping } from "../packages/ynab4-importer/src/proveYnab4MonthlyBudgetMapping.js";

function createPackageEntries() {
  return [
    {
      path: "Household.ynab4/Budget.ymeta",
      text: JSON.stringify({ relativeDataFolderName: "data1-AAAA" }),
    },
    {
      path: "Household.ynab4/data1-AAAA/budget-guid/Budget.yfull",
      text: JSON.stringify({
        monthlyBudgets: [
          {
            entityType: "monthlyBudget",
            entityId: "MB/2026-01",
            month: "2026-01-01",
            monthlySubCategoryBudgets: [
              {
                entityType: "monthlyCategoryBudget",
                entityId: "MCB/2026-01/cat-food",
                parentMonthlyBudgetId: "MB/2026-01",
                categoryId: "cat-food",
                budgeted: 125.55,
                overspendingHandling: null,
              },
              {
                entityType: "monthlyCategoryBudget",
                entityId: "MCB/2026-01/cat-fuel",
                parentMonthlyBudgetId: "MB/2026-01",
                categoryId: "cat-fuel",
                budgeted: "40.20",
                overspendingHandling: "affectBuffer",
              },
            ],
          },
          {
            entityType: "monthlyBudget",
            entityId: "MB/2026-02",
            month: "2026-02-01",
            monthlySubCategoryBudgets: [
              {
                entityType: "monthlyCategoryBudget",
                entityId: "MCB/2026-02/cat-food",
                parentMonthlyBudgetId: "MB/2026-02",
                categoryId: "cat-food",
                budgeted: 200,
                overspendingHandling: null,
              },
            ],
          },
        ],
      }),
    },
  ];
}

const proof = proveYnab4MonthlyBudgetMapping(createPackageEntries());

assert.equal(proof.isYnab4Package, true);
assert.equal(proof.budgetName, "Household");
assert.equal(proof.monthCount, 2);
assert.equal(proof.categoryMonthCount, 3);
assert.equal(proof.earliestMonth, "2026-01");
assert.equal(proof.latestMonth, "2026-02");

assert.deepEqual(proof.totals.assignedByMonth, [
  { appMonth: "2026-01", assigned: 16575, categoryRowCount: 2 },
  { appMonth: "2026-02", assigned: 20000, categoryRowCount: 1 },
]);
assert.equal(proof.totals.rowsWithBudgeted, 3);
assert.equal(proof.totals.rowsMissingBudgeted, 0);
assert.equal(proof.totals.rowsWithOverspendingHandling, 1);

const january = proof.budgetMonthProofs[0];
assert.equal(january.ynab4Month, "2026-01-01");
assert.equal(january.appMonth, "2026-01");
assert.equal(january.mapping.month, "proved");
assert.equal(january.mapping.assigned, "derived");
assert.equal(january.mapping.activity, "derived");
assert.equal(january.mapping.readyToBudget, "blocked");

const firstCategory = proof.categoryMonthProofSample[0];
assert.equal(firstCategory.ynab4CategoryId, "cat-food");
assert.equal(firstCategory.appMonth, "2026-01");
assert.equal(firstCategory.assigned, 12555);
assert.equal(firstCategory.mapping.categoryId, "proved");
assert.equal(firstCategory.mapping.assigned, "proved");
assert.equal(firstCategory.mapping.activity, "derived");
assert.equal(firstCategory.mapping.available, "validation-only");

assert.ok(
  proof.blockers.some((blocker) => blocker.includes("Income for Month / Income for Next Month")),
);
assert.ok(
  proof.blockers.some((blocker) => blocker.includes("overspendingHandling")),
);

console.log("v1.67 monthly budget mapping proof passed");
