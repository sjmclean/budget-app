import { BankImportProviderApplicationService } from "../packages/application/src/BankImportProviderApplicationService.js";
import { BudgetImportProviderApplicationService } from "../packages/application/src/BudgetImportProviderApplicationService.js";

const service = new BankImportProviderApplicationService();
const budgetService = new BudgetImportProviderApplicationService();

const actualExport = JSON.stringify({
  metadata: { version: "fixture", budgetName: "Household" },
  accounts: [
    { id: "acc-cheque", name: "Cheque", type: "checking" },
    { id: "acc-savings", name: "Savings", type: "savings", closed: true },
  ],
  category_groups: [{ id: "group-everyday", name: "Everyday" }],
  categories: [
    { id: "cat-groceries", name: "Groceries", group: "group-everyday" },
    { id: "cat-hidden", name: "Old category", group: "group-everyday", hidden: true },
  ],
  payees: [
    { id: "payee-woolworths", name: "Woolworths" },
    { id: "payee-transfer", name: "Transfer : Savings" },
  ],
  transactions: [
    {
      id: "tx-1",
      account: "acc-cheque",
      date: "2026-07-01",
      amount: -42500,
      payee: "payee-woolworths",
      category: "cat-groceries",
      notes: "weekly shop",
      cleared: true,
    },
    {
      id: "tx-2",
      account: "acc-cheque",
      date: "2026-07-02",
      amount: -100000,
      payee: "payee-transfer",
      category: null,
      transfer_id: "transfer-1",
    },
    {
      id: "tx-3",
      account: "missing-account",
      date: "2026-07-03",
      amount: -5000,
      payee: "missing-payee",
      category: "missing-category",
    },
  ],
});

const fullBudgetPreview = budgetService.fullBudgetPreview({ fileName: "household.actualbudget", text: actualExport });

if (!fullBudgetPreview) throw new Error("Expected Actual full-budget preview");
if (fullBudgetPreview.sourceBudgetName !== "Household") throw new Error("Expected Actual source budget name");
if (fullBudgetPreview.accounts.length !== 2) throw new Error("Expected Actual accounts to be previewed");
if (fullBudgetPreview.accounts[1]?.closed !== true) throw new Error("Expected closed account state to be preserved in preview");
if (fullBudgetPreview.categoryGroups.length !== 1) throw new Error("Expected Actual category groups to be previewed");
if (fullBudgetPreview.categories.length !== 2) throw new Error("Expected Actual categories to be previewed");
if (fullBudgetPreview.categories[0]?.groupName !== "Everyday") throw new Error("Expected category group names to be resolved");
if (fullBudgetPreview.categories[1]?.hidden !== true) throw new Error("Expected hidden category state to be preserved in preview");
if (fullBudgetPreview.payees.length !== 2) throw new Error("Expected Actual payees to be previewed");
if (fullBudgetPreview.transactions.length !== 3) throw new Error("Expected Actual transactions to be previewed");
if (fullBudgetPreview.transactions[0]?.accountName !== "Cheque") throw new Error("Expected transaction account name to be resolved");
if (fullBudgetPreview.transactions[0]?.payeeName !== "Woolworths") throw new Error("Expected transaction payee name to be resolved");
if (fullBudgetPreview.transactions[0]?.categoryName !== "Groceries") throw new Error("Expected transaction category name to be resolved");
if (fullBudgetPreview.transactions[0]?.memo !== "weekly shop") throw new Error("Expected transaction memo to be preserved");
if (fullBudgetPreview.transactions[0]?.cleared !== true) throw new Error("Expected cleared state to be preserved");
if (fullBudgetPreview.transactions[1]?.isTransfer !== true) throw new Error("Expected transfer transaction to be identified");
if (fullBudgetPreview.transferCount !== 1) throw new Error("Expected transfer count");
if (!fullBudgetPreview.issues.some((issue) => issue.code === "ActualUnknownAccountReference")) throw new Error("Expected unknown account reference warning");
if (!fullBudgetPreview.issues.some((issue) => issue.code === "ActualUnknownCategoryReference")) throw new Error("Expected unknown category reference warning");
if (!fullBudgetPreview.issues.some((issue) => issue.code === "ActualUnknownPayeeReference")) throw new Error("Expected unknown payee reference warning");
if (fullBudgetPreview.canCommit) throw new Error("Actual full-budget commit should remain disabled in v2.43.2");

const csvFullBudgetPreview = budgetService.fullBudgetPreview({
  fileName: "statement.csv",
  text: "Date,Description,Amount\n2026-07-01,Cafe,-4.50",
});
if (csvFullBudgetPreview !== null) throw new Error("CSV must not expose full-budget preview details");

console.log("v2.43.2 Actual full-budget preview checks passed");
