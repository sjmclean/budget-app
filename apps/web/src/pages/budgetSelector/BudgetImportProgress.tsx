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

export interface BudgetImportProgressCounts {
  accounts?: number;
  categoryGroups?: number;
  categories?: number;
  payees?: number;
  transactions?: number;
  scheduledTransactions?: number;
}

interface BudgetImportProgressStep {
  phase: BudgetImportProgressPhase;
  label: string;
  detail: string;
  countKey?: keyof BudgetImportProgressCounts;
}

const budgetImportProgressSteps: BudgetImportProgressStep[] = [
  {
    phase: "reading",
    label: "Scanning budget files",
    detail: "Reading the selected budget file or package.",
  },
  {
    phase: "detecting",
    label: "Detecting budget format",
    detail: "Checking Actual Budget, YNAB4 and Budget App backup signatures.",
  },
  {
    phase: "inspecting",
    label: "Inspecting budget contents",
    detail: "Counting accounts, categories, payees, transactions and budget data.",
  },
  {
    phase: "preparing",
    label: "Preparing import",
    detail: "Validating the source before creating a new local budget.",
  },
  {
    phase: "importing-accounts",
    label: "Importing accounts",
    detail: "Creating account structures and opening balances.",
    countKey: "accounts",
  },
  {
    phase: "importing-categories",
    label: "Importing categories",
    detail: "Creating category groups, categories and budget months.",
    countKey: "categories",
  },
  {
    phase: "importing-payees",
    label: "Importing payees",
    detail: "Creating supported payees and transfer relationships.",
    countKey: "payees",
  },
  {
    phase: "importing-transactions",
    label: "Importing transactions",
    detail: "Creating registers, transactions, splits and scheduled transactions.",
    countKey: "transactions",
  },
  {
    phase: "finalising",
    label: "Finalising import",
    detail: "Saving the import report and preparing the new budget.",
  },
];

function formatStepLabel(
  step: BudgetImportProgressStep,
  counts: BudgetImportProgressCounts | null,
): string {
  if (!step.countKey || !counts) {
    return step.label;
  }

  const count = counts[step.countKey];
  return typeof count === "number"
    ? `${step.label} (${count.toLocaleString()})`
    : step.label;
}

export function BudgetImportProgressIndicator({
  phase,
  counts = null,
}: {
  phase: BudgetImportProgressPhase;
  counts?: BudgetImportProgressCounts | null;
}) {
  const currentIndex = budgetImportProgressSteps.findIndex(
    (step) => step.phase === phase,
  );
  const isIdle = phase === "idle";
  const isFailed = phase === "failed";
  const isComplete = phase === "complete";
  const completedSteps = isComplete
    ? budgetImportProgressSteps.length
    : Math.max(currentIndex + 1, 0);

  return (
    <div className="budget-import-progress-panel" aria-label="Budget import progress">
      <div className="budget-import-progress-heading">
        <div>
          <h3>Import progress</h3>
          <p>
            {isIdle
              ? "Progress will appear here after you choose a budget file or package."
              : isFailed
                ? "Import stopped before completion."
                : isComplete
                  ? "Import complete."
                  : `Step ${Math.max(currentIndex + 1, 1)} of ${budgetImportProgressSteps.length}`}
          </p>
        </div>
        {!isIdle && !isFailed ? (
          <strong>{Math.round((completedSteps / budgetImportProgressSteps.length) * 100)}%</strong>
        ) : null}
      </div>

      <div
        className="budget-import-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={budgetImportProgressSteps.length}
        aria-valuenow={completedSteps}
      >
        <span
          style={{
            width: `${(completedSteps / budgetImportProgressSteps.length) * 100}%`,
          }}
        />
      </div>

      <ol className="budget-import-progress-steps">
        {budgetImportProgressSteps.map((step, index) => {
          const isDone =
            isComplete || (!isIdle && currentIndex >= 0 && index < currentIndex);
          const isCurrent = !isIdle && !isComplete && index === currentIndex;

          return (
            <li
              key={step.phase}
              className={
                isCurrent
                  ? "budget-import-progress-step budget-import-progress-step-current"
                  : isDone
                    ? "budget-import-progress-step budget-import-progress-step-complete"
                    : "budget-import-progress-step"
              }
            >
              <span className="budget-import-progress-step-marker" aria-hidden="true">
                {isDone ? "✓" : isCurrent ? "•" : ""}
              </span>
              <span>
                <strong>{formatStepLabel(step, counts)}</strong>
                <small>{step.detail}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
