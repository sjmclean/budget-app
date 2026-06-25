import { useEffect, useMemo, useState } from "react";
import type { NewRegisterTransactionInput, TransactionFlag } from "../../features/accounts/accountRegisterTypes";
import { alertDialog, confirmDialog } from "../../features/ui/appDialogService";
import type {
  ScheduledFrequency,
  ScheduledTransactionView,
  UpsertScheduledTransactionInput,
} from "../../features/accounts/scheduledTransactionPersistencePort";
import { getAppPersistenceGateway } from "../../features/persistence";
import type { SidebarAccount } from "../../features/accounts/accountService";
import type { PayeeView } from "../../features/accounts/payeeService";
import type { BudgetCategoryOption } from "../../features/budget/budgetViewTypes";
import { formatDateForDisplay } from "../../features/settings/dateFormatting";
import { useDateFormatPreference } from "../../features/settings/useDateFormatPreference";

interface ScheduledTransactionsPanelProps {
  accountId: string;
  isOpen: boolean;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  onClose: () => void;
  onEnter: (transaction: NewRegisterTransactionInput) => Promise<void>;
  onDueCountChange?: (count: number) => void;
}

interface ScheduledFormDraft {
  id?: string;
  flag: TransactionFlag;
  splitLines?: ScheduledTransactionView["splitLines"];
  nextDueDate: string;
  frequency: ScheduledFrequency;
  payee: string;
  payeeId?: string;
  category: string;
  memo: string;
  outflow: string;
  inflow: string;
}

const flagOptions: Array<Exclude<TransactionFlag, null>> = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
];

const frequencyLabels: Record<ScheduledFrequency, string> = {
  once: "Once",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function ScheduledTransactionsPanel({
  accountId,
  isOpen,
  categoryOptions,
  transferAccounts,
  payeeOptions,
  onClose,
  onEnter,
  onDueCountChange,
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
      alertDialog({ message: "A scheduled transaction can have either an outflow or an inflow, not both." });
      return;
    }

    if (outflow <= 0 && inflow <= 0) {
      alertDialog({ message: "Enter either an outflow or an inflow amount." });
      return;
    }

    const input: UpsertScheduledTransactionInput = {
      id: draft.id,
      accountId,
      flag: draft.flag,
      nextDueDate: draft.nextDueDate,
      frequency: draft.frequency,
      payee: draft.payee.trim(),
      payeeId: draft.payeeId,
      category: draft.category.trim(),
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
    const confirmed = confirmDialog({ message: `Delete scheduled transaction "${transaction.payee}"?` });

    if (!confirmed) {
      return;
    }

    const next = await scheduledTransactionsPersistence.delete(accountId, transaction.id);
    setScheduledTransactions(next);
    onDueCountChange?.(countDue(next));
  }

  async function enterScheduled(transaction: ScheduledTransactionView) {
    await onEnter(scheduledTransactionsPersistence.toRegisterInput(transaction));
    const next = await scheduledTransactionsPersistence.advanceAfterEnter(accountId, transaction.id);
    setScheduledTransactions(next);
    onDueCountChange?.(countDue(next));
  }

  return (
    <div className="scheduled-panel-overlay" role="dialog" aria-modal="false">
      <div className="scheduled-panel">
        <div className="scheduled-panel-header">
          <div>
            <h2>Scheduled Transactions</h2>
            <p>View upcoming repeating transactions and inspect imported split allocations.</p>
          </div>
          <button className="button button-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {draft ? (
          <ScheduledForm
            draft={draft}
            setDraft={setDraft}
            categoryOptions={categoryOptions}
            transferAccounts={transferAccounts}
            payeeOptions={payeeOptions}
            onCancel={() => setDraft(null)}
            onSave={saveDraft}
          />
        ) : (
          <button
            className="button button-primary"
            type="button"
            onClick={() => setDraft(createEmptyDraft())}
          >
            Add scheduled
          </button>
        )}

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
    </div>
  );
}

function ScheduledForm({
  draft,
  setDraft,
  categoryOptions,
  transferAccounts,
  payeeOptions,
  onCancel,
  onSave,
}: {
  draft: ScheduledFormDraft;
  setDraft: (draft: ScheduledFormDraft) => void;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  onCancel: () => void;
  onSave: () => void;
}) {
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
    <div className="scheduled-form">
      <FlagColourSelect
        value={draft.flag}
        onChange={(flag) =>
          setDraft({
            ...draft,
            flag,
          })
        }
      />

      <input
        type="date"
        value={draft.nextDueDate}
        onChange={(event) => setDraft({ ...draft, nextDueDate: event.target.value })}
        aria-label="Next due date"
      />

      <select
        value={draft.frequency}
        onChange={(event) => setDraft({ ...draft, frequency: event.target.value as ScheduledFrequency })}
        aria-label="Frequency"
      >
        {Object.entries(frequencyLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <input
        value={draft.payee}
        onChange={(event) => setDraft({ ...draft, payee: event.target.value })}
        placeholder="Payee"
        list="scheduled-payee-options"
      />
      <datalist id="scheduled-payee-options">
        {payeeOptions.map((payee) => (
          <option key={payee.id} value={payee.name} />
        ))}

        {transferAccounts.map((account) => (
          <option key={account.id} value={`Transfer: ${account.name}`} label="Transfer" />
        ))}
      </datalist>

      <input
        value={draft.category}
        onChange={(event) => setDraft({ ...draft, category: event.target.value })}
        placeholder="Category"
        list="scheduled-category-options"
      />
      <datalist id="scheduled-category-options">
        {categoryOptions.map((category) => (
          <option key={category.id} value={category.name} label={category.groupName} />
        ))}
      </datalist>

      <input
        value={draft.memo}
        onChange={(event) => setDraft({ ...draft, memo: event.target.value })}
        placeholder="Memo"
      />

      <input
        value={draft.outflow}
        onChange={(event) => updateOutflow(event.target.value)}
        placeholder="Outflow"
        inputMode="decimal"
      />

      <input
        value={draft.inflow}
        onChange={(event) => updateInflow(event.target.value)}
        placeholder="Inflow"
        inputMode="decimal"
      />

      <div className="scheduled-form-actions">
        <button className="button button-primary" type="button" onClick={onSave}>
          Save scheduled
        </button>
        <button className="button button-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function FlagColourSelect({
  value,
  onChange,
}: {
  value: TransactionFlag;
  onChange: (flag: TransactionFlag) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  function chooseFlag(flag: TransactionFlag) {
    onChange(flag);
    setIsOpen(false);
  }

  return (
    <div className="flag-colour-picker" title="Flag">
      <button
        className="flag-colour-picker-button"
        type="button"
        aria-label="Flag"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <FlagPickerDot flag={value} />
      </button>

      {isOpen ? (
        <div className="flag-colour-picker-menu" role="listbox" aria-label="Choose flag colour">
          <button
            className="flag-colour-picker-option"
            type="button"
            role="option"
            aria-selected={value === null}
            title="No flag"
            onClick={() => chooseFlag(null)}
          >
            <span className="transaction-flag transaction-flag-empty" aria-hidden="true" />
          </button>

          {flagOptions.map((flag) => (
            <button
              className="flag-colour-picker-option"
              type="button"
              role="option"
              aria-selected={value === flag}
              title={`${flag[0].toUpperCase()}${flag.slice(1)} flag`}
              key={flag}
              onClick={() => chooseFlag(flag)}
            >
              <span className={`transaction-flag transaction-flag-${flag}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FlagPickerDot({ flag }: { flag: TransactionFlag }) {
  return (
    <span
      className={
        flag
          ? `transaction-flag transaction-flag-${flag}`
          : "transaction-flag transaction-flag-empty"
      }
      aria-hidden="true"
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
                {formatDateForDisplay(transaction.nextDueDate, dateFormat)} · {frequencyLabels[transaction.frequency]}
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

function createEmptyDraft(): ScheduledFormDraft {
  return {
    flag: null,
    nextDueDate: new Date().toISOString().slice(0, 10),
    frequency: "monthly",
    payee: "",
    payeeId: undefined,
    category: "",
    memo: "",
    outflow: "",
    inflow: "",
    splitLines: undefined,
  };
}

function draftFromScheduled(transaction: ScheduledTransactionView): ScheduledFormDraft {
  return {
    id: transaction.id,
    flag: transaction.flag,
    nextDueDate: transaction.nextDueDate,
    frequency: transaction.frequency,
    payee: transaction.payee,
    payeeId: transaction.payeeId,
    category: transaction.category,
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
