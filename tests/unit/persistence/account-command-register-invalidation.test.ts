import assert from "node:assert/strict";
import test from "node:test";

import { createAccountCommands } from "../../../apps/web/src/features/persistence/localFirst/engine/accountCommands.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import { doesPersistenceChangeAffect } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";

const budgetId = "budget-a";

function mutation(entityId: string): LocalBudgetMutation {
  return {
    mutationId: `mutation-${entityId}`,
    budgetId,
    syncEpoch: "epoch-a",
    deviceId: "device-a",
    deviceSequence: 1,
    baseCursor: 0,
    domain: "accounts",
    entityId,
    operation: "upsert",
    payload: null,
    createdAt: "2026-09-20T00:00:00.000Z",
  };
}

function navigationAccount() {
  return {
    id: "savings",
    name: "Savings",
    type: "checking",
    participation: "on-budget",
    openingBalance: 0,
    currencyCode: "USD",
    closedAt: null,
    workingBalance: 0,
    transactionCount: 0,
    hasUncategorizedTransactions: false,
  };
}

test("account metadata edits invalidate registers in other accounts that project transfer metadata", async () => {
  const local = {
    async listAccountNavigation() { return [navigationAccount()]; },
    async writeAccount() { return {}; },
  } as unknown as LocalBudgetDatabaseClient;

  const commands = createAccountCommands({
    requireDatabase: async () => local,
    createMutation: (_budgetId, _domain, entityId) => mutation(entityId),
  });

  const committed = await commands.updateAccount(budgetId, {
    id: "savings",
    name: "Holiday Savings",
    type: "checking",
  });

  assert.equal(committed.change.accountIds, undefined);
  assert.deepEqual(committed.change.domains, ["accounts"]);
  assert.equal(doesPersistenceChangeAffect({
    source: "local",
    occurredAt: "2026-09-20T00:00:00.000Z",
    scope: committed.change,
  }, {
    budgetId,
    accountId: "checking",
    domains: ["accounts", "transactions"],
  }), true);
});

test("account history replacement also invalidates transfer metadata in other registers", async () => {
  const local = {
    async replaceAccountHistoryState() { return {}; },
  } as unknown as LocalBudgetDatabaseClient;

  const commands = createAccountCommands({
    requireDatabase: async () => local,
    createMutation: (_budgetId, _domain, entityId) => mutation(entityId),
  });

  const expected = {
    id: "savings",
    budgetId,
    name: "Savings",
    type: "checking",
    participation: "on-budget" as const,
    openingBalance: 0,
    currencyCode: "USD",
    createdAt: "2026-09-01T00:00:00.000Z",
    closedAt: null,
  };
  const replacement = { ...expected, name: "Holiday Savings" };

  const committed = await commands.replaceAccountHistoryState({
    budgetId,
    accountId: "savings",
    expected,
    replacement,
  });

  assert.equal(committed.change.accountIds, undefined);
  assert.equal(doesPersistenceChangeAffect({
    source: "local",
    occurredAt: "2026-09-20T00:00:00.000Z",
    scope: committed.change,
  }, {
    budgetId,
    accountId: "checking",
    domains: ["accounts"],
  }), true);
});
