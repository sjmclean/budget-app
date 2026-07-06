import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { readAccounts } from "../features/accounts/accountService";
import type { AccountRegisterView } from "../features/accounts/accountRegisterTypes";
import { getBudgetScopedStorageKey } from "../features/budget/budgetDataScope";
import { browserLocalStorageKeyValueStorage } from "../features/persistence/keyValueStoragePort";
import { useBudgetRegistryStore, type BudgetSummary } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import { BudgetImportDialog } from "./budgetSelector/BudgetImportDialog";
import { NewBudgetWizard } from "../features/budget/newBudget/NewBudgetWizard";
import type { NewBudgetSetup } from "../features/budget/newBudget/budgetTemplates";

type LaunchMode = "list" | "empty" | "budgetImport";

const REGISTERS_STORAGE_KEY = "budget-app.account-registers.v1";

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

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function readBudgetStats(budget: BudgetSummary) {
  const scopedStorage = {
    getItem(key: string): string | null {
      return browserLocalStorageKeyValueStorage.getItem(
        getBudgetScopedStorageKey(budget.id, key),
      );
    },
    setItem(): void {
      // Read-only launcher view model adapter.
    },
    removeItem(): void {
      // Read-only launcher view model adapter.
    },
    listKeys(): string[] {
      return [];
    },
  };

  const accounts = readAccounts(scopedStorage);
  const registersValue = scopedStorage.getItem(REGISTERS_STORAGE_KEY);
  let transactionCount = 0;

  if (registersValue) {
    try {
      const registers = JSON.parse(registersValue) as Record<string, AccountRegisterView>;
      transactionCount = Object.values(registers).reduce(
        (total, register) => total + (Array.isArray(register.transactions) ? register.transactions.length : 0),
        0,
      );
    } catch {
      transactionCount = 0;
    }
  }

  return {
    accountCount: accounts.length,
    transactionCount,
  };
}

export function BudgetSelectorPage() {
  const navigate = useNavigate();
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const createBudgetWithSetup = useBudgetRegistryStore((state) => state.createBudgetWithSetup);
  const importYnab4Budget = useBudgetRegistryStore(
    (state) => state.importYnab4Budget,
  );
  const importActualBudget = useBudgetRegistryStore(
    (state) => state.importActualBudget,
  );
  const deleteBudget = useBudgetRegistryStore((state) => state.deleteBudget);
  const updateBudget = useBudgetRegistryStore((state) => state.updateBudget);
  const markBudgetOpened = useBudgetRegistryStore(
    (state) => state.markBudgetOpened,
  );
  const refreshBudgets = useBudgetRegistryStore((state) => state.refreshBudgets);
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const selectBudget = useUIStore((state) => state.selectBudget);
  const clearSelectedBudget = useUIStore((state) => state.clearSelectedBudget);
  const [launchMode, setLaunchMode] = useState<LaunchMode>("list");
  const [deleteBudgetId, setDeleteBudgetId] = useState<string | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [renameBudgetId, setRenameBudgetId] = useState<string | null>(null);
  const [activeBudgetMenuId, setActiveBudgetMenuId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const sortedBudgets = useMemo(
    () =>
      [...budgets].sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
    [budgets],
  );

  const budgetCards = useMemo(
    () =>
      sortedBudgets.map((budget, index) => ({
        budget,
        stats: readBudgetStats(budget),
        tone: index % 2 === 0 ? "home" : "business",
      })),
    [sortedBudgets],
  );

  const budgetPendingDelete = useMemo(
    () => budgets.find((budget) => budget.id === deleteBudgetId) ?? null,
    [budgets, deleteBudgetId],
  );

  const budgetPendingRename = useMemo(
    () => budgets.find((budget) => budget.id === renameBudgetId) ?? null,
    [budgets, renameBudgetId],
  );

  useEffect(() => {
    if (!activeBudgetMenuId) {
      return;
    }

    function handleDocumentPointerDown() {
      setActiveBudgetMenuId(null);
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveBudgetMenuId(null);
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [activeBudgetMenuId]);

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
  }

  function handleRequestRenameBudget(budget: BudgetSummary) {
    setActiveBudgetMenuId(null);
    setRenameBudgetId(budget.id);
    setRenameDraft(budget.name);
    setRenameError(null);
  }

  function handleCancelRenameBudget() {
    setRenameBudgetId(null);
    setRenameDraft("");
    setRenameError(null);
  }

  function handleConfirmRenameBudget() {
    if (!budgetPendingRename) {
      setRenameError("The selected budget could not be found.");
      return;
    }

    const nextName = renameDraft.trim();

    if (!nextName) {
      setRenameError("Enter a budget name.");
      return;
    }

    const duplicate = budgets.some(
      (budget) =>
        budget.id !== budgetPendingRename.id &&
        budget.name.trim().toLocaleLowerCase() === nextName.toLocaleLowerCase(),
    );

    if (duplicate) {
      setRenameError("Another budget already uses that name.");
      return;
    }

    const updated = updateBudget(budgetPendingRename.id, { name: nextName });

    if (!updated) {
      setRenameError("The budget could not be renamed.");
      return;
    }

    handleCancelRenameBudget();
  }

  function handleRequestDeleteBudget(budgetId: string) {
    setActiveBudgetMenuId(null);
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

  function handleCreateBudget(setup: NewBudgetSetup) {
    const budget = createBudgetWithSetup(setup);
    selectBudget(budget.id);
    navigate("/dashboard");
  }

  return (
    <main className="budget-selector-page budget-manager-page">
      <section
        className="budget-manager-shell"
        aria-labelledby="budget-selector-title"
      >
        <header className="budget-manager-brand-bar">
          <div className="budget-manager-brand">
            <span className="budget-manager-brand-mark" aria-hidden="true">▣</span>
            <div>
              <strong>Budget App</strong>
              <span>Your budget. Your data.</span>
            </div>
          </div>
        </header>

        {launchMode === "list" ? (
          <>
            <section className="budget-manager-hero">
              <div>
                <h1 id="budget-selector-title">Budget Manager</h1>
                <p>Open an existing budget, start a new one, or migrate from another budgeting app.</p>
              </div>
              <div className="budget-manager-hero-actions">
                <Button
                  type="button"
                  variant="secondary"
                  className="budget-manager-refresh-button"
                  onClick={refreshBudgets}
                >
                  ↻ Refresh
                </Button>
                <Button type="button" onClick={() => setLaunchMode("empty")}>
                  + New Budget
                </Button>
              </div>
            </section>

            <section className="budget-manager-section" aria-label="Your budgets">
              <h2>Your Budgets</h2>
              {budgetCards.length === 0 ? (
                <div className="budget-manager-empty-card">
                  <span className="budget-manager-empty-icon" aria-hidden="true">▣</span>
                  <div>
                    <h3>No budgets yet</h3>
                    <p>Create your first budget or migrate an existing budget from another app.</p>
                  </div>
                  <Button type="button" onClick={() => setLaunchMode("empty")}>
                    New Budget
                  </Button>
                </div>
              ) : (
                <div className="budget-manager-card-grid budget-manager-budget-grid">
                  {budgetCards.map(({ budget, stats, tone }) => (
                    <article
                      key={budget.id}
                      className="budget-manager-budget-card"
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${budget.name}`}
                      onClick={() => handleOpenBudget(budget.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleOpenBudget(budget.id);
                        }
                      }}
                    >
                      <div className="budget-manager-budget-card-header">
                        <span className={`budget-manager-budget-icon budget-manager-budget-icon-${tone}`} aria-hidden="true">
                          {tone === "home" ? "⌂" : "▣"}
                        </span>
                        <div className="budget-manager-budget-title">
                          <h3>{budget.name}</h3>
                          <p>Last opened: {budget.lastOpenedLabel}</p>
                          <p>File: {formatBudgetLocation(budget.packagePath)}</p>
                        </div>
                        <div
                          className="budget-manager-more-menu"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="budget-manager-more-menu-trigger"
                            aria-label={`More actions for ${budget.name}`}
                            aria-haspopup="menu"
                            aria-expanded={activeBudgetMenuId === budget.id}
                            onClick={() => {
                              setActiveBudgetMenuId((currentBudgetId) =>
                                currentBudgetId === budget.id ? null : budget.id,
                              );
                            }}
                          >
                            ⋯
                          </button>
                          {activeBudgetMenuId === budget.id ? (
                            <div className="budget-manager-more-menu-panel" role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => handleRequestRenameBudget(budget)}
                              >
                                Rename Budget…
                              </button>
                              <div className="budget-manager-more-menu-separator" role="separator" />
                              <button
                                type="button"
                                role="menuitem"
                                className="budget-manager-more-menu-danger"
                                onClick={() => handleRequestDeleteBudget(budget.id)}
                              >
                                Delete Budget…
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <dl className="budget-manager-budget-stats">
                        <div>
                          <dt>Budgeting Month</dt>
                          <dd>{formatBudgetCreatedLabel(budget.createdAt)}</dd>
                        </div>
                        <div>
                          <dt>Accounts</dt>
                          <dd>{formatNumber(stats.accountCount)}</dd>
                        </div>
                        <div>
                          <dt>Transactions</dt>
                          <dd>{formatNumber(stats.transactionCount)}</dd>
                        </div>
                      </dl>

                      <div
                        className="budget-manager-budget-actions"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Button type="button" onClick={() => handleOpenBudget(budget.id)}>
                          Open Budget
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="budget-manager-section" aria-label="Other actions">
              <h2>Other Actions</h2>
              <div className="budget-manager-card-grid budget-manager-action-grid">
                <button
                  type="button"
                  className="budget-manager-action-card"
                  onClick={() => setLaunchMode("budgetImport")}
                >
                  <span className="budget-manager-action-icon budget-manager-action-icon-purple" aria-hidden="true">⇩</span>
                  <strong>Migrate Budget</strong>
                  <span>Bring in a full budget from YNAB4 or Actual Budget.</span>
                  <em>Start Migration →</em>
                </button>

                <button type="button" className="budget-manager-action-card" disabled>
                  <span className="budget-manager-action-icon budget-manager-action-icon-amber" aria-hidden="true">▢</span>
                  <strong>Restore Backup</strong>
                  <span>Restore a budget from a previous backup.</span>
                  <em>Restore Now →</em>
                </button>

                <button type="button" className="budget-manager-action-card" disabled>
                  <span className="budget-manager-action-icon budget-manager-action-icon-blue" aria-hidden="true">□</span>
                  <strong>Open Budget File</strong>
                  <span>Open a portable budget package from your computer.</span>
                  <em>Browse Files →</em>
                </button>
              </div>
            </section>

            <aside className="budget-manager-storage-banner" aria-label="Local storage reminder">
              <span aria-hidden="true">i</span>
              <div>
                <strong>Budgets are stored locally on your computer</strong>
                <p>Back up your budgets regularly to protect your data.</p>
              </div>
              <button type="button">Learn More ↗</button>
            </aside>
          </>
        ) : null}

        {launchMode === "empty" ? (
          <NewBudgetWizard
            onBack={() => setLaunchMode("list")}
            onCreateBudget={handleCreateBudget}
          />
        ) : null}

        {launchMode === "budgetImport" ? (
          <BudgetImportDialog
            importActualBudget={importActualBudget}
            importYnab4Budget={importYnab4Budget}
            onBack={() => setLaunchMode("list")}
            onImportedBudgetSelected={selectBudget}
            onOpenBudget={handleOpenBudget}
          />
        ) : null}

        {budgetPendingRename ? (
          <div className="app-dialog-backdrop" role="presentation">
            <section
              className="app-dialog budget-rename-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="budget-rename-title"
            >
              <h2 id="budget-rename-title" className="app-dialog-title">
                Rename “{budgetPendingRename.name}”
              </h2>
              <p className="app-dialog-message">
                Choose a clear name for this budget. This changes the budget name
                shown in Budget Manager only.
              </p>
              <label className="form-field budget-rename-field">
                <span className="field-label">Budget name</span>
                <input
                  className="text-input"
                  value={renameDraft}
                  autoFocus
                  onChange={(event) => {
                    setRenameDraft(event.target.value);
                    setRenameError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleConfirmRenameBudget();
                    }

                    if (event.key === "Escape") {
                      handleCancelRenameBudget();
                    }
                  }}
                />
              </label>
              {renameError ? <p className="form-error">{renameError}</p> : null}
              <div className="app-dialog-actions">
                <Button type="button" variant="secondary" onClick={handleCancelRenameBudget}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!renameDraft.trim()}
                  onClick={handleConfirmRenameBudget}
                >
                  Rename Budget
                </Button>
              </div>
            </section>
          </div>
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
