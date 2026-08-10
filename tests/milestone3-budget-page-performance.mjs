import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const budgetPage = await readFile(
  new URL("../apps/web/src/pages/BudgetPage.tsx", import.meta.url),
  "utf8",
);
const budgetView = await readFile(
  new URL("../apps/web/src/features/budget/useBudgetView.ts", import.meta.url),
  "utf8",
);
const sidebar = await readFile(
  new URL("../apps/web/src/layouts/Sidebar.tsx", import.meta.url),
  "utf8",
);

assert.match(budgetView, /readonly enabled\?: boolean/);
assert.doesNotMatch(
  budgetPage,
  /needsPreviousMonthFallback|previousMonthBudget/,
  "The Budget page must not reconstruct engine values from a neighbouring month.",
);
assert.match(budgetPage, /readAuthoritativeBudgetSummary\(data\)/);
assert.match(sidebar, /prefetchBudgetMonthView/);
console.log("Milestone 3 Budget page performance contracts passed.");
