import assert from "node:assert/strict";
import {
  createYnab4ReconciliationAudit,
  formatYnab4ReconciliationAuditReport,
  parseYnabBudgetCsv,
} from "../apps/web/src/features/budget/ynab4ReconciliationAudit.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";

class MemoryStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  listKeys(): string[] {
    return [...this.values.keys()].sort();
  }
}

const csv = `Month,Category,Master Category,Sub Category,Budgeted,Outflows,Category Balance
2026-06,Savings Goals:ATO Refund,Savings Goals,ATO Refund,"$100.00","-$25.00","$75.00"
2026-06,Everyday:Groceries,Everyday,Groceries,"$200.00","-$50.00","$150.00"
`;

{
  const parsed = parseYnabBudgetCsv(csv);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], {
    month: "2026-06",
    categoryGroup: "Savings Goals",
    category: "ATO Refund",
    budgeted: 100,
    activity: -25,
    balance: 75,
  });
}

{
  const storage = new MemoryStorage();
  const budgetId = "my-budget";
  storage.setItem(`budget-app.budgets.${budgetId}.budget-app.accounts.v1`, JSON.stringify([
    { id: "account-1", name: "Cheque", balance: 125 },
  ]));
  storage.setItem(`budget-app.budgets.${budgetId}.budget-app.account-registers.v1`, JSON.stringify({
    "account-1": {
      accountId: "account-1",
      accountName: "Cheque",
      transactions: [{ amount: 50000 }, { amount: 75000 }],
    },
  }));
  storage.setItem(`budget-app.budget-view.v1.${budgetId}.2026-06`, JSON.stringify({
    categoryGroups: [
      { name: "Savings Goals", categories: [{ name: "ATO Refund", assigned: 100, activity: -25, available: 75 }] },
      { name: "Everyday", categories: [{ name: "Groceries", assigned: 200, activity: -50, available: 150 }] },
    ],
  }));

  const audit = createYnab4ReconciliationAudit({
    storage,
    budgetId,
    budgetCsvText: csv,
    month: "2026-06",
  });

  const report = formatYnab4ReconciliationAuditReport(audit);
  console.log(report);

  assert.equal(audit.status, "pass");
  assert.equal(audit.budgetRows.length, 2);
  assert.equal(audit.budgetRows.every((row) => row.status === "pass"), true);
  assert.equal(audit.categoryStructureRows.every((row) => row.status === "pass"), true);
  assert.match(report, /Status: PASS/);
  assert.match(report, /budgeted 200\.00 \/ 200\.00/);
  assert.match(report, /balance 150\.00 \/ 150\.00/);
}

{
  const storage = new MemoryStorage();
  const budgetId = "bad-budget";
  storage.setItem(`budget-app.budget-view.v1.${budgetId}.2026-06`, JSON.stringify({
    categoryGroups: [
      { name: "Savings Goals", categories: [{ name: "ATO Refund", assigned: 0, activity: 0, available: 0 }] },
      { name: "Everyday", categories: [] },
    ],
  }));

  const audit = createYnab4ReconciliationAudit({
    storage,
    budgetId,
    budgetCsvText: csv,
    month: "2026-06",
  });

  const report = formatYnab4ReconciliationAuditReport(audit);
  console.log(report);

  assert.equal(audit.status, "fail");
  assert.equal(audit.budgetRows.some((row) => row.category === "ATO Refund" && row.status === "fail"), true);
  assert.equal(audit.budgetRows.some((row) => row.category === "Groceries" && row.status === "imported-missing"), true);
  assert.equal(audit.categoryStructureRows.some((row) => row.category === "Groceries" && row.status === "missing-imported"), true);
  assert.match(report, /Status: FAIL/);
  assert.match(report, /Everyday > Groceries/);
}

console.log("v1.72.4 account and budget reconciliation audit tests passed");
