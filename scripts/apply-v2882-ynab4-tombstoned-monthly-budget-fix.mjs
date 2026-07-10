import { readFileSync, writeFileSync } from "node:fs";

const path = "apps/web/src/features/budget/ynab4LauncherImport.ts";
let source = readFileSync(path, "utf8");

const assignmentNeedle = `    for (const row of toRecords(monthlyBudget.monthlySubCategoryBudgets)) {
      const categoryId = mappedId(maps.categoryIdBySourceId, row.categoryId, row.subCategoryId);`;
const assignmentReplacement = `    for (const row of toRecords(monthlyBudget.monthlySubCategoryBudgets)) {
      if (isYnab4Tombstone(row)) continue;
      const categoryId = mappedId(maps.categoryIdBySourceId, row.categoryId, row.subCategoryId);`;

const budgetedIdsNeedle = `    for (const row of toRecords(monthlyBudget.monthlySubCategoryBudgets)) {
      const categoryId = mappedId(maps.categoryIdBySourceId, row.categoryId, row.subCategoryId);`;

let replacements = 0;
while (source.includes(assignmentNeedle) && replacements < 2) {
  source = source.replace(assignmentNeedle, assignmentReplacement);
  replacements += 1;
}

if (replacements !== 2) {
  if (source.split("if (isYnab4Tombstone(row)) continue;").length - 1 >= 2) {
    console.log("YNAB4 tombstoned monthly budget fix already applied");
    process.exit(0);
  }
  throw new Error(`Unable to apply YNAB4 tombstoned monthly budget fix: expected 2 monthly row loops, updated ${replacements}`);
}

writeFileSync(path, source);
console.log("Applied YNAB4 tombstoned monthly budget filtering fix");
