import assert from "node:assert/strict";
import { auditYnab4MonthlyBudgetMapping } from "../packages/ynab4-importer/src/auditYnab4MonthlyBudgetMapping.js";

const entries = [
  {
    path: "Household.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1-ABC" }),
  },
  {
    path: "Household.ynab4/data1-ABC/Budget.yfull",
    text: JSON.stringify({
      monthlyBudgets: [
        {
          month: "2026-01",
          incomeForMonth: 500000,
          monthlySubCategoryBudgets: [
            {
              entityId: "cm-1",
              subCategoryId: "cat-food",
              budgeted: 100000,
              activity: -75000,
              available: 25000,
              previousAvailable: 0,
            },
          ],
        },
        {
          month: "2026-02",
          incomeForMonth: 520000,
          monthlySubCategoryBudgets: [
            {
              entityId: "cm-2",
              subCategoryId: "cat-food",
              budgeted: 120000,
              activity: -90000,
              available: 55000,
              previousAvailable: 25000,
            },
          ],
        },
      ],
    }),
  },
];

const audit = auditYnab4MonthlyBudgetMapping(entries);

assert.equal(audit.isYnab4Package, true);
assert.equal(audit.budgetName, "Household");
assert.equal(audit.monthCount, 2);
assert.equal(audit.categoryMonthCount, 2);
assert.equal(audit.earliestMonth, "2026-01");
assert.equal(audit.latestMonth, "2026-02");

const monthItem = audit.items.find((item) => item.ynab4Area === "monthlyBudgets");
assert.ok(monthItem);
assert.equal(monthItem.status, "needs-mapping");
assert.ok(monthItem.sampleFields.includes("incomeForMonth"));

const categoryMonthItem = audit.items.find(
  (item) => item.ynab4Area === "monthlySubCategoryBudgets",
);
assert.ok(categoryMonthItem);
assert.equal(categoryMonthItem.status, "needs-mapping");
assert.ok(categoryMonthItem.sampleFields.includes("budgeted"));
assert.ok(categoryMonthItem.sampleFields.includes("available"));
assert.ok(categoryMonthItem.sampleFields.includes("previousAvailable"));

const carryForwardItem = audit.items.find(
  (item) => item.ynab4Area === "previous-available/carry-forward",
);
assert.ok(carryForwardItem);
assert.equal(carryForwardItem.status, "needs-mapping");

const overspendingItem = audit.items.find(
  (item) => item.ynab4Area === "overspending-and-ready-to-budget",
);
assert.ok(overspendingItem);
assert.equal(overspendingItem.status, "blocked");

console.log("v1.66 monthly budget mapping audit checks passed");
