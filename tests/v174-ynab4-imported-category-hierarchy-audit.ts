import assert from "node:assert/strict";
import { auditYnab4ImportedCategoryHierarchy } from "../packages/ynab4-importer/src/auditYnab4ImportedCategoryHierarchy.js";
import type { Ynab4PackageEntry } from "./packages/ynab4-importer/src/analyzeYnab4Package.js";

const sourceEntries: Ynab4PackageEntry[] = [
  {
    path: "My Budget~ABC123.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data33-ACTIVE" }),
  },
  {
    path: "My Budget~ABC123.ynab4/data33-ACTIVE/DEVICE/Budget.yfull",
    text: JSON.stringify({
      masterCategories: [
        {
          entityId: "group-monthly-bills",
          name: "Monthly Bills",
          subCategories: [{ entityId: "cat-pocket-money", name: "Pocket Money" }],
        },
        {
          entityId: "group-main-expenses",
          name: "Main Expenses",
          subCategories: [{ entityId: "cat-income-holding", name: "Income Holding" }],
        },
        {
          entityId: "group-savings-goals",
          name: "Savings Goals",
          subCategories: [{ entityId: "cat-defered-income", name: "Defered Income" }],
        },
        { entityId: "group-pre-ynab-debt", name: "Pre-YNAB Debt", isTombstone: true, subCategories: [] },
        { entityId: "group-giving", name: "Giving", isTombstone: true, subCategories: [] },
        { entityId: "group-new-master-1", name: "New Master Category", isTombstone: true, subCategories: [] },
        { entityId: "group-new-master-2", name: "New Master Category", isTombstone: true, subCategories: [] },
        { entityId: "group-new-master-3", name: "New Master Category", isTombstone: true, subCategories: [] },
      ],
      accounts: [],
      transactions: [],
      scheduledTransactions: [],
      monthlyBudgets: [],
      payees: [],
    }),
  },
];

const importedBackup = JSON.stringify({
  schema: "budget-app.budget-backup.v1",
  records: [
    {
      key: "budget-app.budget-view.v1.my-budget-imported.2026-01",
      value: JSON.stringify({
        categoryGroups: [
          { id: "monthly-bills", name: "Monthly Bills", categories: [{ id: "pocket-money", name: "Pocket Money" }] },
          { id: "main-expenses", name: "Main Expenses", categories: [{ id: "income-holding", name: "Income Holding" }] },
          { id: "savings-goals", name: "Savings Goals", categories: [{ id: "defered-income", name: "Defered Income" }] },
          { id: "pocket-money-header", name: "Pocket Money", categories: [] },
          { id: "income-holding-header", name: "Income Holding", categories: [] },
          { id: "defered-income-header", name: "Defered Income", categories: [] },
          { id: "pre-ynab-debt", name: "Pre-YNAB Debt", categories: [] },
          { id: "giving", name: "Giving", categories: [] },
          { id: "new-master-1", name: "New Master Category", categories: [] },
          { id: "new-master-2", name: "New Master Category", categories: [] },
          { id: "new-master-3", name: "New Master Category", categories: [] },
        ],
      }),
    },
  ],
});

const cleanBackup = JSON.stringify({
  schema: "budget-app.budget-backup.v1",
  records: [
    {
      key: "budget-app.budget-view.v1.my-budget-imported.2026-01",
      value: JSON.stringify({
        categoryGroups: [
          { id: "monthly-bills", name: "Monthly Bills", categories: [{ id: "pocket-money", name: "Pocket Money" }] },
          { id: "main-expenses", name: "Main Expenses", categories: [{ id: "income-holding", name: "Income Holding" }] },
          { id: "savings-goals", name: "Savings Goals", categories: [{ id: "defered-income", name: "Defered Income" }] },
        ],
      }),
    },
  ],
});

const audit = auditYnab4ImportedCategoryHierarchy(sourceEntries, importedBackup);
assert.equal(audit.canTrustImportedCategoryHierarchy, false);
assert.equal(audit.summary.sourceCategoryGroups, 8);
assert.equal(audit.summary.sourceCategories, 3);
assert.equal(audit.summary.sourceHiddenGroups, 5);
assert.equal(audit.summary.promotedSubcategoryGroups, 3);
assert.equal(audit.summary.visibleHiddenSourceGroups, 3);
assert.equal(audit.summary.duplicateEmptyGroupNames, 1);

assert.ok(audit.blockers.some((finding) => finding.id === "categories.subcategory-promoted-to-empty-group" && finding.details?.categoryName === "Pocket Money"));
assert.ok(audit.blockers.some((finding) => finding.id === "categories.subcategory-promoted-to-empty-group" && finding.details?.categoryName === "Income Holding"));
assert.ok(audit.blockers.some((finding) => finding.id === "categories.subcategory-promoted-to-empty-group" && finding.details?.categoryName === "Defered Income"));
assert.ok(audit.blockers.some((finding) => finding.id === "categories.hidden-source-group-visible" && finding.details?.groupName === "Pre-YNAB Debt"));
assert.ok(audit.blockers.some((finding) => finding.id === "categories.hidden-source-group-visible" && finding.details?.groupName === "Giving"));
assert.ok(audit.blockers.some((finding) => finding.id === "categories.hidden-source-group-visible" && finding.details?.groupName === "New Master Category"));
assert.ok(audit.blockers.some((finding) => finding.id === "categories.duplicate-empty-group-in-month" && finding.details?.groupName === "New Master Category"));
assert.ok(audit.warnings.some((finding) => finding.id === "categories.source-group-name-duplicated" && finding.details?.groupName === "New Master Category"));

const cleanAudit = auditYnab4ImportedCategoryHierarchy(sourceEntries, cleanBackup);
assert.equal(cleanAudit.canTrustImportedCategoryHierarchy, true);
assert.equal(cleanAudit.summary.promotedSubcategoryGroups, 0);
assert.equal(cleanAudit.summary.visibleHiddenSourceGroups, 0);
assert.equal(cleanAudit.summary.duplicateEmptyGroupNames, 0);

console.log("v1.74 YNAB4 imported category hierarchy audit passed");
