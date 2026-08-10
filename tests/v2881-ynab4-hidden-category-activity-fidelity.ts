import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importer = readFileSync("apps/web/src/features/budget/ynab4LauncherImport.ts", "utf8");
const transactionMapper = readFileSync("apps/web/src/features/budget/ynab4/mapYnab4Transactions.ts", "utf8");

assert.match(importer, /const categoryIsTombstone = isYnab4Tombstone\(category\);[\s\S]*maps\.nonImportableCategorySourceIds\.add/);
assert.doesNotMatch(importer, /suppressDuplicateArchivedCategories|findSingleActiveCategoryIdByNamePrefix|categoryKey\s*===\s*["']mortgage["']/);
assert.match(transactionMapper, /const sourceCategoryId = firstString\(record\.categoryId, record\.subCategoryId\);[\s\S]*maps\.categoryIdBySourceId\.get\(sourceCategoryId\)/);

console.log("v2.88.1 YNAB4 hidden category source-ID fidelity checks passed");
