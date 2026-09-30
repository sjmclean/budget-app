import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("automatic scheduled generation may reacquire a released local database", () => {
  const shell = readFileSync(
    new URL("../../../apps/web/src/layouts/AppShell.tsx", import.meta.url),
    "utf8",
  );

  assert.match(shell, /generateDueScheduledTransactionsForBudget\(persistenceProvider, activeBudgetId\)/u);
  assert.doesNotMatch(
    shell,
    /isLocalDatabaseReleased\?\.\(\).*return/u,
    "AppShell must let the local-first client run its normal readiness/reacquisition path",
  );
  assert.match(shell, /setInterval\(generate, 60_000\)/u);
  assert.match(shell, /addEventListener\("focus", generate\)/u);
  assert.match(shell, /visibilitychange/u);
});
