import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
const packageJson = readFileSync("package.json", "utf8");

assert(packageJson.includes('"test:v214"'), "package.json should include test:v214");
assert(
  packageJson.includes('"test:v214:category-details-panel"'),
  "package.json should include test:v214:category-details-panel",
);

assert(
  budgetPage.includes("Category Details"),
  "Inspector should be renamed to Category Details",
);

assert(
  budgetPage.includes("Manage Category"),
  "Category details panel should expose a Manage Category entry point",
);

assert(
  !budgetPage.includes("<h2>Inspector</h2>"),
  "Old Inspector heading should be removed",
);

console.log("v2.14 category details panel regression checks passed");
