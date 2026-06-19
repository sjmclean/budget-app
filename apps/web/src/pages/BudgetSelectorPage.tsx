import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";

export function BudgetSelectorPage() {
  const navigate = useNavigate();
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const selectBudget = useUIStore((state) => state.selectBudget);

  function handleOpenBudget(budgetId: string) {
    selectBudget(budgetId);
    navigate("/dashboard");
  }

  return (
    <main className="budget-selector-page">
      <section className="workspace-header">
        <div>
          <h1>Open budget</h1>
          <p className="muted">
            Select a local budget package. This is demo registry data until the
            package registry is connected.
          </p>
        </div>

        <Button type="button" variant="secondary">
          Open .budget package
        </Button>
      </section>

      <section className="budget-list">
        {budgets.map((budget) => (
          <Card key={budget.id} className="budget-row-card">
            <div className="budget-row-main">
              <div>
                <h2>{budget.name}</h2>
                <p className="muted">{budget.packagePath}</p>
              </div>

              <div className="budget-meta">
                <span>{budget.currency}</span>
                <span>{budget.lastOpenedLabel}</span>
              </div>
            </div>

            <Button type="button" onClick={() => handleOpenBudget(budget.id)}>
              Open
            </Button>
          </Card>
        ))}
      </section>
    </main>
  );
}
