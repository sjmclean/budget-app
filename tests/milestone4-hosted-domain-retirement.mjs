import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const server = readFileSync(
  new URL("../apps/server/src/server.mjs", import.meta.url),
  "utf8",
);
const persistenceExports = readFileSync(
  new URL("../apps/web/src/features/persistence/index.ts", import.meta.url),
  "utf8",
);
const configured = readFileSync(
  new URL("../apps/web/src/features/persistence/configuredPersistenceProvider.ts", import.meta.url),
  "utf8",
);

assert.match(server, /HOSTED_BUDGET_DOMAIN_RETIRED/);
assert.match(server, /pathname\.startsWith\("\/api\/budget-engine\/"\)/);
assert.doesNotMatch(server, /const budgetEngineStatusMatch|\/api\\\/budget-engine\\\/imports/);
for (const module of [
  "budgetEngineStore.mjs",
  "budgetImportStore.mjs",
  "budgetLifecycleStore.mjs",
  "budgetReferenceDataStore.mjs",
  "budgetScheduledTransactionStore.mjs",
]) {
  assert.equal(
    existsSync(new URL(`../apps/server/src/${module}`, import.meta.url)),
    false,
  );
}

assert.doesNotMatch(
  persistenceExports,
  /export\s*\{\s*createHostedAccountRegisterQueryClient\s*\}/,
);
assert.doesNotMatch(configured, /createHostedAccountRegisterQueryClient/);
assert.match(configured, /createLocalFirstAccountRegisterQueryClient/);

console.log(
  "Milestone 4 hosted-domain retirement passed: local SQLite is the only domain engine and the hosted implementation is physically absent.",
);
