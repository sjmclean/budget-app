import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

function testImportInputsAcceptCreditCardBehaviour() {
  const actualImport = readSource("apps/web/src/features/budget/actualBudgetLauncherImport.ts");
  const ynab4Import = readSource("apps/web/src/features/budget/ynab4LauncherImport.ts");

  assert.match(
    actualImport,
    /creditCardBehaviour\?: CreditCardBehaviour;/,
    "Actual Budget import input should accept a credit-card behaviour override",
  );
  assert.match(
    actualImport,
    /preferences:\s*input\.creditCardBehaviour\s*\?\s*\{ creditCardBehaviour: input\.creditCardBehaviour \}/s,
    "Actual Budget import should persist the selected credit-card behaviour on the imported budget",
  );

  assert.match(
    ynab4Import,
    /creditCardBehaviour\?: CreditCardBehaviour;/,
    "YNAB4 import input should accept a credit-card behaviour override",
  );
  assert.match(
    ynab4Import,
    /preferences:\s*input\.creditCardBehaviour\s*\?\s*\{ creditCardBehaviour: input\.creditCardBehaviour \}/s,
    "YNAB4 import should persist the selected credit-card behaviour on the imported budget",
  );
}

function testImportDialogPromptsOnlyWhenCreditCardsAreDetected() {
  const dialog = readSource("apps/web/src/pages/budgetSelector/BudgetImportDialog.tsx");

  assert.match(
    dialog,
    /interface PendingCreditCardBehaviourImport/s,
    "Budget import dialog should model a pending credit-card behaviour decision",
  );
  assert.match(
    dialog,
    /actualPreviewContainsCreditCards\(preview\)/,
    "Actual Budget import should check whether the detected budget contains credit cards",
  );
  assert.match(
    dialog,
    /ynab4EntriesContainCreditCards\(entries\)/,
    "YNAB4 import should check whether the detected package contains credit cards",
  );
  assert.match(
    dialog,
    /setPendingCreditCardImport\(\{[\s\S]*creditCardBehaviour: "normal"[\s\S]*continueImport:/,
    "Credit-card imports should pause for an explicit budget-wide behaviour decision",
  );
  assert.match(
    dialog,
    /name="budget-import-credit-card-behaviour"/,
    "The import decision should render a dedicated credit-card behaviour radio group",
  );
  assert.match(
    dialog,
    /Treat credit cards like normal accounts/,
    "Import UI should offer normal account behaviour in plain language",
  );
  assert.match(
    dialog,
    /Reserve money for credit card payments/,
    "Import UI should offer payment funding behaviour in plain language",
  );
}

function testImportDialogPassesSelectedBehaviourToImportServices() {
  const dialog = readSource("apps/web/src/pages/budgetSelector/BudgetImportDialog.tsx");

  assert.match(
    dialog,
    /importDetectedActualBudget\(preview, file\.name, behaviour\)/,
    "Actual Budget import should continue with the selected credit-card behaviour",
  );
  assert.match(
    dialog,
    /importYnab4PackagePreview\(\{[\s\S]*creditCardBehaviour: behaviour[\s\S]*\}\)/,
    "YNAB4 import should continue with the selected credit-card behaviour",
  );
  assert.match(
    dialog,
    /creditCardBehaviour,\s*\}\);/,
    "Actual Budget import service call should receive the selected behaviour",
  );
}

function run() {
  testImportInputsAcceptCreditCardBehaviour();
  testImportDialogPromptsOnlyWhenCreditCardsAreDetected();
  testImportDialogPassesSelectedBehaviourToImportServices();
  console.log("v2.50.5 credit-card import integration checks passed");
}

run();
