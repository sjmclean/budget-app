import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageDiscoveryResult,
  type Ynab4PackageEntry,
  type Ynab4PackageImportMode,
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

export function BudgetSelectorPage() {
  const navigate = useNavigate();
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const createBudget = useBudgetRegistryStore((state) => state.createBudget);
  const markBudgetOpened = useBudgetRegistryStore((state) => state.markBudgetOpened);
  const selectBudget = useUIStore((state) => state.selectBudget);
  const [budgetName, setBudgetName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [ynabImportMode, setYnabImportMode] = useState<Ynab4PackageImportMode>("new-budget");
  const [ynabDiscovery, setYnabDiscovery] = useState<Ynab4PackageDiscoveryResult | null>(null);
  const [ynabPreview, setYnabPreview] = useState<Ynab4PackageMigrationPreview | null>(null);
  const [ynabStatus, setYnabStatus] = useState<string>("Select your real .ynab4 package folder to preview the migration.");
  const [ynabError, setYnabError] = useState<string | null>(null);
  const [isAnalysingYnab, setIsAnalysingYnab] = useState(false);

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

  async function handleYnab4PackageSelection(files: FileList | null) {
    setYnabError(null);
    setYnabDiscovery(null);
    setYnabPreview(null);

    if (!files || files.length === 0) {
      setYnabStatus("Select your real .ynab4 package folder to preview the migration.");
      return;
    }

    setIsAnalysingYnab(true);
    setYnabStatus("Reading YNAB4 package…");

    try {
      const entries = await readYnab4PackageEntries(Array.from(files));
      const discovery = discoverYnab4Package(entries);
      const preview = createYnab4PackageMigrationPreview(discovery, ynabImportMode);
      setYnabDiscovery(discovery);
      setYnabPreview(preview);
      setYnabStatus(discovery.isYnab4Package ? "YNAB4 package analysed. Review the preview before continuing." : "The selected folder was not recognised as a YNAB4 package.");
    } catch (error) {
      setYnabError(error instanceof Error ? error.message : "Unable to analyse the selected YNAB4 package.");
      setYnabStatus("YNAB4 package analysis failed.");
    } finally {
      setIsAnalysingYnab(false);
    }
  }

  function handleYnabImportModeChange(mode: Ynab4PackageImportMode) {
    setYnabImportMode(mode);
    if (ynabDiscovery) {
      setYnabPreview(createYnab4PackageMigrationPreview(ynabDiscovery, mode));
    }
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
            Open an existing local budget, create a new blank budget, or preview a YNAB4 package migration.
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
                  <p>Create a budget above to get started or preview a YNAB4 import below.</p>
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

        <section className="ynab4-preview-panel" aria-labelledby="ynab4-preview-title">
          <div className="ynab4-preview-header">
            <div>
              <p className="eyebrow">Migration preview</p>
              <h2 id="ynab4-preview-title">Import YNAB4 budget</h2>
              <p>
                Preview a real .ynab4 package before any budget is created or replaced.
              </p>
            </div>
            <label className="ynab4-file-button">
              <input
                type="file"
                multiple
                onChange={(event) => void handleYnab4PackageSelection(event.currentTarget.files)}
                {...ynab4DirectoryInputProps}
              />
              Select .ynab4 package folder
            </label>
          </div>

          <div className="ynab4-mode-picker" role="radiogroup" aria-label="YNAB4 import mode">
            <label>
              <input
                type="radio"
                name="ynab4-import-mode"
                checked={ynabImportMode === "new-budget"}
                onChange={() => handleYnabImportModeChange("new-budget")}
              />
              <span>
                <strong>Import as new budget</strong>
                <small>Non-destructive. Creates a separate imported budget later.</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="ynab4-import-mode"
                checked={ynabImportMode === "replace-current-budget"}
                onChange={() => handleYnabImportModeChange("replace-current-budget")}
              />
              <span>
                <strong>Replace current budget</strong>
                <small>Destructive future mode. Will require confirmation from Settings/Reset.</small>
              </span>
            </label>
          </div>

          <p className={ynabError ? "ynab4-status ynab4-status-error" : "ynab4-status"}>
            {isAnalysingYnab ? "Analysing selected YNAB4 package…" : ynabError ?? ynabStatus}
          </p>

          {ynabPreview ? (
            <div className="ynab4-preview-grid">
              <div className="ynab4-preview-summary">
                <h3>{ynabPreview.budgetName ?? "YNAB4 Budget"}</h3>
                <p>{ynabPreview.destructive ? "Replace current budget preview" : "New budget import preview"}</p>
                <div className="ynab4-summary-metrics">
                  {ynabPreview.summaryItems.map((item) => (
                    <div key={item.label} className="ynab4-summary-metric">
                      <strong>{item.value.toLocaleString()}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                {ynabDiscovery?.budgetDataPath ? (
                  <p className="ynab4-data-path">Data source: {ynabDiscovery.budgetDataPath}</p>
                ) : null}
                {ynabPreview.warnings.length > 0 ? (
                  <ul className="ynab4-warning-list">
                    {ynabPreview.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="ynab4-progress-preview" aria-label="Planned YNAB4 import progress">
                <h3>Planned progress indicator</h3>
                <ol>
                  {ynabPreview.progressSteps.map((step, index) => (
                    <li key={step.phase}>
                      <span className={index < 4 ? "ynab4-progress-dot ynab4-progress-dot-complete" : "ynab4-progress-dot"} aria-hidden="true" />
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
            <Button type="button" disabled>
              Continue import later
            </Button>
            <p>No data is written in v1.60. This screen only analyses and previews the package.</p>
          </div>
        </section>
      </section>
    </main>
  );
}

async function readYnab4PackageEntries(files: File[]): Promise<Ynab4PackageEntry[]> {
  const readableFiles = files.filter((file) => /(?:Budget\.ymeta|Budget\.yfull|Budget\.json)$/i.test(file.name));

  if (readableFiles.length === 0) {
    throw new Error("No Budget.ymeta, Budget.yfull, or Budget.json files were found in the selected folder.");
  }

  return Promise.all(
    readableFiles.map(async (file) => ({
      path: file.webkitRelativePath || file.name,
      text: await file.text(),
    })),
  );
}
