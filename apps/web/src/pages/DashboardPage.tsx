import { Card } from "../components/ui/Card";
import { resolveActiveBudget } from "../features/budget/activeBudget";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";

const accounts = [
  {
    name: "Everyday Account",
    type: "On budget",
    balance: "$2,840.25",
  },
  {
    name: "Savings",
    type: "On budget",
    balance: "$8,500.00",
  },
  {
    name: "Credit Card",
    type: "Credit",
    balance: "-$642.10",
  },
];

const categoryGroups = [
  {
    name: "Immediate Obligations",
    assigned: "$2,150.00",
    available: "$485.00",
    categories: ["Mortgage", "Electricity", "Groceries", "Internet"],
  },
  {
    name: "True Expenses",
    assigned: "$780.00",
    available: "$1,940.00",
    categories: ["Car Rego", "Insurance", "Medical", "Christmas"],
  },
  {
    name: "Quality of Life",
    assigned: "$420.00",
    available: "$310.00",
    categories: ["Dining Out", "Entertainment", "Streaming"],
  },
];

const recentTransactions = [
  {
    payee: "Woolworths",
    account: "Everyday Account",
    category: "Groceries",
    amount: "-$86.40",
  },
  {
    payee: "Salary",
    account: "Everyday Account",
    category: "Ready To Assign",
    amount: "$2,950.00",
  },
  {
    payee: "Netflix",
    account: "Credit Card",
    category: "Streaming",
    amount: "-$22.99",
  },
];

export function DashboardPage() {
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const activeBudget = resolveActiveBudget(budgets, selectedBudgetId);

  return (
    <div className="budget-workspace">
      <section className="budget-workspace-header">
        <div>
          <h1>{activeBudget?.name ?? "Budget"}</h1>
          <p className="muted">
            June 2026 · Local-first budget workspace
          </p>
        </div>

        <div className="ready-card">
          <span>Ready To Assign</span>
          <strong>$0.00</strong>
        </div>
      </section>

      <section className="budget-dashboard-grid">
        <Card className="accounts-panel">
          <div className="panel-header">
            <h2>Accounts</h2>
            <p className="muted">Current balances</p>
          </div>

          <div className="account-list">
            {accounts.map((account) => (
              <div className="account-row" key={account.name}>
                <div>
                  <strong>{account.name}</strong>
                  <span>{account.type}</span>
                </div>
                <strong>{account.balance}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card className="budget-panel">
          <div className="panel-header">
            <h2>Budget</h2>
            <p className="muted">Category groups</p>
          </div>

          <div className="budget-table">
            <div className="budget-table-row budget-table-head">
              <span>Group</span>
              <span>Assigned</span>
              <span>Available</span>
            </div>

            {categoryGroups.map((group) => (
              <div className="budget-table-row" key={group.name}>
                <div>
                  <strong>{group.name}</strong>
                  <small>{group.categories.join(" · ")}</small>
                </div>
                <span>{group.assigned}</span>
                <strong>{group.available}</strong>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card className="activity-panel">
        <div className="panel-header">
          <h2>Recent activity</h2>
          <p className="muted">Placeholder transactions</p>
        </div>

        <div className="activity-table">
          <div className="activity-row activity-head">
            <span>Payee</span>
            <span>Account</span>
            <span>Category</span>
            <span>Amount</span>
          </div>

          {recentTransactions.map((transaction) => (
            <div className="activity-row" key={`${transaction.payee}-${transaction.amount}`}>
              <strong>{transaction.payee}</strong>
              <span>{transaction.account}</span>
              <span>{transaction.category}</span>
              <strong>{transaction.amount}</strong>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
