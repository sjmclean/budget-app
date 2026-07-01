import { BankImportProviderApplicationService } from "../packages/application/src/BankImportProviderApplicationService.js";
import { BudgetImportProviderApplicationService } from "../packages/application/src/BudgetImportProviderApplicationService.js";

const service = new BankImportProviderApplicationService();
const budgetService = new BudgetImportProviderApplicationService();

const csvInspection = service.inspect({
  fileName: "statement.csv",
  text: "Date,Description,Amount\n2026-07-01,Cafe,-4.50",
});
if (csvInspection.providerId !== "csv") throw new Error("Expected CSV provider detection");
if (csvInspection.scope !== "account-transactions") throw new Error("CSV should remain an account-level transaction import provider");
if (csvInspection.canPreviewFullBudget) throw new Error("CSV should not expose full-budget preview");
if (!csvInspection.canCommitTransactions) throw new Error("CSV should remain transaction-commit capable");

const qifInspection = service.inspect({
  fileName: "statement.qif",
  text: "!Type:Bank\nD01/07/2026\nT-12.00\nPCafe\n^",
});
if (qifInspection.providerId !== "qif") throw new Error("Expected QIF provider detection");
if (qifInspection.scope !== "account-transactions") throw new Error("QIF should remain an account-level transaction import provider");
if (qifInspection.canPreviewFullBudget) throw new Error("QIF should not expose full-budget preview");

const actualExport = JSON.stringify({
  metadata: { version: "fixture", budgetName: "Household" },
  accounts: [{ id: "acc-1", name: "Cheque" }],
  category_groups: [{ id: "group-1", name: "Everyday" }],
  categories: [{ id: "cat-1", name: "Groceries", group: "group-1" }],
  payees: [{ id: "payee-1", name: "Woolworths" }],
  transactions: [
    { id: "tx-1", account: "acc-1", date: "2026-07-01", amount: -42500, payee: "payee-1", category: "cat-1" },
    { id: "tx-2", account: "acc-1", date: "2026-07-02", amount: 2500000, payee: null, category: null },
  ],
  rules: [{ id: "rule-1" }],
  schedules: [{ id: "schedule-1" }],
});

const actualInspection = budgetService.inspect({ fileName: "household.actualbudget", text: actualExport });
if (actualInspection.providerId !== "actual-budget") throw new Error("Expected Actual Budget provider detection");
if (actualInspection.scope !== "full-budget") throw new Error("Actual Budget should be a full-budget import provider");
if (!actualInspection.canPreviewFullBudget) throw new Error("Actual Budget should expose full-budget preview");
if (actualInspection.canCommitFullBudget) throw new Error("Raw Actual inspection should not be commit-capable without a full preview");
if (actualInspection.summary.find((item) => item.label === "Transactions")?.count !== 2) throw new Error("Expected Actual transactions to be counted");
if (actualInspection.summary.find((item) => item.label === "Rules")?.supported !== false) throw new Error("Expected Actual rules to be reported as unsupported");
if (!actualInspection.issues.some((issue) => issue.code === "ActualRulesPreviewOnly")) throw new Error("Expected Actual rules warning");
if (actualInspection.metadata.budgetName !== "Household") throw new Error("Expected Actual metadata extraction");

const fullBudgetPreview = budgetService.fullBudgetPreview({ fileName: "household.actualbudget", text: actualExport });
if (!fullBudgetPreview) throw new Error("Expected Actual full-budget preview");
if (fullBudgetPreview.format !== "actual-budget") throw new Error("Expected Actual full-budget preview format");
if (fullBudgetPreview.sourceBudgetName !== "Household") throw new Error("Expected Actual source budget name");
if (!fullBudgetPreview.canCommit) throw new Error("Actual full-budget previews should now be commit-capable after v2.44.5");
if (fullBudgetPreview.entityCounts.find((item) => item.label === "Accounts")?.count !== 1) throw new Error("Expected Actual account count in full-budget preview");
if (fullBudgetPreview.entityCounts.find((item) => item.label === "Transactions")?.count !== 2) throw new Error("Expected Actual transaction count in full-budget preview");

const csvFullBudgetPreview = budgetService.fullBudgetPreview({
  fileName: "statement.csv",
  text: "Date,Description,Amount\n2026-07-01,Cafe,-4.50",
});
if (csvFullBudgetPreview !== null) throw new Error("Account transaction imports should not expose full-budget preview");

console.log("v2.43.1 Actual full-budget import foundation checks passed");
