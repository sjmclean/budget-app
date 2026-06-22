import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";

export function BudgetSelectorPage() {
  const navigate = useNavigate();
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const createBudget = useBudgetRegistryStore((state) => state.createBudget);
  const markBudgetOpened = useBudgetRegistryStore((state) => state.markBudgetOpened);
  const selectBudget = useUIStore((state) => state.selectBudget);

  function handleOpenBudget(budgetId: string) {
    markBudgetOpened(budgetId);
    selectBudget(budgetId);
    navigate("/dashboard");
  }

  function handleCreateBudget() {
    const budget = createBudget();
    selectBudget(budget.id);
    navigate("/dashboard");
  }

  return (
    <main className="budget-selector-page">
      <section className="workspace-header">
        <div>
          <h1>Open budget</h1>
          <p className="muted">
            Select a local budget package or create a new budget registry entry.
          </p>
        </div>

        <div className="budget-selector-actions">
          <Button type="button" variant="secondary">
            Open .budget package
          </Button>
          <Button type="button" onClick={handleCreateBudget}>
            New budget
          </Button>
        </div>
      </section>

      <section className="budget-list">
        {budgets.length === 0 ? (
          <Card className="budget-row-card budget-empty-card">
            <div>
              <h2>No budgets yet</h2>
              <p className="muted">Create a budget to get started.</p>
            </div>
            <Button type="button" onClick={handleCreateBudget}>
              New budget
            </Button>
          </Card>
        ) : null}

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
