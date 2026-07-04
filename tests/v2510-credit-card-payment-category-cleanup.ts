import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function testPaymentCategoryHelpersAreExtracted() {
  const helperSource = readFileSync(
    "apps/web/src/features/budget/creditCardPaymentCategories.ts",
    "utf8",
  );

  assert.match(
    helperSource,
    /export const CREDIT_CARD_PAYMENT_GROUP_ID = "credit-card-payments"/,
    "Credit-card payment group id should have a single shared definition",
  );
  assert.match(
    helperSource,
    /export const CREDIT_CARD_PAYMENT_GROUP_NAME = "Credit Card Payments"/,
    "Credit-card payment group name should have a single shared definition",
  );
  assert.match(
    helperSource,
    /export function getCreditCardPaymentCategoryId/,
    "Payment category id generation should be shared",
  );
  assert.match(
    helperSource,
    /export function isCreditCardPaymentGroup/,
    "Payment group detection should be shared",
  );
  assert.match(
    helperSource,
    /export function isCreditCardPaymentCategory/,
    "Payment category detection should be shared",
  );
  assert.match(
    helperSource,
    /name: accountName/,
    "Payment category display names should use the account name inside the Credit Card Payments group",
  );
}

function testBudgetViewAndBudgetPageUseSharedHelpers() {
  const budgetViewService = readFileSync(
    "apps/web/src/features/budget/budgetViewService.ts",
    "utf8",
  );
  const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");

  assert.match(
    budgetViewService,
    /from "\.\/creditCardPaymentCategories"/,
    "Budget view service should use shared credit-card payment category helpers",
  );
  assert.match(
    budgetViewService,
    /getCreditCardPaymentCategoryId/,
    "Budget activity should use the shared payment category id helper",
  );
  assert.doesNotMatch(
    budgetViewService,
    /credit-card-payment-\$\{accountId\}/,
    "Budget view service should not duplicate payment category id construction",
  );
  assert.match(
    budgetPage,
    /from "\.\.\/features\/budget\/creditCardPaymentCategories"/,
    "Budget page should use shared credit-card payment category helpers",
  );
  assert.match(
    budgetPage,
    /isCreditCardPaymentCategory/,
    "Budget page should protect managed payment categories through the shared helper",
  );
  assert.match(
    budgetPage,
    /isCreditCardPaymentGroup/,
    "Budget page should protect the managed payment group through the shared helper",
  );
}

function testReleaseWiring() {
  const packageJson = readFileSync("package.json", "utf8");

  assert.match(
    packageJson,
    /test:v2510/,
    "Release scripts should include v2.51.0 cleanup checks",
  );
}

function run() {
  testPaymentCategoryHelpersAreExtracted();
  testBudgetViewAndBudgetPageUseSharedHelpers();
  testReleaseWiring();
  console.log("v2.51.0 credit card payment category cleanup checks passed");
}

run();
