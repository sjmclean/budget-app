import { useEffect, useMemo, useState } from "react";
import type { NewRegisterTransactionInput } from "../../features/accounts/accountRegisterTypes";
import { alertDialog, confirmDialog } from "../../features/ui/appDialogService";
import type {
  ScheduledEndCondition,
  ScheduledFrequency,
  ScheduledRecurrenceUnit,
  ScheduledTransactionView,
  ScheduledWeekendPolicy,
  UpsertScheduledTransactionInput,
} from "../../features/accounts/scheduledTransactionPersistencePort";
import {
  applyWeekendPolicy,
  advanceDateByRule,
  frequencyFromRecurrence,
  resolveOccurrenceDate,
  resolveRecurrence,
  shouldSkipOccurrence,
} from "../../features/accounts/scheduledTransactionService";
import type { RegisterSplitLineView } from "../../features/accounts/accountRegisterTypes";
import { getSplitBalanceStatus } from "../../features/accounts/registerSplitDrafts";
import { getAppPersistenceGateway } from "../../features/persistence";
import type { SidebarAccount } from "../../features/accounts/accountService";
import type { PayeeView } from "../../features/accounts/payeeService";
import type { BudgetCategoryOption } from "../../features/budget/budgetViewTypes";
import { formatDateForDisplay } from "../../features/settings/dateFormatting";
import { useDateFormatPreference } from "../../features/settings/useDateFormatPreference";
import type { TransactionTagDefinition } from "../../features/tags/transactionTagTypes";
import { TransactionTagPicker } from "../../features/accounts/components/TransactionRow";

interface ScheduledTransactionsPanelProps {
  accountId: string;
  isOpen: boolean;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  tags: readonly TransactionTagDefinition[];
  onCreateTag: (name: string) => TransactionTagDefinition;
  onClose: () => void;
  onEnter: (transaction: NewRegisterTransactionInput) => Promise<void>;
  onDueCountChange?: (count: number) => void;
  presentation?: "overlay" | "workspace";
}

interface ScheduledFormDraft {
  id?: string;
  tagIds: string[];
  splitLines?: ScheduledTransactionView["splitLines"];
  nextDueDate: string;
  frequency: ScheduledFrequency;
  frequencyChoice: ScheduledFrequencyChoice;
  isRecurring: boolean;
  recurrenceInterval: number;
  recurrenceUnit: ScheduledRecurrenceUnit;
  recurrenceAnchorDate: string;
  endCondition: ScheduledEndCondition;
  endDate: string;
  occurrenceCount: number;
  occurrencesCompleted: number;
  weekendPolicy: ScheduledWeekendPolicy;
  payee: string;
  payeeId?: string;
  category: string;
  categoryId?: string;
  memo: string;
  outflow: string;
  inflow: string;
}

type ScheduledFrequencyChoice = "once" | "daily" | "weekly" | "fortnightly" | "monthly" | "quarterly" | "half-yearly" | "yearly" | "custom";

export function ScheduledTransactionsPanel({
  accountId,
  isOpen,
  categoryOptions,
  transferAccounts,
  payeeOptions,
  tags,
  onCreateTag,
  onClose,
  onEnter,
  onDueCountChange,
  presentation = "overlay",
}: ScheduledTransactionsPanelProps) {
  const scheduledTransactionsPersistence = getAppPersistenceGateway().scheduledTransactions;
  const dateFormat = useDateFormatPreference();
  const [scheduledTransactions, setScheduledTransactions] = useState<ScheduledTransactionView[]>([]);
  const [draft, setDraft] = useState<ScheduledFormDraft | null>(null);

  useEffect(() => {
    let mounted = true;

    scheduledTransactionsPersistence.listByAccount(accountId).then((transactions) => {
      if (!mounted) return;
      setScheduledTransactions(transactions);
      onDueCountChange?.(countDue(transactions));
    });

    return () => {
      mounted = false;
    };
  }, [accountId, onDueCountChange, scheduledTransactionsPersistence]);

  const dueSoonTransactions = useMemo(
    () => scheduledTransactions.filter((transaction) => isDueOrUpcoming(transaction.nextDueDate)),
    [scheduledTransactions],
  );

  const otherTransactions = useMemo(
    () => scheduledTransactions.filter((transaction) => !isDueOrUpcoming(transaction.nextDueDate)),
    [scheduledTransactions],
  );

  if (!isOpen) {
    return null;
  }

  async function saveDraft() {
    if (!draft || !draft.payee.trim()) {
      return;
    }

    const outflow = parseMoney(draft.outflow);
    const inflow = parseMoney(draft.inflow);

    if (outflow > 0 && inflow > 0) {
      await alertDialog({ message: "A scheduled transaction can have either an outflow or an inflow, not both." });
      return;
    }

    if (outflow <= 0 && inflow <= 0) {
      await alertDialog({ message: "Enter either an outflow or an inflow amount." });
      return;
    }

    if (draft.isRecurring && draft.endCondition === "on-date" && (!draft.endDate || draft.endDate < draft.recurrenceAnchorDate)) {
      await alertDialog({ message: "Choose an end date on or after the next scheduled date." });
      return;
    }

    if (draft.splitLines && draft.splitLines.length > 0) {
      const invalidSplit = draft.splitLines.some((line) => !line.category.trim() || (line.outflow <= 0 && line.inflow <= 0));
      if (invalidSplit) {
        await alertDialog({ message: "Each split line needs a category and an amount." });
        return;
      }

      const splitOutflow = draft.splitLines.reduce((total, line) => total + line.outflow, 0);
      const splitInflow = draft.splitLines.reduce((total, line) => total + line.inflow, 0);
      const parentAmount = inflow > 0 ? inflow : outflow;
      const splitAmount = inflow > 0 ? splitInflow : splitOutflow;
      if (Math.abs(parentAmount - splitAmount) >= 0.005) {
        await alertDialog({ message: "Split amounts must add up to the scheduled transaction amount." });
        return;
      }
    }

    const input: UpsertScheduledTransactionInput = {
      id: draft.id,
      accountId,
      tagIds: draft.tagIds,
      nextDueDate: draft.recurrenceAnchorDate,
      frequency: draft.isRecurring ? frequencyFromRecurrence(draft.recurrenceInterval, draft.recurrenceUnit) : "once",
      recurrenceInterval: draft.recurrenceInterval,
      recurrenceUnit: draft.recurrenceUnit,
      recurrenceAnchorDate: draft.recurrenceAnchorDate,
      endCondition: draft.endCondition,
      endDate: draft.endCondition === "on-date" ? draft.endDate : undefined,
      occurrenceCount: draft.endCondition === "after-occurrences" ? draft.occurrenceCount : undefined,
      occurrencesCompleted: draft.occurrencesCompleted,
      weekendPolicy: draft.weekendPolicy,
      payee: draft.payee.trim(),
      payeeId: draft.payeeId,
      category: draft.category.trim(),
      categoryId: draft.categoryId,
      memo: draft.memo.trim(),
      outflow,
      inflow,
      splitLines: draft.splitLines,
    };

    const next = draft.id
      ? await scheduledTransactionsPersistence.update({ ...input, id: draft.id })
      : await scheduledTransactionsPersistence.create(input);

    setScheduledTransactions(next);
    onDueCountChange?.(countDue(next));
    setDraft(null);
  }

  async function deleteScheduled(transaction: ScheduledTransactionView) {
    const confirmed = await confirmDialog({
      message: `Delete scheduled transaction "${transaction.payee}"?`,
      confirmLabel: "Delete scheduled transaction",
      tone: "danger",
    });

    if (!confirmed) {
      return;
    }

    const next = await scheduledTransactionsPersistence.delete(accountId, transaction.id);
    setScheduledTransactions(next);
    onDueCountChange?.(countDue(next));
  }

  async function enterScheduled(transaction: ScheduledTransactionView) {
    const anchorDate = transaction.recurrenceAnchorDate ?? transaction.nextDueDate;
    if (!shouldSkipOccurrence(anchorDate, transaction.weekendPolicy ?? "same-day")) {
      await onEnter(scheduledTransactionsPersistence.toRegisterInput(transaction));
    }
    const next = await scheduledTransactionsPersistence.advanceAfterEnter(accountId, transaction.id);
    setScheduledTransactions(next);
    onDueCountChange?.(countDue(next));
  }

  const isWorkspace = presentation === "workspace";

  return (
    <div
      className={isWorkspace ? "scheduled-panel-workspace" : "scheduled-panel-overlay"}
      role={isWorkspace ? "region" : "dialog"}
      aria-label={isWorkspace ? "Scheduled transactions" : undefined}
      aria-modal={isWorkspace ? undefined : false}
    >
      <div className={`scheduled-panel${isWorkspace ? " scheduled-panel-inline" : ""}`}>
        <div className="scheduled-panel-header">
          <div>
            <h2>Scheduled Transactions</h2>
            <p>View upcoming repeating transactions and inspect imported split allocations.</p>
          </div>
          {!isWorkspace ? (
            <button className="button button-secondary" type="button" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>

        {!draft ? (
          <button
            className="button button-primary scheduled-panel-add"
            type="button"
            onClick={() => setDraft(createEmptyDraft())}
          >
            Add scheduled
          </button>
        ) : null}

        <div className="scheduled-panel-list">
          <ScheduledSection
            title="Due soon"
            emptyText="No scheduled transactions due in the next 30 days."
            transactions={dueSoonTransactions}
            dateFormat={dateFormat}
            onEnter={enterScheduled}
            onEdit={(transaction) => setDraft(draftFromScheduled(transaction))}
            onDelete={deleteScheduled}
          />

          {otherTransactions.length > 0 ? (
            <ScheduledSection
              title="Later"
              emptyText=""
              transactions={otherTransactions}
              dateFormat={dateFormat}
              onEnter={enterScheduled}
              onEdit={(transaction) => setDraft(draftFromScheduled(transaction))}
              onDelete={deleteScheduled}
            />
          ) : null}
        </div>
      </div>

      {draft ? (
        <ScheduledForm
          draft={draft}
          setDraft={setDraft}
          categoryOptions={categoryOptions}
          transferAccounts={transferAccounts}
          payeeOptions={payeeOptions}
          tags={tags}
          onCreateTag={onCreateTag}
          onCancel={() => setDraft(null)}
          onSave={saveDraft}
        />
      ) : null}
    </div>
  );
}

function ScheduledForm({
  draft,
  setDraft,
  categoryOptions,
  transferAccounts,
  payeeOptions,
  tags,
  onCreateTag,
  onCancel,
  onSave,
}: {
  draft: ScheduledFormDraft;
  setDraft: (draft: ScheduledFormDraft) => void;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  tags: readonly TransactionTagDefinition[];
  onCreateTag: (name: string) => TransactionTagDefinition;
  onCancel: () => void;
  onSave: () => void;
}) {
  const previewDates = getUpcomingOccurrenceDates(draft, 5);
  const splitCount = draft.splitLines?.length ?? 0;
  const [isSplitEditorOpen, setIsSplitEditorOpen] = useState(false);
  const title = draft.payee.trim() || (draft.id ? "Scheduled transaction" : "New scheduled transaction");
  const frequencyChoice = draft.frequencyChoice;

  function selectFrequency(choice: ScheduledFrequencyChoice) {
    if (choice === "custom") {
      setDraft({ ...draft, frequencyChoice: choice, isRecurring: true });
      return;
    }

    if (choice === "once") {
      setDraft({ ...draft, frequencyChoice: choice, isRecurring: false, endCondition: "never" });
      return;
    }

    const recurrenceByChoice: Record<Exclude<ScheduledFrequencyChoice, "custom" | "once">, { interval: number; unit: ScheduledRecurrenceUnit }> = {
      daily: { interval: 1, unit: "day" },
      weekly: { interval: 1, unit: "week" },
      fortnightly: { interval: 2, unit: "week" },
      monthly: { interval: 1, unit: "month" },
      quarterly: { interval: 3, unit: "month" },
      "half-yearly": { interval: 6, unit: "month" },
      yearly: { interval: 1, unit: "year" },
    };
    const recurrence = recurrenceByChoice[choice];
    setDraft({
      ...draft,
      frequencyChoice: choice,
      isRecurring: true,
      recurrenceInterval: recurrence.interval,
      recurrenceUnit: recurrence.unit,
    });
  }

  function updateOutflow(value: string) {
    setDraft({
      ...draft,
      outflow: value,
      inflow: parseMoney(value) > 0 ? "" : draft.inflow,
    });
  }

  function updateInflow(value: string) {
    setDraft({
      ...draft,
      inflow: value,
      outflow: parseMoney(value) > 0 ? "" : draft.outflow,
    });
  }

  return (
    <div className="scheduled-editor-backdrop">
      <div className="scheduled-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="scheduled-editor-title">
        <div className="scheduled-editor-header">
          <div>
            <p className="scheduled-editor-eyebrow">{draft.id ? "Edit scheduled transaction" : "Add scheduled transaction"}</p>
            <h3 id="scheduled-editor-title">{title}</h3>
            <p>
              {formatRecurrenceLabel(draft)}
              {draft.recurrenceAnchorDate ? ` · Next ${formatScheduleDate(applyWeekendPolicy(draft.recurrenceAnchorDate, draft.weekendPolicy))}` : ""}
            </p>
          </div>
          <button className="scheduled-editor-close" type="button" onClick={onCancel} aria-label="Close scheduled transaction editor">
            ×
          </button>
        </div>

        <div className="scheduled-editor-content">
          <div className="scheduled-editor-fields">
            <div className="scheduled-editor-section">
              <span className="scheduled-editor-section-title">Schedule</span>
              <label className="scheduled-frequency-field">
                <span>Frequency</span>
                <select
                  value={frequencyChoice}
                  onChange={(event) => selectFrequency(event.target.value as ScheduledFrequencyChoice)}
                >
                  <option value="once">Run once</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="half-yearly">Half-yearly</option>
                  <option value="yearly">Yearly</option>
                  <option value="custom">Custom interval...</option>
                </select>
              </label>

              {frequencyChoice === "custom" ? (
                <div className="scheduled-recurrence-controls">
                  <span>Every</span>
                  <input
                    type="number"
                    min="1"
                    value={draft.recurrenceInterval}
                    onChange={(event) => setDraft({
                      ...draft,
                      recurrenceInterval: Math.max(1, Number.parseInt(event.target.value || "1", 10)),
                    })}
                    aria-label="Recurrence interval"
                  />
                  <select
                    value={draft.recurrenceUnit}
                    onChange={(event) => setDraft({ ...draft, recurrenceUnit: event.target.value as ScheduledRecurrenceUnit })}
                    aria-label="Recurrence unit"
                  >
                    <option value="day">Day(s)</option>
                    <option value="week">Week(s)</option>
                    <option value="month">Month(s)</option>
                    <option value="year">Year(s)</option>
                  </select>
                </div>
              ) : null}

              <div className="scheduled-editor-row scheduled-editor-row-two">
              <label>
                <span>{draft.isRecurring ? "Next date" : "Scheduled date"}</span>
                <input
                  type="date"
                  value={draft.recurrenceAnchorDate}
                  onChange={(event) => setDraft({
                    ...draft,
                    recurrenceAnchorDate: event.target.value,
                    nextDueDate: applyWeekendPolicy(event.target.value, draft.weekendPolicy),
                  })}
                />
              </label>

              <label>
                <span>When a date falls on a weekend</span>
                <select
                  value={draft.weekendPolicy}
                  onChange={(event) => {
                    const weekendPolicy = event.target.value as ScheduledWeekendPolicy;
                    setDraft({
                      ...draft,
                      weekendPolicy,
                      nextDueDate: applyWeekendPolicy(draft.recurrenceAnchorDate, weekendPolicy),
                    });
                  }}
                >
                  <option value="same-day">Keep the scheduled date</option>
                  <option value="previous-business-day">Move to the previous business day</option>
                  <option value="next-business-day">Move to the next business day</option>
                  <option value="skip">Skip the weekend date</option>
                </select>
                <small className="muted">Public holiday calendars are planned separately.</small>
              </label>
              </div>

              {!draft.isRecurring ? (
                <p className="scheduled-once-note">
                  After this transaction is entered, the schedule is removed from Scheduled Transactions. The register transaction remains.
                </p>
              ) : null}
            </div>

            {draft.isRecurring ? (
            <div className="scheduled-editor-row scheduled-editor-row-two">
              <label>
                <span>Ends</span>
                <select
                  value={draft.endCondition}
                  onChange={(event) => setDraft({ ...draft, endCondition: event.target.value as ScheduledEndCondition })}
                >
                  <option value="never">Never</option>
                  <option value="on-date">On a date</option>
                  <option value="after-occurrences">After a number of occurrences</option>
                </select>
              </label>

              {draft.endCondition === "on-date" ? (
                <label>
                  <span>End date</span>
                  <input
                    type="date"
                    min={draft.recurrenceAnchorDate}
                    value={draft.endDate}
                    onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
                  />
                </label>
              ) : draft.endCondition === "after-occurrences" ? (
                <label>
                  <span>Occurrences</span>
                  <input
                    type="number"
                    min="1"
                    value={draft.occurrenceCount}
                    onChange={(event) => setDraft({
                      ...draft,
                      occurrenceCount: Math.max(1, Number.parseInt(event.target.value || "1", 10)),
                    })}
                  />
                </label>
              ) : (
                <div aria-hidden="true" />
              )}
            </div>
            ) : null}

            <div className="scheduled-transaction-divider" role="separator">
              <span>Transaction details</span>
            </div>

            <label>
              <span>Payee</span>
              <input
                value={draft.payee}
                onChange={(event) => setDraft({ ...draft, payee: event.target.value })}
                placeholder="Payee"
                list="scheduled-payee-options"
                autoFocus
              />
            </label>
            <datalist id="scheduled-payee-options">
              {payeeOptions.map((payee) => (
                <option key={payee.id} value={payee.name} />
              ))}
              {transferAccounts.map((account) => (
                <option key={account.id} value={`Transfer: ${account.name}`} label="Transfer" />
              ))}
            </datalist>

            <div className="scheduled-editor-row scheduled-editor-row-two">
              <label>
                <span>Outflow</span>
                <input
                  value={draft.outflow}
                  onChange={(event) => updateOutflow(event.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </label>

              <label>
                <span>Inflow</span>
                <input
                  value={draft.inflow}
                  onChange={(event) => updateInflow(event.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </label>
            </div>

            {splitCount > 0 || isSplitEditorOpen ? (
              <div className="scheduled-editor-split-summary">
                <div>
                  <span>Category / split</span>
                  <strong>{splitCount} {splitCount === 1 ? "category" : "categories"} (split transaction)</strong>
                  <small>Split amounts should add up to the transaction amount.</small>
                </div>
                <button className="scheduled-split-toggle" type="button" onClick={() => setIsSplitEditorOpen((current) => !current)} aria-expanded={isSplitEditorOpen}>
                  <span>{isSplitEditorOpen ? "Collapse split" : "Edit split"}</span>
                  <span aria-hidden="true">{isSplitEditorOpen ? "^" : "v"}</span>
                </button>
              </div>
            ) : (
              <div className="scheduled-category-row">
                <label>
                  <span>Category</span>
                  <input
                    value={draft.category}
                    onChange={(event) => {
                      const category = event.target.value;
                      const categoryId = categoryOptions.find((option) => option.name === category)?.id;
                      setDraft({ ...draft, category, categoryId });
                    }}
                    placeholder="Category"
                    list="scheduled-category-options"
                  />
                </label>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    setDraft({ ...draft, category: "Split", categoryId: undefined, splitLines: [createScheduledSplitLine()] });
                    setIsSplitEditorOpen(true);
                  }}
                >
                  Split transaction
                </button>
              </div>
            )}
            {isSplitEditorOpen ? (
              <ScheduledSplitEditor
                splitLines={draft.splitLines ?? []}
                categoryOptions={categoryOptions}
                onChange={(splitLines) => setDraft({ ...draft, splitLines, category: "Split", categoryId: undefined })}
                parentOutflow={parseMoney(draft.outflow)}
                parentInflow={parseMoney(draft.inflow)}
              />
            ) : null}
            <datalist id="scheduled-category-options">
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.name} label={category.groupName} />
              ))}
            </datalist>

            <label>
              <span>Memo</span>
              <input
                value={draft.memo}
                onChange={(event) => setDraft({ ...draft, memo: event.target.value })}
                placeholder="Optional memo"
              />
            </label>
            <div className="scheduled-tag-picker-field">
              <span>Tags</span>
              <TransactionTagPicker
              selectedTagIds={draft.tagIds}
              identity={draft.id ?? "new-scheduled-transaction"}
              tags={tags}
              onChange={(tagIds) => setDraft({ ...draft, tagIds })}
              onCreateTag={onCreateTag}
            />
            </div>
          </div>

          <aside className="scheduled-editor-preview" aria-label="Upcoming scheduled transaction occurrences">
            <div className="scheduled-editor-preview-heading">
              <strong>Preview</strong>
              <span>Next {previewDates.length} occurrences</span>
            </div>
            <ol>
              {previewDates.map((date, index) => (
                <li key={`${date}-${index}`}>
                  <span>{formatScheduleDate(date)}</span>
                  {index === 0 ? <small>Next</small> : null}
                </li>
              ))}
            </ol>
            {!draft.isRecurring ? (
              <p className="muted">This schedule will be complete after the next occurrence.</p>
            ) : null}
          </aside>
        </div>

        <div className="scheduled-editor-actions">
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="button button-primary" type="button" onClick={onSave}>
            {draft.id ? "Save changes" : "Add scheduled"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduledSplitEditor({
  splitLines,
  categoryOptions,
  onChange,
  parentOutflow,
  parentInflow,
}: {
  splitLines: RegisterSplitLineView[];
  categoryOptions: BudgetCategoryOption[];
  onChange: (splitLines: RegisterSplitLineView[]) => void;
  parentOutflow: number;
  parentInflow: number;
}) {
  const splitOutflow = splitLines.reduce((total, line) => total + line.outflow, 0);
  const splitInflow = splitLines.reduce((total, line) => total + line.inflow, 0);
  const balanceStatus = getSplitBalanceStatus({
    parentOutflow,
    parentInflow,
    splitOutflow,
    splitInflow,
  });

  function updateLine(id: string, changes: Partial<RegisterSplitLineView>) {
    onChange(splitLines.map((line) => line.id === id ? { ...line, ...changes } : line));
  }

  return (
    <div className="scheduled-split-editor">
      <div className="scheduled-split-editor-header">
        <strong>Split details</strong>
      </div>
      {splitLines.map((line) => (
        <div className="scheduled-split-editor-row" key={line.id}>
          <input
            value={line.category}
            list="scheduled-category-options"
            placeholder="Category"
            onChange={(event) => {
              const category = event.target.value;
              updateLine(line.id, {
                category,
                categoryId: categoryOptions.find((option) => option.name === category)?.id,
              });
            }}
          />
          <input value={line.memo ?? ""} placeholder="Memo" onChange={(event) => updateLine(line.id, { memo: event.target.value })} />
          <ScheduledSplitAmountInput
            value={line.outflow}
            placeholder="Outflow"
            onValueChange={(outflow) => updateLine(line.id, { outflow, inflow: outflow > 0 ? 0 : line.inflow })}
          />
          <ScheduledSplitAmountInput
            value={line.inflow}
            placeholder="Inflow"
            onValueChange={(inflow) => updateLine(line.id, { inflow, outflow: inflow > 0 ? 0 : line.outflow })}
          />
          <button className="scheduled-split-remove" type="button" aria-label="Remove split line" onClick={() => onChange(splitLines.filter((candidate) => candidate.id !== line.id))}>×</button>
        </div>
      ))}
      {!balanceStatus.isBalanced ? (
        <div className="scheduled-split-allocation-row" aria-live="polite">
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <strong className="scheduled-split-over-amount">
            {balanceStatus.isOverAssigned ? formatAmount(Math.abs(balanceStatus.remaining)) : ""}
          </strong>
          <strong className="scheduled-split-remaining-amount">
            {!balanceStatus.isOverAssigned ? formatAmount(balanceStatus.remaining) : ""}
          </strong>
          <span aria-hidden="true" />
        </div>
      ) : null}
      <button className="button button-secondary" type="button" onClick={() => onChange([...splitLines, createScheduledSplitLine()])}>
        Add split line
      </button>
    </div>
  );
}

function ScheduledSplitAmountInput({
  value,
  placeholder,
  onValueChange,
}: {
  value: number;
  placeholder: string;
  onValueChange: (value: number) => void;
}) {
  const [text, setText] = useState(value > 0 ? value.toFixed(2) : "");

  useEffect(() => {
    if (value === 0 && parseMoney(text) !== 0) {
      setText("");
    }
  }, [text, value]);

  return (
    <input
      value={text}
      inputMode="decimal"
      placeholder={placeholder}
      onChange={(event) => {
        const nextText = event.target.value;
        setText(nextText);
        onValueChange(parseMoney(nextText));
      }}
      onBlur={() => {
        const parsed = parseMoney(text);
        setText(parsed > 0 ? parsed.toFixed(2) : "");
      }}
    />
  );
}

function ScheduledSection({
  title,
  emptyText,
  transactions,
  dateFormat,
  onEnter,
  onEdit,
  onDelete,
}: {
  title: string;
  emptyText: string;
  transactions: ScheduledTransactionView[];
  dateFormat: ReturnType<typeof useDateFormatPreference>;
  onEnter: (transaction: ScheduledTransactionView) => void;
  onEdit: (transaction: ScheduledTransactionView) => void;
  onDelete: (transaction: ScheduledTransactionView) => void;
}) {
  const [expandedTransactionIds, setExpandedTransactionIds] = useState<Set<string>>(new Set());

  function toggleSplitDetails(transactionId: string) {
    setExpandedTransactionIds((current) => {
      const next = new Set(current);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
  }

  return (
    <section className="scheduled-section">
      <h3>{title}</h3>

      {transactions.length === 0 ? <p className="muted">{emptyText}</p> : null}

      {transactions.map((transaction) => {
        const splitLines = transaction.splitLines ?? [];
        const hasSplitLines = splitLines.length > 0;
        const isExpanded = expandedTransactionIds.has(transaction.id);

        return (
          <div className="scheduled-item" key={transaction.id}>
            <div className="scheduled-item-main">
              <strong>{transaction.payee}</strong>
              <span>
                {formatDateForDisplay(transaction.nextDueDate, dateFormat)} · {formatScheduledTransactionRecurrence(transaction)}
              </span>
              {hasSplitLines ? (
                <button
                  className="scheduled-split-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => toggleSplitDetails(transaction.id)}
                >
                  {isExpanded ? "▾" : "▸"} Split ({splitLines.length} {splitLines.length === 1 ? "category" : "categories"})
                </button>
              ) : (
                <span>{transaction.category}</span>
              )}
              {transaction.memo ? <span>{transaction.memo}</span> : null}
            </div>

            <div className="scheduled-item-amounts">
              {transaction.outflow > 0 ? <span className="negative">-{formatAmount(transaction.outflow)}</span> : null}
              {transaction.inflow > 0 ? <span className="positive">+{formatAmount(transaction.inflow)}</span> : null}
            </div>

            <div className="scheduled-item-actions">
              <button className="button button-primary" type="button" onClick={() => onEnter(transaction)}>
                Enter
              </button>
              <button className="button button-secondary" type="button" onClick={() => onEdit(transaction)}>
                Edit
              </button>
              <button className="button button-secondary" type="button" onClick={() => onDelete(transaction)}>
                Delete
              </button>
            </div>

            {hasSplitLines && isExpanded ? <ScheduledSplitDetails splitLines={splitLines} /> : null}
          </div>
        );
      })}
    </section>
  );
}

function ScheduledSplitDetails({
  splitLines,
}: {
  splitLines: NonNullable<ScheduledTransactionView["splitLines"]>;
}) {
  return (
    <div className="scheduled-split-details" aria-label="Scheduled split details">
      {splitLines.map((line) => (
        <div className="scheduled-split-line" key={line.id}>
          <div className="scheduled-split-line-main">
            <span>{line.category}</span>
            {line.memo ? <small>{line.memo}</small> : null}
          </div>
          <div className="scheduled-split-line-amounts">
            {line.outflow > 0 ? <span className="negative">-{formatAmount(line.outflow)}</span> : null}
            {line.inflow > 0 ? <span className="positive">+{formatAmount(line.inflow)}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatScheduledTransactionRecurrence(transaction: ScheduledTransactionView): string {
  if (transaction.frequency === "once") return "Once";
  const recurrence = resolveRecurrence(transaction);
  const unit = recurrence.unit.charAt(0).toUpperCase() + recurrence.unit.slice(1);
  return `Every ${recurrence.interval} ${unit}${recurrence.interval === 1 ? "" : "s"}`;
}

function createEmptyDraft(): ScheduledFormDraft {
  return {
    tagIds: [],
    nextDueDate: new Date().toISOString().slice(0, 10),
    frequency: "monthly",
    frequencyChoice: "monthly",
    isRecurring: true,
    recurrenceInterval: 1,
    recurrenceUnit: "month",
    recurrenceAnchorDate: new Date().toISOString().slice(0, 10),
    endCondition: "never",
    endDate: "",
    occurrenceCount: 12,
    occurrencesCompleted: 0,
    weekendPolicy: "same-day",
    payee: "",
    payeeId: undefined,
    category: "",
    categoryId: undefined,
    memo: "",
    outflow: "",
    inflow: "",
    splitLines: undefined,
  };
}

function draftFromScheduled(transaction: ScheduledTransactionView): ScheduledFormDraft {
  return {
    id: transaction.id,
    tagIds: [...(transaction.tagIds ?? [])],
    nextDueDate: transaction.nextDueDate,
    frequency: transaction.frequency,
    frequencyChoice: resolveFrequencyChoice(
      transaction.frequency !== "once",
      resolveRecurrence(transaction).interval,
      resolveRecurrence(transaction).unit,
    ),
    isRecurring: transaction.frequency !== "once",
    recurrenceInterval: resolveRecurrence(transaction).interval,
    recurrenceUnit: resolveRecurrence(transaction).unit,
    recurrenceAnchorDate: transaction.recurrenceAnchorDate ?? transaction.nextDueDate,
    endCondition: transaction.endCondition ?? "never",
    endDate: transaction.endDate ?? "",
    occurrenceCount: transaction.occurrenceCount ?? 12,
    occurrencesCompleted: transaction.occurrencesCompleted ?? 0,
    weekendPolicy: transaction.weekendPolicy ?? "same-day",
    payee: transaction.payee,
    payeeId: transaction.payeeId,
    category: transaction.category,
    categoryId: transaction.categoryId,
    memo: transaction.memo ?? "",
    outflow: transaction.outflow ? transaction.outflow.toFixed(2) : "",
    inflow: transaction.inflow ? transaction.inflow.toFixed(2) : "",
    splitLines: transaction.splitLines?.map((line) => ({ ...line })),
  };
}

function isDueOrUpcoming(nextDueDate: string): boolean {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 30);
  return nextDueDate <= horizon.toISOString().slice(0, 10);
}

function countDue(transactions: ScheduledTransactionView[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return transactions.filter((transaction) => transaction.nextDueDate <= today).length;
}

function getUpcomingOccurrenceDates(draft: ScheduledFormDraft, count: number): string[] {
  if (!draft.recurrenceAnchorDate) return [];

  const dates: string[] = [];
  let anchor = draft.recurrenceAnchorDate;
  const remainingLimit = draft.endCondition === "after-occurrences"
    ? Math.max(0, draft.occurrenceCount - draft.occurrencesCompleted)
    : count;
  const maximum = Math.min(count, remainingLimit);

  for (let index = 0; index < maximum; index += 1) {
    const occurrence = resolveOccurrenceDate(anchor, draft.recurrenceInterval, draft.recurrenceUnit, draft.weekendPolicy);
    if (draft.endCondition === "on-date" && draft.endDate && occurrence.anchorDate > draft.endDate) break;
    dates.push(occurrence.dueDate);
    if (!draft.isRecurring) break;
    anchor = advanceDateByRule(occurrence.anchorDate, draft.recurrenceInterval, draft.recurrenceUnit);
  }

  return dates;
}

function formatRecurrenceLabel(draft: ScheduledFormDraft): string {
  if (!draft.isRecurring) return "Once";
  const unit = draft.recurrenceUnit.charAt(0).toUpperCase() + draft.recurrenceUnit.slice(1);
  return `Every ${draft.recurrenceInterval} ${unit}${draft.recurrenceInterval === 1 ? "" : "s"}`;
}

function resolveFrequencyChoice(
  isRecurring: boolean,
  interval: number,
  unit: ScheduledRecurrenceUnit,
): ScheduledFrequencyChoice {
  if (!isRecurring) return "once";
  if (interval === 1 && unit === "day") return "daily";
  if (interval === 1 && unit === "week") return "weekly";
  if (interval === 2 && unit === "week") return "fortnightly";
  if (interval === 1 && unit === "month") return "monthly";
  if (interval === 3 && unit === "month") return "quarterly";
  if (interval === 6 && unit === "month") return "half-yearly";
  if (interval === 1 && unit === "year") return "yearly";
  return "custom";
}

function createScheduledSplitLine(): RegisterSplitLineView {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `scheduled-split-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    category: "",
    memo: "",
    outflow: 0,
    inflow: 0,
  };
}

function formatScheduleDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function parseMoney(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}


function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}
