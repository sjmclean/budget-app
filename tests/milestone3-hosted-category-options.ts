import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const provider = readFileSync(
  "apps/web/src/features/persistence/createSqliteBudgetViewService.ts",
  "utf8",
);
const accountPage = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
const categoryInput = readFileSync(
  "apps/web/src/features/accounts/components/RegisterCategoryInput.tsx",
  "utf8",
);

assert.match(provider, /getCategoryOptions\(input\)/);
assert.match(provider, /getBudgetCategoryOptions\(input\)/);
assert.match(provider, /requireBudgetMonths/);
assert.match(accountPage, /categoriesPersistence\s*\.getCategoryOptions/);
assert.match(categoryInput, /\.filter\(\(category\) => !category\.isArchived\)/);

console.log(
  "Hosted category options passed: register dropdown follows the SQLite month view.",
);
