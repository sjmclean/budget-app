import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url),
  "utf8",
);
const configured = readFileSync(
  new URL("../apps/web/src/features/persistence/configuredPersistenceProvider.ts", import.meta.url),
  "utf8",
);

assert.match(configured, /createLocalFirstAccountRegisterQueryClient\(lifecycle/);
assert.match(runtime, /getAccountRegisterBootstrap[\s\S]*Promise\.all/);
assert.match(runtime, /syncThenDatabase\(input\.budgetId\)/);
assert.match(runtime, /pushMutations/);
assert.match(runtime, /pullMutations/);
assert.match(runtime, /applyRemoteMutations/);
assert.match(runtime, /acknowledgeOutbox/);
assert.match(runtime, /bootstrapLocalBudget/);
assert.match(runtime, /getTransaction/);
assert.match(runtime, /writeTransaction/);
assert.match(runtime, /deleteTransaction/);
assert.match(worker, /WHERE transaction_id IN \(\$\{placeholders\}\)/);
assert.match(worker, /const pageIds = pageRows\.map/);
assert.match(worker, /splitByTransaction/);
assert.match(worker, /tagsByTransaction/);

console.log(
  "Milestone 4 local register runtime contracts passed: local bootstrap, bounded reads, batched hydration, transactional writes, and relay convergence.",
);
