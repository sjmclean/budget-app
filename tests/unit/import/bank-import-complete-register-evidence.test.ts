import assert from "node:assert/strict";
import test from "node:test";

import {
  getTransactionImportEvidenceDateRange,
  loadTransactionImportEvidence,
} from "../../../apps/web/src/features/accounts/transactionImportEvidence.js";
import type { ParsedImportTransaction } from "../../../apps/web/src/features/accounts/transactionImport.js";
import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";

function imported(date: string): ParsedImportTransaction {
  return {
    rowNumber: 1,
    date,
    payee: "Northern Motor Group",
    outflow: 761.04,
    inflow: 0,
    raw: {},
  };
}

test("import evidence window expands source dates by fourteen calendar days", () => {
  assert.deepEqual(
    getTransactionImportEvidenceDateRange([
      imported("2026-08-17"),
      imported("2026-08-20"),
    ]),
    {
      startDate: "2026-08-03",
      endDate: "2026-09-03",
    },
  );
});

test("import evidence loader requests the complete bounded register window", async () => {
  const calls: {
    accountId: string;
    dateRange?: {
      startDate: string;
      endDate: string;
    };
  }[] = [];

  const sentinel = {
    id: "older-match",
    date: "2026-08-14",
    payee: "Northern Motor Group",
  } as RegisterTransactionView;

  const result = await loadTransactionImportEvidence(
    "checking",
    [imported("2026-08-17")],
    async (accountId, dateRange) => {
      calls.push({ accountId, dateRange });
      return [sentinel];
    },
  );

  assert.deepEqual(calls, [
    {
      accountId: "checking",
      dateRange: {
        startDate: "2026-08-03",
        endDate: "2026-08-31",
      },
    },
  ]);

  assert.deepEqual(result, [sentinel]);
});

import { loadTransactionImportRegisterEvidence } from "../../../apps/web/src/features/accounts/loadTransactionImportRegisterEvidence.js";
import type {
  AccountTransactionPage,
  AccountTransactionRow,
} from "../../../packages/application/src/accountRegister/AccountRegisterQueryPort.js";

test("import evidence continues beyond the first 250 register rows", async () => {
  const firstPageRows = Array.from(
    { length: 250 },
    (_, index) =>
      ({
        id: `recent-${index}`,
        date: "2026-08-17",
      }) as AccountTransactionRow,
  );

  const olderMatch = {
    id: "older-qif-overlap",
    date: "2026-08-14",
    payeeName: "Northern Motor Group",
    amount: -76_104,
  } as AccountTransactionRow;

  const cursors: Array<
    { readonly date: string; readonly id: string } | undefined
  > = [];

  const rows = await loadTransactionImportRegisterEvidence({
    budgetId: "budget-1",
    accountId: "checking",
    dateRange: {
      startDate: "2026-08-03",
      endDate: "2026-08-31",
    },
    queryPage: async (query): Promise<AccountTransactionPage> => {
      cursors.push(query.before);

      if (!query.before) {
        return {
          rows: firstPageRows,
          nextCursor: {
            date: "2026-08-17",
            id: "recent-249",
          },
          hasMore: true,
        };
      }

      return {
        rows: [olderMatch],
        nextCursor: {
          date: olderMatch.date,
          id: olderMatch.id,
        },
        hasMore: false,
      };
    },
  });

  assert.equal(rows.length, 251);
  assert.equal(rows.at(-1)?.id, "older-qif-overlap");

  assert.deepEqual(cursors, [
    undefined,
    {
      date: "2026-08-17",
      id: "recent-249",
    },
  ]);
});

import { previewTransactionQifImport } from "../../../apps/web/src/features/accounts/transactionImport.js";
import { buildRegisterTransaction } from "../../support/builders/importMatchingBuilders.js";

test("QIF matching finds an existing register transaction beyond row 250", async () => {
  const irrelevantRows = Array.from(
    { length: 250 },
    (_, index) =>
      ({
        id: `recent-${index}`,
        date: "2026-08-17",
      }) as AccountTransactionRow,
  );

  const matchedRegisterTransaction = buildRegisterTransaction({
    id: "older-qif-overlap",
    date: "2026-08-14",
    payee: "Northern Motor Group",
    outflow: 761.04,
    inflow: 0,
  });

  const evidenceRows = await loadTransactionImportRegisterEvidence({
    budgetId: "budget-1",
    accountId: "checking",
    dateRange: {
      startDate: "2026-08-03",
      endDate: "2026-08-31",
    },
    queryPage: async (query): Promise<AccountTransactionPage> => {
      if (!query.before) {
        return {
          rows: irrelevantRows,
          nextCursor: {
            date: "2026-08-17",
            id: "recent-249",
          },
          hasMore: true,
        };
      }

      return {
        rows: [
          {
            id: matchedRegisterTransaction.id,
            date: matchedRegisterTransaction.date,
          } as AccountTransactionRow,
        ],
        nextCursor: {
          date: matchedRegisterTransaction.date,
          id: matchedRegisterTransaction.id,
        },
        hasMore: false,
      };
    },
  });

  assert.equal(
    evidenceRows.length,
    251,
    "the matcher must receive evidence from pages beyond the first 250 rows",
  );

  const evidenceTransactions = [
    ...Array.from(
      { length: 250 },
      (_, index) =>
        buildRegisterTransaction({
          id: `recent-${index}`,
          date: "2026-08-17",
          payee: `Unrelated Merchant ${index}`,
          outflow: 1 + index,
          inflow: 0,
        }),
    ),
    matchedRegisterTransaction,
  ];

  assert.equal(
    evidenceTransactions.length,
    evidenceRows.length,
    "the reconciliation evidence must include every row loaded by bounded pagination",
  );

  const qif = [
    "!Type:Bank",
    "D17/08/26",
    "T-761.04",
    "PNorthern Motor Group",
    "^",
  ].join("\n");

  const preview = previewTransactionQifImport(
    qif,
    evidenceTransactions,
    {
      dateFormat: "DD/MM/YY",
      amountFormat: "decimal-dot",
    },
  );

  assert.equal(preview.candidates.length, 1);
  assert.equal(
    preview.candidates[0]?.status,
    "exact-match",
    "a valid existing transaction beyond row 250 must not be imported as new",
  );
  assert.equal(
    preview.candidates[0]?.matchedTransactionId,
    "older-qif-overlap",
    "the automatic match must target the existing page-two register transaction",
  );
});
