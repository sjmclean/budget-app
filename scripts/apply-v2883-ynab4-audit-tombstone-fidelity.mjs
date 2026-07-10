import { readFileSync, writeFileSync } from "node:fs";

const path = "apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts";
let source = readFileSync(path, "utf8");

const oldCategoryLoop = `  for (const row of toRecords(month.monthlySubCategoryBudgets)) {
    const categoryId = firstString(`;
const newCategoryLoop = `  for (const row of toRecords(month.monthlySubCategoryBudgets)) {
    if (isDeleted(row)) continue;
    const categoryId = firstString(`;

const oldSchemaRows = `  const rows = monthlyBudgets.flatMap((month) =>
    toRecords(month.monthlySubCategoryBudgets),
  );`;
const newSchemaRows = `  const rows = monthlyBudgets.flatMap((month) =>
    toRecords(month.monthlySubCategoryBudgets).filter((row) => !isDeleted(row)),
  );`;

if (source.includes(newCategoryLoop) && source.includes(newSchemaRows)) {
  console.log("YNAB4 audit tombstone fidelity fix already applied");
  process.exit(0);
}

if (!source.includes(oldCategoryLoop)) {
  throw new Error("Unable to apply v288.3: source budget category loop was not found");
}
if (!source.includes(oldSchemaRows)) {
  throw new Error("Unable to apply v288.3: source row schema block was not found");
}

source = source.replace(oldCategoryLoop, newCategoryLoop);
source = source.replace(oldSchemaRows, newSchemaRows);
writeFileSync(path, source);
console.log("Applied v288.3 YNAB4 audit tombstone fidelity fix");
