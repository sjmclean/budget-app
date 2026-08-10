import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync("apps/web/src/features/persistence/localFirst/localBudget.worker.ts", "utf8");
assert.match(worker, /parseRegisterAmountSearchCents/);
assert.match(worker, /ABS\(transaction_row\.amount\) = \?/);
assert.match(worker, /configuredScopeColumns\.filter/);

console.log("Milestone 4 SQLite register amount-search contracts passed: exact minor-unit predicate is used for numeric queries.");
