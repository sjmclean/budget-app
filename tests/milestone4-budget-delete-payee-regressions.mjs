import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const selector = readFileSync("apps/web/src/pages/BudgetSelectorPage.tsx", "utf8");
const settings = readFileSync("apps/web/src/pages/SettingsPage.tsx", "utf8");
const server = readFileSync("apps/server/src/server.mjs", "utf8");
const authStore = readFileSync("apps/server/src/authStore.mjs", "utf8");
const relayTransport = readFileSync(
  "apps/web/src/features/persistence/localFirst/relayTransport.ts",
  "utf8",
);
const ynab4Import = readFileSync(
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
  "utf8",
);
const actualImport = readFileSync(
  "apps/web/src/features/budget/actualBudgetLauncherImport.ts",
  "utf8",
);
const registryStore = readFileSync("apps/web/src/stores/budgetRegistryStore.ts", "utf8");
const freshProvisioning = readFileSync(
  "apps/web/src/features/persistence/localFirst/freshBudgetProvisioning.ts",
  "utf8",
);
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
assert.match(settings, /completeBudgetDeletion/);
assert.doesNotMatch(
  settings.match(/async function handleDeleteCurrentBudget\(\)[\s\S]*?\n  }/)?.[0] ?? "",
  /isHostedSqliteBudget|packagePath\.startsWith/,
);
assert.match(server, /budgetDeletionLifecycle\.deleteBudget\(localFirstBudgetId\)/);
assert.doesNotMatch(
  authStore.match(/requireBudgetRole\([\s\S]*?\n    },/)?.[0] ?? "",
  /insertMembership/,
);
assert.doesNotMatch(
  server.match(/if \(url\.pathname === "\/api\/local-first\/epoch\/reset"[\s\S]*?return;\n    }/)?.[0] ?? "",
  /claimBudget/,
);
assert.match(server, /isExplicitProvisioning/);
assert.match(server, /performAuthorizedBudgetMutation/);
assert.match(relayTransport, /provisionBudget\(budgetId: string\)/);
assert.match(freshProvisioning, /await relay\.provisionBudget\(budgetId\)/);
assert.match(freshProvisioning, /await relay\.resetEpoch\(budgetId, LOCAL_BUDGET_SCHEMA_VERSION\)/);
assert.match(freshProvisioning, /await relay\.getBootstrap\(budgetId\)/);
assert.match(ynab4Import, /provisionFreshLocalFirstBudget\(budget\.id/);
assert.match(actualImport, /provisionFreshLocalFirstBudget\(result\.budget\.id/);
assert.match(registryStore, /await provisionFreshLocalFirstBudget\(budget\.id\)/);

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
