import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
const budgetGroup = readFileSync("apps/web/src/features/budget/BudgetWorkspaceGroup.tsx", "utf8");
const resizeHandle = readFileSync("apps/web/src/features/tableLayout/ColumnResizeHandle.tsx", "utf8");
const styles = readFileSync("apps/web/src/styles/globals.css", "utf8");

assert(
  budgetPage.includes("BUDGET_COLLAPSED_GROUPS_STORAGE_KEY_PREFIX") &&
    budgetPage.includes("writeCollapsedBudgetGroupIds"),
  "Budget group collapse state must be persisted per budget",
);
assert(
  budgetPage.includes("isCollapsed={collapsedGroupIds.has(group.id)}") &&
    budgetPage.includes("onToggleCollapsed={() => toggleBudgetGroup(group.id)}"),
  "Budget groups must receive persisted collapse state and toggle behavior",
);
assert(
  budgetGroup.includes('className="budget-group-collapse-button"') &&
    budgetGroup.includes("aria-expanded={!isCollapsed}"),
  "Budget group collapse control must be an accessible independent button",
);
assert(
  budgetGroup.includes("!isCollapsed") && budgetGroup.includes("group.categories.map"),
  "Collapsed Budget groups must omit category rows",
);
assert(
  resizeHandle.includes("table-layout-column-resize-indicator") &&
    resizeHandle.includes("↔"),
  "Column resize handles must use the Option D double-arrow indicator",
);
assert(
  styles.includes("high-contrast hover boundary") &&
    styles.includes(".table-layout-column-resize-handle::before") &&
    styles.includes(".table-layout-resizable-head-cell:hover .table-layout-column-resize-indicator"),
  "Column resizing must expose a high-contrast hover line and indicator",
);
assert(
  !resizeHandle.includes("table-layout-column-resize-grip"),
  "The old pill grip marker must be removed",
);

console.log("v3.04 Budget collapse and resize marker regression checks passed.");
