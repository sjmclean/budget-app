import assert from "node:assert/strict";
import test from "node:test";

import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";
import { toSqliteImportTransaction } from "../../../apps/web/src/features/budget/ynab4LauncherImport.js";
import { createLocalFirstYnab4ImportClient } from "../../../apps/web/src/features/persistence/localFirst/localFirstYnab4ImportClient.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import type { LocalTransactionRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

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
    /txn-provenance-loss/,
  );
});
