import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import { BudgetImportDialog } from "./budgetSelector/BudgetImportDialog";

type LaunchMode = "list" | "choose" | "empty" | "budgetImport";

function formatBudgetCreatedLabel(createdAt: string) {
  const createdDate = new Date(createdAt);

  if (Number.isNaN(createdDate.getTime())) {
    return "Created date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(createdDate);
}

function formatBudgetLocation(packagePath: string) {
  const parts = packagePath.split("/").filter(Boolean);
  return parts.at(-1) ?? packagePath;
}

export function BudgetSelectorPage() {
  const navigate = useNavigate();
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const createBudget = useBudgetRegistryStore((state) => state.createBudget);
  const importYnab4Budget = useBudgetRegistryStore(
    (state) => state.importYnab4Budget,
  );
  const importActualBudget = useBudgetRegistryStore(
    (state) => state.importActualBudget,
  );
  const deleteBudget = useBudgetRegistryStore((state) => state.deleteBudget);
  const markBudgetOpened = useBudgetRegistryStore(
    (state) => state.markBudgetOpened,
  );
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const selectBudget = useUIStore((state) => state.selectBudget);
  const clearSelectedBudget = useUIStore((state) => state.clearSelectedBudget);
  const [launchMode, setLaunchMode] = useState<LaunchMode>("list");
  const [budgetName, setBudgetName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteBudgetId, setDeleteBudgetId] = useState<string | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sortedBudgets = useMemo(
    () =>
      [...budgets].sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
    [budgets],
  );

  const budgetPendingDelete = useMemo(
    () => budgets.find((budget) => budget.id === deleteBudgetId) ?? null,
    [budgets, deleteBudgetId],
  );

  const deleteConfirmationMatches =
    Boolean(budgetPendingDelete) &&
    deleteConfirmationName.trim() === budgetPendingDelete?.name;

  function handleOpenBudget(budgetId: string) {
    markBudgetOpened(budgetId);
    selectBudget(budgetId);
    navigate("/dashboard");
  }

  function handleReturnToBudgets() {
    setLaunchMode("list");
    setFormError(null);
  }

  function handleRequestDeleteBudget(budgetId: string) {
    setDeleteBudgetId(budgetId);
    setDeleteConfirmationName("");
    setDeleteError(null);
  }

  function handleCancelDeleteBudget() {
    setDeleteBudgetId(null);
    setDeleteConfirmationName("");
    setDeleteError(null);
  }

  function handleConfirmDeleteBudget() {
    if (!budgetPendingDelete) {
      setDeleteError("The selected budget could not be found.");
      return;
    }

    if (!deleteConfirmationMatches) {
      setDeleteError("Type the budget name exactly to confirm deletion.");
      return;
    }

    const wasSelectedBudget = selectedBudgetId === budgetPendingDelete.id;
    const nextBudget = sortedBudgets.find(
      (budget) => budget.id !== budgetPendingDelete.id,
    );
    const result = deleteBudget(budgetPendingDelete.id);

    if (!result.completed) {
      setDeleteError(result.errors[0] ?? "The budget could not be deleted.");
      return;
    }

    if (wasSelectedBudget) {
      if (nextBudget) {
        selectBudget(nextBudget.id);
      } else {
        clearSelectedBudget();
      }
    }

    handleCancelDeleteBudget();
    setLaunchMode("list");
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
      <section
        className="budget-selector-premium-shell"
        aria-labelledby="budget-selector-title"
      >
        <div className="budget-selector-premium-chrome" aria-hidden="true">
          <span className="budget-selector-orb budget-selector-orb-one" />
          <span className="budget-selector-orb budget-selector-orb-two" />
          <span className="budget-selector-orb budget-selector-orb-three" />
        </div>

        <header className="budget-selector-premium-header">
          <div className="budget-selector-brand-mark" aria-hidden="true">
            ▣
          </div>
          <div>
            <p className="budget-selector-brand">Budget App</p>
            <p className="budget-selector-caption">Local-first budgeting</p>
          </div>
        </header>

        <section className="budget-selector-premium-hero">
          <p className="eyebrow">Budget launch experience</p>
          <h1 id="budget-selector-title">
            {launchMode === "list" ? "Budget Manager" : "Create a budget"}
          </h1>
          <p>
            {launchMode === "list"
              ? "Open an existing local budget, or start one clear launch flow when you need something new."
              : "Choose one starting point. The next step only asks for the details needed for that path."}
          </p>
        </section>

        {launchMode === "list" ? (
          <>
            <section
              className="budget-list-panel budget-list-panel-glass"
              aria-label="Existing budgets"
            >
              <div className="budget-list-header budget-list-header-premium">
                <div>
                  <h2>Your budgets</h2>
                  <p>Choose a budget to continue.</p>
                </div>
                <span>
                  {sortedBudgets.length} budget
                  {sortedBudgets.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="budget-list budget-list-premium">
                {sortedBudgets.length === 0 ? (
                  <div className="budget-empty-state budget-empty-card-premium">
                    <div className="budget-empty-state-icon" aria-hidden="true">
                      ▣
                    </div>
                    <div>
                      <p className="eyebrow">No budgets yet</p>
                      <h2>Create your first budget</h2>
                      <p>
                        Start with a blank budget or import your existing YNAB4
                        history. Restore, cloud, CSV, and templates are queued
                        as future launch paths.
                      </p>
                    </div>
                    <Button type="button" onClick={() => setLaunchMode("choose")}>
                      + New budget…
                    </Button>
                  </div>
                ) : null}

                {sortedBudgets.map((budget) => (
                  <div
                    key={budget.id}
                    role="button"
                    tabIndex={0}
                    className="budget-row-card budget-row-card-premium"
                    onClick={() => handleOpenBudget(budget.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleOpenBudget(budget.id);
                      }
                    }}
                  >
                    <span className="budget-row-icon" aria-hidden="true">
                      ▣
                    </span>
                    <span className="budget-row-main">
                      <strong>{budget.name}</strong>
                      <span>{budget.lastOpenedLabel}</span>
                      <span className="budget-row-meta">
                        <span>{budget.currency}</span>
                        <span>{formatBudgetCreatedLabel(budget.createdAt)}</span>
                        <span>{formatBudgetLocation(budget.packagePath)}</span>
                      </span>
                    </span>
                    <span className="budget-row-open-label">Open</span>
                    <button
                      type="button"
                      className="budget-row-delete-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRequestDeleteBudget(budget.id);
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      Delete…
                    </button>
                    <span className="budget-row-chevron" aria-hidden="true">
                      ›
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <Card className="budget-launch-card budget-create-card-glass">
              <div className="budget-launch-copy">
                <p className="eyebrow">New</p>
                <h2>Start a budget</h2>
                <p>
                  Create a blank budget, import YNAB4, restore a backup, or
                  see what import paths are coming next.
                </p>
              </div>
              <Button type="button" onClick={() => setLaunchMode("choose")}>
                + New budget…
              </Button>
            </Card>
          </>
        ) : null}

        {launchMode === "choose" ? (
          <Card className="budget-launch-picker budget-create-card-glass">
            <div className="budget-launch-nav">
              <button type="button" onClick={handleReturnToBudgets}>
                ← Back to budgets
              </button>
            </div>
            <div className="budget-launch-choice-header">
              <p className="eyebrow">Create a new budget</p>
              <h2>How would you like to get started?</h2>
              <p>
                Pick one path. The next step reuses the existing creation and
                import workflows without showing every option at once.
              </p>
            </div>

            <div className="budget-launch-options">
              <button
                type="button"
                className="budget-launch-option"
                onClick={() => setLaunchMode("empty")}
              >
                <span className="budget-launch-option-icon" aria-hidden="true">
                  +
                </span>
                <span>
                  <strong>Empty budget</strong>
                  <small>Create a brand new budget from scratch.</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>

              <button
                type="button"
                className="budget-launch-option"
                onClick={() => setLaunchMode("budgetImport")}
              >
                <span className="budget-launch-option-icon" aria-hidden="true">
                  ⇪
                </span>
                <span>
                  <strong>Import Budget</strong>
                  <small>Choose a supported budget file or YNAB4 package and let the app detect the provider.</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>

              <button type="button" className="budget-launch-option" disabled>
                <span className="budget-launch-option-icon" aria-hidden="true">
                  ↺
                </span>
                <span>
                  <strong>Restore backup</strong>
                  <small>Queued for the next launch-experience iteration.</small>
                </span>
                <span aria-hidden="true">•</span>
              </button>
            </div>

            <div className="budget-launch-coming-soon" aria-label="Coming soon">
              <span>Coming soon</span>
              <ul>
                <li>Cloud budget continuation</li>
                <li>Transaction import remains separate from budget migration</li>
                <li>Budget templates</li>
              </ul>
            </div>
          </Card>
        ) : null}

        {launchMode === "empty" ? (
          <Card className="budget-create-card budget-create-card-glass">
            <div className="budget-launch-nav">
              <button type="button" onClick={() => setLaunchMode("choose")}>
                ← Back
              </button>
            </div>
            <div>
              <h2>Create empty budget</h2>
              <p>
                Currency, date format, start month, and other setup details will
                be handled by the first-run setup flow later.
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
                Create budget
              </Button>
            </div>

            {formError ? <p className="form-error">{formError}</p> : null}
          </Card>
        ) : null}

        {launchMode === "budgetImport" ? (
          <BudgetImportDialog
            importActualBudget={importActualBudget}
            importYnab4Budget={importYnab4Budget}
            onBack={() => setLaunchMode("choose")}
            onImportedBudgetSelected={selectBudget}
            onOpenBudget={handleOpenBudget}
          />
        ) : null}

        {budgetPendingDelete ? (
          <div className="app-dialog-backdrop" role="presentation">
            <section
              className="app-dialog budget-delete-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="budget-delete-title"
            >
              <h2 id="budget-delete-title" className="app-dialog-title">
                Delete “{budgetPendingDelete.name}”?
              </h2>
              <p className="app-dialog-message">
                This permanently removes this budget's accounts, transactions,
                categories, budget months, payees, and scheduled transactions.
              </p>
              {sortedBudgets.length === 1 ? (
                <p className="budget-delete-warning">
                  This is your last budget. After deletion, the Budget Selector
                  will return to the empty state so you can create or import a
                  new budget.
                </p>
              ) : null}
              <label className="form-field budget-delete-confirm-field">
                <span className="field-label">
                  Type {budgetPendingDelete.name} to confirm
                </span>
                <input
                  className="text-input"
                  value={deleteConfirmationName}
                  onChange={(event) => {
                    setDeleteConfirmationName(event.target.value);
                    setDeleteError(null);
                  }}
                />
              </label>
              {deleteError ? <p className="form-error">{deleteError}</p> : null}
              <div className="app-dialog-actions">
                <Button type="button" variant="secondary" onClick={handleCancelDeleteBudget}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="button-danger"
                  disabled={!deleteConfirmationMatches}
                  onClick={handleConfirmDeleteBudget}
                >
                  Delete Budget
                </Button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
