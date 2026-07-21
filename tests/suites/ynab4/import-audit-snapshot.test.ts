import assert from "node:assert/strict";
import test from "node:test";

import {
  buildYnab4ImportAuditSnapshot,
  serializeYnab4ImportAuditSnapshot,
} from "../../../apps/web/src/features/budget/ynab4/serializeYnab4ImportAudit";
import type { Ynab4LauncherImportAccuracyAuditResult } from "../../../apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit";
import type { Ynab4LauncherImportPlan } from "../../../apps/web/src/features/budget/ynab4LauncherImport";

const emptyAudit: Ynab4LauncherImportAccuracyAuditResult = {
  status: "pass",
  mismatches: [],
  warnings: [],
  source: {
    accounts: 0,
    openAccounts: 0,
    closedAccounts: 0,
    transactions: 0,
    openAccountTransactions: 0,
    closedAccountTransactions: 0,
    scheduledTransactions: 0,
    categoryGroups: 0,
    categories: 0,
    monthlyBudgets: 0,
    budgetMonthSourceRowSchema: {
      totalRows: 0,
      rowsWithBudgeted: 0,
      rowsWithActivity: 0,
      rowsWithOutflows: 0,
      rowsWithAvailable: 0,
      rowsWithBalance: 0,
      rowsWithOverspendingHandling: 0,
    },
    budgetMonthTotals: {},
    budgetMonthCategoryValues: {},
    budgetMonthCategoryActivityContributions: {},
    transactionsByAccountName: {},
    accountTransactionFidelity: {},
  },
  imported: {
    accounts: 0,
    openAccounts: 0,
    closedAccounts: 0,
    transactions: 0,
    openAccountTransactions: 0,
    closedAccountTransactions: 0,
    scheduledTransactions: 0,
    budgetMonthViews: 0,
    budgetMonthTotals: {},
    budgetMonthCategoryValues: {},
    budgetMonthCategoryActivityContributions: {},
    transactionsByAccountName: {},
    accountTransactionFidelity: {},
  },
};

test("serialises the existing audit as the sole financial source of truth", () => {
  const snapshot = buildYnab4ImportAuditSnapshot(emptyAudit);

  assert.deepStrictEqual(snapshot.audit, emptyAudit);
  assert.equal(snapshot.planDetails, undefined);

  assert.equal(
    serializeYnab4ImportAuditSnapshot(emptyAudit),
    serializeYnab4ImportAuditSnapshot(emptyAudit),
  );
});

test("adds only stable schedule and transfer plan details", () => {
  const plan = {
    budgetId: "budget-1",
    accounts: [],
    payees: [],
    transactionTags: [],
    budgetMonths: new Map(),
    warnings: ["z warning", "a warning"],
    scheduledTransactions: [
      {
        id: "schedule-1",
        accountId: "account-1",
        nextDueDate: "2026-08-01",
        frequency: "monthly",
        payee: "Rent",
        category: "Housing",
        outflow: 1000,
        inflow: 0,
        createdAt: "volatile-created",
        updatedAt: "volatile-updated",
      },
    ],
    registers: {
      "account-1": {
        accountId: "account-1",
        accountName: "Checking",
        accountType: "On budget",
        currencyCode: "AUD",
        clearedBalance: 0,
        unclearedBalance: 0,
        workingBalance: 0,
        transactions: [
          {
            id: "transfer-leg",
            date: "2026-07-01",
            attachmentCount: 0,
            attachments: [],
            payee: "Transfer",
            category: "Transfer",
            inflow: 0,
            outflow: 25,
            runningBalance: -25,
            cleared: true,
            reconciled: false,
            transferId: "pair-1",
            transferAccountId: "account-2",
            transferTransactionId: "other-leg",
          },
        ],
      },
    },
  } satisfies Ynab4LauncherImportPlan;

  const text = serializeYnab4ImportAuditSnapshot(emptyAudit, plan);

  assert.match(text, /"transferId": "pair-1"/);
  assert.match(text, /"nextDueDate": "2026-08-01"/);
  assert.doesNotMatch(text, /volatile-created|volatile-updated/);
  assert.ok(text.indexOf("a warning") < text.indexOf("z warning"));
});