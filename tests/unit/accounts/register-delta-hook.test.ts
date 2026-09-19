import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { useAccountRegister } from "../../../apps/web/src/features/accounts/useAccountRegister.js";
import { configureBudgetPersistenceProvider, resetBudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProviderFactory.js";
import { flushPersistenceChanges, publishPersistenceChange } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import type { AccountRegisterSummary, AccountTransactionRow } from "../../../packages/application/src/accountRegister/AccountRegisterQueryPort.js";

const webRequire = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { createElement } = webRequire("react");
const { act, create } = webRequire("react-test-renderer");
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function row(id: string, amount = -100): AccountTransactionRow {
  return { id, date: "2026-09-01", amount, memo: null, checkNumber: null, clearedStatus: "uncleared", payeeId: null, payeeName: null, categoryId: null, categoryName: null, transferAccountId: null, transferTransactionId: null, splitLines: [] };
}

test("ordinary committed register delta updates loaded rows without a bootstrap or relay read", async () => {
  const budgetId = "delta-hook-budget";
  const accountId = "checking";
  const before = row("tx", -100);
  const after = row("tx", -300);
  const afterSecondCommit = row("tx", -500);
  const baseSummary: AccountRegisterSummary = { budgetId, accountId, accountName: "Checking", accountType: "checking", participation: "on-budget", currencyCode: "USD", openingBalance: 0, clearedBalance: 0, unclearedBalance: -100, workingBalance: -100, transactionCount: 1 };
  const nextSummary = { ...baseSummary, unclearedBalance: -300, workingBalance: -300 };
  let bootstrapCalls = 0;
  let localRefillCalls = 0;
  let syncedPageCalls = 0;
  configureBudgetPersistenceProvider({
    metadata: { kind: "local-database", label: "test", description: "test", isProductionPersistence: false },
    accountRegisters: { getAccountRegisterView: async () => { throw new Error("legacy register must not run"); } },
    accountRegisterQueries: {
      getBudgetStatus: async () => ({ capabilities: { accountRegisters: true } }),
      getAccountRegisterBootstrap: async () => { bootstrapCalls++; return { summary: baseSummary, page: { rows: [before], nextCursor: { date: before.date, id: before.id }, hasMore: false, totalCount: 1 } }; },
      queryTransactions: async () => { syncedPageCalls++; throw new Error("synced page read must not run"); },
      queryLocalTransactions: async () => { localRefillCalls++; throw new Error("no refill expected"); },
    },
    scheduledTransactions: {},
  } as never);
  let latest: ReturnType<typeof useAccountRegister> | undefined;
  function Probe() { latest = useAccountRegister(accountId, budgetId); return null; }
  let root: { unmount(): void } | undefined;
  try {
    await act(async () => { root = create(createElement(Probe)); });
    assert.equal(bootstrapCalls, 1);
    assert.equal(latest?.data?.transactions[0]?.outflow, 1);
    await act(async () => {
      publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["transactions"], accountIds: [accountId], transactionIds: ["tx"] }, registerDelta: {
        mode: "patch", budgetId, affectedAccountIds: [accountId], beforeRows: [{ accountId, row: before }], afterRows: [{ accountId, row: after }], summaries: [nextSummary],
      } });
      flushPersistenceChanges();
    });
    assert.equal(latest?.data?.transactions[0]?.outflow, 3);
    assert.equal(bootstrapCalls, 1);
    assert.equal(localRefillCalls, 0);
    assert.equal(syncedPageCalls, 0);
    await act(async () => {
      publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["transactions"], accountIds: [accountId], transactionIds: ["tx"] }, registerDelta: {
        mode: "patch", budgetId, affectedAccountIds: [accountId], beforeRows: [{ accountId, row: after }], afterRows: [{ accountId, row: afterSecondCommit }], summaries: [{ ...nextSummary, unclearedBalance: -500, workingBalance: -500 }],
      } });
      publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["transactions"], accountIds: [accountId], transactionIds: ["tx"] }, registerDelta: {
        mode: "patch", budgetId, affectedAccountIds: [accountId], beforeRows: [{ accountId, row: afterSecondCommit }], afterRows: [{ accountId, row: after }], summaries: [nextSummary],
      } });
      flushPersistenceChanges();
    });
    assert.equal(latest?.data?.transactions[0]?.outflow, 3);
    assert.equal(bootstrapCalls, 1);
    await act(async () => {
      publishPersistenceChange({ source: "local", scope: { budgetId: "other-budget", domains: ["transactions"], accountIds: [accountId] } });
      flushPersistenceChanges();
    });
    assert.equal(bootstrapCalls, 1);
    await act(async () => {
      publishPersistenceChange({ source: "replication", scope: { budgetId, domains: ["transactions"], accountIds: [accountId] } });
      flushPersistenceChanges();
    });
    assert.equal(bootstrapCalls, 2);
    await act(async () => {
      publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["transactions"], accountIds: [accountId] }, registerDelta: {
        mode: "refresh-required", budgetId, affectedAccountIds: [accountId], reason: "delta-too-large",
      } });
      flushPersistenceChanges();
    });
    assert.equal(bootstrapCalls, 3);
  } finally {
    await act(async () => { root?.unmount(); });
    resetBudgetPersistenceProvider();
  }
});

test("delete refills only the one missing row through the local-only query", async () => {
  const budgetId = "delta-refill-budget";
  const accountId = "checking";
  const rows = Array.from({ length: 150 }, (_, index) => ({ ...row(`tx-${String(150 - index).padStart(3, "0")}`), date: "2026-09-01" }));
  const replacement = row("tx-000");
  const baseSummary: AccountRegisterSummary = { budgetId, accountId, accountName: "Checking", accountType: "checking", participation: "on-budget", currencyCode: "USD", openingBalance: 0, clearedBalance: 0, unclearedBalance: -15100, workingBalance: -15100, transactionCount: 151 };
  let bootstrapCalls = 0;
  const refillInputs: { limit: number; offset?: number }[] = [];
  configureBudgetPersistenceProvider({
    metadata: { kind: "local-database", label: "test", description: "test", isProductionPersistence: false },
    accountRegisters: { getAccountRegisterView: async () => { throw new Error("legacy register must not run"); } },
    accountRegisterQueries: {
      getBudgetStatus: async () => ({ capabilities: { accountRegisters: true } }),
      getAccountRegisterBootstrap: async () => { bootstrapCalls++; return { summary: baseSummary, page: { rows, nextCursor: { date: rows.at(-1)!.date, id: rows.at(-1)!.id }, hasMore: true, totalCount: 151 } }; },
      queryTransactions: async () => { throw new Error("synced page read must not run"); },
      queryLocalTransactions: async (input: { limit: number; offset?: number }) => { refillInputs.push(input); return { rows: [replacement], nextCursor: { date: replacement.date, id: replacement.id }, hasMore: false, totalCount: 150 }; },
    },
    scheduledTransactions: {},
  } as never);
  let latest: ReturnType<typeof useAccountRegister> | undefined;
  function Probe() { latest = useAccountRegister(accountId, budgetId); return null; }
  let root: { unmount(): void } | undefined;
  try {
    await act(async () => { root = create(createElement(Probe)); });
    const deleted = rows[4]!;
    await act(async () => {
      publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["transactions"], accountIds: [accountId], transactionIds: [deleted.id] }, registerDelta: {
        mode: "patch", budgetId, affectedAccountIds: [accountId], beforeRows: [{ accountId, row: deleted }], afterRows: [], summaries: [{ ...baseSummary, transactionCount: 150, workingBalance: -15000 }],
      } });
      flushPersistenceChanges();
    });
    assert.equal(bootstrapCalls, 1);
    assert.deepEqual(refillInputs.map(({ limit, offset }) => ({ limit, offset })), [{ limit: 1, offset: 149 }]);
    assert.equal(latest?.data?.transactions.length, 150);
    assert.equal(latest?.data?.transactions.some(({ id }) => id === deleted.id), false);
  } finally {
    await act(async () => { root?.unmount(); });
    resetBudgetPersistenceProvider();
  }
});
