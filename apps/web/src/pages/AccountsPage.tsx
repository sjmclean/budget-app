import { Card } from "../components/ui/Card";

const accounts = [
  ["Everyday Account", "On budget", "$2,840.25"],
  ["Savings", "On budget", "$8,500.00"],
  ["Credit Card", "Credit", "-$642.10"],
  ["Superannuation", "Off budget", "$84,200.00"],
];

export function AccountsPage() {
  return (
    <div className="page-stack">
      <section className="workspace-header">
        <div>
          <h1>Accounts</h1>
          <p className="muted">
            Placeholder account list for future register navigation.
          </p>
        </div>
      </section>

      <Card className="workspace-panel">
        <div className="activity-table">
          <div className="activity-row activity-head">
            <span>Account</span>
            <span>Type</span>
            <span>Balance</span>
            <span>Status</span>
          </div>

          {accounts.map(([name, type, balance]) => (
            <div className="activity-row" key={name}>
              <strong>{name}</strong>
              <span>{type}</span>
              <strong>{balance}</strong>
              <span>Placeholder</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
