import { Card } from "../components/ui/Card";

const transactions = [
  ["18 Jun 2026", "Woolworths", "Groceries", "Everyday Account", "-$86.40"],
  ["17 Jun 2026", "Salary", "Ready To Assign", "Everyday Account", "$2,950.00"],
  ["16 Jun 2026", "Netflix", "Streaming", "Credit Card", "-$22.99"],
  ["15 Jun 2026", "BP", "Fuel", "Credit Card", "-$74.20"],
];

export function TransactionsPage() {
  return (
    <div className="page-stack">
      <section className="workspace-header">
        <div>
          <h1>Transactions</h1>
          <p className="muted">
            Placeholder transaction register. The real register is planned for
            the next major UI milestone.
          </p>
        </div>
      </section>

      <Card className="workspace-panel">
        <div className="transaction-table">
          <div className="transaction-row transaction-head">
            <span>Date</span>
            <span>Payee</span>
            <span>Category</span>
            <span>Account</span>
            <span>Amount</span>
          </div>

          {transactions.map(([date, payee, category, account, amount]) => (
            <div className="transaction-row" key={`${date}-${payee}-${amount}`}>
              <span>{date}</span>
              <strong>{payee}</strong>
              <span>{category}</span>
              <span>{account}</span>
              <strong>{amount}</strong>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
