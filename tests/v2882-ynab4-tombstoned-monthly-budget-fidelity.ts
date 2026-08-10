import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("apps/web/src/features/budget/ynab4/mapYnab4BudgetMonths.ts", "utf8");
const loop = source.indexOf("for (const row of toRecords(monthlyBudget.monthlySubCategoryBudgets))");
assert.ok(loop >= 0, "Expected monthly budget assignment loop");
assert.ok(source.indexOf("if (isYnab4Tombstone(row)) continue;", loop) > loop);
assert.match(source, /import \{ isYnab4Tombstone \} from "\.\/ynab4RecordState";/);

console.log("v2.88.2 YNAB4 tombstoned monthly budget fidelity checks passed");
