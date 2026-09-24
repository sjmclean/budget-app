import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const budgetPageSource = readFileSync(
  new URL("../../../apps/web/src/pages/BudgetPage.tsx", import.meta.url),
  "utf8",
);

test("Budget category creation remains available from the Category heading", () => {
  assert.equal(
    (budgetPageSource.match(/aria-label="Add category"/g) ?? []).length,
    1,
  );
  assert.match(
    budgetPageSource,
    /column\.id === "category"[\s\S]*onClick=\{\(\) => void handleCreateCategory\(\)\}[\s\S]*aria-label="Add category"/,
  );
  assert.match(
    budgetPageSource,
    /candidate\.id !== ARCHIVED_CATEGORIES_GROUP_ID[\s\S]*!isCreditCardPaymentGroup\(candidate\.id\)/,
  );
  assert.match(
    budgetPageSource,
    /title: "New category"[\s\S]*message: \`Enter a category name for \$\{group\.name\}\.\`[\s\S]*confirmLabel: "Create category"[\s\S]*placeholder: "Category name"/,
  );
  assert.match(
    budgetPageSource,
    /const name = \([\s\S]*promptDialog[\s\S]*\)\?\.trim\(\);[\s\S]*if \(!name\) return;[\s\S]*await createCategory\(\{[\s\S]*name,[\s\S]*groupId: group\.id,[\s\S]*groupName: group\.name/,
  );
});

test("Budget planning toolbar exposes compact accessible history controls only", () => {
  assert.doesNotMatch(budgetPageSource, />\s*\+ Category\s*</);
  assert.doesNotMatch(budgetPageSource, /More ▾/);
  assert.doesNotMatch(budgetPageSource, /Reset column widths/);
  assert.doesNotMatch(budgetPageSource, /<DropdownMenu/);

  assert.match(
    budgetPageSource,
    /onClick=\{\(\) => void applicationHistory\.undo\(\)\}[\s\S]*disabled=\{!applicationHistory\.canUndo\}[\s\S]*aria-label="Undo"[\s\S]*title="Undo"/,
  );
  assert.match(
    budgetPageSource,
    /onClick=\{\(\) => void applicationHistory\.redo\(\)\}[\s\S]*disabled=\{!applicationHistory\.canRedo\}[\s\S]*aria-label="Redo"[\s\S]*title="Redo"/,
  );
  assert.doesNotMatch(budgetPageSource, />\s*Undo\s*</);
  assert.doesNotMatch(budgetPageSource, />\s*Redo\s*</);
});

test("Budget column handles retain per-column reset wiring", () => {
  assert.match(
    budgetPageSource,
    /<ColumnResizeHandle[\s\S]*onResizeStart=\{budgetTableLayout\.startColumnResize\}[\s\S]*onNudgeColumnWidth=\{budgetTableLayout\.nudgeColumnWidth\}[\s\S]*onResetColumnWidth=\{budgetTableLayout\.resetColumnWidth\}/,
  );
});


test("Budget header exposes rolling month navigation with a deliberate year selector", () => {
  assert.match(
    budgetPageSource,
    /const navigationMonths = getBudgetMonthWindow\(selectedMonth\)\.map/,
  );
  assert.match(
    budgetPageSource,
    /className="budget-month-step"[\s\S]*getPreviousBudgetMonth\(currentMonth\)[\s\S]*aria-label="Go to previous budget month"[\s\S]*className="budget-month-step"[\s\S]*getNextBudgetMonth\(currentMonth\)[\s\S]*aria-label="Go to next budget month"/,
  );
  assert.doesNotMatch(
    budgetPageSource,
    /Go to (?:previous|next) budget year|yearMonths\.map|addMonthsToBudgetMonth\(selectedMonth,\s*-?12\)/,
  );
  assert.match(
    budgetPageSource,
    /showYear = value\.endsWith\("-01"\) && year !== selectedYear/,
  );
  assert.match(
    budgetPageSource,
    /<nav className="budget-year-month-navigation"[\s\S]*aria-label="Budget year"[\s\S]*<div className="budget-month-strip">/,
  );
  assert.match(
    budgetPageSource,
    /const firstSelectableYear = Math\.min\(1900, selectedYear\);[\s\S]*const lastSelectableYear = Math\.max\(2100, selectedYear\)/,
  );
  assert.match(
    budgetPageSource,
    /<h1>\{data\.monthLabel\}<\/h1>/,
  );
  assert.doesNotMatch(
    budgetPageSource,
    /budget-planning-title-line/,
  );
  assert.match(
    budgetPageSource,
    /aria-current=\{isSelected \? "date" : undefined\}/,
  );
  assert.match(
    budgetPageSource,
    /<span>Monthly Budget<\/span>/,
  );
});
