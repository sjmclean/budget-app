import assert from "node:assert/strict";
import { auditYnab4MigrationCorrectness } from "../packages/ynab4-importer/src/auditYnab4MigrationCorrectness.js";

const healthyPackage = [
  {
    path: "Household.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1-AAAA" }),
  },
  {
    path: "Household.ynab4/data1-AAAA/budget-guid/Budget.yfull",
    text: JSON.stringify({
      accounts: [
        {
          entityId: "acct-cheque",
          accountName: "Cheque Account",
          accountType: "Checking",
          startingBalance: 100000,
          balance: 72500,
        },
        {
          entityId: "acct-visa",
          accountName: "Visa Card",
          accountType: "CreditCard",
          startingBalance: -50000,
          balance: -25000,
        },
      ],
      masterCategories: [
        {
          entityId: "group-everyday",
          name: "Everyday Expenses",
          subCategories: [{ entityId: "cat-groceries", name: "Groceries" }],
        },
      ],
      transactions: [
        {
          entityId: "txn-payment-source",
          accountId: "acct-cheque",
          targetAccountId: "acct-visa",
          transferTransactionId: "txn-payment-target",
          amount: -25000,
        },
        {
          entityId: "txn-payment-target",
          accountId: "acct-visa",
          targetAccountId: "acct-cheque",
          transferTransactionId: "txn-payment-source",
          amount: 25000,
        },
        {
          entityId: "txn-groceries",
          accountId: "acct-cheque",
          categoryId: "cat-groceries",
          amount: -2500,
        },
      ],
      scheduledTransactions: [
        {
          entityId: "sched-card-payment",
          accountId: "acct-cheque",
          targetAccountId: "acct-visa",
          amount: -10000,
        },
      ],
      monthlyBudgets: [
        {
          entityId: "MB/2026-01",
          month: "2026-01-01",
          monthlySubCategoryBudgets: [
            {
              entityId: "MCB/2026-01/cat-groceries",
              categoryId: "cat-groceries",
              budgeted: 10000,
              activity: -2500,
              balance: 7500,
            },
          ],
        },
      ],
    }),
  },
];

const healthyAudit = auditYnab4MigrationCorrectness(healthyPackage);
assert.equal(healthyAudit.canProceedToWriteImport, true);
assert.equal(healthyAudit.summary.accounts, 2);
assert.equal(healthyAudit.summary.transactions, 3);
assert.equal(healthyAudit.summary.scheduledTransactions, 1);
assert.equal(healthyAudit.summary.creditCardAccounts, 1);
assert.equal(healthyAudit.summary.transferTransactions, 2);
assert.equal(healthyAudit.blockers.length, 0);
assert.ok(healthyAudit.findings.some((finding) => finding.id === "credit-cards.manual-ynab4-transfer-model-detected"));

const defectivePackage = [
  {
    path: "Broken.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1-BBBB" }),
  },
  {
    path: "Broken.ynab4/data1-BBBB/budget-guid/Budget.yfull",
    text: JSON.stringify({
      accounts: [
        {
          entityId: "acct-cheque",
          accountName: "Cheque Account",
          accountType: "Checking",
          startingBalance: 100000,
          balance: 999999,
        },
        {
          entityId: "acct-visa",
          accountName: "Visa Card",
          accountType: "CreditCard",
          startingBalance: -50000,
          balance: -22500,
        },
      ],
      masterCategories: [
        {
          entityId: "group-everyday",
          name: "Everyday Expenses",
          subCategories: [{ entityId: "cat-groceries", name: "Groceries" }],
        },
      ],
      transactions: [
        {
          entityId: "txn-payment-source",
          accountId: "acct-cheque",
          targetAccountId: "acct-visa",
          transferTransactionId: "txn-payment-target",
          amount: -25000,
        },
        {
          entityId: "txn-payment-target",
          accountId: "acct-visa",
          targetAccountId: "acct-cheque",
          transferTransactionId: "txn-payment-source",
          amount: 20000,
        },
        {
          entityId: "txn-missing-account",
          accountId: "acct-missing",
          categoryId: "cat-groceries",
          amount: -2500,
        },
      ],
      monthlyBudgets: [
        {
          entityId: "MB/2026-01",
          month: "2026-01-01",
          monthlySubCategoryBudgets: [
            {
              entityId: "MCB/2026-01/cat-missing",
              categoryId: "cat-missing",
              budgeted: 10000,
              activity: -2500,
              balance: 7500,
            },
          ],
        },
      ],
    }),
  },
];

const defectiveAudit = auditYnab4MigrationCorrectness(defectivePackage);
assert.equal(defectiveAudit.canProceedToWriteImport, false);
assert.ok(defectiveAudit.blockers.some((finding) => finding.id === "accounts.balance-does-not-reconcile"));
assert.ok(defectiveAudit.blockers.some((finding) => finding.id === "accounts.transaction-references-missing-account"));
assert.ok(defectiveAudit.blockers.some((finding) => finding.id === "transfers.pair-amount-mismatch"));
assert.ok(defectiveAudit.blockers.some((finding) => finding.id === "categories.monthly-budget-references-missing-category"));
assert.ok(defectiveAudit.blockers.some((finding) => finding.id === "budgets.monthly-category-budget-unmapped"));

console.log("v1.73 YNAB4 migration correctness audit passed");
