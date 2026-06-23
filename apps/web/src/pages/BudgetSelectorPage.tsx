import { useMemo, useState } from "react";
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
  const [budgetName, setBudgetName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const sortedBudgets = useMemo(
    () => [...budgets].sort((first, second) => first.name.localeCompare(second.name)),
    [budgets],
  );

  function handleOpenBudget(budgetId: string) {
    markBudgetOpened(budgetId);
    selectBudget(budgetId);
    navigate("/dashboard");
  }

  function handleCreateBudget() {
    const name = budgetName.trim();

    if (!name) {
      setFormError("Enter a budget name before creating a budget.");
      return;
    }

    const budget = createBudget({ name });
    setBudgetName("");
    setFormError(null);
    selectBudget(budget.id);
    navigate("/dashboard");
  }

  return (
    <main className="budget-selector-page budget-selector-page-premium">
      <section className="budget-selector-premium-shell" aria-labelledby="budget-selector-title">
        <div className="budget-selector-premium-chrome" aria-hidden="true">
          <span className="budget-selector-orb budget-selector-orb-one" />
          <span className="budget-selector-orb budget-selector-orb-two" />
          <span className="budget-selector-orb budget-selector-orb-three" />
        </div>

        <header className="budget-selector-premium-header">
          <div className="budget-selector-brand-mark" aria-hidden="true">▣</div>
          <div>
            <p className="budget-selector-brand">Budget App</p>
            <p className="budget-selector-caption">Local-first budgeting</p>
          </div>
        </header>

        <section className="budget-selector-premium-hero">
          <p className="eyebrow">Welcome back</p>
          <h1 id="budget-selector-title">Choose a budget</h1>
          <p>
            Open an existing local budget, or create a new blank budget and finish setup later.
          </p>
        </section>

        <Card className="budget-create-card budget-create-card-glass">
          <div>
            <h2>New budget</h2>
            <p>
              Currency, date format, start month, and other setup details will be handled by the
              first-run setup flow later.
            </p>
          </div>

          <div className="budget-create-inline-form">
            <label className="form-field budget-name-field">
              <span className="field-label">Budget name</span>
              <input
                className="text-input budget-selector-input"
                value={budgetName}
                onChange={(event) => {
                  setBudgetName(event.target.value);
                  setFormError(null);
                }}
                placeholder="Personal Budget"
              />
            </label>

            <Button type="button" onClick={handleCreateBudget}>
              + New budget
            </Button>
          </div>

          {formError ? <p className="form-error">{formError}</p> : null}
        </Card>

        <section className="budget-list-panel budget-list-panel-glass" aria-label="Existing budgets">
          <div className="budget-list-header budget-list-header-premium">
            <div>
              <h2>Your budgets</h2>
              <p>Choose a budget to continue.</p>
            </div>
            <span>{sortedBudgets.length} budget{sortedBudgets.length === 1 ? "" : "s"}</span>
          </div>

          <div className="budget-list budget-list-premium">
            {sortedBudgets.length === 0 ? (
              <div className="budget-row-card budget-row-card-premium budget-empty-card-premium">
                <div className="budget-row-icon" aria-hidden="true">▣</div>
                <div>
                  <h2>No budgets yet</h2>
                  <p>Create a budget above to get started.</p>
                </div>
              </div>
            ) : null}

            {sortedBudgets.map((budget) => (
              <button
                key={budget.id}
                type="button"
                className="budget-row-card budget-row-card-premium"
                onClick={() => handleOpenBudget(budget.id)}
              >
                <span className="budget-row-icon" aria-hidden="true">▣</span>
                <span className="budget-row-main">
                  <strong>{budget.name}</strong>
                  <span>{budget.lastOpenedLabel}</span>
                </span>
                <span className="budget-row-chevron" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>

        <div className="budget-selector-import-placeholder">
          <Button type="button" variant="secondary" disabled>
            Import YNAB4 budget
          </Button>
          <p>
            YNAB4 JSON migration will create a new budget here. Full migration UI and progress
            indicator are planned next.
          </p>
        </div>
      </section>
    </main>
  );
}
