import assert from "node:assert/strict";
import test from "node:test";

import { loadCompleteAccountTransactionsForImport } from "../../../apps/web/src/features/accounts/transactionImportAccountLoader.js";
import type {
  AccountRegisterQueryPort,
  AccountTransactionQuery,
  AccountTransactionRow,
} from "../../../packages/application/src/accountRegister/AccountRegisterQueryPort.js";

function row(index: number): AccountTransactionRow {
  return {
    id: `transaction-${String(index).padStart(3, "0")}`,
    date: "2026-08-01",
    amount: -600,
    memo: null,
    checkNumber: null,
    clearedStatus: "uncleared",
    payeeId: null,
    payeeName: "Example",
    rawPayeeName: "EXAMPLE",
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
});
