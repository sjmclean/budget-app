import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const budgetPage = readFileSync(
  "apps/web/src/pages/BudgetPage.tsx",
  "utf8",
);

const packageJson = readFileSync("package.json", "utf8");

assert(
  packageJson.includes('"test:v213"'),
  "package.json should include test:v213",
);

assert(
  packageJson.includes('"test:v213:budget-ux-cleanup"'),
  "package.json should include test:v213:budget-ux-cleanup",
);

// Search UI removed
assert(
  !budgetPage.includes("Search categories"),
  "Budget search UI should be removed",
);

// Dead filter buttons removed
assert(
  !budgetPage.includes("Needs Money"),
  "Needs Money filter should be removed",
);

assert(
  !budgetPage.includes("Money Available"),
  "Money Available filter should be removed",
);

assert(
  !budgetPage.includes("Overspent"),
  "Overspent filter should be removed",
);

// Archive visibility remains
assert(
  budgetPage.includes("Show archived") ||
    budgetPage.includes("Archived"),
  "Archived visibility control should remain",
);

console.log("v2.13 budget UX cleanup regression checks passed");