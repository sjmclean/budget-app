import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
  "utf8",
);

assert.match(
  source,
  /function suppressDuplicateArchivedCategories\(drafts: CategoryGroupDraft\[\], maps: ImportMaps\): void/,
  "The importer must retain the duplicate archived category remapping helper.",
);

const mapCategoryGroupsStart = source.indexOf("function mapCategoryGroups(");
const helperStart = source.indexOf("function suppressDuplicateArchivedCategories(");
assert.ok(mapCategoryGroupsStart >= 0 && helperStart > mapCategoryGroupsStart);

const mapCategoryGroupsSource = source.slice(mapCategoryGroupsStart, helperStart);
assert.match(
  mapCategoryGroupsSource,
  /suppressDuplicateArchivedCategories\(drafts, maps\);\s*return drafts/,
  "Hidden/archived duplicate categories must be remapped before imported groups are returned.",
);

assert.match(
  source,
  /if \(mappedCategoryId === category\.id\) \{\s*maps\.categoryIdBySourceId\.set\(sourceId, canonicalId\);/,
  "Every source ID for a suppressed hidden duplicate must point to the visible canonical category.",
);

assert.match(
  source,
  /firstString\(record\.subCategoryId\)/,
  "YNAB4 subCategoryId values must participate in category identity mapping.",
);

console.log("v2.88.1 YNAB4 hidden category activity fidelity checks passed");
