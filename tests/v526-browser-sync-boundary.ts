import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const browserEntry = join(root, "packages/sync/src/browser.ts");
const browserSource = await readFile(browserEntry, "utf8");

for (const builtin of ["crypto", "node:crypto", "fs", "node:fs", "path", "node:path"]) {
  assert.equal(
    browserSource.includes(`\"${builtin}\"`) || browserSource.includes(`'${builtin}'`),
    false,
    `browser sync entry must not import or export Node builtin ${builtin}`
  );
}

const webFiles = [
  "apps/web/src/features/settings/entities/settingsPreferenceEntity.ts",
  "apps/web/src/features/persistence/localDatabaseKeyValueStorage.ts",
  "apps/web/src/features/tableLayout/entities/tableLayoutEntity.ts",
  "apps/web/src/features/accounts/entities/importFingerprintEntity.ts",
  "apps/web/src/features/accounts/entities/importPreferenceEntity.ts",
  "apps/web/src/features/accounts/entities/scheduledTransactionEntity.ts",
  "apps/web/src/features/accounts/entities/transactionEntity.ts",
  "apps/web/src/features/accounts/entities/transactionImportPreferenceEntity.ts",
  "apps/web/src/features/accounts/entities/importSessionEntity.ts",
  "apps/web/src/features/accounts/entities/payeeEntity.ts",
  "apps/web/src/features/accounts/entities/importKnowledgeEntity.ts",
  "apps/web/src/features/accounts/entities/accountEntity.ts",
  "apps/web/src/features/budget/categoryEntities.ts",
  "apps/web/src/features/budget/entities/budgetMonthEntity.ts",
  "apps/web/src/features/tags/entities/transactionTagEntity.ts"
];

for (const file of webFiles) {
  const source = await readFile(join(root, file), "utf8");
  assert.match(
    source,
    /packages\/sync\/src\/browser\.js/,
    `${relative(root, file)} must use the browser-safe sync entry`
  );
  assert.doesNotMatch(
    source,
    /packages\/sync\/src\/index\.js/,
    `${relative(root, file)} must not use the Node-capable sync entry`
  );
}

console.log("v526 browser sync boundary tests passed");
