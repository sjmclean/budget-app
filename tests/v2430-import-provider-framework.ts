import { BankImportProviderApplicationService } from "../packages/application/src/BankImportProviderApplicationService.js";

const service = new BankImportProviderApplicationService();

const providers = service.listProviders().map((provider) => provider.id);
for (const expected of ["csv", "qif", "ofx", "qfx", "actual-budget"]) {
  if (!providers.includes(expected)) throw new Error(`Expected provider registry to include ${expected}`);
}

const csvInspection = service.inspect({
  fileName: "statement.csv",
  text: "Date,Description,Amount\n2026-07-01,Cafe,-4.50",
});
if (csvInspection.providerId !== "csv") throw new Error("Expected CSV provider detection");
if (!csvInspection.canCommitTransactions) throw new Error("Expected CSV provider to remain commit-capable");
if (csvInspection.summary.find((item) => item.label === "Transactions")?.count !== 1) throw new Error("Expected CSV inspection to count transactions");

const qifInspection = service.inspect({
  fileName: "statement.qif",
  text: "!Type:Bank\nD01/07/2026\nT-12.00\nPCafe\n^",
});
if (qifInspection.providerId !== "qif") throw new Error("Expected QIF provider detection");
if (!qifInspection.canPreviewTransactions) throw new Error("Expected QIF provider to be preview-capable");

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

const actualInspection = service.inspect({ fileName: "household.actualbudget", text: actualExport });
if (actualInspection.providerId !== "actual-budget") throw new Error("Expected Actual Budget provider detection");
if (actualInspection.canCommitTransactions) throw new Error("Actual Budget should be inspection-only in v2.43.0");
if (actualInspection.canPreviewTransactions) throw new Error("Actual Budget should not yet enter transaction preview in v2.43.0");
if (actualInspection.summary.find((item) => item.label === "Transactions")?.count !== 2) throw new Error("Expected Actual transactions to be counted");
if (actualInspection.summary.find((item) => item.label === "Rules")?.supported !== false) throw new Error("Expected Actual rules to be reported as unsupported");
if (!actualInspection.issues.some((issue) => issue.code === "ActualRulesPreviewOnly")) throw new Error("Expected Actual rules warning");
if (actualInspection.metadata.budgetName !== "Household") throw new Error("Expected Actual metadata extraction");

const unknownInspection = service.inspect({ fileName: "notes.txt", text: "hello" });
if (unknownInspection.isRecognized) throw new Error("Expected unknown text file not to be recognized");
if (unknownInspection.providerId !== null) throw new Error("Expected no provider for unknown file");

console.log("v2.43.0 import provider framework checks passed");
