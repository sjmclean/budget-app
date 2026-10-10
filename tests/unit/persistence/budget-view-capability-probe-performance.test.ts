import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../../apps/web/src/features/persistence/createSqliteBudgetViewService.ts", import.meta.url),
  "utf8",
);

test("SQLite budget views do not probe worker status before every read", () => {
  assert.match(
    source,
    /async function requireBudgetMonths\([\s\S]*if \(!hosted\) throw new Error\(SQLITE_BUDGET_REQUIRED\);[\s\S]*return hosted;/,
  );
  assert.doesNotMatch(source, /requireBudgetMonths[\s\S]{0,500}getBudgetStatus\(/);
});
