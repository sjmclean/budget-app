import assert from "node:assert/strict";
import fs from "node:fs";

const registry = fs.readFileSync("apps/web/src/features/budget/budgetRegistry.ts", "utf8");
const lifecycle = fs.readFileSync("apps/web/src/features/budget/budgetLifecycle.ts", "utf8");

assert.match(registry, /crypto\?\.randomUUID|crypto\.randomUUID/);
assert.match(registry, /createUniqueBudgetId/);
assert.doesNotMatch(registry, /function createBudgetId\(name:/);
assert.match(lifecycle, /namespacePrefix/);
assert.match(lifecycle, /diagnostics, version history and any future/);
assert.match(lifecycle, /REGISTER_SORT_STORAGE_KEY_PREFIX/);
assert.match(lifecycle, /YNAB4_IMPORT_STORAGE_PREFIX/);
assert.match(lifecycle, /ACTUAL_IMPORT_STORAGE_PREFIX/);

console.log("v3.23.0 budget identity and complete deletion structure tests passed");
