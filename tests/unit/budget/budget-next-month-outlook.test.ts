import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveBudgetNextMonthOutlook } from "../../../apps/web/src/features/budget/budgetNextMonthOutlook";

const budgetPageSource = readFileSync(
  new URL("../../../apps/web/src/pages/BudgetPage.tsx", import.meta.url),
  "utf8",
);

test("next month outlook classifies authoritative Ready to Assign states", () => {
  assert.deepEqual(resolveBudgetNextMonthOutlook(-1245), {
    status: "overbudget",
    amount: 1245,
  });
  assert.deepEqual(resolveBudgetNextMonthOutlook(0), {
    status: "balanced",
    amount: 0,
  });
  assert.deepEqual(resolveBudgetNextMonthOutlook(820), {
    status: "available",
    amount: 820,
  });
});

test("Budget page reads the adjacent month through the existing Budget view query", () => {
  assert.match(
    budgetPageSource,
    /const nextMonth = getNextBudgetMonth\(selectedMonth\);[\s\S]*const nextMonthBudget = useBudgetView\(budgetId, nextMonth\);/,
  );
  assert.match(
    budgetPageSource,
    /<BudgetNextMonthOutlook[\s\S]*data=\{nextMonthBudget\.data\}[\s\S]*onOpen=\{\(\) => setSelectedMonth\(nextMonth\)\}/,
  );
});

test("Budget page preserves the current-month breakdown and compact next-month summary", () => {
  assert.match(budgetPageSource, /className="budget-ready-summary-primary"/);
  assert.match(budgetPageSource, /className="budget-ready-summary-breakdown"/);
  assert.match(budgetPageSource, />Carried forward</);
  assert.match(budgetPageSource, />Previous overspending</);
  assert.match(budgetPageSource, /Income for \{monthName\}/);
  assert.match(budgetPageSource, /Assigned in \{monthName\}/);
  assert.match(
    budgetPageSource,
    /budget-next-month-outlook-assigned[\s\S]*Assigned in \{monthName\}[\s\S]*data\.totalAssigned/,
  );
  assert.match(budgetPageSource, /Balanced/);
  assert.match(budgetPageSource, /overbudget/);
  assert.match(budgetPageSource, /available/);
});
