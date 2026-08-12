import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importerSource = readFileSync(
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
  "utf8",
);

assert.match(
  importerSource,
  /categoryId: isTrackingAccount \|\| \(splitLines && splitLines\.length > 0\)[\s\S]*\? undefined[\s\S]*: transferAccountId && !isCategorisedOffBudgetTransfer[\s\S]*\? undefined[\s\S]*: categoryId \?\? undefined/,
);

const typesSource = readFileSync(
  "apps/web/src/features/accounts/scheduledTransactionTypes.ts",
  "utf8",
);

assert.match(typesSource, /categoryId\?: string;/);

const conversionSource = readFileSync(
  "apps/web/src/features/accounts/scheduledTransactionToRegisterInput.ts",
  "utf8",
);

assert.match(
  conversionSource,
  /categoryId:\s*transaction\.categoryId/,
);

console.log("v2.94 YNAB4 scheduled category ID fidelity checks passed");
