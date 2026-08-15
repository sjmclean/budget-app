import assert from "node:assert/strict";
import test from "node:test";

import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";
import {
  collectYnab4ImportedPayeeExpectations,
  toSqliteImportTransaction,
} from "../../../apps/web/src/features/budget/ynab4LauncherImport.js";
import { mapYnab4Transactions } from "../../../apps/web/src/features/budget/ynab4/mapYnab4Transactions.js";
import { createLocalFirstYnab4ImportClient } from "../../../apps/web/src/features/persistence/localFirst/localFirstYnab4ImportClient.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import type { LocalTransactionRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";
import { Ynab4StreamingPreflightSession } from "../../../packages/ynab4-importer/src/source/ynab4StreamingPreflight.js";

test("forwards raw bank payee through the SQLite import DTO", () => {
  const transaction = {
    id: "txn-provenance",
    date: "2026-08-13",
    payee: "Local Shop",
    rawPayee: "LOCAL SHOP 0421 MELBOURNE",
    category: "Groceries",
    categoryId: "groceries",
    memo: "Card ending 4242",
    inflow: 0,
    outflow: 12.34,
    cleared: true,
    reconciled: false,
  } as RegisterTransactionView;

  const dto = toSqliteImportTransaction(
    "checking",
    transaction,
    new Date("2026-08-14T00:00:00.000Z"),
  );

  assert.equal(dto.payeeId, null);
  assert.equal(dto.rawPayeeName, "LOCAL SHOP 0421 MELBOURNE");
  assert.equal(dto.categoryName, "Groceries");
  assert.equal(dto.memo, "Card ending 4242");
  assert.equal(dto.amount, -1234);
});

test("local-first YNAB4 persistence retains raw bank payee on the stored transaction record", async () => {
  let stored: readonly LocalTransactionRecord[] = [];
  const database = {
    async beginStagedImport() {},
    async importRegisterBatch(batch: { readonly transactions?: readonly LocalTransactionRecord[] }) {
      if (batch.transactions) stored = batch.transactions;
    },
  } as unknown as LocalBudgetDatabaseClient;

  const client = createLocalFirstYnab4ImportClient({
    database,
    syncEpoch: "epoch-provenance",
    deviceId: "device-provenance",
  });
  const session = await client.begin({
    budgetId: "budget-provenance",
    budgetName: "Imported Budget",
    currency: "AUD",
  });

  await session.persistTransactions([{
    id: "txn-provenance",
    accountId: "checking",
    payeeId: null,
    rawPayeeName: "LOCAL SHOP 0421 MELBOURNE",
    categoryId: "groceries",
    categoryName: "Groceries",
    transferAccountId: null,
    transferTransactionId: null,
    splitLines: [],
    type: "standard",
    date: "2026-08-13",
    memo: "Card ending 4242",
    checkNumber: null,
    amount: -1234,
    clearedStatus: "cleared",
    createdAt: 1,
    updatedAt: 1,
  }]);

  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.rawPayeeName, "LOCAL SHOP 0421 MELBOURNE");
  assert.equal(stored[0]?.payeeName, null);
  assert.equal(stored[0]?.categoryName, "Groceries");
});


test("staged local-first validation reports provenance lost after persistence", async () => {
  let stored: readonly LocalTransactionRecord[] = [];
  const database = {
    async beginStagedImport() {},
    async importRegisterBatch(batch: { readonly transactions?: readonly LocalTransactionRecord[] }) {
      if (batch.transactions) stored = batch.transactions;
    },
    async getManifest() {
      return {
        counts: {
          accounts: 0,
          transactions: 1,
          payees: 0,
          categories: 0,
          budgetMonths: 0,
          scheduledTransactions: 0,
          transactionTags: 0,
        },
      };
    },
    async getTransactionsByIds() {
      return stored.map((transaction) => ({
        ...transaction,
        rawPayeeName: null,
      }));
    },
  } as unknown as LocalBudgetDatabaseClient;

  const client = createLocalFirstYnab4ImportClient({
    database,
    syncEpoch: "epoch-provenance-audit",
    deviceId: "device-provenance-audit",
  });
  const session = await client.begin({
    budgetId: "budget-provenance-audit",
    budgetName: "Imported Budget",
    currency: "AUD",
  });

  session.recordSourceTransactionDescriptions?.([{
    transactionId: "txn-provenance-loss",
    rawPayeeName: "LOCAL SHOP 0421 MELBOURNE",
  }]);

  await session.persistTransactions([{
    id: "txn-provenance-loss",
    accountId: "checking",
    payeeId: null,
    rawPayeeName: "LOCAL SHOP 0421 MELBOURNE",
    categoryId: null,
    categoryName: null,
    transferAccountId: null,
    transferTransactionId: null,
    splitLines: [],
    type: "standard",
    date: "2026-08-13",
    memo: null,
    checkNumber: null,
    amount: -1234,
    clearedStatus: "cleared",
    createdAt: 1,
    updatedAt: 1,
  }]);

  const validation = await session.validate();
  assert.equal(
    validation.importedPayeeProvenance?.sourceTransactionsWithImportedPayee,
    1,
  );
  assert.equal(validation.importedPayeeProvenance?.preservedRawPayees, 0);
  assert.equal(validation.importedPayeeProvenance?.mismatches.length, 1);
  assert.match(
    validation.importedPayeeProvenance?.mismatches[0] ?? "",
    /destination found but rawPayeeName is null.*txn-provenance-loss/,
  );
});


test("active provenance is required while tombstones create no destination expectation", async () => {
  const sourceRecords = [
    {
      entityId: "active-import",
      accountId: "source-checking",
      date: "2026-08-13",
      amount: -12.34,
      importedPayee: "SYNTHETIC ACTIVE BANK DESCRIPTION",
    },
    {
      entityId: "deleted-import",
      accountId: "source-checking",
      date: "2026-08-14",
      amount: -5,
      importedPayee: "SYNTHETIC DELETED BANK DESCRIPTION",
      isTombstone: true,
    },
  ];
  const expectations = collectYnab4ImportedPayeeExpectations(sourceRecords);
  assert.deepEqual(expectations, [{
    transactionId: "active-import",
    rawPayeeName: "SYNTHETIC ACTIVE BANK DESCRIPTION",
  }]);

  const registers = mapYnab4Transactions({
    accounts: [{
      id: "checking",
      name: "Checking",
      type: "on-budget",
      startingBalance: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    }],
    maps: {
      accountIdBySourceId: new Map([["source-checking", "checking"]]),
      accountNameById: new Map([["checking", "Checking"]]),
      accountTypeById: new Map([["checking", "on-budget"]]),
      categoryIdBySourceId: new Map(),
      categoryNameById: new Map(),
      payeeIdBySourceId: new Map(),
      payeeNameById: new Map(),
    },
    currencyCode: "AUD",
    importedFlagTagIdByColour: new Map(),
    transactions: sourceRecords,
  });
  assert.deepEqual(registers.checking.transactions.map(row => row.id), ["active-import"]);

  let stored: readonly LocalTransactionRecord[] = [];
  const database = {
    async beginStagedImport() {},
    async importRegisterBatch(batch: { readonly transactions?: readonly LocalTransactionRecord[] }) {
      if (batch.transactions) stored = batch.transactions;
    },
    async getManifest() {
      return {
        counts: {
          accounts: 0,
          transactions: 1,
          payees: 0,
          categories: 0,
          budgetMonths: 0,
          scheduledTransactions: 0,
          transactionTags: 0,
        },
      };
    },
    async getTransactionsByIds(
      _budgetId: string,
      accountId: string,
      ids: readonly string[],
    ) {
      return stored.filter(row => row.accountId === accountId && ids.includes(row.id));
    },
    async getTransaction(_budgetId: string, id: string) {
      return stored.find(row => row.id === id) ?? null;
    },
  } as unknown as LocalBudgetDatabaseClient;
  const client = createLocalFirstYnab4ImportClient({
    database,
    syncEpoch: "epoch-active-tombstone",
    deviceId: "device-active-tombstone",
  });
  const session = await client.begin({
    budgetId: "budget-active-tombstone",
    budgetName: "Imported Budget",
    currency: "AUD",
  });
  session.recordSourceTransactionDescriptions?.(expectations);
  await session.persistTransactions(registers.checking.transactions.map(row =>
    toSqliteImportTransaction(
      "checking",
      row,
      new Date("2026-08-15T00:00:00.000Z"),
    ),
  ));
  const validation = await session.validate();
  assert.deepEqual(validation.importedPayeeProvenance, {
    sourceTransactionsWithImportedPayee: 1,
    preservedRawPayees: 1,
    mismatches: [],
  });
  assert.equal(stored.some(row => row.id === "deleted-import"), false);
});


test("active provenance without a mapped destination account fails explicitly", async () => {
  let accountScopedReads = 0;
  const database = {
    async beginStagedImport() {},
    async getManifest() {
      return {
        counts: {
          accounts: 0,
          transactions: 0,
          payees: 0,
          categories: 0,
          budgetMonths: 0,
          scheduledTransactions: 0,
          transactionTags: 0,
        },
      };
    },
    async getTransactionsByIds() {
      accountScopedReads += 1;
      return [];
    },
    async getTransaction() {
      throw new Error("diagnostic lookup must not run for unresolved account assignment");
    },
  } as unknown as LocalBudgetDatabaseClient;
  const client = createLocalFirstYnab4ImportClient({
    database,
    syncEpoch: "epoch-unresolved-account",
    deviceId: "device-unresolved-account",
  });
  const session = await client.begin({
    budgetId: "budget-unresolved-account",
    budgetName: "Imported Budget",
    currency: "AUD",
  });
  session.recordSourceTransactionDescriptions?.([{
    transactionId: "active-without-account",
    rawPayeeName: "SYNTHETIC ACTIVE BANK DESCRIPTION",
  }]);

  const validation = await session.validate();
  assert.equal(accountScopedReads, 0);
  assert.match(
    validation.importedPayeeProvenance?.mismatches[0] ?? "",
    /unresolved expected destination\/account assignment.*active-without-account/,
  );
});


test("preflight counts active identities and rejects duplicate active source IDs", async () => {
  const summary = {
    format: "ynab4-json" as const,
    sourceName: "synthetic",
    size: null,
    topLevelKeys: ["accounts", "transactions"],
  };
  const referenceData = {
    accounts: [{ entityId: "source-checking" }],
    masterCategories: [],
    payees: [],
    monthlyBudgets: [],
    values: {},
  };
  const preflight = new Ynab4StreamingPreflightSession();
  assert.equal((await preflight.validateSource(summary, referenceData)).valid, true);
  await preflight.begin();
  await preflight.persistBatch([
    {
      entityId: "active-one",
      accountId: "source-checking",
      amount: -1,
    },
    {
      entityId: "deleted-one",
      accountId: "source-checking",
      amount: -2,
      isDeleted: true,
    },
  ]);
  const result = await preflight.commit();
  assert.equal(result.transactionsValidated, 2);
  assert.equal(result.activeTransactionRecords, 1);
  assert.equal(result.uniqueActiveTransactionIds, 1);
  assert.equal(result.duplicateTransactionIds, 0);
  await preflight.close();

  const duplicate = new Ynab4StreamingPreflightSession();
  await duplicate.validateSource(summary, referenceData);
  await duplicate.begin();
  await assert.rejects(
    duplicate.persistBatch([
      {
        entityId: "duplicate-active",
        accountId: "source-checking",
        amount: -1,
        importedPayee: "FIRST SYNTHETIC DESCRIPTION",
      },
      {
        entityId: "duplicate-active",
        accountId: "source-checking",
        amount: -1,
        importedPayee: "DIFFERENT SYNTHETIC DESCRIPTION",
      },
    ]),
    (error: unknown) => {
      const typed = error as Error & { issue?: { code?: string } };
      assert.equal(typed.issue?.code, "YNAB4_TRANSACTION_DUPLICATE");
      assert.match(typed.message, /Duplicate transaction identity "duplicate-active"/);
      return true;
    },
  );
  await duplicate.close();
});
