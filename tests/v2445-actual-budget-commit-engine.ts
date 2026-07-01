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
  ],
  categoryGroups: [{ id: "group-everyday", name: "Everyday", hidden: false }],
  categories: [{ id: "cat-groceries", name: "Groceries", groupId: "group-everyday", groupName: "Everyday", hidden: false }],
  payees: [
    { id: "payee-shop", name: "Woolworths" },
    { id: "payee-transfer", name: "Transfer: Savings" },
  ],
  transactions: [
    { id: "tx-1", accountId: "acct-cheque", accountName: "Cheque", date: "2026-06-01", amount: -1234, payeeId: "payee-shop", payeeName: "Woolworths", categoryId: "cat-groceries", categoryName: "Groceries", memo: "weekly shop", cleared: true, transferId: null, isTransfer: false },
    { id: "tx-2", accountId: "acct-cheque", accountName: "Cheque", date: "2026-06-02", amount: 5000, payeeId: null, payeeName: "Salary", categoryId: null, categoryName: null, memo: null, cleared: false, transferId: null, isTransfer: false },
    { id: "tx-3", accountId: "acct-cheque", accountName: "Cheque", date: "2026-06-03", amount: -2500, payeeId: "payee-transfer", payeeName: "Transfer: Savings", categoryId: null, categoryName: null, memo: "save", cleared: true, transferId: "acct-savings", isTransfer: true },
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
if (accounts.length !== 2 || accounts[0]?.name !== "Cheque") throw new Error("Expected Actual accounts to be persisted");

const payees = JSON.parse(storage.getItem(getBudgetScopedStorageKey(result.budget.id, "budget-app.payees.v1")) ?? "[]") as Array<{ name: string }>;
if (payees.length !== 1 || payees[0]?.name !== "Woolworths") throw new Error("Expected non-transfer Actual payees to be persisted");

const registers = JSON.parse(storage.getItem(getBudgetScopedStorageKey(result.budget.id, "budget-app.account-registers.v1")) ?? "{}") as Record<string, { transactions: Array<{ payee: string; outflow: number; inflow: number; category: string; transferAccountId?: string }> }>;
const chequeRegister = Object.values(registers).find((register) => register.transactions.some((transaction) => transaction.payee === "Woolworths"));
if (!chequeRegister) throw new Error("Expected imported transactions in an account register");
if (!chequeRegister.transactions.some((transaction) => transaction.payee === "Woolworths" && transaction.outflow === 12.34 && transaction.category === "Groceries")) throw new Error("Expected Actual expense transaction to be converted from minor units");
if (!chequeRegister.transactions.some((transaction) => transaction.payee.startsWith("Transfer:") && transaction.transferAccountId)) throw new Error("Expected Actual transfer transaction to be preserved");
const importedSplit = chequeRegister.transactions.find((transaction) => transaction.id === "tx-4");
if (!importedSplit?.splitLines || importedSplit.splitLines.length !== 2) throw new Error("Expected Actual split transaction lines to be persisted");
if (importedSplit.category !== "Split") throw new Error("Expected Actual split parent category to display as Split");
if (importedSplit.splitLines.reduce((sum, line) => sum + line.inflow - line.outflow, 0) !== -30) throw new Error("Expected Actual split line amounts to be converted from minor units");

const record = readActualBudgetLauncherImportRecord(storage, result.budget.id);
if (!record) throw new Error("Expected Actual import report record");
if (record.counts.transactions !== 4) throw new Error("Expected Actual import report transaction count");
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
