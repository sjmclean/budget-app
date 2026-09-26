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

test("next month outlook uses neutral presentation unless the outlook is negative", () => {
  assert.match(
    budgetPageSource,
    /const statusClass = outlook\?\.status === "overbudget"[\s\S]*budget-next-month-outlook-overbudget[\s\S]*budget-next-month-outlook-neutral/,
  );
  assert.doesNotMatch(
    budgetPageSource,
    /budget-next-month-outlook-\$\{outlook\.status\}/,
  );
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

test("Budget page presents Ready to Assign and income as month-scoped values", () => {
  assert.match(budgetPageSource, /className="budget-ready-summary-primary"/);
  assert.match(budgetPageSource, /className="budget-ready-summary-breakdown"/);
  assert.match(budgetPageSource, /Ready to Assign in \{monthName\}/);
  assert.match(budgetPageSource, />Carried forward</);
  assert.match(budgetPageSource, />Previous overspending</);
  assert.match(budgetPageSource, /Income for \{monthName\}/);
  assert.match(budgetPageSource, /Assigned in \{monthName\}/);
  assert.match(
    budgetPageSource,
    /budget-next-month-outlook-breakdown[\s\S]*Income for \{monthName\}[\s\S]*summary\.incomeForMonth[\s\S]*Assigned in \{monthName\}[\s\S]*data\.totalAssigned/,
  );
  assert.match(budgetPageSource, /Balanced/);
  assert.match(budgetPageSource, /overbudget/);
  assert.match(budgetPageSource, /available/);
});


test("Budget page keeps the adaptive one-to-four month planning view", () => {
  assert.match(
    budgetPageSource,
    /\{\[1, 2, 3, 4\]\.map\(\(count\) =>/,
  );
  assert.match(
    budgetPageSource,
    /if \(workspaceWidth >= 1960\) return 4;[\s\S]*if \(workspaceWidth >= 1470\) return 3;[\s\S]*if \(workspaceWidth >= 975\) return 2;/,
  );
});


test("future month panes write assignments through their own month workspace", () => {
  assert.match(
    budgetPageSource,
    /function BudgetFutureMonthPane[\s\S]*useBudgetWorkspace\(budgetId, month\)[\s\S]*updateAssigned=\{workspace\.updateAssigned\}/,
  );
});


test("Budget summary preserves the authoritative monthly Ready to Assign equation", () => {
  assert.match(
    budgetPageSource,
    /Carried forward[\s\S]*Previous overspending[\s\S]*Income for \{monthName\}[\s\S]*Assigned in \{monthName\}/,
  );
  assert.match(
    budgetPageSource,
    /Assigned in \{monthName\}[\s\S]*formatMoney\(-data\.totalAssigned, data\.currencyCode\)/,
  );
});


test("Budget status copy follows the selected month instead of assuming the present month", () => {
  assert.doesNotMatch(budgetPageSource, /Based on your current budget/);
  assert.match(budgetPageSource, /Based on \$\{monthName\}'s budget/);
  assert.doesNotMatch(budgetPageSource, /: "this month"\}/);
  assert.match(budgetPageSource, /: monthLabel\}/);
});
