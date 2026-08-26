import React, { useEffect, useState, type FormEvent } from "react";
import type { CategoryGoalType } from "../../../../../packages/types/src/CategoryGoalType";
import type { BudgetCategoryView } from "../budget/budgetViewTypes";
import { formatMoney } from "../budget/budgetMoneyDisplay";
import { MoneyInput } from "../money/MoneyInput";
import { confirmDialog } from "../ui/appDialogService";
import { categoryGoalHistory } from "./categoryGoalHistory";
import type { GoalRecommendedAssignmentResult } from "../budget/goalRecommendedAssignment";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function categoryGoalConfigurationFromDraft(
  type: CategoryGoalType | null,
  targetAmount: number,
  targetMonth: string,
) {
  if (!type) throw new Error("Choose what you are trying to do.");
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }
  if (type === "target-balance-by-date" && !MONTH_PATTERN.test(targetMonth)) {
    throw new Error("Choose a valid target month.");
  }
  return {
    type,
    targetAmount,
    targetMonth: type === "target-balance-by-date" ? targetMonth : null,
  };
}

const GOAL_OPTIONS: readonly {
  type: CategoryGoalType;
  label: string;
  description: string;
}[] = [
  { type: "monthly-funding", label: "Fund this category every month", description: "Put aside the same amount each month." },
  { type: "target-balance", label: "Build this category to a balance", description: "Save until this category contains an amount." },
  { type: "target-balance-by-date", label: "Reach a balance by a date", description: "Work toward an amount by a target month." },
];

function goalTitle(category: BudgetCategoryView, currencyCode: string): string {
  const projection = category.goal!;
  const amount = formatMoney(projection.goal.targetAmount, currencyCode);
  if (projection.goal.type === "monthly-funding") return `Fund ${amount} every month`;
  if (projection.goal.type === "target-balance") return `Build balance to ${amount}`;
  return `Reach ${amount} by ${formatTargetMonth(projection.goal.targetMonth!)}`;
}

function formatTargetMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" })
    .format(new Date(year!, monthNumber! - 1, 1));
}

function historyError(error: string | undefined, action: string): string {
  if (error?.toLowerCase().includes("conflict") || error?.includes("changed unexpectedly")) {
    return `This goal changed elsewhere. Close the dialog, review the latest goal, and try ${action} again.`;
  }
  return `The goal could not be ${action}. Check the values and try again.`;
}

export function CategoryGoalInspectorSection({
  budgetId,
  category,
  currencyCode,
  managed,
  onAssignRecommendation,
}: {
  budgetId: string;
  category: BudgetCategoryView;
  currencyCode: string;
  managed: boolean;
  onAssignRecommendation: () => Promise<GoalRecommendedAssignmentResult>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const projection = category.goal;
  const interactive = !managed && !category.isArchived;

  useEffect(() => {
    setDialogOpen(false);
    setAssignmentError(null);
  }, [category.id]);

  async function assignRecommendation() {
    if (assigning) return;
    setAssigning(true);
    setAssignmentError(null);
    try {
      const result = await onAssignRecommendation();
      if (result.performed) return;
      setAssignmentError("The recommended amount could not be assigned. Review the category and try again.");
    } catch {
      setAssignmentError("The recommended amount could not be assigned. Review the category and try again.");
    } finally {
      setAssigning(false);
    }
  }

  if (managed) return null;

  return (
    <section className="category-goal-section" aria-labelledby="category-goal-heading">
      <div className="category-goal-section-header">
        <h3 id="category-goal-heading">Goal</h3>
      </div>

      {!projection ? (
        <div className="category-goal-empty">
          <p className="muted">No goal set for this category.</p>
          {interactive ? (
            <button className="button button-secondary" type="button" onClick={() => setDialogOpen(true)}>
              Set a goal
            </button>
          ) : null}
        </div>
      ) : (
        <div className="category-goal-summary">
          <strong>{goalTitle(category, currencyCode)}</strong>
          <div
            className="category-goal-progress"
            role="progressbar"
            aria-label={`${goalTitle(category, currencyCode)}: ${Math.round(projection.percentComplete)}% complete`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(projection.percentComplete)}
          >
            <span style={{ width: `${projection.percentComplete}%` }} />
          </div>
          <div className="category-goal-details">
            <div>
              <span>{projection.goal.type === "monthly-funding" ? "Assigned this month" : "Available"}</span>
              <strong>{formatMoney(projection.progressAmount, currencyCode)}</strong>
            </div>
            {projection.remainingAmount === 0 ? (
              <div><span>Status</span><strong>Goal funded</strong></div>
            ) : (
              <div>
                <span>{projection.goal.type === "monthly-funding" ? "Still needed" : "Remaining"}</span>
                <strong>{formatMoney(projection.remainingAmount, currencyCode)}</strong>
              </div>
            )}
            {projection.goal.type === "target-balance-by-date" && projection.status !== "overdue" ? (
              <div><span>Needed this month</span><strong>{formatMoney(projection.recommendedAssignment ?? 0, currencyCode)}</strong></div>
            ) : null}
            {projection.status === "overdue" ? (
              <div><span>Status</span><strong className="category-goal-overdue">Overdue</strong></div>
            ) : null}
          </div>
          {interactive &&
          (projection.goal.type === "monthly-funding" || projection.goal.type === "target-balance-by-date") &&
          projection.recommendedAssignment !== null && projection.recommendedAssignment > 0 ? (
            <button className="button button-primary" type="button" onClick={() => void assignRecommendation()} disabled={assigning}>
              {assigning ? "Assigning…" : `Assign ${formatMoney(projection.recommendedAssignment, currencyCode)}`}
            </button>
          ) : null}
          {assignmentError ? <p className="category-goal-form-error" role="alert">{assignmentError}</p> : null}
          {interactive ? (
            <button className="button button-secondary" type="button" onClick={() => setDialogOpen(true)}>
              Edit goal
            </button>
          ) : (
            <p className="muted category-goal-readonly">Restore this category to edit its goal.</p>
          )}
        </div>
      )}

      {dialogOpen && interactive ? (
        <CategoryGoalDialog
          budgetId={budgetId}
          category={category}
          currencyCode={currencyCode}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}

function CategoryGoalDialog({
  budgetId,
  category,
  currencyCode,
  onClose,
}: {
  budgetId: string;
  category: BudgetCategoryView;
  currencyCode: string;
  onClose: () => void;
}) {
  const existing = category.goal?.goal ?? null;
  const [type, setType] = useState<CategoryGoalType | null>(existing?.type ?? null);
  const [amount, setAmount] = useState(existing?.targetAmount ?? 0);
  const [targetMonth, setTargetMonth] = useState(existing?.targetMonth ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  function selectType(next: CategoryGoalType) {
    setType(next);
    if (next !== "target-balance-by-date") setTargetMonth("");
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    let configuration;
    try {
      configuration = categoryGoalConfigurationFromDraft(type, amount, targetMonth);
    } catch (validationError) {
      return setError(validationError instanceof Error ? validationError.message : "Check the goal values.");
    }
    setSaving(true);
    setError(null);
    const result = existing
      ? await categoryGoalHistory.updateCategoryGoalConfiguration({ goal: existing, ...configuration })
      : await categoryGoalHistory.createNewCategoryGoal({ budgetId, categoryId: category.id, ...configuration });
    setSaving(false);
    if (!result.performed) return setError(historyError(result.error, existing ? "saved" : "created"));
    onClose();
  }

  async function deleteGoal() {
    if (!existing || saving) return;
    const confirmed = await confirmDialog({
      title: "Delete this goal?",
      message: "This removes the goal from this category. It does not change the money currently assigned or available.",
      confirmLabel: "Delete goal",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    const result = await categoryGoalHistory.deleteCategoryGoal({ budgetId, categoryId: category.id });
    setSaving(false);
    if (!result.performed) return setError(historyError(result.error, "deleted"));
    onClose();
  }

  return (
    <div className="app-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="app-dialog category-goal-dialog" role="dialog" aria-modal="true" aria-labelledby="category-goal-dialog-title">
        <form onSubmit={submit}>
          <h2 className="app-dialog-title" id="category-goal-dialog-title">
            {existing ? `Edit goal for ${category.name}` : `Set a goal for ${category.name}`}
          </h2>
          <fieldset className="category-goal-options">
            <legend>What are you trying to do?</legend>
            {GOAL_OPTIONS.map((option, index) => (
              <label key={option.type} className="category-goal-option">
                <input
                  type="radio"
                  name="category-goal-type"
                  value={option.type}
                  checked={type === option.type}
                  onChange={() => selectType(option.type)}
                  autoFocus={!existing && index === 0}
                />
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </label>
            ))}
          </fieldset>

          {type ? (
            <div className="category-goal-form-fields">
              <label>
                <span>{type === "monthly-funding" ? "Amount each month" : "Target balance"}</span>
                <MoneyInput
                  autoFocus={Boolean(existing)}
                  value={amount}
                  onCommit={setAmount}
                  validate={(value) => value > 0}
                  emptyWhenZero
                  selectOnInitialFocus={Boolean(existing)}
                  aria-describedby={error ? "category-goal-form-error" : undefined}
                />
                <small className="muted">{currencyCode}</small>
              </label>
              {type === "target-balance-by-date" ? (
                <label>
                  <span>Target month</span>
                  <input
                    type="month"
                    value={targetMonth}
                    onChange={(event) => setTargetMonth(event.target.value)}
                    aria-describedby={error ? "category-goal-form-error" : undefined}
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="category-goal-form-error" id="category-goal-form-error" role="alert">{error}</p> : null}

          <div className="app-dialog-actions category-goal-dialog-actions">
            {existing ? (
              <button className="button button-danger category-goal-delete" type="button" onClick={() => void deleteGoal()} disabled={saving}>
                Delete goal
              </button>
            ) : null}
            <button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={saving || !type}>
              {saving ? "Saving…" : existing ? "Save" : "Set goal"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
