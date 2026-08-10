import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const provider = read(
  "apps/web/src/features/persistence/createKeyValueBudgetPersistenceProvider.ts",
);
const sqliteBudget = read(
  "apps/web/src/features/persistence/createSqliteBudgetViewService.ts",
);
const dashboard = read("apps/web/src/pages/DashboardPage.tsx");
const reports = read(
  "apps/web/src/pages/reports/hooks/useReportsViewModel.ts",
);
const register = read("apps/web/src/features/accounts/useAccountRegister.ts");

assert.match(provider, /createSqliteBudgetViewService/);
assert.doesNotMatch(provider, /createBudgetViewService|budgetViewService/);
assert.match(sqliteBudget, /status\.capabilities\.budgetMonths/);
assert.doesNotMatch(provider, /BUDGET_MONTH_NOT_FOUND/);
assert.match(dashboard, /status\.capabilities\.analytics/);
assert.doesNotMatch(dashboard, /BUDGET_MONTH_NOT_FOUND/);
assert.match(reports, /hostedStatus\?\.capabilities\.analytics/);
assert.match(register, /status\?\.capabilities\.accountRegisters/);

console.log(
  "Milestone 3 cutover cleanup passed: capability routing replaces exception-driven fallback.",
);
