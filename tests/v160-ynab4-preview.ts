import assert from "node:assert/strict";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  getYnab4PackageMigrationProgressSteps,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

const entries: Ynab4PackageEntry[] = [
  {
    path: "My Budget.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data32-73E5B868" }),
  },
  {
    path: "My Budget.ynab4/data32-73E5B868/Budget.yfull",
    text: JSON.stringify({
      accounts: [{ accountId: "a1" }, { accountId: "a2" }],
      masterCategories: [
        {
          name: "Bills",
          note: "Header note",
          subCategories: [{ name: "Rent", note: "Category note" }],
        },
        {
          name: "Everyday",
          subCategories: [{ name: "Groceries" }, { name: "Fuel" }],
        },
      ],
      payees: [{ name: "Coles" }, { name: "Payroll" }, { name: "Visa" }],
      monthlyBudgets: [{ month: "2026-06" }],
      transactions: [
        {
          id: "t1",
          date: "2026-06-01",
          payeeName: "Coles",
          amount: -4500,
          memo: "Groceries",
        },
        { id: "t2", date: "2026-06-02", payeeName: "Payroll", amount: 250000 },
        { id: "t3", date: "2026-06-03", payeeName: "Visa", amount: -10000 },
        { id: "t4", date: "2026-06-04", payeeName: "Fuel", amount: -8500 },
      ],
      scheduledTransactions: [
        {
          id: "s1",
          payeeName: "Mortgage",
          nextDueDate: "2026-07-01",
          amount: -200000,
        },
      ],
    }),
  },
];

function testPreviewSummarisesDiscoveredPackage() {
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");

  assert.equal(preview.canContinue, true);
  assert.equal(preview.destructive, false);
  assert.equal(preview.budgetName, "My Budget");
  assert.deepEqual(
    Object.fromEntries(
      preview.summaryItems.map((item) => [item.label, item.value]),
    ),
    {
      Accounts: 2,
      "Category groups": 2,
      Categories: 3,
      Payees: 3,
      "Monthly budgets": 1,
      Transactions: 4,
      "Scheduled transactions": 1,
      "Category notes": 1,
      "Category group notes": 1,
    },
  );
}

function testPreviewIncludesDrillDownSamples() {
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");

  assert.equal(preview.details.accounts.length, 2);
  assert.equal(preview.details.categoryGroups[0]?.name, "Bills");
  assert.equal(preview.details.categoryGroups[0]?.categories[0]?.name, "Rent");
  assert.equal(
    preview.details.notes.categoryGroupNotes[0]?.note,
    "Header note",
  );
  assert.equal(preview.details.notes.categoryNotes[0]?.note, "Category note");
  assert.equal(preview.details.firstTransactions[0]?.payee, "Coles");
  assert.equal(preview.details.scheduledTransactions[0]?.payee, "Mortgage");
}

function testReplaceModeIsDestructiveButStillPreviewOnly() {
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(
    discovery,
    "replace-current-budget",
  );

  assert.equal(preview.mode, "replace-current-budget");
  assert.equal(preview.destructive, true);
  assert.equal(preview.canContinue, true);
}

function testProgressStepsIncludeVisibleImportPhases() {
  const phases = getYnab4PackageMigrationProgressSteps().map(
    (step) => step.phase,
  );

  assert.deepEqual(phases.slice(0, 4), [
    "read-file",
    "validate-json",
    "analyse-structure",
    "preview-migration",
  ]);
  assert.ok(phases.includes("import-accounts"));
  assert.ok(phases.includes("import-categories"));
  assert.ok(phases.includes("import-payees"));
  assert.ok(phases.includes("import-transactions"));
  assert.ok(phases.includes("import-scheduled-transactions"));
  assert.equal(phases.at(-1), "complete");
}

function testInvalidPackageCannotContinue() {
  const discovery = discoverYnab4Package([
    { path: "not-a-budget/readme.txt", text: "hello" },
  ]);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");

  assert.equal(preview.canContinue, false);
  assert.ok(
    preview.warnings.some((warning) => warning.includes("Budget.ymeta")),
  );
}

function run() {
  testPreviewSummarisesDiscoveredPackage();
  testPreviewIncludesDrillDownSamples();
  testReplaceModeIsDestructiveButStillPreviewOnly();
  testProgressStepsIncludeVisibleImportPhases();
  testInvalidPackageCannotContinue();
  console.log("v1.60 YNAB4 preview tests passed");
}

run();
