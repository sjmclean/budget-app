import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function testAddAccountModalShowsFirstCreditCardBehaviourChoice() {
  const source = readFileSync("apps/web/src/components/accounts/AddAccountModal.tsx", "utf8");

  assert.match(
    source,
    /shouldAskCreditCardBehaviour\?: boolean/,
    "Add account modal should accept a first-credit-card behaviour prompt flag",
  );
  assert.match(
    source,
    /onCreditCardBehaviourSelected\?: \(behaviour: CreditCardBehaviour\) => void/,
    "Add account modal should report the selected credit-card behaviour",
  );
  assert.match(
    source,
    /type === "credit-card" && shouldAskCreditCardBehaviour/,
    "Credit-card behaviour choice should only appear when creating the first credit card",
  );
  assert.match(
    source,
    /This is the first credit card in this budget\./,
    "First credit-card setup copy should explain why the choice is being shown",
  );
  assert.match(
    source,
    /Treat credit cards like normal accounts/,
    "Normal account behaviour should be presented in user-facing language",
  );
  assert.match(
    source,
    /Reserve money for credit card payments/,
    "Payment-funding behaviour should be presented in user-facing language",
  );
  assert.match(
    source,
    /ⓘ What's the difference\?/,
    "The dialog should offer a compact explanation rather than a long warning",
  );
}

function testCreditCardBehaviourIsPersistedBeforeAccountCreation() {
  const source = readFileSync("apps/web/src/components/accounts/AddAccountModal.tsx", "utf8");

  const behaviourCallbackIndex = source.indexOf("onCreditCardBehaviourSelected?.(creditCardBehaviour)");
  const accountCreateIndex = source.indexOf("onCreate({");

  assert.ok(behaviourCallbackIndex > -1, "Selected credit-card behaviour should be emitted on submit");
  assert.ok(accountCreateIndex > -1, "Account creation should still be performed by the modal");
  assert.ok(
    behaviourCallbackIndex < accountCreateIndex,
    "Budget-level credit-card behaviour should be saved before the first credit-card account is created",
  );
}

function testSidebarStoresBudgetWideCreditCardBehaviour() {
  const source = readFileSync("apps/web/src/layouts/Sidebar.tsx", "utf8");

  assert.match(
    source,
    /const creditCards = activeAccounts\.filter\(\(account\) => account\.type === "credit-card"\)/,
    "Sidebar should identify existing credit-card accounts for the first-card decision",
  );
  assert.match(
    source,
    /function chooseCreditCardBehaviour\(behaviour: CreditCardBehaviour\)/,
    "Sidebar should own the budget-level preference update callback",
  );
  assert.match(
    source,
    /updateBudget\(activeBudgetId, \{\s*preferences: \{\s*creditCardBehaviour: behaviour,\s*\},\s*\}\)/s,
    "Selected credit-card behaviour should be persisted as a budget preference",
  );
  assert.match(
    source,
    /shouldAskCreditCardBehaviour=\{creditCards\.length === 0\}/,
    "The first-card prompt should not appear after a credit-card account already exists",
  );
  assert.match(
    source,
    /onCreditCardBehaviourSelected=\{chooseCreditCardBehaviour\}/,
    "Sidebar should wire the modal selection back into the budget registry store",
  );
}

function testReleaseWiring() {
  const packageJson = readFileSync("package.json", "utf8");
  const styles = readFileSync("apps/web/src/styles/globals.css", "utf8");

  assert.match(packageJson, /test:v2501:first-credit-card-experience/, "Release scripts should include v2.50.1 checks");
  assert.match(styles, /credit-card-behaviour-panel/, "Credit-card behaviour panel should have styling");
  assert.match(styles, /credit-card-behaviour-explanation/, "Credit-card explanation should have styling");
}

function run() {
  testAddAccountModalShowsFirstCreditCardBehaviourChoice();
  testCreditCardBehaviourIsPersistedBeforeAccountCreation();
  testSidebarStoresBudgetWideCreditCardBehaviour();
  testReleaseWiring();
  console.log("v2.50.1 first credit card experience checks passed");
}

run();
