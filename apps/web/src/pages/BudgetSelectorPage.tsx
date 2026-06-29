import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageDiscoveryResult,
  type Ynab4PackageEntry,
  type Ynab4PackageMigrationPreview,
} from "../../../../packages/ynab4-importer/src/analyzeYnab4Package";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";

const ynab4DirectoryInputProps = {
  webkitdirectory: "",
  directory: "",
} as Record<string, string>;

type LaunchMode = "list" | "choose" | "empty" | "ynab";

export function BudgetSelectorPage() {
  const navigate = useNavigate();
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const createBudget = useBudgetRegistryStore((state) => state.createBudget);
  const importYnab4Budget = useBudgetRegistryStore(
    (state) => state.importYnab4Budget,
  );
  const markBudgetOpened = useBudgetRegistryStore(
    (state) => state.markBudgetOpened,
  );
  const selectBudget = useUIStore((state) => state.selectBudget);
  const [launchMode, setLaunchMode] = useState<LaunchMode>("list");
  const [budgetName, setBudgetName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [ynabDiscovery, setYnabDiscovery] =
    useState<Ynab4PackageDiscoveryResult | null>(null);
  const [ynabPreview, setYnabPreview] =
    useState<Ynab4PackageMigrationPreview | null>(null);
  const [ynabEntries, setYnabEntries] = useState<Ynab4PackageEntry[]>([]);
  const [ynabStatus, setYnabStatus] = useState<string>(
    "Select your real .ynab4 package folder to preview the migration.",
  );
  const [ynabError, setYnabError] = useState<string | null>(null);
  const [isAnalysingYnab, setIsAnalysingYnab] = useState(false);
  const [isImportingYnab, setIsImportingYnab] = useState(false);

  const sortedBudgets = useMemo(
    () =>
      [...budgets].sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
    [budgets],
  );

  const getSummaryValue = (label: string) =>
    ynabPreview?.summaryItems.find((item) => item.label === label)?.value ?? 0;

  const detailLimitText = (shown: number, total: number, noun: string) =>
    total > shown
      ? `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} ${noun}.`
      : `Showing ${shown.toLocaleString()} ${noun}.`;

  function handleOpenBudget(budgetId: string) {
    markBudgetOpened(budgetId);
    selectBudget(budgetId);
    navigate("/dashboard");
  }

  function handleReturnToBudgets() {
    setLaunchMode("list");
    setFormError(null);
    setYnabError(null);
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

  async function handleImportYnab4Budget() {
    setYnabError(null);

    if (!ynabDiscovery || !ynabPreview || ynabEntries.length === 0) {
      setYnabError("Preview a valid YNAB4 package before importing.");
      return;
    }

    if (!ynabPreview.canContinue) {
      setYnabError("Resolve YNAB4 package warnings before importing.");
      return;
    }

    setIsImportingYnab(true);
    setYnabStatus("Creating imported YNAB4 budget…");

    try {
      const result = await importYnab4Budget({
        discovery: ynabDiscovery,
        preview: ynabPreview,
        entries: ynabEntries,
      });
      selectBudget(result.budget.id);
      setYnabStatus(`Imported ${result.budget.name}. Opening budget…`);
      navigate("/dashboard");
    } catch (error) {
      setYnabError(
        error instanceof Error
          ? error.message
          : "Unable to create the imported YNAB4 budget.",
      );
      setYnabStatus("YNAB4 import failed.");
    } finally {
      setIsImportingYnab(false);
    }
  }

  async function handleYnab4PackageSelection(files: FileList | null) {
    setYnabError(null);
    setYnabDiscovery(null);
    setYnabPreview(null);
    setYnabEntries([]);

    if (!files || files.length === 0) {
      setYnabStatus(
        "Select your real .ynab4 package folder to preview the migration.",
      );
      return;
    }

    setIsAnalysingYnab(true);
    setYnabStatus("Reading YNAB4 package…");

    try {
      const entries = await readYnab4PackageEntries(Array.from(files));
      const discovery = discoverYnab4Package(entries);
      const preview = createYnab4PackageMigrationPreview(
        discovery,
        "new-budget",
      );
      setYnabEntries(entries);
      setYnabDiscovery(discovery);
      setYnabPreview(preview);
      setYnabStatus(
        discovery.isYnab4Package
          ? "YNAB4 package analysed. Review the preview before continuing."
          : "The selected folder was not recognised as a YNAB4 package.",
      );
    } catch (error) {
      setYnabError(
        error instanceof Error
          ? error.message
          : "Unable to analyse the selected YNAB4 package.",
      );
      setYnabStatus("YNAB4 package analysis failed.");
    } finally {
      setIsAnalysingYnab(false);
    }
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
            {launchMode === "list" ? "Choose a budget" : "Create a budget"}
          </h1>
          <p>
            {launchMode === "list"
              ? "Open an existing local budget or start a guided flow for a new budget, import, or restore."
              : "Choose how you want to begin. The app will only ask for the details needed for that path."}
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
                  <div className="budget-row-card budget-row-card-premium budget-empty-card-premium">
                    <div className="budget-row-icon" aria-hidden="true">
                      ▣
                    </div>
                    <div>
                      <h2>No budgets yet</h2>
                      <p>
                        Start with a blank budget, import YNAB4, or restore a
                        Budget App backup.
                      </p>
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
                    <span className="budget-row-icon" aria-hidden="true">
                      ▣
                    </span>
                    <span className="budget-row-main">
                      <strong>{budget.name}</strong>
                      <span>{budget.lastOpenedLabel}</span>
                    </span>
                    <span className="budget-row-chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
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
              <h2>How would you like to begin?</h2>
              <p>
                Pick one path. The next step reuses the existing creation,
                import, or restore workflow.
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
                onClick={() => setLaunchMode("ynab")}
              >
                <span className="budget-launch-option-icon" aria-hidden="true">
                  ⇪
                </span>
                <span>
                  <strong>Import YNAB4</strong>
                  <small>Import an existing YNAB4 package as a new budget.</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>

              <button type="button" className="budget-launch-option" disabled>
                <span className="budget-launch-option-icon" aria-hidden="true">
                  ↺
                </span>
                <span>
                  <strong>Restore backup</strong>
                  <small>Restore a Budget App backup. Coming soon.</small>
                </span>
                <span aria-hidden="true">•</span>
              </button>
            </div>

            <div className="budget-launch-coming-soon" aria-label="Coming soon">
              <span>Coming soon</span>
              <ul>
                <li>Actual Budget import</li>
                <li>Cloud budget</li>
                <li>CSV import</li>
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

        {launchMode === "ynab" ? (
          <section
            className="ynab4-preview-panel"
            aria-labelledby="ynab4-preview-title"
          >
            <div className="budget-launch-nav">
              <button type="button" onClick={() => setLaunchMode("choose")}>
                ← Back
              </button>
            </div>
            <div className="ynab4-preview-header">
              <div>
                <p className="eyebrow">Migration preview</p>
                <h2 id="ynab4-preview-title">Import YNAB4 budget</h2>
                <p>
                  Preview a real .ynab4 package before creating a new imported
                  budget.
                </p>
              </div>
              <label className="ynab4-file-button">
                <input
                  type="file"
                  multiple
                  onChange={(event) =>
                    void handleYnab4PackageSelection(event.currentTarget.files)
                  }
                  {...ynab4DirectoryInputProps}
                />
                Select .ynab4 package folder
              </label>
            </div>

            <div className="ynab4-import-mode-note">
              <strong>Launcher imports always create a new budget.</strong>
              <span>
                Replacing the current budget remains a future Settings / Reset
                workflow with destructive confirmation.
              </span>
            </div>

            <p
              className={
                ynabError ? "ynab4-status ynab4-status-error" : "ynab4-status"
              }
            >
              {isAnalysingYnab
                ? "Analysing selected YNAB4 package…"
                : isImportingYnab
                  ? "Creating imported YNAB4 budget…"
                  : (ynabError ?? ynabStatus)}
            </p>

            {ynabPreview ? (
              <div className="ynab4-preview-context-note">
                <strong>Preview lists are intentionally capped.</strong>
                <span>
                  They are samples to confirm the file has been understood, not a
                  full browser for every YNAB4 record. Full counts are shown
                  above.
                </span>
              </div>
            ) : null}

            {ynabPreview ? (
              <div className="ynab4-preview-grid">
                <div className="ynab4-preview-summary">
                  <h3>{ynabPreview.budgetName ?? "YNAB4 Budget"}</h3>
                  <p>New budget import preview</p>
                  <div className="ynab4-summary-metrics">
                    {ynabPreview.summaryItems.map((item) => (
                      <div key={item.label} className="ynab4-summary-metric">
                        <strong>{item.value.toLocaleString()}</strong>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                  {ynabDiscovery?.budgetDataPath ? (
                    <p className="ynab4-data-path">
                      Data source: {ynabDiscovery.budgetDataPath}
                    </p>
                  ) : null}
                  {ynabPreview.warnings.length > 0 ? (
                    <ul className="ynab4-warning-list">
                      {ynabPreview.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}

                  <div
                    className="ynab4-drilldown-list"
                    aria-label="YNAB4 package drill-down preview"
                  >
                    <Ynab4PreviewDetails
                      title="Accounts"
                      summary={detailLimitText(
                        ynabPreview.details.accounts.length,
                        getSummaryValue("Accounts"),
                        "accounts",
                      )}
                      emptyMessage="No accounts detected yet."
                    >
                      {ynabPreview.details.accounts.map((account) => (
                        <Ynab4PreviewLine
                          key={account.id ?? account.name}
                          primary={account.name}
                          secondary={account.note}
                        />
                      ))}
                    </Ynab4PreviewDetails>

                    <Ynab4PreviewDetails
                      title="Categories"
                      summary={`${detailLimitText(
                        ynabPreview.details.categoryGroups.length,
                        getSummaryValue("Category groups"),
                        "category groups",
                      )} Showing up to ${ynabPreview.details.previewLimits.categoriesPerGroup} categories per group.`}
                      emptyMessage="No categories detected yet."
                    >
                      {ynabPreview.details.categoryGroups.map((group) => (
                        <div
                          key={group.id ?? group.name}
                          className="ynab4-category-group-preview"
                        >
                          <Ynab4PreviewLine
                            primary={group.name}
                            secondary={group.note}
                          />
                          {group.categories.length > 0 ? (
                            <ul>
                              {group.categories.map((category) => (
                                <li key={category.id ?? category.name}>
                                  <span>{category.name}</span>
                                  {category.note ? (
                                    <small>{category.note}</small>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </Ynab4PreviewDetails>

                    <Ynab4PreviewDetails
                      title="Payees"
                      summary={detailLimitText(
                        ynabPreview.details.payees.length,
                        getSummaryValue("Payees"),
                        "payees",
                      )}
                      emptyMessage="No payees detected yet."
                    >
                      {ynabPreview.details.payees.map((payee) => (
                        <Ynab4PreviewLine
                          key={payee.id ?? payee.name}
                          primary={payee.name}
                          secondary={payee.note}
                        />
                      ))}
                    </Ynab4PreviewDetails>

                    <Ynab4PreviewDetails
                      title="Notes"
                      summary={`Showing up to ${ynabPreview.details.previewLimits.notes} category notes and ${ynabPreview.details.previewLimits.notes} group notes.`}
                      emptyMessage="No category or category group notes detected yet."
                    >
                      {ynabPreview.details.notes.categoryGroupNotes.map(
                        (note) => (
                          <Ynab4PreviewLine
                            key={`group-${note.id ?? note.name}`}
                            primary={`Group: ${note.name}`}
                            secondary={note.note}
                          />
                        ),
                      )}
                      {ynabPreview.details.notes.categoryNotes.map((note) => (
                        <Ynab4PreviewLine
                          key={`category-${note.id ?? note.name}`}
                          primary={`Category: ${note.name}`}
                          secondary={note.note}
                        />
                      ))}
                    </Ynab4PreviewDetails>

                    <Ynab4PreviewDetails
                      title="Scheduled transactions"
                      summary={detailLimitText(
                        ynabPreview.details.scheduledTransactions.length,
                        getSummaryValue("Scheduled transactions"),
                        "scheduled transactions",
                      )}
                      emptyMessage="No scheduled transactions detected yet."
                    >
                      {ynabPreview.details.scheduledTransactions.map(
                        (transaction, index) => (
                          <Ynab4PreviewLine
                            key={transaction.id ?? `scheduled-${index}`}
                            primary={
                              transaction.payee ??
                              transaction.memo ??
                              "Scheduled transaction"
                            }
                            secondary={[
                              transaction.date,
                              transaction.amount,
                              transaction.memo,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          />
                        ),
                      )}
                    </Ynab4PreviewDetails>

                    <Ynab4PreviewDetails
                      title="Transaction samples"
                      summary={`Showing first ${ynabPreview.details.firstTransactions.length} and recent ${ynabPreview.details.recentTransactions.length} of ${getSummaryValue("Transactions").toLocaleString()} transactions.`}
                      emptyMessage="No transactions detected yet."
                    >
                      <p className="ynab4-drilldown-caption">
                        First transactions
                      </p>
                      {ynabPreview.details.firstTransactions.map(
                        (transaction, index) => (
                          <Ynab4PreviewLine
                            key={transaction.id ?? `first-${index}`}
                            primary={
                              transaction.payee ??
                              transaction.memo ??
                              "Transaction"
                            }
                            secondary={[
                              transaction.date,
                              transaction.amount,
                              transaction.category,
                              transaction.memo,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          />
                        ),
                      )}
                      <p className="ynab4-drilldown-caption">
                        Recent transactions
                      </p>
                      {ynabPreview.details.recentTransactions.map(
                        (transaction, index) => (
                          <Ynab4PreviewLine
                            key={transaction.id ?? `recent-${index}`}
                            primary={
                              transaction.payee ??
                              transaction.memo ??
                              "Transaction"
                            }
                            secondary={[
                              transaction.date,
                              transaction.amount,
                              transaction.category,
                              transaction.memo,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          />
                        ),
                      )}
                    </Ynab4PreviewDetails>
                  </div>
                </div>

                <div
                  className="ynab4-progress-preview"
                  aria-label="Planned YNAB4 import progress"
                >
                  <h3>Planned progress indicator</h3>
                  <ol>
                    {ynabPreview.progressSteps.map((step, index) => (
                      <li key={step.phase}>
                        <span
                          className={
                            index < 4
                              ? "ynab4-progress-dot ynab4-progress-dot-complete"
                              : "ynab4-progress-dot"
                          }
                          aria-hidden="true"
                        />
                        <span>
                          <strong>{step.label}</strong>
                          <small>{step.detail}</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : null}

            <div className="ynab4-preview-actions">
              <Button
                type="button"
                disabled={
                  !ynabPreview?.canContinue || isAnalysingYnab || isImportingYnab
                }
                onClick={handleImportYnab4Budget}
              >
                {isImportingYnab
                  ? "Creating imported budget…"
                  : "Create imported budget"}
              </Button>
              <p>
                v2.32.0 launches the existing YNAB4 import from the new budget
                experience. Detailed import progress remains a later polish item.
              </p>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function Ynab4PreviewDetails({
  title,
  summary,
  emptyMessage,
  children,
}: {
  title: string;
  summary?: string;
  emptyMessage: string;
  children: ReactNode;
}) {
  const hasContent = Array.isArray(children)
    ? children.some(Boolean)
    : Boolean(children);

  return (
    <details className="ynab4-drilldown-section">
      <summary>{title}</summary>
      <div className="ynab4-drilldown-content">
        {summary ? <p className="ynab4-drilldown-summary">{summary}</p> : null}
        {hasContent ? (
          children
        ) : (
          <p className="ynab4-drilldown-empty">{emptyMessage}</p>
        )}
      </div>
    </details>
  );
}

function Ynab4PreviewLine({
  primary,
  secondary,
}: {
  primary: string;
  secondary?: string | number | null;
}) {
  return (
    <div className="ynab4-preview-line">
      <strong>{primary}</strong>
      {secondary ? <small>{secondary}</small> : null}
    </div>
  );
}

async function readYnab4PackageEntries(
  files: File[],
): Promise<Ynab4PackageEntry[]> {
  const readableFiles = files.filter((file) =>
    /(?:Budget\.ymeta|Budget\.yfull|Budget\.json)$/i.test(file.name),
  );

  if (readableFiles.length === 0) {
    throw new Error(
      "No Budget.ymeta, Budget.yfull, or Budget.json files were found in the selected folder.",
    );
  }

  return Promise.all(
    readableFiles.map(async (file) => ({
      path: file.webkitRelativePath || file.name,
      text: await file.text(),
    })),
  );
}
