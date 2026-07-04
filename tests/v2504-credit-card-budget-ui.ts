import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function testPaymentCategoryNaming() {
  const serviceSource = readFileSync("apps/web/src/features/budget/creditCardPaymentCategories.ts", "utf8");

  assert.match(
    serviceSource,
    /name: accountName,/,
    "Credit-card payment categories should use the account name because the group already provides payment context",
  );
}

function testBudgetPageRecognisesPaymentCategories() {
  const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");

  assert.match(
    budgetPage,
    /isCreditCardPaymentGroup/,
    "Budget UI should identify the generated credit-card payment group through the shared helper",
  );
  assert.match(
    budgetPage,
    /isCreditCardPaymentCategory/,
    "Budget UI should identify generated credit-card payment categories through the shared helper",
  );
  assert.match(
    budgetPage,
    /Money reserved for card payments/,
    "Credit-card payment group should explain its purpose in plain language",
  );
  assert.match(
    budgetPage,
    /category-system-badge/,
    "Generated payment categories should be labelled as managed categories",
  );
  assert.match(
    budgetPage,
    /cannot be renamed or archived/,
    "Inspector should explain that generated payment categories are protected",
  );
}

function testBudgetPageProtectsPaymentCategories() {
  const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");

  assert.match(
    budgetPage,
    /disabled: isCreditCardPaymentCategory/,
    "Credit-card payment categories should not be draggable",
  );
  assert.match(
    budgetPage,
    /disabled: isCreditCardPaymentGroup/,
    "Credit-card payment groups should not be draggable",
  );
  assert.match(
    budgetPage,
    /if \(isCreditCardPaymentCategory\(categoryId\)\) {\n\s+selectCategory\(categoryId\);\n\s+return;\n\s+}/,
    "Opening the category editor should be blocked for managed payment categories",
  );
  assert.match(
    budgetPage,
    /isCreditCardPaymentCategory \? \(/,
    "Inspector should replace category-management actions for managed payment categories",
  );
}

function testReleaseScript() {
  const packageJson = readFileSync("package.json", "utf8");

  assert.match(
    packageJson,
    /test:v2504:credit-card-budget-ui/,
    "Release scripts should include v2.50.4 checks",
  );
}

function run() {
  testPaymentCategoryNaming();
  testBudgetPageRecognisesPaymentCategories();
  testBudgetPageProtectsPaymentCategories();
  testReleaseScript();
  console.log("v2.50.4 credit card budget UI checks passed");
}

run();
