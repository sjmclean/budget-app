import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertLegacyBudgetFeatureAvailable,
  SQLITE_BUDGET_FEATURE_UNAVAILABLE_CODE,
  SqliteBudgetFeatureUnavailableError,
  isActiveSqliteBudget,
} from "../apps/web/src/features/persistence/sqliteBudgetSafety.ts";
import type { AccountRegisterQueryClient } from "../apps/web/src/features/persistence/accountRegisterQueryContracts.ts";

function clientWithState(
  state: "legacy" | "active",
): AccountRegisterQueryClient {
  return {
    async getBudgetStatus(budgetId) {
      return {
        budgetId,
        generationId: state === "active" ? "generation-1" : null,
        state,
        activatedAt: state === "active" ? Date.now() : null,
        capabilities: {
          accountRegisters: state === "active",
          budgetMonths: state === "active",
          analytics: state === "active",
        },
      };
    },
  } as AccountRegisterQueryClient;
}

const hosted = clientWithState("active");
const legacy = clientWithState("legacy");

assert.equal(await isActiveSqliteBudget(hosted, "budget-1"), true);
assert.equal(await isActiveSqliteBudget(legacy, "budget-1"), false);
assert.equal(await isActiveSqliteBudget(undefined, "budget-1"), false);

await assert.doesNotReject(
  assertLegacyBudgetFeatureAvailable(legacy, "budget-1", "Budget backup"),
);

await assert.rejects(
  assertLegacyBudgetFeatureAvailable(hosted, "budget-1", "Budget backup"),
  (error: unknown) => {
    assert.ok(error instanceof SqliteBudgetFeatureUnavailableError);
    assert.equal(error.code, SQLITE_BUDGET_FEATURE_UNAVAILABLE_CODE);
    assert.match(error.message, /No budget data was changed/);
    return true;
  },
);

const settingsSource = readFileSync(
  new URL("../apps/web/src/pages/SettingsPage.tsx", import.meta.url),
  "utf8",
);
for (const feature of [
  "Portable budget export",
  "Portable budget restore",
  "Version-history restore",
]) {
  assert.ok(settingsSource.includes(`"${feature}"`), `${feature} must be guarded`);
}
for (const method of [
  "getBudgetExportUrl",
  "restoreBudget",
  "resetBudget",
  "deleteBudget",
]) {
  assert.ok(settingsSource.includes(`.${method}(`), `${method} must use the hosted lifecycle client`);
}

const sidebarSource = readFileSync(
  new URL("../apps/web/src/layouts/Sidebar.tsx", import.meta.url),
  "utf8",
);
for (const method of ["createAccount", "updateAccount", "deleteAccount"]) {
  assert.ok(sidebarSource.includes(`accountRegisterQueries.${method}(`));
}
assert.doesNotMatch(
  sidebarSource,
  /legacyAccounts[\s\S]*setAccountClosed/,
  "legacy account lifecycle state must never be replayed over SQLite on navigation load",
);

const workspaceSource = readFileSync(
  new URL("../apps/web/src/features/budget/useBudgetWorkspace.ts", import.meta.url),
  "utf8",
);
assert.match(workspaceSource, /assertLegacyBudgetFeatureAvailable/);
assert.doesNotMatch(workspaceSource, /Category administration/);

const payeeSource = readFileSync(
  new URL("../apps/web/src/pages/PayeeManagementPage.tsx", import.meta.url),
  "utf8",
);
for (const method of ["updatePayee", "setPayeeArchived", "mergePayees"]) {
  assert.ok(payeeSource.includes(`accountRegisterQueries`) && payeeSource.includes(`.${method}(`));
}

const registerSource = readFileSync(
  new URL("../apps/web/src/features/accounts/useAccountRegister.ts", import.meta.url),
  "utf8",
);
assert.match(registerSource, /No budget data was changed/);
assert.doesNotMatch(registerSource, /currently read-only/);

const registerPageSource = readFileSync(
  new URL("../apps/web/src/pages/AccountRegisterPage.tsx", import.meta.url),
  "utf8",
);
for (const method of [
  "createPayee",
  "updatePayee",
  "setPayeeArchived",
  "mergePayees",
]) {
  assert.match(
    registerPageSource,
    new RegExp(`hosted\\.${method}\\(`),
    `the in-register payee manager must route ${method} through SQLite`,
  );
}

console.log("Milestone 3 SQLite safety guards passed.");
