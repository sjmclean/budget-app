export type BudgetImportProgressPhase =
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

export function BudgetImportProgressIndicator({
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
