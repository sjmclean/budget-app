import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const selector = readFileSync("apps/web/src/pages/BudgetSelectorPage.tsx", "utf8");
const client = readFileSync(
  "apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
  "utf8",
);
const mapper = readFileSync(
  "apps/web/src/features/persistence/localFirst/localPayeeView.ts",
  "utf8",
);

assert.match(selector, /completeBudgetDeletion/);
assert.doesNotMatch(selector, /packagePath\.startsWith\("hosted:\/\/"\)/);
assert.doesNotMatch(selector, /getBudgetStatus\(budgetId\)/);

assert.doesNotMatch(client, /function listLocalPayees/);
assert.doesNotMatch(client, /useCount:\s*0/);
assert.match(client, /rows\.map\(localPayeeRecordToView\)/);
assert.ok((client.match(/listPersistedPayees\(budgetId,/g) ?? []).length >= 5);

for (const field of [
  "useCount", "scheduledUseCount", "defaultCategoryId", "defaultCategoryName",
  "firstUsedAt", "lastUsedAt", "aliases", "importRules",
]) {
  assert.match(mapper, new RegExp(`row\\.${field}`), `canonical mapper omitted ${field}`);
}

console.log("Milestone 4 deletion lifecycle and canonical PayeeView structural contracts passed.");
