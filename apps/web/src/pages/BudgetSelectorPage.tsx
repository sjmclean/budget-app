import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { getActiveKeyValueStorage } from "../features/persistence/activeKeyValueStorage";
import { getBudgetPersistenceProvider } from
  "../features/persistence/budgetPersistenceProviderFactory";
import { useBudgetRegistryStore, type BudgetSummary } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import type { NewBudgetSetup } from "../features/budget/newBudget/budgetTemplates";
import { readBudgetLauncherStats } from "../features/budget/budgetLauncherStats.js";
import { usePersistenceChangeVersion } from "../features/persistence/persistenceChangeBus";
import {
  completeBudgetDeletion,
  shouldRestoreBudgetSelectionAfterDeletionFailure,
} from "../features/budget/completeBudgetDeletion";
import { confirmDialog } from "../features/ui/appDialogService";


type LaunchMode = "list" | "empty" | "budgetImport";
type BudgetFileAction = "restore" | "open";


const LazyBudgetImportDialog = lazy(() =>
  import("./budgetSelector/BudgetImportDialog").then((module) => ({
    default: module.BudgetImportDialog,
  })),
);

const LazyNewBudgetWizard = lazy(() =>
  import("../features/budget/newBudget/NewBudgetWizard").then((module) => ({
    default: module.NewBudgetWizard,
  })),
);

function BudgetWorkflowLoading() {
  return (
    <Card className="budget-workflow-loading" aria-live="polite">
      Loading budget workflow…
    </Card>
  );
}

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
  return readBudgetLauncherStats(getActiveKeyValueStorage(), budget);
}

export function BudgetSelectorPage() {
  const navigate = useNavigate();
  const persistenceChangeVersion = usePersistenceChangeVersion();
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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameBudgetId, setRenameBudgetId] = useState<string | null>(null);
  const [activeBudgetMenuId, setActiveBudgetMenuId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [budgetFileAction, setBudgetFileAction] = useState<BudgetFileAction | null>(null);
  const [restoreTargetBudgetId, setRestoreTargetBudgetId] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);

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
        // Persisted launcher metadata only; never open a SQLite budget for cards.
        stats: readBudgetStats(budget),
        tone: index % 2 === 0 ? "home" : "business",
      })),
    [sortedBudgets, persistenceChangeVersion],
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

  function handleOpenBudget(budgetId: string) {
    markBudgetOpened(budgetId);
    selectBudget(budgetId);
    navigate("/dashboard");
  }

  function handleReturnToBudgets() {
    setLaunchMode("list");
  }

  function openBudgetFileWorkflow(action: BudgetFileAction) {
    const preferredBudgetId =
      selectedBudgetId && budgets.some((budget) => budget.id === selectedBudgetId)
        ? selectedBudgetId
        : sortedBudgets[0]?.id ?? "";
    setBudgetFileAction(action);
    setRestoreTargetBudgetId(preferredBudgetId);
    setRestoreFile(null);
    setRestoreError(
      sortedBudgets.length === 0
        ? "Create a budget entry before restoring a SQLite budget file."
        : null,
    );
  }

  function closeBudgetFileWorkflow() {
    if (restoreInProgress) return;
    setBudgetFileAction(null);
    setRestoreTargetBudgetId("");
    setRestoreFile(null);
    setRestoreError(null);
    if (restoreFileInputRef.current) restoreFileInputRef.current.value = "";
  }

  async function restoreBudgetFile() {
    const targetBudget = budgets.find(
      (budget) => budget.id === restoreTargetBudgetId,
    );
    const queries = getBudgetPersistenceProvider().accountRegisterQueries;

    if (!targetBudget) {
      setRestoreError("Choose the budget this SQLite backup belongs to.");
      return;
    }
    if (!restoreFile) {
      setRestoreError("Choose a Budget App SQLite backup file.");
      return;
    }
    if (!queries?.restoreBudget) {
      setRestoreError("SQLite budget restore is unavailable in this build.");
      return;
    }

    const confirmed = await confirmDialog({
      title: "Restore “" + targetBudget.name + "”?",
      message:
        "This will replace the current SQLite data for " + targetBudget.name +
        " with " + restoreFile.name + ". The file must belong to this budget. " +
        "A before-restore safety point is created automatically.",
      confirmLabel: "Restore budget",
      tone: "danger",
    });
    if (!confirmed) return;

    setRestoreInProgress(true);
    setRestoreError(null);
    try {
      const result = await queries.restoreBudget(targetBudget.id, restoreFile);
      refreshBudgets();
      selectBudget(targetBudget.id);
      setBudgetFileAction(null);
      setRestoreFile(null);
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = "";
      await confirmDialog({
        title: "Budget restored",
        message:
          targetBudget.name + " was restored successfully: " +
          result.counts.accounts + " accounts and " +
          result.counts.transactions + " transactions are available.",
        confirmLabel: "OK",
      });
    } catch (error) {
      setRestoreError(
        error instanceof Error
          ? error.message
          : "The SQLite budget file could not be restored.",
      );
    } finally {
      setRestoreInProgress(false);
    }
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
    setDeleteError(null);
  }

  function handleCancelDeleteBudget() {
    setDeleteBudgetId(null);
    setDeleteError(null);
  }

  async function handleConfirmDeleteBudget() {
    if (!budgetPendingDelete) {
      setDeleteError("The selected budget could not be found.");
      return;
    }

    const budgetId = budgetPendingDelete.id;
    const wasSelectedBudget = selectedBudgetId === budgetId;
    const nextBudget = sortedBudgets.find(
      (budget) => budget.id !== budgetPendingDelete.id,
    );
    if (wasSelectedBudget) {
      if (nextBudget) selectBudget(nextBudget.id);
      else clearSelectedBudget();
    }
    setDeleteInProgress(true);
    setDeleteError(null);
    try {
      const result = await completeBudgetDeletion(
        getBudgetPersistenceProvider(),
        budgetId,
        () => deleteBudget(budgetId),
      );

      if (!result.completed) {
        setDeleteError(result.errors[0] ?? "The budget could not be deleted.");
        return;
      }

      handleCancelDeleteBudget();
      setLaunchMode("list");
    } catch (error) {
      if (
        wasSelectedBudget &&
        shouldRestoreBudgetSelectionAfterDeletionFailure(error)
      ) selectBudget(budgetId);
      setDeleteError(error instanceof Error ? error.message : "The hosted budget could not be deleted.");
    } finally {
      setDeleteInProgress(false);
    }
  }

  async function handleCreateBudget(setup: NewBudgetSetup) {
    setCreateError(null);
    try {
      const budget = await createBudgetWithSetup(setup);
      selectBudget(budget.id);
      navigate("/dashboard");
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "The new budget could not be provisioned.",
      );
    }
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

                <button
                  type="button"
                  className="budget-manager-action-card"
                  onClick={() => openBudgetFileWorkflow("restore")}
                >
                  <span className="budget-manager-action-icon budget-manager-action-icon-amber" aria-hidden="true">▢</span>
                  <strong>Restore Budget</strong>
                  <span>Restore an existing budget from a Budget App SQLite backup.</span>
                  <em>Restore Now →</em>
                </button>

                <button
                  type="button"
                  className="budget-manager-action-card"
                  onClick={() => openBudgetFileWorkflow("open")}
                >
                  <span className="budget-manager-action-icon budget-manager-action-icon-blue" aria-hidden="true">□</span>
                  <strong>Open Budget File</strong>
                  <span>Select a Budget App SQLite file and open it into its existing budget entry.</span>
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
          <Suspense fallback={<BudgetWorkflowLoading />}>
            {createError ? <p className="form-error" role="alert">{createError}</p> : null}
            <LazyNewBudgetWizard
              onBack={() => setLaunchMode("list")}
              onCreateBudget={handleCreateBudget}
            />
          </Suspense>
        ) : null}

        {launchMode === "budgetImport" ? (
          <Suspense fallback={<BudgetWorkflowLoading />}>
            <LazyBudgetImportDialog
              importActualBudget={importActualBudget}
              importYnab4Budget={importYnab4Budget}
              onBack={() => setLaunchMode("list")}
              onImportedBudgetSelected={selectBudget}
              onOpenBudget={handleOpenBudget}
            />
          </Suspense>
        ) : null}

        {budgetFileAction ? (
          <div className="app-dialog-backdrop" role="presentation">
            <section
              className="app-dialog budget-restore-file-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="budget-restore-file-title"
            >
              <h2 id="budget-restore-file-title" className="app-dialog-title">
                {budgetFileAction === "restore" ? "Restore Budget" : "Open Budget File"}
              </h2>
              <p className="app-dialog-message">
                Choose the existing budget this SQLite file belongs to. The file is
                staged and validated before it replaces the current local database.
              </p>

              <label className="form-field">
                <span className="field-label">Budget</span>
                <select
                  className="text-input"
                  value={restoreTargetBudgetId}
                  disabled={restoreInProgress || sortedBudgets.length === 0}
                  onChange={(event) => {
                    setRestoreTargetBudgetId(event.target.value);
                    setRestoreError(null);
                  }}
                >
                  {sortedBudgets.map((budget) => (
                    <option key={budget.id} value={budget.id}>
                      {budget.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="field-label">SQLite budget file</span>
                <input
                  ref={restoreFileInputRef}
                  className="text-input"
                  type="file"
                  accept=".budget-sqlite,.sqlite,.sqlite3,application/vnd.sqlite3,application/octet-stream"
                  disabled={restoreInProgress || sortedBudgets.length === 0}
                  onChange={(event) => {
                    setRestoreFile(event.target.files?.[0] ?? null);
                    setRestoreError(null);
                  }}
                />
              </label>

              {restoreFile ? (
                <p className="muted">
                  Selected: {restoreFile.name} · {Math.max(1, Math.round(restoreFile.size / 1024))} KiB
                </p>
              ) : null}
              {restoreError ? <p className="form-error" role="alert">{restoreError}</p> : null}

              <div className="app-dialog-actions">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={restoreInProgress}
                  onClick={closeBudgetFileWorkflow}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={restoreInProgress || !restoreTargetBudgetId || !restoreFile}
                  onClick={() => void restoreBudgetFile()}
                >
                  {restoreInProgress ? "Restoring…" : "Restore Budget"}
                </Button>
              </div>
            </section>
          </div>
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
                This action cannot be undone.
              </p>
              {deleteError ? <p className="form-error">{deleteError}</p> : null}
              <div className="app-dialog-actions">
                <Button
                  type="button"
                  variant="secondary"
                  autoFocus
                  disabled={deleteInProgress}
                  onClick={handleCancelDeleteBudget}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="button-danger"
                  disabled={deleteInProgress}
                  onClick={handleConfirmDeleteBudget}
                >
                  {deleteInProgress ? "Deletingâ€¦" : "Delete Budget"}
                </Button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
