import assert from "node:assert/strict";
import { discoverYnab4Package } from "../packages/ynab4-importer/src/analyzeYnab4Package.js";

function createPackageEntries() {
  return [
    {
      path: "My Budget~ABC123.ynab4/Budget.ymeta",
      text: JSON.stringify({
        formatVersion: "2",
        relativeDataFolderName: "data32-73E5B868",
        TED: 17556350400000,
      }),
    },
    {
      path: "My Budget~ABC123.ynab4/data31-OLD/DEVICE/Budget.yfull",
      text: JSON.stringify({ transactions: [{ entityId: "old" }] }),
    },
    {
      path: "My Budget~ABC123.ynab4/data32-73E5B868/DEVICE/Budget.yfull",
      text: JSON.stringify({
        masterCategories: [
          {
            entityId: "mc-1",
            name: "Bills",
            note: "Header note",
            subCategories: [
              { entityId: "cat-1", name: "Electricity", note: "Quarterly bill" },
              { entityId: "cat-2", name: "Water" },
            ],
          },
        ],
        payees: [{ entityId: "payee-1" }, { entityId: "payee-2" }],
        monthlyBudgets: [{ entityId: "month-1" }],
        fileMetaData: { entityId: "file" },
        transactions: [{ entityId: "txn-1" }, { entityId: "txn-2" }, { entityId: "txn-3" }],
        scheduledTransactions: [{ entityId: "schedule-1" }],
        budgetMetaData: { dateLocale: "en_AU" },
        accounts: [{ entityId: "account-1" }, { entityId: "account-2" }],
      }),
    },
  ];
}

function testDiscoversActiveYnab4PackageDataFile() {
  const result = discoverYnab4Package(createPackageEntries());

  assert.equal(result.isYnab4Package, true);
  assert.equal(result.packageRoot, "My Budget~ABC123.ynab4");
  assert.equal(result.budgetName, "My Budget");
  assert.equal(result.metadataPath, "My Budget~ABC123.ynab4/Budget.ymeta");
  assert.equal(result.relativeDataFolderName, "data32-73E5B868");
  assert.equal(result.activeDataFolderPath, "My Budget~ABC123.ynab4/data32-73E5B868");
  assert.equal(result.budgetDataPath, "My Budget~ABC123.ynab4/data32-73E5B868/DEVICE/Budget.yfull");
  assert.equal(result.budgetDataFormat, "yfull");
}

function testProducesMigrationPreviewCounts() {
  const result = discoverYnab4Package(createPackageEntries());

  assert.deepEqual(result.counts, {
    accounts: 2,
    masterCategories: 1,
    categories: 2,
    payees: 2,
    monthlyBudgets: 1,
    transactions: 3,
    scheduledTransactions: 1,
    categoryNotes: 1,
    categoryGroupNotes: 1,
  });

  assert.ok(result.topLevelKeys.includes("transactions"));
  assert.ok(result.topLevelKeys.includes("scheduledTransactions"));
}

function testDiscoveryProgressStepsAreUserVisible() {
  const result = discoverYnab4Package(createPackageEntries());

  assert.ok(result.progressSteps.length >= 4);
  assert.equal(result.progressSteps[0]?.phase, "read-file");
  assert.ok(result.progressSteps.some((step) => step.phase === "analyse-structure"));
  assert.ok(result.progressSteps.some((step) => step.phase === "preview-migration"));
}

function testRejectsCsvStyleInput() {
  const result = discoverYnab4Package([
    {
      path: "Register.csv",
      text: "Date,Payee,Amount\n2026-06-01,Coles,-42.50",
    },
  ]);

  assert.equal(result.isYnab4Package, false);
  assert.match(result.warnings[0], /Budget\.ymeta/);
}

function testRequiresActiveDataFolderFromMetadata() {
  const result = discoverYnab4Package([
    {
      path: "Budget.ymeta",
      text: JSON.stringify({ formatVersion: "2" }),
    },
  ]);

  assert.equal(result.isYnab4Package, false);
  assert.match(result.warnings[0], /relativeDataFolderName/);
}

function run() {
  testDiscoversActiveYnab4PackageDataFile();
  testProducesMigrationPreviewCounts();
  testDiscoveryProgressStepsAreUserVisible();
  testRejectsCsvStyleInput();
  testRequiresActiveDataFolderFromMetadata();
  console.log("v1.59 YNAB4 package discovery tests passed");
}

run();
