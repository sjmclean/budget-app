import { BankImportProviderApplicationService } from "../packages/application/src/BankImportProviderApplicationService.js";
import { BudgetImportProviderApplicationService } from "../packages/application/src/BudgetImportProviderApplicationService.js";

const bankService = new BankImportProviderApplicationService();
const budgetService = new BudgetImportProviderApplicationService();

const bankProviders = bankService.listProviders().map((provider) => provider.id);
if (bankProviders.includes("actual-budget")) throw new Error("Actual Budget must not be registered as an account transaction import provider");
for (const expected of ["csv", "qif", "ofx", "qfx"]) {
  if (!bankProviders.includes(expected)) throw new Error(`Expected bank import provider registry to include ${expected}`);
}

const budgetProviders = budgetService.listProviders().map((provider) => provider.id);
if (!budgetProviders.includes("actual-budget")) throw new Error("Expected budget import provider registry to include Actual Budget");

const actualExport = JSON.stringify({
  metadata: { version: "fixture", budgetName: "Household" },
  accounts: [{ id: "acc-1", name: "Cheque" }],
  category_groups: [{ id: "group-1", name: "Everyday" }],
  categories: [{ id: "cat-1", name: "Groceries", group: "group-1" }],
  payees: [{ id: "payee-1", name: "Woolworths" }],
  transactions: [{ id: "tx-1", account: "acc-1", date: "2026-07-01", amount: -42500, payee: "payee-1", category: "cat-1" }],
  rules: [{ id: "rule-1" }],
});

const bankInspection = bankService.inspect({ fileName: "household.actualbudget", text: actualExport });
if (bankInspection.isRecognized) throw new Error("Bank transaction import service should not recognize Actual Budget files");
if (bankService.preview({ fileName: "household.actualbudget", text: actualExport }) !== null) throw new Error("Bank transaction import service should not preview Actual Budget files");

const budgetInspection = budgetService.inspect({ fileName: "household.actualbudget", text: actualExport });
if (budgetInspection.providerId !== "actual-budget") throw new Error("Expected budget import service to detect Actual Budget");
if (budgetInspection.scope !== "full-budget") throw new Error("Expected Actual Budget to be full-budget scoped");
if (!budgetInspection.canPreviewFullBudget) throw new Error("Expected Actual Budget budget provider to support preview");
if (budgetInspection.canCommitFullBudget) throw new Error("Raw Actual inspection should not be commit-capable without a full preview");
if (budgetInspection.summary.find((item) => item.label === "Transactions")?.count !== 1) throw new Error("Expected Actual transaction count");

const fullBudgetPreview = budgetService.fullBudgetPreview({ fileName: "household.actualbudget", text: actualExport });
if (!fullBudgetPreview) throw new Error("Expected Actual full-budget preview");
if (fullBudgetPreview.accounts.length !== 1) throw new Error("Expected Actual account preview");
if (fullBudgetPreview.transactions.length !== 1) throw new Error("Expected Actual transaction preview");
if (!fullBudgetPreview.canCommit) throw new Error("Actual full-budget previews should now be commit-capable after v2.44.5");


const actualZipInspection = budgetService.inspect({ fileName: "actual-export.zip", text: "PK\u0003\u0004db.sqlite metadata.json" });
if (actualZipInspection.providerId !== "actual-budget") throw new Error("Expected Actual Budget ZIP files to be accepted by the budget import service");
if (!actualZipInspection.canPreviewFullBudget) throw new Error("Expected Actual Budget ZIP files to open the preview path");
if (actualZipInspection.issues.find((issue) => issue.code === "ActualZipPreviewPending") === undefined) throw new Error("Expected Actual Budget ZIP preview to explain that SQLite inspection is pending");

const csvBudgetPreview = budgetService.fullBudgetPreview({
  fileName: "statement.csv",
  text: "Date,Description,Amount\n2026-07-01,Cafe,-4.50",
});
if (csvBudgetPreview !== null) throw new Error("Budget import service should not preview account-level CSV imports");

console.log("v2.44.0 budget import provider foundation checks passed");
