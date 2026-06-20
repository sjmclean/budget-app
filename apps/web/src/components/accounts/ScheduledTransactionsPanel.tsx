import { useEffect, useMemo, useState } from "react";
import type { NewRegisterTransactionInput, TransactionFlag } from "../../features/accounts/accountRegisterTypes";
import {
  scheduledTransactionService,
  type ScheduledFrequency,
  type ScheduledTransactionView,
  type UpsertScheduledTransactionInput,
} from "../../features/accounts/scheduledTransactionService";
import type { SidebarAccount } from "../../features/accounts/accountService";
import type { BudgetCategoryOption } from "../../features/budget/budgetViewTypes";

interface ScheduledTransactionsPanelProps {
  accountId: string;
  isOpen: boolean;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  onClose: () => void;
  onEnter: (transaction: NewRegisterTransactionInput) => Promise<void>;
  onDueCountChange?: (count: number) => void;
}

interface ScheduledFormDraft {
  id?: string;
  flag: TransactionFlag;
  nextDueDate: string;
  frequency: ScheduledFrequency;
  payee: string;
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
  onClose,
  onEnter,
  onDueCountChange,
}: ScheduledTransactionsPanelProps) {
  const [scheduledTransactions, setScheduledTransactions] = useState<ScheduledTransactionView[]>([]);
  const [draft, setDraft] = useState<ScheduledFormDraft | null>(null);

  useEffect(() => {
    let mounted = true;

    scheduledTransactionService.listByAccount(accountId).then((transactions) => {
      if (!mounted) return;
      setScheduledTransactions(transactions);
      onDueCountChange?.(countDue(transactions));
    });

    return () => {
      mounted = false;
    };
  }, [accountId, onDueCountChange]);

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
      window.alert("A scheduled transaction can have either an outflow or an inflow, not both.");
      return;
    }

    if (outflow <= 0 && inflow <= 0) {
      window.alert("Enter either an outflow or an inflow amount.");
      return;
    }

    const input: UpsertScheduledTransactionInput = {
      id: draft.id,
      accountId,
      flag: draft.flag,
      nextDueDate: draft.nextDueDate,
      frequency: draft.frequency,
      payee: draft.payee.trim(),
      category: draft.category.trim(),
      memo: draft.memo.trim(),
      outflow,
      inflow,
    };

    const next = draft.id
      ? await scheduledTransactionService.update({ ...input, id: draft.id })
      : await scheduledTransactionService.create(input);

    setScheduledTransactions(next);
    onDueCountChange?.(countDue(next));
    setDraft(null);
  }

  async function deleteScheduled(transaction: ScheduledTransactionView) {
    const confirmed = window.confirm(`Delete scheduled transaction "${transaction.payee}"?`);

    if (!confirmed) {
      return;
    }

    const next = await scheduledTransactionService.delete(accountId, transaction.id);
    setScheduledTransactions(next);
    onDueCountChange?.(countDue(next));
  }

  async function enterScheduled(transaction: ScheduledTransactionView) {
    await onEnter(scheduledTransactionService.toRegisterInput(transaction));
    const next = await scheduledTransactionService.advanceAfterEnter(accountId, transaction.id);
    setScheduledTransactions(next);
    onDueCountChange?.(countDue(next));
  }

  return (
    <div className="scheduled-panel-overlay" role="dialog" aria-modal="false">
      <div className="scheduled-panel">
        <div className="scheduled-panel-header">
          <div>
            <h2>Scheduled Transactions</h2>
            <p>Scheduled splits are pinned for later.</p>
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
            onEnter={enterScheduled}
            onEdit={(transaction) => setDraft(draftFromScheduled(transaction))}
            onDelete={deleteScheduled}
          />

          {otherTransactions.length > 0 ? (
            <ScheduledSection
              title="Later"
              emptyText=""
              transactions={otherTransactions}
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
  onCancel,
  onSave,
}: {
  draft: ScheduledFormDraft;
  setDraft: (draft: ScheduledFormDraft) => void;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
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
  onEnter,
  onEdit,
  onDelete,
}: {
  title: string;
  emptyText: string;
  transactions: ScheduledTransactionView[];
  onEnter: (transaction: ScheduledTransactionView) => void;
  onEdit: (transaction: ScheduledTransactionView) => void;
  onDelete: (transaction: ScheduledTransactionView) => void;
}) {
  return (
    <section className="scheduled-section">
      <h3>{title}</h3>

      {transactions.length === 0 ? <p className="muted">{emptyText}</p> : null}

      {transactions.map((transaction) => (
        <div className="scheduled-item" key={transaction.id}>
          <div className="scheduled-item-main">
            <strong>{transaction.payee}</strong>
            <span>
              {formatDate(transaction.nextDueDate)} · {frequencyLabels[transaction.frequency]}
            </span>
            <span>{transaction.category}</span>
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
        </div>
      ))}
    </section>
  );
}

function createEmptyDraft(): ScheduledFormDraft {
  return {
    flag: null,
    nextDueDate: new Date().toISOString().slice(0, 10),
    frequency: "monthly",
    payee: "",
    category: "",
    memo: "",
    outflow: "",
    inflow: "",
  };
}

function draftFromScheduled(transaction: ScheduledTransactionView): ScheduledFormDraft {
  return {
    id: transaction.id,
    flag: transaction.flag,
    nextDueDate: transaction.nextDueDate,
    frequency: transaction.frequency,
    payee: transaction.payee,
    category: transaction.category,
    memo: transaction.memo ?? "",
    outflow: transaction.outflow ? transaction.outflow.toFixed(2) : "",
    inflow: transaction.inflow ? transaction.inflow.toFixed(2) : "",
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}
