import { readFileSync } from "node:fs";
import { BudgetImportProviderApplicationService } from "../packages/application/src/BudgetImportProviderApplicationService.js";

const pageSource = readFileSync("apps/web/src/pages/BudgetSelectorPage.tsx", "utf8");

if (!pageSource.includes('type LaunchMode = "list" | "choose" | "empty" | "ynab" | "actual"')) {
  throw new Error("Expected BudgetSelector launch mode to include Actual Budget");
}

if (!pageSource.includes('onClick={() => setLaunchMode("actual")}')) {
  throw new Error("Expected Actual Budget launch option to be enabled");
}

if (!pageSource.includes("Select Actual export")) {
  throw new Error("Expected Actual Budget file picker label");
}

if (!pageSource.includes("actualBudgetImportProviderService.fullBudgetPreview") || !pageSource.includes("BudgetImportProviderApplicationService")) {
  throw new Error("Expected Actual Budget UI to use the budget full-budget preview service");
}

if (!pageSource.includes("Actual Budget imports are full-budget migrations")) {
  throw new Error("Expected Actual Budget UI to clarify full-budget import scope");
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
