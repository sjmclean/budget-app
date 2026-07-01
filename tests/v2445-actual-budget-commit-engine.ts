import { createActualBudgetLauncherImport, readActualBudgetLauncherImportRecord } from "../apps/web/src/features/budget/actualBudgetLauncherImport.js";
import { getBudgetScopedStorageKey, SELECTED_BUDGET_STORAGE_KEY } from "../apps/web/src/features/budget/budgetDataScope.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";
import type { FullBudgetImportPreview } from "../packages/types/src/index.js";

class MemoryStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  listKeys(): string[] { return [...this.values.keys()]; }
}

const preview: FullBudgetImportPreview = {
  format: "actual-budget",
  providerId: "actual-budget",
  providerLabel: "Actual Budget",
  sourceBudgetName: "Actual Household",
  entityCounts: [
    { label: "Accounts", count: 2, supported: true },
    { label: "Category groups", count: 1, supported: true },
    { label: "Categories", count: 1, supported: true },
    { label: "Payees", count: 2, supported: true },
    { label: "Transactions", count: 3, supported: true },
    { label: "Rules", count: 4, supported: false, note: "Not imported yet" },
  ],
  issues: [{ rowNumber: null, severity: "warning", code: "ActualRulesPreviewOnly", message: "Rules are detected but not imported yet." }],
  metadata: { budgetName: "Actual Household", currency: "AUD" },
  accounts: [
    { id: "acct-cheque", name: "Cheque", type: "checking", closed: false, offBudget: false },
    { id: "acct-savings", name: "Savings", type: "savings", closed: false, offBudget: false },
    { id: "acct-mortgage", name: "Mortgage Account", type: "mortgage", closed: false, offBudget: true },
  ],
  categoryGroups: [
    { id: "group-income", name: "Income", hidden: false, isIncome: true },
    { id: "group-hidden", name: "Hidden Categories", hidden: false },
    { id: "group-everyday", name: "Everyday", hidden: false },
  ],
  categories: [
    { id: "cat-income", name: "Income", groupId: "group-income", groupName: "Income", hidden: false, isIncome: true },
    { id: "cat-hidden", name: "Fortnight Two (2)/Mortgage", groupId: "group-hidden", groupName: "Hidden Categories", hidden: false },
    { id: "cat-groceries", name: "Groceries", groupId: "group-everyday", groupName: "Everyday", hidden: false },
    { id: "cat-sinking", name: "Sinking Fund", groupId: "group-everyday", groupName: "Everyday", hidden: false },
    { id: "cat-mortgage", name: "Mortgage ($955/f) $878", groupId: "group-everyday", groupName: "Everyday", hidden: false },
  ],
  payees: [
    { id: "payee-shop", name: "Woolworths" },
    { id: "payee-transfer", name: "Transfer: Savings" },
    { id: "payee-mortgage-transfer", name: "Transfer: Mortgage Account" },
  ],
  budgetMonths: [
    { id: "202606-cat-income", month: "2026-06", categoryId: "cat-income", assigned: 0, carryover: 0 },
    { id: "202607-cat-income", month: "2026-07", categoryId: "cat-income", assigned: 0, carryover: 0 },
    { id: "202606-cat-hidden", month: "2026-06", categoryId: "cat-hidden", assigned: 999999, carryover: 1 },
    { id: "202607-cat-hidden", month: "2026-07", categoryId: "cat-hidden", assigned: 0, carryover: 1 },
    { id: "202606-cat-groceries", month: "2026-06", categoryId: "cat-groceries", assigned: 10000, carryover: 0 },
    { id: "202607-cat-groceries", month: "2026-07", categoryId: "cat-groceries", assigned: 0, carryover: 0 },
    { id: "202606-cat-sinking", month: "2026-06", categoryId: "cat-sinking", assigned: 5000, carryover: 1 },
    { id: "202607-cat-sinking", month: "2026-07", categoryId: "cat-sinking", assigned: 0, carryover: 1 },
    { id: "202606-cat-mortgage", month: "2026-06", categoryId: "cat-mortgage", assigned: 180000, carryover: 0 },
    { id: "202607-cat-mortgage", month: "2026-07", categoryId: "cat-mortgage", assigned: 0, carryover: 0 },
  ],
  transactions: [
    { id: "tx-1", accountId: "acct-cheque", accountName: "Cheque", date: "2026-06-01", amount: -1234, payeeId: "payee-shop", payeeName: "Woolworths", categoryId: "cat-groceries", categoryName: "Groceries", memo: "weekly shop", cleared: true, transferId: null, isTransfer: false },
    { id: "tx-2", accountId: "acct-cheque", accountName: "Cheque", date: "2026-06-02", amount: 5000, payeeId: null, payeeName: "Salary", categoryId: "cat-income", categoryName: "Income", memo: null, cleared: false, transferId: null, isTransfer: false },
    { id: "tx-hidden", accountId: "acct-cheque", accountName: "Cheque", date: "2026-06-02", amount: -79000, payeeId: "payee-shop", payeeName: "Woolworths", categoryId: "cat-hidden", categoryName: "Fortnight Two (2)/Mortgage", memo: null, cleared: false, transferId: null, isTransfer: false },
    { id: "tx-3", accountId: "acct-cheque", accountName: "Cheque", date: "2026-06-03", amount: -2500, payeeId: "payee-transfer", payeeName: "Transfer: Savings", categoryId: "cat-groceries", categoryName: "Groceries", memo: "save", cleared: true, transferId: "acct-savings", isTransfer: true },
    { id: "tx-mortgage-july", accountId: "acct-cheque", accountName: "Cheque", date: "2026-07-01", amount: -180000, payeeId: "payee-mortgage-transfer", payeeName: "Transfer: Mortgage Account", categoryId: "cat-mortgage", categoryName: "Mortgage ($955/f) $878", memo: null, cleared: true, transferId: "acct-mortgage", isTransfer: true },
    {
      id: "tx-4",
      accountId: "acct-cheque",
      accountName: "Cheque",
      date: "2026-06-04",
      amount: -3000,
      payeeId: "payee-shop",
      payeeName: "Woolworths",
      categoryId: null,
      categoryName: null,
      memo: "split shop",
      cleared: true,
      transferId: null,
      isTransfer: false,
      splitLines: [
        { id: "split-food", categoryId: "cat-groceries", categoryName: "Groceries", memo: "food", amount: -2000 },
        { id: "split-household", categoryId: "cat-groceries", categoryName: "Groceries", memo: "household", amount: -1000 },
      ],
    },
  ],
  transferCount: 1,
  canCommit: true,
};

const storage = new MemoryStorage();
const result = createActualBudgetLauncherImport(storage, {
  preview,
  sourceFileName: "actual-household.zip",
  now: new Date("2026-07-01T00:00:00.000Z"),
});

if (result.budget.name !== "Actual Household Imported") throw new Error("Expected imported Actual budget name");
if (storage.getItem(SELECTED_BUDGET_STORAGE_KEY) !== result.budget.id) throw new Error("Expected imported budget to be selected");

const accounts = JSON.parse(storage.getItem(getBudgetScopedStorageKey(result.budget.id, "budget-app.accounts.v1")) ?? "[]") as Array<{ name: string }>;
if (accounts.length < 2 || !accounts.some((account) => account.name === "Cheque") || !accounts.some((account) => account.name === "Savings")) throw new Error("Expected Actual accounts to be persisted");

const payees = JSON.parse(storage.getItem(getBudgetScopedStorageKey(result.budget.id, "budget-app.payees.v1")) ?? "[]") as Array<{ name: string }>;
if (payees.length !== 1 || payees[0]?.name !== "Woolworths") throw new Error("Expected non-transfer Actual payees to be persisted");

const registers = JSON.parse(storage.getItem(getBudgetScopedStorageKey(result.budget.id, "budget-app.account-registers.v1")) ?? "{}") as Record<string, { transactions: Array<{ payee: string; outflow: number; inflow: number; category: string; categoryId?: string; transferAccountId?: string; id?: string; splitLines?: Array<{ inflow: number; outflow: number }> }> }>;
const chequeRegister = Object.values(registers).find((register) => register.transactions.some((transaction) => transaction.payee === "Woolworths"));
if (!chequeRegister) throw new Error("Expected imported transactions in an account register");
if (!chequeRegister.transactions.some((transaction) => transaction.payee === "Woolworths" && transaction.outflow === 12.34 && transaction.category === "Groceries")) throw new Error("Expected Actual expense transaction to be converted from minor units");
const importedTransfer = chequeRegister.transactions.find((transaction) => transaction.payee.startsWith("Transfer:") && transaction.transferAccountId && transaction.categoryId === "groceries");
if (!importedTransfer) throw new Error("Expected categorized Actual transfers to preserve their category for Budget activity");
const importedSplit = chequeRegister.transactions.find((transaction) => transaction.id === "tx-4");
if (!importedSplit?.splitLines || importedSplit.splitLines.length !== 2) throw new Error("Expected Actual split transaction lines to be persisted");
if (importedSplit.category !== "Split") throw new Error("Expected Actual split parent category to display as Split");
if (importedSplit.splitLines.reduce((sum, line) => sum + line.inflow - line.outflow, 0) !== -30) throw new Error("Expected Actual split line amounts to be converted from minor units");

const budgetViewKey = `budget-app.budget-view.v1.${result.budget.id}.2026-06`;
const budgetView = JSON.parse(storage.getItem(budgetViewKey) ?? "null") as { categoryGroups?: Array<{ name: string; categories: Array<{ name: string; activity: number }> }> } | null;
if (!budgetView?.categoryGroups?.length) throw new Error("Expected Actual import to persist Budget screen category groups");
const groceries = budgetView.categoryGroups.flatMap((group) => group.categories).find((category) => category.name === "Groceries");
if (!groceries) throw new Error("Expected Actual import to persist Budget screen categories");
if (groceries.assigned !== 100) throw new Error("Expected Actual import to seed Budget screen assigned amounts from budget month data");
if (groceries.activity !== -67.34) throw new Error("Expected Actual import to seed Budget screen category activity including split lines and categorized transfers");
if (groceries.available !== 32.66) throw new Error("Expected Actual import to calculate Budget screen available from assigned and activity");
const currentBudgetViewKey = `budget-app.budget-view.v1.${result.budget.id}.2026-07`;
const currentBudgetView = JSON.parse(storage.getItem(currentBudgetViewKey) ?? "null") as { categoryGroups?: Array<{ categories: Array<{ name: string; available: number }> }> } | null;
const currentCategories = currentBudgetView?.categoryGroups?.flatMap((group) => group.categories) ?? [];
const currentGroceries = currentCategories.find((category) => category.name === "Groceries");
if (!currentGroceries) throw new Error("Expected Actual import to seed the current Budget screen month with imported categories");
if (currentGroceries.available !== 32.66) throw new Error("Expected positive Actual category available balances to carry into the current month");
const currentSinkingFund = currentCategories.find((category) => category.name === "Sinking Fund");
if (currentSinkingFund?.available !== 50) throw new Error("Expected Actual rollover categories to carry previous available into the current month");
const currentMortgage = currentCategories.find((category) => category.name === "Mortgage ($955/f) $878");
if (!currentMortgage) throw new Error("Expected Actual mortgage category to be imported");
if (currentMortgage.assigned !== 0) throw new Error("Expected Actual July mortgage assigned to remain zero");
if (currentMortgage.activity !== -1800) throw new Error("Expected categorized Actual mortgage transfer to count as Budget Activity");
if (currentMortgage.available !== 0) throw new Error("Expected Actual July mortgage available to be offset by transfer activity");
const importedCategoryNames = currentCategories.map((category) => category.name);
if (importedCategoryNames.includes("Income")) throw new Error("Expected Actual income categories not to appear as Budget screen categories");
if (importedCategoryNames.includes("Fortnight Two (2)/Mortgage")) throw new Error("Expected Actual Hidden Categories bucket not to appear on the Budget screen");

const scopedBudgetView = storage.getItem(getBudgetScopedStorageKey(result.budget.id, budgetViewKey));
if (!scopedBudgetView) throw new Error("Expected Actual import to persist scoped Budget screen view for compatibility");

const record = readActualBudgetLauncherImportRecord(storage, result.budget.id);
if (!record) throw new Error("Expected Actual import report record");
if (record.counts.transactions !== 6) throw new Error("Expected Actual import report transaction count");
if (!record.skipped.some((item) => item.label === "Rules" && item.count === 4)) throw new Error("Expected unsupported Rules count in import report");

const invalidStorage = new MemoryStorage();
try {
  createActualBudgetLauncherImport(invalidStorage, {
    preview: { ...preview, transactions: [], canCommit: true },
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  throw new Error("Expected invalid preview to fail");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("at least one transaction")) throw error;
}
if (invalidStorage.listKeys().length !== 0) throw new Error("Expected failed Actual import to roll back storage");

console.log("v2.44.5 Actual Budget commit engine checks passed");
