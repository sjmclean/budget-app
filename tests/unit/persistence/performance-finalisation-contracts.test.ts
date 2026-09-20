import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

test("startup shares one cached authentication status request", () => {
  const main = read("../../../apps/web/src/main.tsx");
  const gate = read("../../../apps/web/src/features/auth/AuthGate.tsx");
  const client = read("../../../apps/web/src/features/auth/authStatusClient.ts");
  assert.match(main, /loadAuthStatus\(\)/);
  assert.match(gate, /getCachedAuthStatus\(\)/);
  assert.match(gate, /loadAuthStatus\(\)/);
  assert.equal((main.match(/\/api\/auth\/status/g) ?? []).length, 0);
  assert.equal((gate.match(/\/api\/auth\/status/g) ?? []).length, 0);
  assert.equal((client.match(/\/api\/auth\/status/g) ?? []).length, 1);
});

test("ordinary budget status is local and background sync owns relay bootstrap", () => {
  const client = read("../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts");
  const statusStart = client.indexOf("async getBudgetStatus(budgetId)");
  const statusEnd = client.indexOf("async getAccountRegisterBootstrap", statusStart);
  const status = client.slice(statusStart, statusEnd);
  assert.match(status, /requireDatabase\(budgetId\)/);
  assert.match(status, /getSyncState\(\)/);
  assert.doesNotMatch(status, /relay\.getBootstrap/);

  const service = read("../../../apps/web/src/features/persistence/replicationService.ts");
  const branchStart = service.indexOf('provider.syncArchitecture === "local-first-relay"');
  const branchEnd = service.indexOf("if (!provider.operationJournal", branchStart);
  const branch = service.slice(branchStart, branchEnd);
  assert.doesNotMatch(branch, /await checkHealth\(\);[\s\S]*synchroniseLocalBudget/);
  assert.doesNotMatch(branch, /getBudgetStatus\(budgetId\)/);
  assert.match(branch, /synchroniseLocalBudget\(budgetId\)/);
});
