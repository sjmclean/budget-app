import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const main = read("apps/web/src/main.tsx");
const registerPage = read("apps/web/src/pages/AccountRegisterPage.tsx");
const importDialog = read("apps/web/src/pages/budgetSelector/BudgetImportDialog.tsx");
const coverMenu = read("apps/web/src/features/budget/BudgetCoverOverspendingMenu.tsx");

for (const stylesheet of [
  "register.css",
  "budgetImportUx.css",
  "budgetCoverOverspending.css",
]) {
  assert(
    !main.includes(stylesheet),
    `${stylesheet} must not be eagerly imported from main.tsx`,
  );
}

assert(
  registerPage.includes('import "../styles/register.css"'),
  "Account Register route must own register.css",
);
assert(
  importDialog.includes('import "../../styles/budgetImportUx.css"'),
  "Budget Import workflow must own budgetImportUx.css",
);
assert(
  coverMenu.includes('import "../../styles/budgetCoverOverspending.css"'),
  "Budget overspending menu must own its feature stylesheet",
);
assert(
  main.includes('import "./styles/globals.css"') &&
    main.includes('import "./styles/topBarUndoRedo.css"'),
  "shared shell styles must remain eager",
);

console.log("v3.03 route-specific CSS loading regression tests passed.");
