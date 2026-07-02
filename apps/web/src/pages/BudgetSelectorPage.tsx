import { useMemo, useState } from "react";
import { BudgetImportProviderApplicationService } from "../../../../packages/application/src/BudgetImportProviderApplicationService";
import type { FullBudgetImportPreview } from "../../../../packages/types/src/index";
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

const actualBudgetImportProviderService = new BudgetImportProviderApplicationService();

type LaunchMode = "list" | "choose" | "empty" | "budgetImport";

type BudgetImportProgressPhase =
  | "idle"
  | "reading"
  | "detecting"
  | "inspecting"
  | "preparing"
  | "importing-accounts"
  | "importing-categories"
  | "importing-payees"
  | "importing-transactions"
  | "finalising"
  | "complete"
  | "failed";

const budgetImportProgressSteps: Array<{ phase: BudgetImportProgressPhase; label: string; detail: string }> = [
  { phase: "reading", label: "Reading file", detail: "Loading the selected budget file or package." },
  { phase: "detecting", label: "Detecting format", detail: "Checking Actual Budget, YNAB4, app backup and future provider signatures." },
  { phase: "inspecting", label: "Inspecting budget", detail: "Reading accounts, categories, payees, transactions and budget month data." },
  { phase: "preparing", label: "Preparing import", detail: "Validating the detected source before creating a new local budget." },
  { phase: "importing-accounts", label: "Importing accounts", detail: "Creating the imported budget and account structure." },
  { phase: "importing-categories", label: "Importing categories", detail: "Creating category groups, categories and budget months." },
  { phase: "importing-payees", label: "Importing payees", detail: "Creating supported payees and filtering transfer-only payees." },
  { phase: "importing-transactions", label: "Importing transactions", detail: "Creating registers, transactions, splits and transfers." },
  { phase: "finalising", label: "Finalising import", detail: "Saving the import report and selecting the new budget." },
];

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
  const markBudgetOpened = useBudgetRegistryStore(
    (state) => state.markBudgetOpened,
  );
  const selectBudget = useUIStore((state) => state.selectBudget);
  const [launchMode, setLaunchMode] = useState<LaunchMode>("list");
  const [budgetName, setBudgetName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [ynabError, setYnabError] = useState<string | null>(null);
  const [actualStatus, setActualStatus] = useState<string>(
    "Choose a supported budget file or YNAB4 package folder to preview a full-budget import.",
  );
  const [actualError, setActualError] = useState<string | null>(null);
  const [isAnalysingActual, setIsAnalysingActual] = useState(false);
  const [isImportingActual, setIsImportingActual] = useState(false);
  const [budgetImportProgressPhase, setBudgetImportProgressPhase] =
    useState<BudgetImportProgressPhase>("idle");
  const [budgetImportResult, setBudgetImportResult] = useState<{
    providerLabel: string;
    budgetId: string;
    budgetName: string;
    counts: Array<{ label: string; count: number }>;
    skipped: Array<{ label: string; count: number; reason?: string }>;
    warnings: string[];
  } | null>(null);
  const [isBudgetImportDragActive, setIsBudgetImportDragActive] = useState(false);

  const sortedBudgets = useMemo(
    () =>
      [...budgets].sort((first, second) =>
        first.name.localeCompare(second.name),
      ),
    [budgets],
  );

  function handleOpenBudget(budgetId: string) {
    markBudgetOpened(budgetId);
    selectBudget(budgetId);
    navigate("/dashboard");
  }

  function handleReturnToBudgets() {
    setLaunchMode("list");
    setFormError(null);
    setYnabError(null);
    setActualError(null);
    setBudgetImportProgressPhase("idle");
    setBudgetImportResult(null);
    setIsBudgetImportDragActive(false);
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

  async function importYnab4PackagePreview(input: {
    discovery: Ynab4PackageDiscoveryResult;
    preview: Ynab4PackageMigrationPreview;
    entries: Ynab4PackageEntry[];
  }) {
    setBudgetImportProgressPhase("importing-accounts");

    try {
      setBudgetImportProgressPhase("importing-transactions");
      const result = await importYnab4Budget(input);
      setBudgetImportProgressPhase("finalising");
      selectBudget(result.budget.id);
      setBudgetImportProgressPhase("complete");
      setBudgetImportResult({
        providerLabel: "YNAB4",
        budgetId: result.budget.id,
        budgetName: result.budget.name,
        counts: [
          { label: "Accounts", count: result.record.counts.accounts },
          { label: "Categories", count: result.record.counts.categories },
          { label: "Payees", count: result.record.counts.payees },
          { label: "Transactions", count: result.record.counts.transactions },
          { label: "Scheduled transactions", count: result.record.counts.scheduledTransactions },
        ],
        skipped: [],
        warnings: result.record.warnings,
      });
      setLaunchMode("budgetImport");
    } catch (error) {
      setYnabError(
        error instanceof Error
          ? error.message
          : "Unable to create the imported YNAB4 budget.",
      );
      setBudgetImportProgressPhase("failed");
    } finally {
    }
  }

  async function importDetectedActualBudget(preview: FullBudgetImportPreview, sourceFileName: string | null) {
    if (!preview.canCommit) {
      setActualError("The detected budget cannot be imported yet. Review the warning details and try a supported export.");
      setBudgetImportProgressPhase("failed");
      return;
    }

    setIsImportingActual(true);
    setBudgetImportProgressPhase("importing-accounts");
    setActualStatus(`Importing ${preview.providerLabel}…`);

    try {
      setBudgetImportProgressPhase("importing-categories");
      setBudgetImportProgressPhase("importing-payees");
      setBudgetImportProgressPhase("importing-transactions");
      const result = await importActualBudget({
        preview,
        sourceFileName,
      });
      setBudgetImportProgressPhase("finalising");
      selectBudget(result.budget.id);
      setBudgetImportProgressPhase("complete");
      setBudgetImportResult({
        providerLabel: preview.providerLabel,
        budgetId: result.budget.id,
        budgetName: result.budget.name,
        counts: [
          { label: "Accounts", count: result.record.counts.accounts },
          { label: "Category groups", count: result.record.counts.categoryGroups },
          { label: "Categories", count: result.record.counts.categories },
          { label: "Payees", count: result.record.counts.payees },
          { label: "Transactions", count: result.record.counts.transactions },
          { label: "Transfers", count: result.record.counts.transfers },
        ],
        skipped: result.record.skipped,
        warnings: result.record.warnings,
      });
      setActualStatus(`Imported ${result.budget.name}.`);
      setLaunchMode("budgetImport");
    } catch (error) {
      setActualError(
        error instanceof Error
          ? error.message
          : "Unable to create the imported budget.",
      );
      setBudgetImportProgressPhase("failed");
      setActualStatus("Budget import failed.");
    } finally {
      setIsImportingActual(false);
    }
  }

  async function handleActualBudgetFileSelection(files: FileList | null) {
    const file = files?.item(0);
    if (!file) {
      setActualStatus("Drop a supported budget file here, or browse to choose one.");
      return;
    }

    setActualError(null);
    setYnabError(null);
    setBudgetImportResult(null);
    setIsAnalysingActual(true);
    setBudgetImportProgressPhase("reading");
    setActualStatus("Reading budget file…");

    try {
      const binary = new Uint8Array(await file.arrayBuffer());
      const text = file.name.toLowerCase().endsWith(".json")
        ? await file.text()
        : "";
      setBudgetImportProgressPhase("detecting");
      const preview = await actualBudgetImportProviderService.fullBudgetPreviewAsync({
        fileName: file.name,
        text,
        binary,
      });

      if (!preview) {
        setActualError(
          "This does not look like a supported budget import. Try an Actual Budget ZIP, Budget Backup JSON, or YNAB4 package.",
        );
        setBudgetImportProgressPhase("failed");
        setActualStatus("Budget import failed before import started.");
        return;
      }

      setBudgetImportProgressPhase("inspecting");
      setBudgetImportProgressPhase("preparing");
      setActualStatus(`${preview.providerLabel} detected. Importing into a new local budget…`);
      await importDetectedActualBudget(preview, file.name);
    } catch (error) {
      setActualError(
        error instanceof Error
          ? error.message
          : "Unable to analyse the selected budget import file.",
      );
      setActualStatus("Budget import failed before import started.");
      setBudgetImportProgressPhase("failed");
    } finally {
      setIsAnalysingActual(false);
    }
  }

  async function handleBudgetImportSelection(files: FileList | null) {
    setIsBudgetImportDragActive(false);
    setActualError(null);
    setYnabError(null);
    setBudgetImportResult(null);

    if (!files || files.length === 0) {
      setActualStatus("Drop a supported budget file here, or browse to choose one.");
      return;
    }

    if (files.length > 1 || Array.from(files).some((file) => file.webkitRelativePath)) {
      await handleYnab4PackageSelection(files);
      return;
    }

    await handleActualBudgetFileSelection(files);
  }

  async function handleYnab4PackageSelection(files: FileList | null) {
    setYnabError(null);
    setActualError(null);
    setBudgetImportResult(null);

    if (!files || files.length === 0) {
      return;
    }

    setBudgetImportProgressPhase("reading");

    try {
      const entries = await readYnab4PackageEntries(Array.from(files));
      setBudgetImportProgressPhase("detecting");
      const discovery = discoverYnab4Package(entries);
      setBudgetImportProgressPhase("inspecting");
      const preview = createYnab4PackageMigrationPreview(
        discovery,
        "new-budget",
      );
      setBudgetImportProgressPhase(discovery.isYnab4Package ? "preparing" : "failed");

      if (!discovery.isYnab4Package) {
        return;
      }

      if (!preview.canContinue) {
        setYnabError("The selected YNAB4 package has warnings that prevent import.");
        setBudgetImportProgressPhase("failed");
        return;
      }

      await importYnab4PackagePreview({ discovery, preview, entries });
    } catch (error) {
      setYnabError(
        error instanceof Error
          ? error.message
          : "Unable to analyse the selected YNAB4 package.",
      );
      setBudgetImportProgressPhase("failed");
    } finally {
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
                      <span className="budget-row-meta">
                        <span>{budget.currency}</span>
                        <span>{formatBudgetCreatedLabel(budget.createdAt)}</span>
                        <span>{formatBudgetLocation(budget.packagePath)}</span>
                      </span>
                    </span>
                    <span className="budget-row-open-label">Open</span>
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
          <Card className="budget-launch-picker budget-create-card-glass budget-import-compact-card">
            <div className="budget-launch-nav">
              <button type="button" onClick={() => setLaunchMode("choose")}>
                ← Back
              </button>
            </div>

            {budgetImportResult ? (
              <div className="budget-import-complete-report" aria-label="Budget import completion report">
                <div className="budget-import-complete-icon" aria-hidden="true">
                  ✓
                </div>
                <div>
                  <p className="eyebrow">Import complete</p>
                  <h2>{budgetImportResult.budgetName}</h2>
                  <p>{budgetImportResult.providerLabel} was imported into a new local budget.</p>
                </div>
                <div className="ynab4-summary-metrics">
                  {budgetImportResult.counts.map((item) => (
                    <div key={item.label} className="ynab4-summary-metric">
                      <strong>{item.count.toLocaleString()}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                {budgetImportResult.skipped.length > 0 ? (
                  <ul className="ynab4-warning-list">
                    {budgetImportResult.skipped.map((item) => (
                      <li key={item.label}>
                        {item.label}: {item.count.toLocaleString()} skipped{item.reason ? ` — ${item.reason}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {budgetImportResult.warnings.length > 0 ? (
                  <ul className="ynab4-warning-list">
                    {budgetImportResult.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <Button type="button" onClick={() => handleOpenBudget(budgetImportResult.budgetId)}>
                  Open imported budget
                </Button>
              </div>
            ) : budgetImportProgressPhase !== "idle" && budgetImportProgressPhase !== "failed" ? (
              <div className="budget-import-progress-state">
                <div className="budget-launch-choice-header">
                  <p className="eyebrow">Import Budget</p>
                  <h2>{isImportingActual || isAnalysingActual ? "Importing budget…" : "Preparing import…"}</h2>
                  <p>{actualStatus}</p>
                </div>
                <BudgetImportProgressIndicator phase={budgetImportProgressPhase} />
              </div>
            ) : (
              <>
                <div className="budget-launch-choice-header budget-import-compact-header">
                  <p className="eyebrow">Full-budget migration</p>
                  <h2>Import Budget</h2>
                  <p>Drop or choose a budget export. The app will detect the provider and create a new local budget.</p>
                </div>

                <label
                  className={
                    isBudgetImportDragActive
                      ? "budget-import-drop-zone budget-import-drop-zone-active"
                      : "budget-import-drop-zone"
                  }
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsBudgetImportDragActive(true);
                  }}
                  onDragLeave={() => setIsBudgetImportDragActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleBudgetImportSelection(event.dataTransfer.files);
                  }}
                >
                  <input
                    type="file"
                    accept=".zip,.actual,.actualbudget,.json,application/zip,application/x-zip-compressed,application/json"
                    onChange={(event) =>
                      void handleBudgetImportSelection(event.currentTarget.files)
                    }
                  />
                  <span className="budget-import-drop-icon" aria-hidden="true">
                    ⇧
                  </span>
                  <span>
                    <strong>Drop your budget here or click to browse</strong>
                    <small>Actual Budget (.zip), Budget Backup (.json), YNAB4 folder/package. YNAB Online Planned.</small>
                    <small>Transaction import remains separate.</small>
                  </span>
                </label>

                <label className="ynab4-file-button budget-import-folder-button">
                  <input
                    type="file"
                    multiple
                    {...ynab4DirectoryInputProps}
                    onChange={(event) =>
                      void handleBudgetImportSelection(event.currentTarget.files)
                    }
                  />
                  Choose YNAB4 folder instead
                </label>
              </>
            )}

            {actualError || ynabError ? (
              <p className="ynab4-status ynab4-status-error">{actualError ?? ynabError}</p>
            ) : null}
          </Card>
        ) : null}
      </section>
    </main>
  );
}

function BudgetImportProgressIndicator({
  phase,
}: {
  phase: BudgetImportProgressPhase;
}) {
  const currentIndex = budgetImportProgressSteps.findIndex(
    (step) => step.phase === phase,
  );
  const isIdle = phase === "idle";
  const isFailed = phase === "failed";
  const isComplete = phase === "complete";

  return (
    <div className="ynab4-progress-preview" aria-label="Budget import progress">
      <h3>Import progress</h3>
      <p className="ynab4-drilldown-summary">
        {isIdle
          ? "Progress will appear here after you choose a budget file or package."
          : isFailed
            ? "Import stopped before completion."
            : isComplete
              ? "Import complete."
              : `Step ${Math.max(currentIndex + 1, 1)} of ${budgetImportProgressSteps.length}`}
      </p>
      <div
        className="budget-import-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={budgetImportProgressSteps.length}
        aria-valuenow={isComplete ? budgetImportProgressSteps.length : Math.max(currentIndex + 1, 0)}
      >
        <span
          style={{
            width: `${isComplete ? 100 : Math.max(((currentIndex + 1) / budgetImportProgressSteps.length) * 100, 0)}%`,
          }}
        />
      </div>
      <ol>
        {budgetImportProgressSteps.map((step, index) => {
          const isDone = isComplete || (!isIdle && currentIndex >= 0 && index < currentIndex);
          const isCurrent = !isIdle && !isComplete && index === currentIndex;
          return (
            <li key={step.phase}>
              <span
                className={
                  isDone || isCurrent
                    ? "ynab4-progress-dot ynab4-progress-dot-complete"
                    : "ynab4-progress-dot"
                }
                aria-hidden="true"
              />
              <span>
                <strong>{step.label}</strong>
                <small>{isCurrent ? "Current step. " : ""}{step.detail}</small>
              </span>
            </li>
          );
        })}
      </ol>
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
