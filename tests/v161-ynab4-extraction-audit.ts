import assert from "node:assert/strict";
import {
  auditYnab4PackageExtraction,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

const entries: Ynab4PackageEntry[] = [
  {
    path: "My Budget.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data32-73E5B868" }),
  },
  {
    path: "My Budget.ynab4/data32-73E5B868/device-guid/Budget.yfull",
    text: JSON.stringify({
      accounts: [
        {
          entityId: "a1",
          accountName: "Everyday Account",
          accountType: "Checking",
          onBudget: true,
          hidden: false,
        },
        {
          entityId: "a2",
          accountName: "Mortgage",
          accountType: "Mortgage",
          onBudget: false,
          hidden: true,
        },
      ],
      masterCategories: [
        {
          entityId: "mc1",
          name: "Bills",
          note: "Header note",
          subCategories: [
            { entityId: "c1", name: "Rent", note: "Category note" },
            { entityId: "c2", name: "Internet" },
          ],
        },
      ],
      payees: [
        {
          entityId: "p1",
          name: "Coles",
          autoFillCategoryId: "c2",
          autoFillAmount: -1000,
        },
        {
          entityId: "p2",
          name: "Transfer : Mortgage",
          targetAccountId: "a2",
        },
      ],
      monthlyBudgets: [
        {
          entityId: "mb1",
          month: "2026-06",
          monthlySubCategoryBudgets: [{ categoryId: "c1", budgeted: 1000 }],
        },
      ],
      transactions: [
        {
          entityId: "t1",
          accountId: "a1",
          payeeId: "p1",
          categoryId: "c2",
          amount: -5000,
          date: "2026-06-01",
          memo: "Groceries",
          cleared: "Cleared",
          flag: "red",
        },
        {
          entityId: "t2",
          accountId: "a1",
          payeeId: "p2",
          targetAccountId: "a2",
          transferTransactionId: "t3",
          amount: -50000,
          date: "2026-06-02",
        },
        {
          entityId: "t4",
          accountId: "a1",
          amount: -2500,
          date: "2026-06-03",
          isTombstone: true,
          subTransactions: [{ categoryId: "c1", amount: -1000 }],
        },
      ],
      scheduledTransactions: [
        {
          entityId: "s1",
          accountId: "a1",
          payeeId: "p2",
          targetAccountId: "a2",
          amount: -20000,
          date: "2026-07-01",
          frequency: "Monthly",
          subTransactions: [{ categoryId: "c1", amount: -20000 }],
        },
      ],
    }),
  },
];

function itemMap(entries: ReturnType<typeof auditYnab4PackageExtraction>["items"]) {
  return new Map(entries.map((item) => [item.entity, item]));
}

function testNestedActiveBudgetDataFileIsDiscovered() {
  const discovery = discoverYnab4Package(entries);

  assert.equal(discovery.isYnab4Package, true);
  assert.equal(
    discovery.budgetDataPath,
    "My Budget.ynab4/data32-73E5B868/device-guid/Budget.yfull",
  );
  assert.equal(discovery.counts.transactions, 3);
}

function testExtractionAuditReportsMajorEntityTypes() {
  const audit = auditYnab4PackageExtraction(entries);
  const items = itemMap(audit.items);

  assert.equal(audit.isYnab4Package, true);
  assert.equal(audit.budgetName, "My Budget");
  assert.equal(items.get("accounts")?.count, 2);
  assert.equal(items.get("category-groups")?.count, 1);
  assert.equal(items.get("categories")?.count, 2);
  assert.equal(items.get("payees")?.count, 2);
  assert.equal(items.get("monthly-budgets")?.count, 1);
  assert.equal(items.get("transactions")?.count, 3);
  assert.equal(items.get("scheduled-transactions")?.count, 1);
  assert.equal(items.get("notes")?.count, 2);
}

function testExtractionAuditFlagsEntitiesThatNeedMapping() {
  const audit = auditYnab4PackageExtraction(entries);
  const items = itemMap(audit.items);

  assert.equal(items.get("payees")?.status, "needs-mapping");
  assert.equal(items.get("monthly-budgets")?.status, "needs-mapping");
  assert.equal(items.get("transactions")?.status, "needs-mapping");
  assert.equal(items.get("scheduled-transactions")?.status, "needs-mapping");
  assert.equal(items.get("notes")?.status, "needs-mapping");

  assert.ok(
    items
      .get("transactions")
      ?.notes.some((note) => note.includes("Transfer-like transactions: 1")),
  );
  assert.ok(
    items
      .get("transactions")
      ?.notes.some((note) => note.includes("Split transactions: 1")),
  );
  assert.ok(
    items
      .get("transactions")
      ?.notes.some((note) => note.includes("Tombstone/deleted transactions: 1")),
  );
}

function testExtractionAuditCapturesSampleFields() {
  const audit = auditYnab4PackageExtraction(entries);
  const items = itemMap(audit.items);

  assert.ok(items.get("accounts")?.sampleFields.includes("accountName"));
  assert.ok(items.get("payees")?.sampleFields.includes("targetAccountId"));
  assert.ok(items.get("transactions")?.sampleFields.includes("transferTransactionId"));
  assert.ok(items.get("scheduled-transactions")?.sampleFields.includes("frequency"));
}

function testInvalidPackageReturnsWarnings() {
  const audit = auditYnab4PackageExtraction([
    { path: "not-a-budget/readme.txt", text: "hello" },
  ]);

  assert.equal(audit.isYnab4Package, false);
  assert.equal(audit.items.length, 0);
  assert.ok(audit.warnings.some((warning) => warning.includes("Budget.ymeta")));
}

function run() {
  testNestedActiveBudgetDataFileIsDiscovered();
  testExtractionAuditReportsMajorEntityTypes();
  testExtractionAuditFlagsEntitiesThatNeedMapping();
  testExtractionAuditCapturesSampleFields();
  testInvalidPackageReturnsWarnings();
  console.log("v1.61 YNAB4 extraction audit tests passed");
}

run();
