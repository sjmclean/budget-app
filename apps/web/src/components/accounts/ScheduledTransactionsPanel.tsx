import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { ScheduledAttachmentTemplate } from "../../features/accounts/accountRegisterTypes";
import { calculateAttachmentContentHash } from "../../features/attachments/attachmentContentStore";
import { alertDialog, confirmDialog } from "../../features/ui/appDialogService";
import type {
  ScheduledEndCondition,
  ScheduledFrequency,
  ScheduledMonthDayPolicy,
  ScheduledRecurrenceKind,
  ScheduledInstalment,
  ScheduledRecurrenceUnit,
  ScheduledTransactionView,
  ScheduledWeekendPolicy,
  UpsertScheduledTransactionInput,
} from "../../features/accounts/scheduledTransactionPersistencePort";
import {
  applyWeekendPolicy,
  advanceDateByRule,
  frequencyFromRecurrence,
  normaliseSpecificInstalments,
  resolveOccurrenceDate,
  resolveRecurrence,
} from "../../features/accounts/scheduledTransactionRecurrence";
import type { ScheduledSplitLineView } from "../../features/accounts/scheduledTransactionTypes";
import {
  resolveScheduledIncomeCategoryChoice,
  scheduledIncomeCategoryChoices,
} from "../../features/accounts/scheduledIncomeCategoryChoices";
import { getSplitBalanceStatus } from "../../features/accounts/registerSplitDrafts";
import { getBudgetPersistenceProvider } from "../../features/persistence";
import { usePersistenceChange } from "../../features/persistence/persistenceChangeBus";
import type { SidebarAccount } from "../../features/accounts/accountService";
import type { PayeeView } from "../../features/accounts/payeeService";
import { PayeeInput } from "../../features/accounts/components/PayeeInput";
import { createRuntimeUuid } from "../../features/ids/createRuntimeUuid";
import type { BudgetCategoryOption } from "../../features/budget/budgetViewTypes";
import { formatDateForDisplay } from "../../features/settings/dateFormatting";
import { useDateFormatPreference } from "../../features/settings/useDateFormatPreference";
import type { TransactionTagDefinition } from "../../features/tags/transactionTagTypes";
import { TransactionTagPicker } from "../../features/accounts/components/TransactionRow";
import { localCalendarDate } from "../../features/dates/localCalendarDate";
import { MoneyInput } from "../../features/money/MoneyInput";
import { useScheduledTransactionHistory } from "../../features/accounts/useScheduledTransactionHistory";
import { ScheduledTransactionDiscoveryDialog } from "./ScheduledTransactionDiscoveryDialog";
import {
  loadScheduledTransactionSuggestions,
} from "../../features/accounts/loadScheduledTransactionDiscoveryEvidence";
import type { ScheduledTransactionSuggestion } from "../../features/accounts/scheduledTransactionDiscovery";
import {
  ignoreScheduledTransactionSuggestion,
  readIgnoredScheduledTransactionSuggestions,
} from "../../features/accounts/scheduledTransactionDiscoveryPreferences";
import {
  applyScheduledPayeeText,
  applyScheduledSavedPayee,
  applyScheduledTransferAccount,
} from "../../features/accounts/scheduledPayeeDraft";
import "../../styles/scheduledTransactions.css";

interface ScheduledTransactionsPanelProps {
  budgetId: string | null;
  accountId: string;
  isOpen: boolean;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  tags: readonly TransactionTagDefinition[];
  onCreateTag: (name: string) => TransactionTagDefinition;
  onClose: () => void;
  onDueCountChange?: (count: number) => void;
  presentation?: "overlay" | "workspace";
  editScheduleId?: string | null;
  onEditScheduleHandled?: () => void;
}

interface ScheduledFormDraft {
  id?: string;
  tagIds: string[];
  splitLines?: ScheduledTransactionView["splitLines"];
  nextDueDate: string;
  frequency: ScheduledFrequency;
  frequencyChoice: ScheduledFrequencyChoice;
  isRecurring: boolean;
  recurrenceKind: ScheduledRecurrenceKind;
  specificDates: string[];
  specificDateIndex: number;
  specificInstalments: ScheduledInstalment[];
  attachments: ScheduledAttachmentTemplate[];
  recurrenceInterval: number;
  recurrenceUnit: ScheduledRecurrenceUnit;
  recurrenceAnchorDate: string;
  recurrenceAnchorDay: number;
  monthDayPolicy: ScheduledMonthDayPolicy;
  endCondition: ScheduledEndCondition;
  endDate: string;
  occurrenceCount: number;
  occurrencesCompleted: number;
  weekendPolicy: ScheduledWeekendPolicy;
  payee: string;
  payeeId?: string;
  transferAccountId?: string;
  category: string;
  categoryId?: string;
  incomeBudgetMonthOffset?: 0 | 1;
  inflowClassification?: "income" | "category-inflow";
  memo: string;
  outflow: string;
  inflow: string;
}

type ScheduledFrequencyChoice = "once" | "daily" | "weekly" | "fortnightly" | "monthly" | "quarterly" | "half-yearly" | "yearly" | "custom" | "specific-dates";

export function ScheduledTransactionsPanel({
  budgetId,
  accountId,
  isOpen,
  categoryOptions,
  transferAccounts,
  payeeOptions,
  tags,
  onCreateTag,
  onClose,
  onDueCountChange,
  presentation = "overlay",
  editScheduleId = null,
  onEditScheduleHandled,
}: ScheduledTransactionsPanelProps) {
  const scheduledTransactionsPersistence = getBudgetPersistenceProvider().scheduledTransactions;
  const { createSchedule, editSchedule, deleteSchedule, enterSchedule } =
    useScheduledTransactionHistory(budgetId, accountId);
  const persistenceChangeVersion = usePersistenceChange({ budgetId: budgetId ?? "legacy", accountId, domains: ["scheduled-transactions", "transactions", "categories"] });
  const dateFormat = useDateFormatPreference();
  const [scheduledTransactions, setScheduledTransactions] = useState<ScheduledTransactionView[]>([]);
  const [draft, setDraft] = useState<ScheduledFormDraft | null>(null);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [discoverySuggestions, setDiscoverySuggestions] = useState<ScheduledTransactionSuggestion[]>([]);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !editScheduleId) return;
    const schedule = scheduledTransactions.find((item) => item.id === editScheduleId);
    if (!schedule) return;
    setDraft(draftFromScheduled(schedule));
    onEditScheduleHandled?.();
  }, [editScheduleId, isOpen, onEditScheduleHandled, scheduledTransactions]);

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
  }, [accountId, onDueCountChange, persistenceChangeVersion, scheduledTransactionsPersistence]);

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

    const enteredOutflow = storedMoneyValue(draft.outflow);
    const enteredInflow = storedMoneyValue(draft.inflow);
    const specificInstalments = normaliseSpecificInstalments(
      draft.specificInstalments,
      draft.specificDates,
      enteredOutflow,
      enteredInflow,
    );
    const firstInstalment = specificInstalments[0];
    const outflow = draft.recurrenceKind === "specific-dates" ? firstInstalment?.outflow ?? 0 : enteredOutflow;
    const inflow = draft.recurrenceKind === "specific-dates" ? firstInstalment?.inflow ?? 0 : enteredInflow;

    if (outflow > 0 && inflow > 0) {
      await alertDialog({ message: "A scheduled transaction can have either an outflow or an inflow, not both." });
      return;
    }

    if (outflow <= 0 && inflow <= 0) {
      await alertDialog({ message: "Enter either an outflow or an inflow amount." });
      return;
    }

    const specificDates = specificInstalments.map((instalment) => instalment.date);
    if (draft.recurrenceKind === "specific-dates" && specificDates.length === 0) {
      await alertDialog({ message: "Add at least one occurrence date." });
      return;
    }

    if (draft.recurrenceKind === "specific-dates" && specificInstalments.some((instalment) => instalment.outflow <= 0 && instalment.inflow <= 0)) {
      await alertDialog({ message: "Enter an amount for every instalment." });
      return;
    }

    if (draft.isRecurring && draft.endCondition === "on-date" && (!draft.endDate || draft.endDate < draft.recurrenceAnchorDate)) {
      await alertDialog({ message: "Choose an end date on or after the next scheduled date." });
      return;
    }

    if (
      draft.incomeBudgetMonthOffset !== undefined &&
      (draft.transferAccountId || inflow <= 0 || outflow > 0)
    ) {
      await alertDialog({ message: "Scheduled income requires a positive inflow and cannot be a transfer." });
      return;
    }

    if (draft.splitLines && draft.splitLines.length > 0) {
      const distinctInstalmentAmounts = new Set(
        specificInstalments.map((instalment) => (instalment.inflow > 0 ? instalment.inflow : instalment.outflow).toFixed(2)),
      );
      if (draft.recurrenceKind === "specific-dates" && distinctInstalmentAmounts.size > 1) {
        await alertDialog({ message: "Variable-amount instalments cannot share one split allocation. Use separate schedules if split amounts also vary." });
        return;
      }
      const invalidSplit = draft.splitLines.some((line) =>
        !line.category.trim() ||
        (line.outflow <= 0 && line.inflow <= 0) ||
        (line.incomeBudgetMonthOffset !== undefined &&
          (line.transferAccountId || line.inflow <= 0 || line.outflow > 0))
      );
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

    const hasParentSplit = Boolean(draft.splitLines?.length);
    const isOrdinaryParentCategoryInflow =
      !draft.transferAccountId &&
      !hasParentSplit &&
      draft.incomeBudgetMonthOffset === undefined &&
      Boolean(draft.categoryId) &&
      inflow > 0 &&
      outflow === 0;
    const resolvedParentInflowClassification =
      draft.incomeBudgetMonthOffset !== undefined
        ? "income" as const
        : isOrdinaryParentCategoryInflow
          ? draft.inflowClassification === "income"
            ? "income" as const
            : "category-inflow" as const
          : undefined;
    const resolvedSplitLines = draft.splitLines?.map((line) => {
      const isOrdinaryCategoryInflow =
        !line.transferAccountId &&
        line.incomeBudgetMonthOffset === undefined &&
        Boolean(line.categoryId) &&
        line.inflow > 0 &&
        line.outflow === 0;
      return {
        ...line,
        inflowClassification:
          line.incomeBudgetMonthOffset !== undefined
            ? "income" as const
            : isOrdinaryCategoryInflow
              ? line.inflowClassification === "income"
                ? "income" as const
                : "category-inflow" as const
              : undefined,
      };
    });

    const input: UpsertScheduledTransactionInput = {
      id: draft.id,
      accountId,
      tagIds: draft.tagIds,
      nextDueDate: draft.recurrenceAnchorDate,
      frequency: draft.isRecurring ? frequencyFromRecurrence(draft.recurrenceInterval, draft.recurrenceUnit) : "once",
      recurrenceKind: draft.recurrenceKind,
      specificDates: draft.recurrenceKind === "specific-dates" ? specificDates : undefined,
      specificInstalments: draft.recurrenceKind === "specific-dates" ? specificInstalments : undefined,
      specificDateIndex: draft.recurrenceKind === "specific-dates" ? 0 : undefined,
      recurrenceInterval: draft.recurrenceInterval,
      recurrenceUnit: draft.recurrenceUnit,
      recurrenceAnchorDate: draft.recurrenceAnchorDate,
      recurrenceAnchorDay: draft.recurrenceAnchorDay,
      monthDayPolicy: draft.monthDayPolicy,
      endCondition: draft.endCondition,
      endDate: draft.endCondition === "on-date" ? draft.endDate : undefined,
      occurrenceCount: draft.endCondition === "after-occurrences" ? draft.occurrenceCount : undefined,
      occurrencesCompleted: draft.occurrencesCompleted,
      weekendPolicy: draft.weekendPolicy,
      payee: draft.payee.trim(),
      payeeId: draft.payeeId,
      transferAccountId: draft.transferAccountId,
      category: draft.category.trim(),
      categoryId: draft.categoryId,
      incomeBudgetMonthOffset: draft.incomeBudgetMonthOffset,
      inflowClassification: resolvedParentInflowClassification,
      memo: draft.memo.trim(),
      outflow,
      inflow,
      splitLines: resolvedSplitLines,
      attachments: draft.attachments,
    };

    if (draft.id) await editSchedule({ ...input, id: draft.id });
    else await createSchedule(input);
    const next = await scheduledTransactionsPersistence.listByAccount(accountId);

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

    await deleteSchedule(transaction.id);
    const next = await scheduledTransactionsPersistence.listByAccount(accountId);
    setScheduledTransactions(next);
    onDueCountChange?.(countDue(next));
  }

  async function enterScheduled(transaction: ScheduledTransactionView) {
    await enterSchedule(transaction);
    const next = await scheduledTransactionsPersistence.listByAccount(accountId);
    setScheduledTransactions(next);
    onDueCountChange?.(countDue(next));
  }

  async function openScheduledDiscovery() {
    setIsDiscoveryOpen(true);
    setIsDiscoveryLoading(true);
    setDiscoveryError(null);
    try {
      const ignoredFingerprints = readIgnoredScheduledTransactionSuggestions(
        budgetId,
        accountId,
      );
      setDiscoverySuggestions(
        await loadScheduledTransactionSuggestions({
          budgetId,
          accountId,
          asOfDate: localCalendarDate(),
          existingSchedules: scheduledTransactions,
          ignoredFingerprints,
        }),
      );
    } catch (error) {
      setDiscoverySuggestions([]);
      setDiscoveryError(
        error instanceof Error
          ? error.message
          : "Scheduled transaction suggestions could not be loaded.",
      );
    } finally {
      setIsDiscoveryLoading(false);
    }
  }

  function reviewScheduledSuggestion(suggestion: ScheduledTransactionSuggestion) {
    setIsDiscoveryOpen(false);
    setDraft(draftFromScheduledSuggestion(suggestion));
  }

  async function createScheduledSuggestion(suggestion: ScheduledTransactionSuggestion) {
    await createSchedule(scheduledInputFromSuggestion(accountId, suggestion));
    const next = await scheduledTransactionsPersistence.listByAccount(accountId);
    setScheduledTransactions(next);
    onDueCountChange?.(countDue(next));
    setDiscoverySuggestions((current) =>
      current.filter((entry) => entry.id !== suggestion.id),
    );
  }

  function ignoreScheduledSuggestion(suggestion: ScheduledTransactionSuggestion) {
    ignoreScheduledTransactionSuggestion(budgetId, accountId, suggestion.fingerprint);
    setDiscoverySuggestions((current) =>
      current.filter((entry) => entry.id !== suggestion.id),
    );
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
          <div className="scheduled-panel-actions">
            <button
              className="button button-primary scheduled-panel-add"
              type="button"
              onClick={() => setDraft(createEmptyDraft())}
            >
              Add scheduled
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void openScheduledDiscovery()}
            >
              Find Scheduled Transactions
            </button>
          </div>
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

      {isDiscoveryOpen ? (
        <ScheduledTransactionDiscoveryDialog
          suggestions={discoverySuggestions}
          dateFormat={dateFormat}
          isLoading={isDiscoveryLoading}
          error={discoveryError}
          onCreate={(suggestion) => void createScheduledSuggestion(suggestion)}
          onReview={reviewScheduledSuggestion}
          onIgnore={ignoreScheduledSuggestion}
          onClose={() => setIsDiscoveryOpen(false)}
        />
      ) : null}

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
  setDraft: Dispatch<SetStateAction<ScheduledFormDraft | null>>;
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
    if (choice === "specific-dates") {
      const dates = normaliseDraftSpecificDates(
        draft.specificDates.length > 0 ? draft.specificDates : [draft.recurrenceAnchorDate],
      );
      setDraft({
        ...draft,
        frequencyChoice: choice,
        isRecurring: true,
        recurrenceKind: "specific-dates",
        specificDates: dates,
        specificInstalments: normaliseSpecificInstalments(
          draft.specificInstalments,
          dates,
          storedMoneyValue(draft.outflow),
          storedMoneyValue(draft.inflow),
        ),
        specificDateIndex: 0,
        endCondition: "never",
      });
      return;
    }
    if (choice === "custom") {
      setDraft({ ...draft, frequencyChoice: choice, isRecurring: true, recurrenceKind: "rule" });
      return;
    }

    if (choice === "once") {
      setDraft({ ...draft, frequencyChoice: choice, isRecurring: false, recurrenceKind: "rule", endCondition: "never" });
      return;
    }

    const recurrenceByChoice: Record<Exclude<ScheduledFrequencyChoice, "custom" | "once" | "specific-dates">, { interval: number; unit: ScheduledRecurrenceUnit }> = {
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
      recurrenceKind: "rule",
      recurrenceInterval: recurrence.interval,
      recurrenceUnit: recurrence.unit,
    });
  }

  function updateOutflow(value: number) {
    setDraft({
      ...draft,
      outflow: value === 0 ? "" : value.toFixed(2),
      inflow: value > 0 ? "" : draft.inflow,
      category:
        value > 0 && draft.incomeBudgetMonthOffset !== undefined
          ? ""
          : draft.category,
      categoryId:
        value > 0 && draft.incomeBudgetMonthOffset !== undefined
          ? undefined
          : draft.categoryId,
      incomeBudgetMonthOffset:
        value > 0 ? undefined : draft.incomeBudgetMonthOffset,
      inflowClassification:
        value > 0 ? undefined : draft.inflowClassification,
    });
  }

  function updateInflow(value: number) {
    setDraft({
      ...draft,
      inflow: value === 0 ? "" : value.toFixed(2),
      outflow: value > 0 ? "" : draft.outflow,
      inflowClassification:
        value > 0 &&
        draft.incomeBudgetMonthOffset === undefined &&
        draft.categoryId
          ? draft.inflowClassification === "income"
            ? "income"
            : "category-inflow"
          : draft.inflowClassification,
    });
  }

  async function addAttachments(files: FileList | null) {
    if (!files) return;
    const additions: ScheduledAttachmentTemplate[] = [];
    let totalSize = draft.attachments.reduce((total, attachment) => total + attachment.fileSize, 0);
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        await alertDialog({ message: `${file.name} is larger than the 5 MB attachment limit.` });
        continue;
      }
      if (totalSize + file.size > 20 * 1024 * 1024) {
        await alertDialog({ message: "Scheduled transaction attachments may total at most 20 MB." });
        break;
      }
      if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        await alertDialog({ message: `${file.name} is not a supported PDF or image file.` });
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      additions.push({
        id: `scheduled-attachment-${createRuntimeUuid()}`,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        attachedAt: new Date().toISOString(),
        contentHash: await calculateAttachmentContentHash(bytes),
        contentBase64: encodeAttachment(bytes),
      });
      totalSize += file.size;
    }
    if (additions.length > 0) {
      setDraft({ ...draft, attachments: [...draft.attachments, ...additions] });
    }
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
                  <option value="specific-dates">Instalments / specific dates...</option>
                </select>
              </label>

              {frequencyChoice === "specific-dates" ? (
                <InstalmentsEditor
                  instalments={draft.specificInstalments}
                  defaultOutflow={storedMoneyValue(draft.outflow)}
                  defaultInflow={storedMoneyValue(draft.inflow)}
                  onChange={(specificInstalments) => {
                    const normalised = normaliseSpecificInstalments(specificInstalments, [], 0, 0);
                    const dates = normalised.map((instalment) => instalment.date);
                    const firstDate = dates[0] ?? draft.recurrenceAnchorDate;
                    const first = normalised[0];
                    setDraft({
                      ...draft,
                      specificDates: dates,
                      specificInstalments,
                      specificDateIndex: 0,
                      outflow: first?.outflow ? first.outflow.toFixed(2) : "",
                      inflow: first?.inflow ? first.inflow.toFixed(2) : "",
                      recurrenceAnchorDate: firstDate,
                      recurrenceAnchorDay: Number.parseInt(firstDate.slice(8, 10), 10),
                      nextDueDate: applyWeekendPolicy(firstDate, draft.weekendPolicy),
                    });
                  }}
                />
              ) : null}

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

              {frequencyChoice !== "specific-dates" ? (
              <div className="scheduled-editor-row scheduled-editor-row-two">
              <label>
                <span>{draft.isRecurring ? "Next date" : "Scheduled date"}</span>
                <input
                  type="date"
                  value={draft.recurrenceAnchorDate}
                  onChange={(event) => setDraft({
                    ...draft,
                    recurrenceAnchorDate: event.target.value,
                    recurrenceAnchorDay: Number.parseInt(event.target.value.slice(8, 10), 10),
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
              ) : (
                <label>
                  <span>When a date falls on a weekend</span>
                  <select
                    value={draft.weekendPolicy}
                    onChange={(event) => {
                      const weekendPolicy = event.target.value as ScheduledWeekendPolicy;
                      const firstDate = normaliseDraftSpecificDates(draft.specificDates)[0] ?? draft.recurrenceAnchorDate;
                      setDraft({
                        ...draft,
                        weekendPolicy,
                        nextDueDate: applyWeekendPolicy(firstDate, weekendPolicy),
                      });
                    }}
                  >
                    <option value="same-day">Keep the scheduled date</option>
                    <option value="previous-business-day">Move to the previous business day</option>
                    <option value="next-business-day">Move to the next business day</option>
                    <option value="skip">Skip the weekend date</option>
                  </select>
                </label>
              )}

              {draft.recurrenceKind === "rule" && draft.isRecurring && (draft.recurrenceUnit === "month" || draft.recurrenceUnit === "year") ? (
                <label>
                  <span>Month position</span>
                  <select
                    value={draft.monthDayPolicy}
                    onChange={(event) => setDraft({
                      ...draft,
                      monthDayPolicy: event.target.value as ScheduledMonthDayPolicy,
                    })}
                  >
                    <option value="same-day-number">Same day number (use the last valid day when needed)</option>
                    <option value="last-day-of-month">Last day of the month</option>
                  </select>
                  <small className="muted">Last day keeps month-end schedules aligned through February and longer months.</small>
                </label>
              ) : null}

              {!draft.isRecurring ? (
                <p className="scheduled-once-note">
                  After this transaction is entered, the schedule is removed from Scheduled Transactions. The register transaction remains.
                </p>
              ) : null}
            </div>

            {draft.isRecurring && draft.recurrenceKind === "rule" ? (
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

            <div className="scheduled-payee-field">
              <span>Payee</span>
              <PayeeInput
                value={draft.payee}
                transferAccounts={transferAccounts}
                payeeOptions={payeeOptions}
                autoFocus
                openWhenEmptyOnFocus={false}
                onChange={(payee) =>
                  setDraft((current) =>
                    current ? applyScheduledPayeeText(current, payee) : current,
                  )
                }
                onTransferAccountIdChange={(transferAccountId) =>
                  setDraft((current) =>
                    current
                      ? applyScheduledTransferAccount(current, transferAccountId)
                      : current,
                  )
                }
                onPayeeIdChange={(payeeId) => {
                  const selectedPayee = payeeOptions.find(
                    (candidate) => candidate.id === payeeId,
                  );

                  setDraft((current) =>
                    current
                      ? applyScheduledSavedPayee(
                          current,
                          payeeId,
                          selectedPayee?.name,
                          selectedPayee?.defaultCategoryId,
                          selectedPayee?.defaultCategoryName,
                          categoryOptions,
                        )
                      : current,
                  );
                }}
              />
            </div>

            <div className="scheduled-editor-row scheduled-editor-row-two">
              <label>
                <span>Outflow</span>
                <MoneyInput
                  value={storedMoneyValue(draft.outflow)}
                  onCommit={updateOutflow}
                  validate={(value) => value >= 0}
                  emptyWhenZero
                  placeholder="0.00"
                />
              </label>

              <label>
                <span>Inflow</span>
                <MoneyInput
                  value={storedMoneyValue(draft.inflow)}
                  onCommit={updateInflow}
                  validate={(value) => value >= 0}
                  emptyWhenZero
                  placeholder="0.00"
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
                      const incomeChoice = resolveScheduledIncomeCategoryChoice(category);
                      const categoryId = incomeChoice
                        ? undefined
                        : categoryOptions.find((option) => option.name === category)?.id;
                      setDraft({
                        ...draft,
                        category,
                        categoryId,
                        incomeBudgetMonthOffset: incomeChoice?.incomeBudgetMonthOffset,
                        inflowClassification: incomeChoice ? "income" : undefined,
                      });
                    }}
                    placeholder="Category"
                    list="scheduled-category-options"
                  />
                </label>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    setDraft({
                      ...draft,
                      category: "Split",
                      categoryId: undefined,
                      incomeBudgetMonthOffset: undefined,
                      inflowClassification: undefined,
                      splitLines: [createScheduledSplitLine()],
                    });
                    setIsSplitEditorOpen(true);
                  }}
                >
                  Split transaction
                </button>
              </div>
            )}
            {!isSplitEditorOpen &&
            !draft.transferAccountId &&
            draft.incomeBudgetMonthOffset === undefined &&
            Boolean(draft.categoryId) &&
            storedMoneyValue(draft.inflow) > 0 &&
            storedMoneyValue(draft.outflow) === 0 ? (
              <label className="scheduled-income-toggle">
                <input
                  type="checkbox"
                  checked={draft.inflowClassification === "income"}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      inflowClassification: event.target.checked
                        ? "income"
                        : "category-inflow",
                    })
                  }
                />
                Count as income
              </label>
            ) : null}
            {isSplitEditorOpen ? (
              <ScheduledSplitEditor
                splitLines={draft.splitLines ?? []}
                categoryOptions={categoryOptions}
                onChange={(splitLines) => setDraft({
                  ...draft,
                  splitLines,
                  category: "Split",
                  categoryId: undefined,
                  incomeBudgetMonthOffset: undefined,
                  inflowClassification: undefined,
                })}
                parentOutflow={storedMoneyValue(draft.outflow)}
                parentInflow={storedMoneyValue(draft.inflow)}
              />
            ) : null}
            <datalist id="scheduled-category-options">
              {scheduledIncomeCategoryChoices().map((choice) => (
                <option key={choice.value} value={choice.value} label="Special" />
              ))}
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

        <div className="scheduled-attachment-section">
          <div className="scheduled-attachment-heading">
            <div>
              <strong>Attachments</strong>
              <span>These files will be attached to every generated transaction.</span>
            </div>
            <label className="button button-secondary scheduled-attachment-add">
              Add files
              <input
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => void addAttachments(event.target.files)}
              />
            </label>
          </div>
          {draft.attachments.length === 0 ? (
            <p className="scheduled-attachment-empty">No template attachments.</p>
          ) : (
            <ul className="scheduled-attachment-list">
              {draft.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <span><strong>{attachment.fileName}</strong><small>{formatFileSize(attachment.fileSize)}</small></span>
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, attachments: draft.attachments.filter(({ id }) => id !== attachment.id) })}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
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

function InstalmentsEditor({
  instalments,
  defaultOutflow,
  defaultInflow,
  onChange,
}: {
  instalments: ScheduledInstalment[];
  defaultOutflow: number;
  defaultInflow: number;
  onChange: (instalments: ScheduledInstalment[]) => void;
}) {
  const displayInstalments = instalments.length > 0
    ? instalments
    : [{ date: "", outflow: defaultOutflow, inflow: defaultInflow }];

  return (
    <div className="scheduled-specific-dates" aria-label="Instalment dates and amounts">
      <div className="scheduled-specific-dates-heading">
        <div>
          <strong>Instalments</strong>
          <small>Set the exact date and amount for each payment. Dates are sorted automatically.</small>
        </div>
        <span>{normaliseSpecificInstalments(instalments, [], 0, 0).length} selected</span>
      </div>
      {displayInstalments.map((instalment, index) => (
        <div className="scheduled-specific-date-row" key={`${instalment.date}-${index}`}>
          <span className="scheduled-specific-date-number">{index + 1}</span>
          <input
            type="date"
            aria-label={`Specific occurrence ${index + 1}`}
            value={instalment.date}
            onChange={(event) => {
              const next = [...displayInstalments];
              next[index] = { ...instalment, date: event.target.value };
              onChange(next);
            }}
          />
          <label className="scheduled-instalment-amount">
            <span aria-hidden="true">$</span>
            <MoneyInput
              aria-label={`Instalment ${index + 1} amount`}
              value={instalment.inflow > 0 ? instalment.inflow : instalment.outflow}
              onCommit={(amount) => {
                const next = [...displayInstalments];
                next[index] = instalment.inflow > 0
                  ? { ...instalment, inflow: amount, outflow: 0 }
                  : { ...instalment, outflow: amount, inflow: 0 };
                onChange(next);
              }}
              validate={(amount) => amount >= 0}
              emptyWhenZero
            />
          </label>
          <button
            type="button"
            className="scheduled-specific-date-remove"
            onClick={() => onChange(displayInstalments.filter((_, candidateIndex) => candidateIndex !== index))}
            aria-label={`Remove occurrence ${index + 1}`}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button button-secondary scheduled-specific-date-add"
        onClick={() => onChange([...instalments, {
          date: "",
          outflow: defaultInflow > 0 ? 0 : defaultOutflow,
          inflow: defaultInflow,
        }])}
      >
        + Add another instalment
      </button>
      <small className="muted">The schedule completes automatically after the final date.</small>
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
  splitLines: ScheduledSplitLineView[];
  categoryOptions: BudgetCategoryOption[];
  onChange: (splitLines: ScheduledSplitLineView[]) => void;
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

  function updateLine(id: string, changes: Partial<ScheduledSplitLineView>) {
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
              const incomeChoice = resolveScheduledIncomeCategoryChoice(category);
              updateLine(line.id, {
                category,
                categoryId: incomeChoice
                  ? undefined
                  : categoryOptions.find((option) => option.name === category)?.id,
                incomeBudgetMonthOffset: incomeChoice?.incomeBudgetMonthOffset,
                inflowClassification: incomeChoice ? "income" : undefined,
              });
            }}
          />
          <input value={line.memo ?? ""} placeholder="Memo" onChange={(event) => updateLine(line.id, { memo: event.target.value })} />
          <MoneyInput
            value={line.outflow}
            placeholder="Outflow"
            onCommit={(outflow) =>
              updateLine(line.id, {
                outflow,
                inflow: outflow > 0 ? 0 : line.inflow,
                category:
                  outflow > 0 && line.incomeBudgetMonthOffset !== undefined
                    ? ""
                    : line.category,
                categoryId:
                  outflow > 0 && line.incomeBudgetMonthOffset !== undefined
                    ? undefined
                    : line.categoryId,
                incomeBudgetMonthOffset:
                  outflow > 0 ? undefined : line.incomeBudgetMonthOffset,
                inflowClassification:
                  outflow > 0 ? undefined : line.inflowClassification,
              })
            }
            validate={(amount) => amount >= 0}
            emptyWhenZero
          />
          <MoneyInput
            value={line.inflow}
            placeholder="Inflow"
            onCommit={(inflow) =>
              updateLine(line.id, {
                inflow,
                outflow: inflow > 0 ? 0 : line.outflow,
                inflowClassification:
                  inflow > 0 &&
                  line.incomeBudgetMonthOffset === undefined &&
                  line.categoryId
                    ? line.inflowClassification === "income"
                      ? "income"
                      : "category-inflow"
                    : line.inflowClassification,
              })
            }
            validate={(amount) => amount >= 0}
            emptyWhenZero
          />
          {line.inflow > 0 &&
          line.outflow === 0 &&
          !line.transferAccountId &&
          line.incomeBudgetMonthOffset === undefined &&
          Boolean(line.categoryId) ? (
            <label className="scheduled-split-income-toggle">
              <input
                type="checkbox"
                checked={line.inflowClassification === "income"}
                onChange={(event) =>
                  updateLine(line.id, {
                    inflowClassification: event.target.checked
                      ? "income"
                      : "category-inflow",
                  })
                }
              />
              Count as income
            </label>
          ) : (
            <span aria-hidden="true" />
          )}
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
  if (transaction.recurrenceKind === "specific-dates") {
    const remaining = Math.max(0, (transaction.specificDates?.length ?? 0) - (transaction.specificDateIndex ?? 0));
    return `Specific dates · ${remaining} remaining`;
  }
  if (transaction.frequency === "once") return "Once";
  const recurrence = resolveRecurrence(transaction);
  const unit = recurrence.unit.charAt(0).toUpperCase() + recurrence.unit.slice(1);
  const monthPosition =
    (recurrence.unit === "month" || recurrence.unit === "year") &&
    transaction.monthDayPolicy === "last-day-of-month"
      ? " · Last day of month"
      : "";
  return `Every ${recurrence.interval} ${unit}${recurrence.interval === 1 ? "" : "s"}${monthPosition}`;
}

function createEmptyDraft(): ScheduledFormDraft {
  return {
    tagIds: [],
    nextDueDate: localCalendarDate(),
    frequency: "monthly",
    frequencyChoice: "monthly",
    isRecurring: true,
    recurrenceKind: "rule",
    specificDates: [],
    specificDateIndex: 0,
    specificInstalments: [],
    attachments: [],
    recurrenceInterval: 1,
    recurrenceUnit: "month",
    recurrenceAnchorDate: localCalendarDate(),
    recurrenceAnchorDay: Number.parseInt(localCalendarDate().slice(8, 10), 10),
    monthDayPolicy: "same-day-number",
    endCondition: "never",
    endDate: "",
    occurrenceCount: 12,
    occurrencesCompleted: 0,
    weekendPolicy: "same-day",
    payee: "",
    payeeId: undefined,
    transferAccountId: undefined,
    category: "",
    categoryId: undefined,
    incomeBudgetMonthOffset: undefined,
    inflowClassification: undefined,
    memo: "",
    outflow: "",
    inflow: "",
    splitLines: undefined,
  };
}

function draftFromScheduledSuggestion(
  suggestion: ScheduledTransactionSuggestion,
): ScheduledFormDraft {
  const amount = suggestion.amount.suggested.toFixed(2);
  return {
    tagIds: [],
    nextDueDate: suggestion.nextDueDate,
    frequency: frequencyFromRecurrence(
      suggestion.recurrenceInterval,
      suggestion.recurrenceUnit,
    ),
    frequencyChoice: resolveFrequencyChoice(
      true,
      suggestion.recurrenceInterval,
      suggestion.recurrenceUnit,
    ),
    isRecurring: true,
    recurrenceKind: "rule",
    specificDates: [],
    specificDateIndex: 0,
    specificInstalments: [],
    attachments: [],
    recurrenceInterval: suggestion.recurrenceInterval,
    recurrenceUnit: suggestion.recurrenceUnit,
    recurrenceAnchorDate: suggestion.nextDueDate,
    recurrenceAnchorDay:
      suggestion.recurrenceAnchorDay ??
      Number.parseInt(suggestion.nextDueDate.slice(8, 10), 10),
    monthDayPolicy: "same-day-number",
    endCondition: "never",
    endDate: "",
    occurrenceCount: 12,
    occurrencesCompleted: 0,
    weekendPolicy: "same-day",
    payee: suggestion.payee,
    payeeId: suggestion.payeeId,
    transferAccountId: undefined,
    category: suggestion.category,
    categoryId: suggestion.categoryId,
    incomeBudgetMonthOffset: undefined,
    inflowClassification: undefined,
    memo: "",
    outflow: suggestion.direction === "outflow" ? amount : "",
    inflow: suggestion.direction === "inflow" ? amount : "",
    splitLines: undefined,
  };
}

function scheduledInputFromSuggestion(
  accountId: string,
  suggestion: ScheduledTransactionSuggestion,
): UpsertScheduledTransactionInput {
  const draft = draftFromScheduledSuggestion(suggestion);
  return {
    accountId,
    tagIds: [],
    nextDueDate: draft.recurrenceAnchorDate,
    frequency: draft.frequency,
    recurrenceKind: "rule",
    recurrenceInterval: draft.recurrenceInterval,
    recurrenceUnit: draft.recurrenceUnit,
    recurrenceAnchorDate: draft.recurrenceAnchorDate,
    recurrenceAnchorDay: draft.recurrenceAnchorDay,
    monthDayPolicy: draft.monthDayPolicy,
    endCondition: "never",
    occurrencesCompleted: 0,
    weekendPolicy: "same-day",
    payee: draft.payee,
    payeeId: draft.payeeId,
    category: draft.category,
    categoryId: draft.categoryId,
    memo: "",
    outflow: storedMoneyValue(draft.outflow),
    inflow: storedMoneyValue(draft.inflow),
  };
}

function draftFromScheduled(transaction: ScheduledTransactionView): ScheduledFormDraft {
  return {
    id: transaction.id,
    tagIds: [...(transaction.tagIds ?? [])],
    nextDueDate: transaction.nextDueDate,
    frequency: transaction.frequency,
    frequencyChoice: transaction.recurrenceKind === "specific-dates" ? "specific-dates" : resolveFrequencyChoice(
      transaction.frequency !== "once",
      resolveRecurrence(transaction).interval,
      resolveRecurrence(transaction).unit,
    ),
    isRecurring: transaction.frequency !== "once",
    recurrenceKind: transaction.recurrenceKind === "specific-dates" ? "specific-dates" : "rule",
    specificDates: [...(transaction.specificDates ?? [])],
    specificDateIndex: transaction.specificDateIndex ?? 0,
    specificInstalments: normaliseSpecificInstalments(
      transaction.specificInstalments,
      transaction.specificDates,
      transaction.outflow,
      transaction.inflow,
    ),
    attachments: (transaction.attachments ?? []).map((attachment) => ({ ...attachment })),
    recurrenceInterval: resolveRecurrence(transaction).interval,
    recurrenceUnit: resolveRecurrence(transaction).unit,
    recurrenceAnchorDate: transaction.recurrenceAnchorDate ?? transaction.nextDueDate,
    recurrenceAnchorDay: transaction.recurrenceAnchorDay ??
      Number.parseInt((transaction.recurrenceAnchorDate ?? transaction.nextDueDate).slice(8, 10), 10),
    monthDayPolicy: transaction.monthDayPolicy ?? "same-day-number",
    endCondition: transaction.endCondition ?? "never",
    endDate: transaction.endDate ?? "",
    occurrenceCount: transaction.occurrenceCount ?? 12,
    occurrencesCompleted: transaction.occurrencesCompleted ?? 0,
    weekendPolicy: transaction.weekendPolicy ?? "same-day",
    payee: transaction.payee,
    payeeId: transaction.payeeId,
    transferAccountId: transaction.transferAccountId,
    category: transaction.category,
    categoryId: transaction.categoryId,
    incomeBudgetMonthOffset: transaction.incomeBudgetMonthOffset,
    inflowClassification: transaction.inflowClassification,
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
  return nextDueDate <= localCalendarDate(horizon);
}

function countDue(transactions: ScheduledTransactionView[]): number {
  const today = localCalendarDate();
  return transactions.filter((transaction) => transaction.nextDueDate <= today).length;
}

function getUpcomingOccurrenceDates(draft: ScheduledFormDraft, count: number): string[] {
  if (draft.recurrenceKind === "specific-dates") {
    return normaliseDraftSpecificDates(draft.specificDates)
      .slice(draft.specificDateIndex, draft.specificDateIndex + count)
      .map((date) => applyWeekendPolicy(date, draft.weekendPolicy));
  }
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
    anchor = advanceDateByRule(
      occurrence.anchorDate,
      draft.recurrenceInterval,
      draft.recurrenceUnit,
      {
        anchorDay: draft.recurrenceAnchorDay,
        monthDayPolicy: draft.monthDayPolicy,
      },
    );
  }

  return dates;
}

function formatRecurrenceLabel(draft: ScheduledFormDraft): string {
  if (draft.recurrenceKind === "specific-dates") {
    const count = normaliseDraftSpecificDates(draft.specificDates).length;
    return `Specific dates · ${count} ${count === 1 ? "occurrence" : "occurrences"}`;
  }
  if (!draft.isRecurring) return "Once";
  const unit = draft.recurrenceUnit.charAt(0).toUpperCase() + draft.recurrenceUnit.slice(1);
  const monthPosition =
    (draft.recurrenceUnit === "month" || draft.recurrenceUnit === "year") &&
    draft.monthDayPolicy === "last-day-of-month"
      ? " · Last day of month"
      : "";
  return `Every ${draft.recurrenceInterval} ${unit}${draft.recurrenceInterval === 1 ? "" : "s"}${monthPosition}`;
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

function createScheduledSplitLine(): ScheduledSplitLineView {
  return {
    id: `scheduled-split-${createRuntimeUuid()}`,
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

function storedMoneyValue(value: string): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}


function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function encodeAttachment(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function normaliseDraftSpecificDates(dates: readonly string[]): string[] {
  return Array.from(new Set(dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort();
}
