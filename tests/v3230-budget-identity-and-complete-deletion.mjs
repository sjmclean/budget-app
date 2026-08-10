import assert from "node:assert/strict";
import fs from "node:fs";

const registry = fs.readFileSync("apps/web/src/features/budget/budgetRegistry.ts", "utf8");
const lifecycle = fs.readFileSync("apps/web/src/features/budget/budgetLifecycle.ts", "utf8");
const runtimeUuid = fs.readFileSync(
  "apps/web/src/features/ids/createRuntimeUuid.ts",
  "utf8",
);

assert.match(registry, /import\s+\{\s*createRuntimeUuid\s*\}/);
assert.match(registry, /`budget-\$\{createRuntimeUuid\(\)\}`/);
assert.doesNotMatch(registry, /crypto\?\.randomUUID|crypto\.randomUUID/);
assert.match(runtimeUuid, /runtimeCrypto\?\.randomUUID/);
assert.match(runtimeUuid, /runtimeCrypto\?\.getRandomValues/);
assert.match(runtimeUuid, /Math\.random/);
assert.match(registry, /createUniqueBudgetId/);
assert.doesNotMatch(registry, /function createBudgetId\(name:/);
assert.match(lifecycle, /namespacePrefix/);
assert.match(lifecycle, /diagnostics, version history and any future/);
assert.match(lifecycle, /REGISTER_SORT_STORAGE_KEY_PREFIX/);
assert.match(lifecycle, /YNAB4_IMPORT_STORAGE_PREFIX/);
assert.match(lifecycle, /ACTUAL_IMPORT_STORAGE_PREFIX/);

console.log("v3.23.0 budget identity and complete deletion structure tests passed");
