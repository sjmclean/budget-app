import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const registry = read("apps/web/src/stores/budgetRegistryStore.ts");
const queryClient = read("apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts");
const importer = read("apps/web/src/features/budget/ynab4LauncherImport.ts");
const worker = read("apps/web/src/features/persistence/localFirst/localBudget.worker.ts");

assert.match(registry, /releaseLocalDatabase\?\.\(\)/);
assert.match(queryClient, /async releaseLocalDatabase\(\)[\s\S]*database\?\.close\(\)[\s\S]*database = null/);
assert.match(importer, /finally\s*\{[\s\S]*localDatabase\?\.close\(\)\.catch/);
assert.match(worker, /SQLITE_DATABASE_BUSY/);
assert.match(worker, /Close other Budget App tabs and retry the import/);

console.log("Milestone 4 OPFS import lifecycle contracts passed: runtime release, failure cleanup, and lock diagnosis.");
