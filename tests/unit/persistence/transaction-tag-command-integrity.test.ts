import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

const runtime = source("apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts");
const tagCommands = source("apps/web/src/features/persistence/localFirst/engine/tagCommands.ts");
const contracts = source("apps/web/src/features/persistence/accountRegisterQueryContracts.ts");
const provider = source("apps/web/src/features/persistence/budgetPersistenceProvider.ts");

test("transaction-tag ordinary writes are owned by the engine module", () => {
  assert.match(tagCommands, /async replaceTransactionTags/);
  assert.match(tagCommands, /local\.mutate\(mutation\)/);
  assert.doesNotMatch(runtime, /async function writeEntity\(/);
  assert.doesNotMatch(runtime, /writeTag:|deleteTag:/);
});

test("conflict recovery is a narrow typed provider surface, not an ordinary command bypass", () => {
  assert.match(contracts, /interface LocalBudgetConflictRecoveryClient/);
  assert.match(contracts, /resolveSyncConflict\([\s\S]*"keep-local" \| "accept-remote"/);
  assert.doesNotMatch(contracts, /interface LocalBudgetConflictRecoveryClient[\s\S]*\bmutate\b/);
  assert.match(provider, /localBudgetConflictRecovery\?: LocalBudgetConflictRecoveryClient/);
  assert.doesNotMatch(provider, /accountRegisterQueries as[\s\S]*resolveSyncConflict/);
});
