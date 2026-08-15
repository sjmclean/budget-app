import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import Database from "better-sqlite3";

import {
  collectYnab4ImportedPayeeExpectations,
  toSqliteImportTransaction,
} from "../../../apps/web/src/features/budget/ynab4LauncherImport.js";
import { mapYnab4Transactions } from "../../../apps/web/src/features/budget/ynab4/mapYnab4Transactions.js";
import { createLocalFirstYnab4ImportClient } from "../../../apps/web/src/features/persistence/localFirst/localFirstYnab4ImportClient.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import { createYnab4SourceReader } from "../../../packages/ynab4-importer/src/source/createYnab4SourceReader.js";
import type { Ynab4SourceRecord } from "../../../packages/ynab4-importer/src/source/types.js";

import {
  LOCAL_REGISTER_SCHEMA_SQL,
  LOCAL_TRANSACTION_UPSERT_SQL,
  localTransactionUpsertBindings,
  type LocalTransactionRecord,
} from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

test("local-first SQLite getTransactionsByIds read contract returns exact raw bank payee", () => {
  const directory = mkdtempSync(join(tmpdir(), "budget-app-raw-payee-"));
  const databasePath = join(directory, "provenance.sqlite");
  const expectedRawPayee = "LOCAL SHOP 0421 MELBOURNE";
  const transaction: LocalTransactionRecord = {
    id: "txn-provenance",
    budgetId: "budget-provenance",
    accountId: "checking",
    date: "2026-08-13",
    amount: -1234,
    memo: "Card ending 4242",
    checkNumber: null,
    clearedStatus: "cleared",
    payeeId: null,
    payeeName: "Local Shop",
    rawPayeeName: expectedRawPayee,
    categoryId: "groceries",
    categoryName: "Groceries",
    transferAccountId: null,
    transferTransactionId: null,
    generatedFromSchedule: false,
    scheduledTransactionId: null,
    scheduledOccurrenceDate: null,
    splitLines: [],
    tagIds: [],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };

  try {
    const database = new Database(databasePath);
    database.exec(LOCAL_REGISTER_SCHEMA_SQL);
    database.prepare(
      `INSERT INTO local_accounts(
         id, budget_id, name, type, participation, opening_balance,
         currency_code, created_at, closed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "checking",
      "budget-provenance",
      "Everyday",
      "checking",
      "budget",
      0,
      "AUD",
      "2026-08-14T00:00:00.000Z",
      null,
    );
    database.prepare(LOCAL_TRANSACTION_UPSERT_SQL).run(
      ...localTransactionUpsertBindings(transaction),
    );
    database.close();

    const reopened = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      // This is the account-scoped persistence read contract used by the
      // worker's getTransactionsByIds validation path.
      const rows = reopened.prepare(
        `SELECT id, account_id AS accountId,
                raw_payee_name AS rawPayeeName
           FROM local_transactions
          WHERE budget_id = ?
            AND account_id = ?
            AND id IN (?)`,
      ).all(
        "budget-provenance",
        "checking",
        "txn-provenance",
      ) as readonly {
        id: string;
        accountId: string;
        rawPayeeName: string | null;
      }[];

      assert.deepEqual(rows, [{
        id: "txn-provenance",
        accountId: "checking",
        rawPayeeName: expectedRawPayee,
      }]);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("raw YNAB4 reader preserves active provenance through SQLite staged validation and excludes tombstones", async () => {
  const directory = mkdtempSync(join(tmpdir(), "budget-app-raw-payee-lifecycle-"));
  const databasePath = join(directory, "provenance-lifecycle.sqlite");
  const sqlite = new Database(databasePath);
  sqlite.exec(LOCAL_REGISTER_SCHEMA_SQL);
  const source = JSON.stringify({
    accounts: [],
    masterCategories: [],
    payees: [],
    monthlyBudgets: [],
    transactions: [
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
    ],
    scheduledTransactions: [],
  });
  const reader = createYnab4SourceReader(source, {
    sourceName: "synthetic-provenance.yfull",
    chunkSize: 37,
  });

  const database = {
    async beginStagedImport() {},
    async importRegisterBatch(batch: {
      readonly accounts?: readonly {
        id: string;
        budgetId: string;
        name: string;
        type: string;
        participation: string;
        openingBalance: number;
        currencyCode: string;
        createdAt: string;
        closedAt: string | null;
      }[];
      readonly transactions?: readonly LocalTransactionRecord[];
    }) {
      for (const account of batch.accounts ?? []) {
        sqlite.prepare(
          `INSERT INTO local_accounts(
             id, budget_id, name, type, participation, opening_balance,
             currency_code, created_at, closed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          account.id,
          account.budgetId,
          account.name,
          account.type,
          account.participation,
          account.openingBalance,
          account.currencyCode,
          account.createdAt,
          account.closedAt,
        );
      }
      for (const transaction of batch.transactions ?? []) {
        sqlite.prepare(LOCAL_TRANSACTION_UPSERT_SQL).run(
          ...localTransactionUpsertBindings(transaction),
        );
      }
    },
    async getManifest() {
      return {
        counts: {
          accounts: Number((sqlite.prepare(
            "SELECT COUNT(*) AS count FROM local_accounts WHERE budget_id = ?",
          ).get("budget-lifecycle") as { count: number }).count),
          transactions: Number((sqlite.prepare(
            "SELECT COUNT(*) AS count FROM local_transactions WHERE budget_id = ?",
          ).get("budget-lifecycle") as { count: number }).count),
          payees: 0,
          categories: 0,
          budgetMonths: 0,
          scheduledTransactions: 0,
          transactionTags: 0,
        },
      };
    },
    async getTransactionsByIds(
      budgetId: string,
      accountId: string,
      ids: readonly string[],
    ) {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => "?").join(", ");
      return sqlite.prepare(
        `SELECT id, budget_id AS budgetId, account_id AS accountId,
                raw_payee_name AS rawPayeeName
           FROM local_transactions
          WHERE budget_id = ?
            AND account_id = ?
            AND id IN (${placeholders})`,
      ).all(budgetId, accountId, ...ids) as readonly LocalTransactionRecord[];
    },
    async getTransaction(budgetId: string, transactionId: string) {
      return (sqlite.prepare(
        `SELECT id, budget_id AS budgetId, account_id AS accountId,
                raw_payee_name AS rawPayeeName
           FROM local_transactions
          WHERE budget_id = ? AND id = ?`,
      ).get(budgetId, transactionId) ?? null) as LocalTransactionRecord | null;
    },
  } as unknown as LocalBudgetDatabaseClient;

  try {
    const sourceRecords: Ynab4SourceRecord[] = [];
    for await (const batch of reader.streamTransactions({ batchSize: 1 })) {
      sourceRecords.push(...batch);
    }
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

    const client = createLocalFirstYnab4ImportClient({
      database,
      syncEpoch: "epoch-lifecycle",
      deviceId: "device-lifecycle",
    });
    const session = await client.begin({
      budgetId: "budget-lifecycle",
      budgetName: "Imported Budget",
      currency: "AUD",
    });
    await session.persistReferenceData({
      accounts: [{
        id: "checking",
        name: "Checking",
        type: "checking",
        participation: "budget",
        openingBalance: 0,
        closedAt: null,
      }],
      payees: [],
      categories: [],
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
    assert.equal(
      (sqlite.prepare(
        "SELECT COUNT(*) AS count FROM local_transactions WHERE id = ?",
      ).get("deleted-import") as { count: number }).count,
      0,
    );
  } finally {
    await reader.close();
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
