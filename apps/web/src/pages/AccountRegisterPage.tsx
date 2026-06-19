import { CalendarDays, Paperclip } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { useAccountRegister } from "../features/accounts/useAccountRegister";
import { budgetViewService } from "../features/budget/budgetViewService";
import { readAccounts, type SidebarAccount } from "../features/accounts/accountService";
import type {
  NewRegisterTransactionInput,
  RegisterTransactionView,
  TransactionFlag,
} from "../features/accounts/accountRegisterTypes";
import type { BudgetCategoryOption } from "../features/budget/budgetViewTypes";

const ACTIVE_BUDGET_ID = "household";
const ACTIVE_BUDGET_MONTH = "2026-06";

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function formatDateForInput(date: string) {
  if (!date) {
    return "";
  }

  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function parseDateInput(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const today = new Date();

  if (["t", "today"].includes(trimmed)) {
    return today.toISOString().slice(0, 10);
  }

  if (["y", "yesterday"].includes(trimmed)) {
    const date = new Date(today);
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  if (["tm", "tomorrow"].includes(trimmed)) {
    const date = new Date(today);
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  if (/^[+-]\d+$/.test(trimmed)) {
    const date = new Date(today);
    date.setDate(date.getDate() + Number.parseInt(trimmed, 10));
    return date.toISOString().slice(0, 10);
  }

  const compact = trimmed.replace(/[^0-9]/g, "");

  if (compact.length === 6) {
    const day = compact.slice(0, 2);
    const month = compact.slice(2, 4);
    const year = `20${compact.slice(4, 6)}`;
    return normaliseDateParts(day, month, year);
  }

  const parts = trimmed.split(/[\/\-.]/).filter(Boolean);

  if (parts.length === 3) {
    const [day, month, rawYear] = parts;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return normaliseDateParts(day, month, year);
  }

  return null;
}

function normaliseDateParts(day: string, month: string, year: string): string | null {
  const numericDay = Number.parseInt(day, 10);
  const numericMonth = Number.parseInt(month, 10);
  const numericYear = Number.parseInt(year, 10);

  if (
    !Number.isFinite(numericDay) ||
    !Number.isFinite(numericMonth) ||
    !Number.isFinite(numericYear)
  ) {
    return null;
  }

  const date = new Date(numericYear, numericMonth - 1, numericDay);

  if (
    date.getFullYear() !== numericYear ||
    date.getMonth() !== numericMonth - 1 ||
    date.getDate() !== numericDay
  ) {
    return null;
  }

  return [
    String(numericYear).padStart(4, "0"),
    String(numericMonth).padStart(2, "0"),
    String(numericDay).padStart(2, "0"),
  ].join("-");
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function RegisterDateField({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(formatDateForInput(value));
  const hiddenDateInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(formatDateForInput(value));
  }, [value]);

  function commit() {
    const parsed = parseDateInput(draft);

    if (parsed) {
      onChange(parsed);
      setDraft(formatDateForInput(parsed));
    }
  }

  return (
    <div className="register-date-field">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
        }}
        placeholder="dd/mm/yy"
        autoFocus={autoFocus}
      />

      <button
        className="register-date-picker-button"
        type="button"
        title="Choose date"
        aria-label="Choose date"
        onClick={() => {
          const input = hiddenDateInputRef.current;

          if (!input) {
            return;
          }

         const dateInput = input as HTMLInputElement & {
  showPicker?: () => void;
};

if (typeof dateInput.showPicker === "function") {
  dateInput.showPicker();
} else {
  dateInput.click();
}
        }}
      >
        <CalendarDays size={15} />
      </button>

      <input
        ref={hiddenDateInputRef}
        className="register-hidden-date-input"
        type="date"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setDraft(formatDateForInput(event.target.value));
        }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

function FlagDot({ flag }: { flag: TransactionFlag }) {
  if (!flag) {
    return <span className="transaction-flag transaction-flag-empty" />;
  }

  return <span className={`transaction-flag transaction-flag-${flag}`} />;
}

function AttachmentIndicator({ count }: { count: number }) {
  if (count <= 0) {
    return (
      <span
        className="attachment-indicator attachment-indicator-empty"
        title="No attachments"
        aria-label="No attachments"
      />
    );
  }

  return (
    <span
      className="attachment-indicator attachment-indicator-present"
      title="Has attachments"
      aria-label="Has attachments"
    >
      <Paperclip size={13} />
    </span>
  );
}


function PayeeInput({
  value,
  onChange,
  transferAccounts,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  transferAccounts: SidebarAccount[];
  autoFocus?: boolean;
}) {
  return (
    <>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Payee"
        list="register-payee-options"
        autoFocus={autoFocus}
      />

      <datalist id="register-payee-options">
        {transferAccounts.map((account) => (
          <option key={account.id} value={`Transfer: ${account.name}`} label="Transfer" />
        ))}
      </datalist>
    </>
  );
}

function CategoryInput({
  value,
  onChange,
  categoryOptions,
}: {
  value: string;
  onChange: (value: string) => void;
  categoryOptions: BudgetCategoryOption[];
}) {
  return (
    <>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Category"
        list="budget-category-options"
      />

      <datalist id="budget-category-options">
        {categoryOptions.map((category) => (
          <option key={category.id} value={category.name} label={category.groupName} />
        ))}
      </datalist>
    </>
  );
}

function TransactionEntryRow({
  initialDate,
  onSave,
  onSaveAndAddAnother,
  onCancel,
  categoryOptions,
  transferAccounts,
}: {
  initialDate: string;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  onSave: (input: NewRegisterTransactionInput) => void;
  onSaveAndAddAnother: (input: NewRegisterTransactionInput) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [payee, setPayee] = useState("");
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [outflow, setOutflow] = useState("");
  const [inflow, setInflow] = useState("");

  function buildInput(): NewRegisterTransactionInput | null {
    if (!payee.trim()) {
      return null;
    }

    const parsedOutflow = parseMoney(outflow);
    const parsedInflow = parseMoney(inflow);

    return {
      date,
      payee: payee.trim(),
      category:
        category.trim() ||
        (parsedInflow > 0 && parsedOutflow === 0 ? "Ready to Assign" : "Uncategorised"),
      memo: memo.trim(),
      outflow: parsedOutflow,
      inflow: parsedInflow,
    };
  }

  function clearForNext() {
    setPayee("");
    setCategory("");
    setMemo("");
    setOutflow("");
    setInflow("");
  }

  function save() {
    const input = buildInput();

    if (!input) {
      return;
    }

    onSave(input);
  }

  function saveAndAddAnother() {
    const input = buildInput();

    if (!input) {
      return;
    }

    onSaveAndAddAnother(input);
    clearForNext();
  }

  return (
    <div
      className="register-entry-row-active register-entry-row-workflow"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCancel();
        }
      }}
    >
      <RegisterDateField value={date} onChange={setDate} />
      <PayeeInput
        value={payee}
        onChange={setPayee}
        transferAccounts={transferAccounts}
        autoFocus
      />
      <CategoryInput
        value={category}
        onChange={setCategory}
        categoryOptions={categoryOptions}
      />
      <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Memo" />
      <input value={outflow} onChange={(event) => setOutflow(event.target.value)} placeholder="Outflow" inputMode="decimal" />
      <input value={inflow} onChange={(event) => setInflow(event.target.value)} placeholder="Inflow" inputMode="decimal" />

      <div className="register-entry-actions register-entry-actions-wide">
        <button className="button button-primary" type="button" onClick={saveAndAddAnother}>
          Save & add another
        </button>
        <button className="button button-secondary" type="button" onClick={save}>
          Save
        </button>
        <button className="button button-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function TransactionEditRow({
  transaction,
  onSave,
  onCancel,
  categoryOptions,
  transferAccounts,
}: {
  transaction: RegisterTransactionView;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  onSave: (input: {
    id: string;
    date: string;
    payee: string;
    category: string;
    memo?: string;
    inflow: number;
    outflow: number;
  }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(transaction.date);
  const [payee, setPayee] = useState(transaction.payee);
  const [category, setCategory] = useState(transaction.category);
  const [memo, setMemo] = useState(transaction.memo ?? "");
  const [outflow, setOutflow] = useState(transaction.outflow ? transaction.outflow.toFixed(2) : "");
  const [inflow, setInflow] = useState(transaction.inflow ? transaction.inflow.toFixed(2) : "");

  function save() {
    if (!payee.trim()) {
      return;
    }

    const parsedOutflow = parseMoney(outflow);
    const parsedInflow = parseMoney(inflow);

    onSave({
      id: transaction.id,
      date,
      payee: payee.trim(),
      category:
        category.trim() ||
        (parsedInflow > 0 && parsedOutflow === 0 ? "Ready to Assign" : "Uncategorised"),
      memo: memo.trim(),
      outflow: parsedOutflow,
      inflow: parsedInflow,
    });
  }

  return (
    <div
      className="register-row register-row-editing"
      onKeyDown={(event) => {
        if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) {
          save();
        }

        if (event.key === "Escape") {
          onCancel();
        }
      }}
    >
      <span className="register-checkbox" aria-hidden="true" />
      <RegisterDateField value={date} onChange={setDate} autoFocus />
      <FlagDot flag={transaction.flag} />
      <AttachmentIndicator count={transaction.attachmentCount} />
      <PayeeInput
        value={payee}
        onChange={setPayee}
        transferAccounts={transferAccounts}
      />
      <CategoryInput
        value={category}
        onChange={setCategory}
        categoryOptions={categoryOptions}
      />
      <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Memo" />
      <input value={outflow} onChange={(event) => setOutflow(event.target.value)} placeholder="Outflow" inputMode="decimal" />
      <input value={inflow} onChange={(event) => setInflow(event.target.value)} placeholder="Inflow" inputMode="decimal" />

      <div className="register-edit-actions">
        <button className="button button-primary" type="button" onClick={save}>Save</button>
        <button className="button button-secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function TransactionStatus({
  transaction,
  onToggleCleared,
}: {
  transaction: RegisterTransactionView;
  onToggleCleared: () => void;
}) {
  if (transaction.reconciled) {
    return (
      <button className="register-status register-status-reconciled" type="button" title="Reconciled">
        R
      </button>
    );
  }

  if (transaction.cleared) {
    return (
      <button
        className="register-status register-status-cleared"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleCleared();
        }}
        title="Cleared"
      >
        C
      </button>
    );
  }

  return (
    <button
      className="register-status register-status-empty"
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggleCleared();
      }}
      title="Mark cleared"
    />
  );
}

function TransactionRow({
  transaction,
  currencyCode,
  isSelected,
  onSelect,
  onEdit,
  onToggleCleared,
}: {
  transaction: RegisterTransactionView;
  currencyCode: string;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggleCleared: () => void;
}) {
  return (
    <button
      type="button"
      className={isSelected ? "register-row register-row-selected" : "register-row"}
      onClick={onSelect}
      onDoubleClick={onEdit}
    >
      <span className="register-checkbox" aria-hidden="true" />
      <span>{formatDate(transaction.date)}</span>
      <FlagDot flag={transaction.flag} />
      <AttachmentIndicator count={transaction.attachmentCount} />

      <div className="register-payee-cell">
        <strong>{transaction.payee}</strong>
      </div>

      <span>{transaction.category}</span>
      <span className="register-memo-cell">{transaction.memo ?? ""}</span>

      <span className="register-money register-outflow">
        {transaction.outflow ? formatMoney(transaction.outflow, currencyCode) : ""}
      </span>

      <span className="register-money register-inflow">
        {transaction.inflow ? formatMoney(transaction.inflow, currencyCode) : ""}
      </span>

      <strong className="register-balance">
        {formatMoney(transaction.runningBalance, currencyCode)}
      </strong>

      <TransactionStatus transaction={transaction} onToggleCleared={onToggleCleared} />
    </button>
  );
}

export function AccountRegisterPage() {
  const { accountId = "everyday" } = useParams();
  const {
    data,
    isLoading,
    error,
    selectedTransactionId,
    selectTransaction,
    addTransaction,
    updateTransaction,
    toggleCleared,
    deleteTransaction,
    addMockAttachment,
  } = useAccountRegister(accountId);

  const [showEntryRow, setShowEntryRow] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [lastEntryDate, setLastEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryOptions, setCategoryOptions] = useState<BudgetCategoryOption[]>([]);
  const [transferAccounts, setTransferAccounts] = useState<SidebarAccount[]>([]);

  useEffect(() => {
    let isMounted = true;

    void budgetViewService
      .getCategoryOptions({
        budgetId: ACTIVE_BUDGET_ID,
        month: ACTIVE_BUDGET_MONTH,
      })
      .then((options) => {
        if (isMounted) {
          setCategoryOptions(options);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);


  useEffect(() => {
    setTransferAccounts(readAccounts().filter((account) => account.id !== accountId));
  }, [accountId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || !selectedTransactionId || editingTransactionId) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement
      ) {
        return;
      }

      setEditingTransactionId(selectedTransactionId);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingTransactionId, selectedTransactionId]);

  if (isLoading) {
    return (
      <div className="page-stack">
        <section className="workspace-header">
          <div>
            <h1>Account Register</h1>
            <p className="muted">Loading account register…</p>
          </div>
        </section>

        <Card>Loading account register.</Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-stack">
        <section className="workspace-header">
          <div>
            <h1>Account Register</h1>
            <p className="muted">Unable to load account register.</p>
          </div>
        </section>

        <Card>{error ?? "Unknown error."}</Card>
      </div>
    );
  }

  return (
    <div className="register-workspace">
      <section className="register-clean-header">
        <div>
          <h1>{data.accountName}</h1>
          <p className="muted">Keyboard-first date entry · Save & add another</p>
        </div>

        <div className="register-main-balance">
          <span>Balance</span>
          <strong>{formatMoney(data.workingBalance, data.currencyCode)}</strong>
        </div>
      </section>

      <Card className="register-table-card">
        <div className="register-toolbar register-toolbar-clean">
          <div className="register-toolbar-actions register-toolbar-actions-left">
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                setEditingTransactionId(null);
                setShowEntryRow((current) => !current);
              }}
            >
              Add transaction
            </button>

            <input
              className="register-search"
              placeholder="Search transactions…"
              aria-label="Search transactions"
            />

            <button className="button button-secondary" type="button" disabled>
              Import
            </button>

            <button className="button button-secondary" type="button" disabled>
              Reconcile
            </button>

            <button className="button button-secondary" type="button" disabled>
              More
            </button>
          </div>
        </div>

        {showEntryRow && (
          <TransactionEntryRow
            initialDate={lastEntryDate}
            categoryOptions={categoryOptions}
            transferAccounts={transferAccounts}
            onSave={(input) => {
              addTransaction(input);
              setLastEntryDate(input.date);
              setShowEntryRow(false);
            }}
            onSaveAndAddAnother={(input) => {
              addTransaction(input);
              setLastEntryDate(input.date);
            }}
            onCancel={() => setShowEntryRow(false)}
          />
        )}

        {selectedTransactionId && !editingTransactionId && (
          <div className="register-selection-bar">
            <span>1 selected</span>
            <button type="button" onClick={() => setEditingTransactionId(selectedTransactionId)}>
              Edit
            </button>
            <button type="button" onClick={() => addMockAttachment(selectedTransactionId)}>
              Attach
            </button>
            <button type="button" disabled>Duplicate</button>
            <button type="button" disabled>Move</button>
            <button type="button" disabled>Flag</button>
            <button type="button" disabled>Add note</button>
            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm(
                  "Delete this transaction? This cannot be undone yet.",
                );

                if (!confirmed) {
                  return;
                }

                deleteTransaction(selectedTransactionId);
                setEditingTransactionId(null);
              }}
            >
              Delete
            </button>
          </div>
        )}

        <div className="register-table">
          <div className="register-row register-head register-row-with-attachments">
            <span />
            <span>Date</span>
            <span>Flag</span>
            <span className="register-head-icon" aria-label="Attachments">
              <Paperclip size={13} />
            </span>
            <span>Payee</span>
            <span>Category</span>
            <span>Memo</span>
            <span>Outflow</span>
            <span>Inflow</span>
            <span>Balance</span>
            <span>C</span>
          </div>

          {data.transactions.map((transaction) =>
            editingTransactionId === transaction.id ? (
              <TransactionEditRow
                key={transaction.id}
                transaction={transaction}
                categoryOptions={categoryOptions}
                transferAccounts={transferAccounts}
                onSave={(input) => {
                  updateTransaction(input);
                  setEditingTransactionId(null);
                }}
                onCancel={() => setEditingTransactionId(null)}
              />
            ) : (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                currencyCode={data.currencyCode}
                isSelected={selectedTransactionId === transaction.id}
                onSelect={() => selectTransaction(transaction.id)}
                onEdit={() => {
                  selectTransaction(transaction.id);
                  setShowEntryRow(false);
                  setEditingTransactionId(transaction.id);
                }}
                onToggleCleared={() => toggleCleared(transaction.id)}
              />
            ),
          )}
        </div>
      </Card>

      <div className="register-legend">
        <span><span className="transaction-flag transaction-flag-red" /> Needs attention</span>
        <span><span className="transaction-flag transaction-flag-orange" /> Waiting for receipt</span>
        <span><span className="transaction-flag transaction-flag-yellow" /> Tax related</span>
        <span><span className="transaction-flag transaction-flag-green" /> Reimbursable</span>
        <span><span className="transaction-flag transaction-flag-blue" /> Business</span>
        <span><span className="transaction-flag transaction-flag-purple" /> Review later</span>
        <span className="register-legend-spacer" />
        <span><Paperclip size={13} /> Attachment</span>
        <span><span className="register-status register-status-cleared">C</span> Cleared</span>
        <span><span className="register-status register-status-empty" /> Uncleared</span>
      </div>
    </div>
  );
}
