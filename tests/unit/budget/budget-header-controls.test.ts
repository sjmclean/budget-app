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
  assert.doesNotMatch(
    budgetPageSource,
    /<span className="sr-only">Budget year<\/span>/,
  );
  assert.match(
    budgetPageSource,
    /const firstSelectableYear = Math\.min\(1900, selectedYear\);[\s\S]*const lastSelectableYear = Math\.max\(2100, selectedYear\)/,
  );
  assert.match(
    budgetPageSource,
    /!isMultiMonthView \? \([\s\S]*<h1>\{data\.monthLabel\}<\/h1>[\s\S]*<span>Monthly Budget<\/span>/,
  );
  assert.doesNotMatch(
    budgetPageSource,
    /\$\{data\.monthLabel\} – \$\{formatBudgetMonthLabel/,
  );
  assert.doesNotMatch(
    budgetPageSource,
    /budget-planning-title-line/,
  );
  assert.match(
    budgetPageSource,
    /aria-current=\{isSelected \? "date" : undefined\}/,
  );
  assert.doesNotMatch(
    budgetPageSource,
    /\$\{visibleMonthCount\}-month planning view/,
  );
});


test("Budget exposes persisted adaptive one-to-four month planning controls", () => {
  assert.match(
    budgetPageSource,
    /\[1, 2, 3, 4\]\.map\(\(count\) =>/,
  );
  assert.match(
    budgetPageSource,
    /className="budget-visible-month-select"[\s\S]*aria-label="Visible budget months"/,
  );
  assert.match(
    budgetPageSource,
    /const visibleMonthCount = Math\.min\([\s\S]*preferredVisibleMonths,[\s\S]*visibleMonthCapacity/,
  );
  assert.match(
    budgetPageSource,
    /buildVisibleBudgetMonths\([\s\S]*selectedMonth,[\s\S]*visibleMonthCount/,
  );
  assert.match(
    budgetPageSource,
    /writePreferredVisibleBudgetMonths\(budgetId, count\)/,
  );
});


test("multi-month Budget uses one compact month-count selector", () => {
  assert.doesNotMatch(budgetPageSource, /BudgetMonthCountIcon/);
  assert.doesNotMatch(budgetPageSource, /budget-visible-month-button/);
  assert.match(
    budgetPageSource,
    /<select[\s\S]*className="budget-visible-month-select"[\s\S]*value=\{visibleCount\}[\s\S]*disabled=\{count > capacity\}/,
  );
});


test("Budget hides the month selector when only one month fits", () => {
  assert.match(
    budgetPageSource,
    /visibleMonthCapacity > 1 \? \([\s\S]*<BudgetVisibleMonthToggle/,
  );
});


test("multi-month Budget synchronizes visible month table scrolling", () => {
  assert.match(
    budgetPageSource,
    /function syncVisibleMonthTableScroll\(event: UIEvent<HTMLDivElement>\)[\s\S]*budget-workspace-table-card[\s\S]*table\.scrollTop = source\.scrollTop/,
  );
  assert.match(
    budgetPageSource,
    /className="budget-multi-month-grid"[\s\S]*onScrollCapture=\{syncVisibleMonthTableScroll\}/,
  );
});


test("multi-month Budget marks the actual current calendar month", () => {
  assert.match(
    budgetPageSource,
    /budget-multi-month-pane-heading[\s\S]*<h2>\{data\.monthLabel\}<\/h2>[\s\S]*Monthly Budget/,
  );
  assert.match(
    budgetPageSource,
    /isCurrentMonth \? \([\s\S]*budget-current-month-badge[\s\S]*Current month/,
  );
  assert.match(
    budgetPageSource,
    /const currentBudgetMonth = getCurrentBudgetMonth\(\)/,
  );
  assert.match(
    budgetPageSource,
    /<BudgetMultiMonthPane[\s\S]*month=\{selectedMonth\}[\s\S]*isCurrentMonth=\{selectedMonth === currentBudgetMonth\}/,
  );
  assert.match(
    budgetPageSource,
    /<BudgetFutureMonthPane[\s\S]*isCurrentMonth=\{month === currentBudgetMonth\}/,
  );
  assert.doesNotMatch(budgetPageSource, /Active month/);
});

test("month count control lives with month navigation rather than the redundant multi-month title", () => {
  assert.match(
    budgetPageSource,
    /<nav className="budget-year-month-navigation"[\s\S]*<BudgetVisibleMonthToggle/,
  );
  assert.match(
    budgetPageSource,
    /!isMultiMonthView \? \([\s\S]*className="budget-planning-title"/,
  );
});

test("Budget Health identifies the active inspector month in its header", () => {
  assert.match(
    budgetPageSource,
    /budget-health-card-header[\s\S]*budget-health-month-badge[\s\S]*\{monthLabel\}/,
  );
});
