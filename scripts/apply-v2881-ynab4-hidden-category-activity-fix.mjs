import { readFileSync, writeFileSync } from "node:fs";

const path = "apps/web/src/features/budget/ynab4LauncherImport.ts";
let source = readFileSync(path, "utf8");

const needle = `  return drafts
    .filter((group) => group.categories.length > 0)
    .map(({ sourceIds: _sourceIds, ...group }) => group);
}`;

const replacement = `  suppressDuplicateArchivedCategories(drafts, maps);

  return drafts
    .filter((group) => group.categories.length > 0)
    .map(({ sourceIds: _sourceIds, ...group }) => group);
}`;

if (source.includes("suppressDuplicateArchivedCategories(drafts, maps);")) {
  console.log("YNAB4 hidden category activity fix already applied");
  process.exit(0);
}

if (!source.includes(needle)) {
  throw new Error("Unable to apply YNAB4 hidden category activity fix: expected mapCategoryGroups return block was not found");
}

source = source.replace(needle, replacement);
writeFileSync(path, source);
console.log("Applied YNAB4 hidden category activity remapping fix");
