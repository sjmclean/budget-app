import { readFileSync } from "node:fs";
import { join } from "node:path";

const budgetPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/BudgetPage.tsx"),
  "utf8",
);
const css = readFileSync(
  join(process.cwd(), "apps/web/src/styles/globals.css"),
  "utf8",
);

function expectContains(source: string, value: string, message: string): void {
  if (!source.includes(value)) {
    throw new Error(`${message}\nMissing: ${value}`);
  }
}

expectContains(
  budgetPage,
  "budget-category-cell budget-category-drag-region",
  "Category cell should be the drag region, not only the grabber.",
);
expectContains(
  budgetPage,
  "budget-group-name-drag-region",
  "Category group name should be draggable.",
);
expectContains(
  budgetPage,
  "setWholeRowDragPreview(event)",
  "Drag should use a whole-row drag preview.",
);
expectContains(
  budgetPage,
  "getDragPreviewSource",
  "Budget page should locate the full row/header for drag preview.",
);
expectContains(
  css,
  ".budget-category-drag-region",
  "Category drag region styling should exist.",
);
expectContains(
  css,
  ".budget-drag-preview",
  "Whole-row drag preview styling should exist.",
);
expectContains(
  css,
  "cursor: grab",
  "Drag regions should communicate grab affordance.",
);

console.log("v2.36.1 budget row drag interaction checks passed");
