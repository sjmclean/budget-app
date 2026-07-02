import { readFileSync } from "node:fs";
import { BudgetImportProviderApplicationService } from "../packages/application/src/BudgetImportProviderApplicationService.js";

const pageSource = [
  readFileSync("apps/web/src/pages/BudgetSelectorPage.tsx", "utf8"),
  readFileSync("apps/web/src/pages/budgetSelector/BudgetImportDialog.tsx", "utf8"),
  readFileSync("apps/web/src/pages/budgetSelector/BudgetImportProgress.tsx", "utf8"),
].join("\n");

if (!pageSource.includes('type LaunchMode = "list" | "choose" | "empty" | "budgetImport"')) {
  throw new Error("Expected BudgetSelector launch mode to include unified Budget Import");
}

if (!pageSource.includes('<strong>Import Budget</strong>')) {
  throw new Error("Expected BudgetSelector to expose a single Budget Import launcher");
}

if (!pageSource.includes("Actual Budget") || !pageSource.includes("YNAB4") || !pageSource.includes("Budget Backup")) {
  throw new Error("Expected unified Budget Import UI to list supported budget import providers");
}

if (!pageSource.includes("YNAB Online") || !pageSource.includes("Planned")) {
  throw new Error("Expected unified Budget Import UI to list YNAB Online as planned");
}

if (!pageSource.includes("Drop your budget here")) {
  throw new Error("Expected unified Budget Import file picker label");
}

if (!pageSource.includes("actualBudgetImportProviderService.fullBudgetPreview") || !pageSource.includes("BudgetImportProviderApplicationService")) {
  throw new Error("Expected Actual Budget UI to use the budget full-budget preview service");
}

if (!pageSource.includes("create a new local budget") || !pageSource.includes("completion report")) {
  throw new Error("Expected Actual Budget UI to clarify direct full-budget import scope");
}

const service = new BudgetImportProviderApplicationService();
const preview = service.fullBudgetPreview({
  fileName: "actual-export.json",
  text: JSON.stringify({
    budgetName: "Household",
    accounts: [{ id: "account-1", name: "Checking", type: "checking" }],
    category_groups: [{ id: "group-1", name: "Everyday" }],
    categories: [{ id: "category-1", name: "Groceries", group: "group-1" }],
    payees: [{ id: "payee-1", name: "Woolworths" }],
    transactions: [{ id: "transaction-1", account: "account-1", date: "2026-07-01", amount: -4200, payee: "payee-1", category: "category-1" }],
  }),
});

if (!preview) throw new Error("Expected Actual Budget full-budget preview");
if (preview.sourceBudgetName !== "Household") throw new Error("Expected Actual Budget source budget name");
if (!preview.canCommit) throw new Error("Actual Budget previews should now be commit-capable after v2.44.5");

console.log("v2.43.3 Actual Budget preview UI checks passed");
