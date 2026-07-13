import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importerSource = readFileSync(
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
  "utf8",
);

assert.match(
  importerSource,
  /categoryId:\s*\n\s*splitLines && splitLines\.length > 0\s*\n\s*\? undefined\s*\n\s*: transferAccountId\s*\n\s*\? undefined\s*\n\s*: categoryId \?\? READY_TO_ASSIGN_CATEGORY_ID/,
  "YNAB4 non-split scheduled transactions must retain their resolved category ID.",
);

const serviceSource = readFileSync(
  "apps/web/src/features/accounts/scheduledTransactionService.ts",
  "utf8",
);

assert.match(serviceSource, /categoryId\?: string;/);
assert.match(
  serviceSource,
  /categoryId:\s*transaction\.categoryId/,
  "Scheduled transaction materialisation must copy categoryId into register input.",
);

console.log("v2.94 YNAB4 scheduled category ID fidelity checks passed");
