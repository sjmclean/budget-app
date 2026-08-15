import assert from "node:assert/strict";
import test from "node:test";

import { loadCompleteAccountTransactionsForImport } from "../../../apps/web/src/features/accounts/transactionImportAccountLoader.js";
import { getTransactionImportQueryRange } from "../../../apps/web/src/features/accounts/transactionImportQueryRange.js";
import { previewTransactionQifImport } from "../../../apps/web/src/features/accounts/transactionImport.js";
import { prepareTransactionImportPreview } from "../../../apps/web/src/features/accounts/transactionImportPreviewPreparation.js";
import type {
  AccountRegisterQueryPort,
  AccountTransactionQuery,
  AccountTransactionRow,
} from "../../../packages/application/src/accountRegister/AccountRegisterQueryPort.js";

function row(index: number): AccountTransactionRow {
  return {
    id: `transaction-${String(index).padStart(3, "0")}`,
    date: index === 300 ? "2026-08-03" : "2026-08-01",
    amount: -600,
    memo: null,
    checkNumber: null,
    clearedStatus: "uncleared",
    payeeId: null,
    payeeName: "Example",
    rawPayeeName: index === 300 ? "BANK SOURCE PAYEE" : "EXAMPLE",
    importProvenance: index === 300 ? "ynab4-imported-payee" : null,
    categoryId: null,
    categoryName: null,
    transferAccountId: null,
    transferTransactionId: null,
    splitLines: [],
  };
}

test("production import loader pages beyond 250 and preserves account/date scope", async () => {
  const allRows = Array.from({ length: 301 }, (_, index) => row(index));
  const calls: AccountTransactionQuery[] = [];
  const queries: AccountRegisterQueryPort = {
    async getAccountSummary() {
      throw new Error("not used");
    },
    async queryTransactions(query) {
      calls.push(query);
      if (query.accountId !== "account-a") {
        return { rows: [], hasMore: false, nextCursor: null };
      }
      const offset = query.before ? 250 : 0;
      const rows = allRows.slice(offset, offset + 250);
      return {
        rows,
        hasMore: offset + rows.length < allRows.length,
        nextCursor: rows.length
          ? { date: rows.at(-1)!.date, id: rows.at(-1)!.id }
          : null,
      };
    },
  };

  const loaded = await loadCompleteAccountTransactionsForImport({
    queries,
    budgetId: "budget-a",
    accountId: "account-a",
    range: { fromDate: "2026-07-01", toDate: "2026-08-31" },
  });

  assert.equal(loaded.length, 301);
  assert.equal(loaded.some((transaction) => transaction.id === "transaction-300"), true);
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map(({ accountId, limit, fromDate, toDate }) => ({
      accountId, limit, fromDate, toDate,
    })),
    [
      { accountId: "account-a", limit: 250, fromDate: "2026-07-01", toDate: "2026-08-31" },
      { accountId: "account-a", limit: 250, fromDate: "2026-07-01", toDate: "2026-08-31" },
    ],
  );

  const incoming = previewTransactionQifImport([
    "!Type:Bank",
    "D05/08/26",
    "T-6.00",
    "PBANK SOURCE PAYEE",
    "MOriginal bank memo",
    "^",
  ].join("\n"), loaded, {
    dateFormat: "DD/MM/YY",
  });
  assert.deepEqual(getTransactionImportQueryRange(incoming), {
    fromDate: "2026-07-29",
    toDate: "2026-08-12",
  });

  const prepared = prepareTransactionImportPreview({
    partition: {
      activeCandidates: incoming.candidates,
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions: loaded,
    isExactDuplicateFile: false,
    sourceFileType: "qif",
  });
  assert.equal(prepared.alreadyRepresentedCount, 1);
  assert.equal(prepared.reviewCandidates.length, 0);

  const otherAccount = await loadCompleteAccountTransactionsForImport({
    queries,
    budgetId: "budget-a",
    accountId: "account-b",
    range: { fromDate: "2026-07-25", toDate: "2026-08-08" },
  });
  const isolated = prepareTransactionImportPreview({
    partition: {
      activeCandidates: incoming.candidates,
      previouslyImportedCandidates: [],
      alreadyRepresentedCandidates: [],
    },
    existingTransactions: otherAccount,
    isExactDuplicateFile: false,
    sourceFileType: "qif",
  });
  assert.equal(otherAccount.length, 0);
  assert.equal(isolated.alreadyRepresentedCount, 0);
  assert.equal(isolated.reviewCandidates.length, 1);
});
