import { readFileSync } from "node:fs";
import { join } from "node:path";

const budgetPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/BudgetPage.tsx"),
  "utf8",
);

const webPackageJson = readFileSync(
  join(process.cwd(), "apps/web/package.json"),
  "utf8",
);

function expectContains(source: string, value: string): void {
  if (!source.includes(value)) {
    throw new Error(`Missing expected text: ${value}`);
  }
}

expectContains(webPackageJson, "@dnd-kit/core");
expectContains(webPackageJson, "@dnd-kit/sortable");
expectContains(webPackageJson, "@dnd-kit/utilities");

expectContains(budgetPage, "DndContext");
expectContains(budgetPage, "SortableContext");
expectContains(budgetPage, "useSortable");
expectContains(budgetPage, "verticalListSortingStrategy");

console.log("v2.37.0 budget dnd-kit checks passed");
