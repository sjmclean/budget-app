import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
const styles = readFileSync("apps/web/src/styles/globals.css", "utf8");

assert(
  budgetPage.includes('className="budget-sticky-working-header"'),
  "BudgetPage should wrap month controls, display actions, and column headers in a sticky working header.",
);

const stickyHeaderIndex = budgetPage.indexOf('className="budget-sticky-working-header"');
const topbarIndex = budgetPage.indexOf('className="budget-workspace-topbar"');
const displayBarIndex = budgetPage.indexOf('className="budget-display-bar"');
const tableHeadIndex = budgetPage.indexOf('className="budget-workspace-table-head"');
const tableCardIndex = budgetPage.indexOf('className="budget-workspace-table-card"');

assert(
  stickyHeaderIndex < topbarIndex && topbarIndex < displayBarIndex && displayBarIndex < tableHeadIndex,
  "Sticky working header should contain month controls, display actions, and Budget column header in order.",
);

assert(
  tableHeadIndex < tableCardIndex,
  "Budget column header should live above the scrolling category rows, not inside the table card body.",
);

assert(
  styles.includes(".budget-sticky-working-header") &&
    styles.includes("position: sticky") &&
    styles.includes("top: 0"),
  "Budget sticky working header CSS should pin the working header at the top of the viewport.",
);

assert(
  styles.includes(".budget-sticky-working-header .budget-workspace-table-head"),
  "Budget column header should receive sticky-stack styling when inside the working header.",
);

console.log("v2.35.2 sticky Budget working header checks passed.");
