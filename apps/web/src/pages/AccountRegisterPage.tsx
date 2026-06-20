import { CalendarDays, Paperclip } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { ScheduledTransactionsPanel } from "../components/accounts/ScheduledTransactionsPanel";
import { useAccountRegister } from "../features/accounts/useAccountRegister";
import { budgetViewService } from "../features/budget/budgetViewService";
import { readAccounts, type SidebarAccount } from "../features/accounts/accountService";
import { payeeService, type PayeeView } from "../features/accounts/payeeService";
import type {
  NewRegisterTransactionInput,
  RegisterSplitLineView,
  RegisterTransactionView,
  TransactionFlag,
} from "../features/accounts/accountRegisterTypes";
import type { BudgetCategoryOption } from "../features/budget/budgetViewTypes";

const SPLIT_CATEGORY_LABEL = "Split...";

function isSplitCategoryValue(value: string): boolean {
  const normalised = value.trim().toLowerCase();
  return normalised === "split" || normalised === "split...";
}

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

function AttachmentIndicator({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  const hasAttachments = count > 0;

  return (
    <button
      className={
        hasAttachments
          ? "attachment-indicator attachment-indicator-present"
          : "attachment-indicator attachment-indicator-empty"
      }
      type="button"
      title={hasAttachments ? "View attachments" : "Add attachment"}
      aria-label={hasAttachments ? "View attachments" : "Add attachment"}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      {hasAttachments ? <Paperclip size={13} /> : null}
    </button>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentManager({
  transaction,
  onClose,
  onAddAttachment,
  onRemoveAttachment,
}: {
  transaction: RegisterTransactionView;
  onClose: () => void;
  onAddAttachment: (file: File) => void;
  onRemoveAttachment: (attachmentId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachments = transaction.attachments ?? [];

  return (
    <div className="attachment-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="attachment-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Transaction attachments"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="attachment-dialog-header">
          <div>
            <strong>Attachments</strong>
            <p className="muted">{transaction.payee} · {formatDate(transaction.date)}</p>
          </div>
          <button className="button button-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="attachment-list">
          {attachments.length === 0 ? (
            <p className="muted">No attachments yet.</p>
          ) : (
            attachments.map((attachment) => (
              <div className="attachment-list-item" key={attachment.id}>
                <Paperclip size={15} />
                <div>
                  <strong>{attachment.fileName}</strong>
                  <span>
                    {formatFileSize(attachment.fileSize)} · {attachment.mimeType || "Unknown type"}
                  </span>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => onRemoveAttachment(attachment.id)}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <div className="attachment-dialog-actions">
          <input
            ref={fileInputRef}
            type="file"
            className="attachment-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (!file) {
                return;
              }

              onAddAttachment(file);
              event.target.value = "";
            }}
          />
          <button
            className="button button-primary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Add attachment
          </button>
        </div>
      </div>
    </div>
  );
}


function PayeeInput({
  value,
  onChange,
  onPayeeIdChange,
  transferAccounts,
  payeeOptions,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onPayeeIdChange?: (payeeId: string | undefined) => void;
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  autoFocus?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const normalisedValue = value.trim().toLowerCase();
  const suggestions = [
    ...payeeOptions.map((payee) => ({
      id: `payee-${payee.id}`,
      value: payee.name,
      payeeId: payee.id,
      label: "Payee",
    })),
    ...transferAccounts.map((account) => ({
      id: `transfer-${account.id}`,
      value: `Transfer: ${account.name}`,
      payeeId: undefined,
      label: "Transfer",
    })),
  ]
    .filter((suggestion, index, allSuggestions) => {
      const suggestionValue = suggestion.value.trim().toLowerCase();
      const isDuplicate =
        allSuggestions.findIndex(
          (candidate) => candidate.value.trim().toLowerCase() === suggestionValue,
        ) !== index;

      if (isDuplicate) {
        return false;
      }

      if (!normalisedValue) {
        return true;
      }

      return suggestionValue.includes(normalisedValue);
    })
    .slice(0, 8);

  const ghostSuggestion = normalisedValue
    ? suggestions.find((suggestion) => {
        const suggestionValue = suggestion.value.trim().toLowerCase();
        return (
          suggestionValue.startsWith(normalisedValue) &&
          suggestionValue !== normalisedValue
        );
      })
    : undefined;
  const ghostCompletion = ghostSuggestion
    ? ghostSuggestion.value.slice(value.length)
    : "";
  const shouldShowGhost = Boolean(ghostCompletion);
  const shouldShowSuggestions = isOpen && suggestions.length > 0;

  function acceptGhostSuggestion() {
    if (!ghostSuggestion) {
      return false;
    }

    selectSuggestion(ghostSuggestion.value, ghostSuggestion.payeeId);
    return true;
  }

  function selectSuggestion(selectedValue: string, selectedPayeeId?: string) {
    onChange(selectedValue);
    onPayeeIdChange?.(selectedPayeeId);
    setIsOpen(false);
    setHighlightedIndex(0);
  }

  return (
    <div className="register-payee-autocomplete">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "Tab" && shouldShowGhost) {
            event.preventDefault();
            acceptGhostSuggestion();
            return;
          }

          if (event.key === "ArrowRight" && shouldShowGhost) {
            const input = event.currentTarget;
            const cursorAtEnd =
              input.selectionStart === value.length && input.selectionEnd === value.length;

            if (cursorAtEnd) {
              event.preventDefault();
              acceptGhostSuggestion();
              return;
            }
          }

          if (!shouldShowSuggestions) {
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightedIndex((current) =>
              current >= suggestions.length - 1 ? 0 : current + 1,
            );
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIndex((current) =>
              current <= 0 ? suggestions.length - 1 : current - 1,
            );
            return;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            selectSuggestion(suggestions[highlightedIndex].value, suggestions[highlightedIndex].payeeId);
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
        placeholder="Payee"
        autoFocus={autoFocus}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shouldShowSuggestions}
      />

      {shouldShowGhost ? (
        <div className="register-payee-ghost" aria-hidden="true">
          <span className="register-payee-ghost-typed">{value}</span>
          <span>{ghostCompletion}</span>
        </div>
      ) : null}

      {shouldShowSuggestions ? (
        <div className="register-payee-suggestions" role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              className={
                index === highlightedIndex
                  ? "register-payee-suggestion register-payee-suggestion-active"
                  : "register-payee-suggestion"
              }
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                selectSuggestion(suggestion.value, suggestion.payeeId);
              }}
              role="option"
              aria-selected={index === highlightedIndex}
            >
              <span>{suggestion.value}</span>
              <small>{suggestion.label}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CategoryInput({
  value,
  onChange,
  categoryOptions,
  includeSplitOption = true,
}: {
  value: string;
  onChange: (value: string) => void;
  categoryOptions: BudgetCategoryOption[];
  includeSplitOption?: boolean;
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
        {includeSplitOption ? (
          <option value={SPLIT_CATEGORY_LABEL} label="Special" />
        ) : null}
        {categoryOptions.map((category) => (
          <option key={category.id} value={category.name} label={category.groupName} />
        ))}
      </datalist>
    </>
  );
}


interface SplitLineDraft {
  id: string;
  category: string;
  categoryId?: string;
  memo: string;
  outflow: string;
  inflow: string;
}

function createSplitLineDraft(): SplitLineDraft {
  return {
    id: createLocalId(),
    category: "",
    memo: "",
    outflow: "",
    inflow: "",
  };
}

function createLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `split-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function splitDraftsFromTransaction(transaction: RegisterTransactionView): SplitLineDraft[] {
  return (transaction.splitLines ?? []).map((line) => ({
    id: line.id,
    category: line.category,
    categoryId: line.categoryId,
    memo: line.memo ?? "",
    outflow: line.outflow ? line.outflow.toFixed(2) : "",
    inflow: line.inflow ? line.inflow.toFixed(2) : "",
  }));
}

function buildSplitLines(
  splitLines: SplitLineDraft[],
  categoryOptions: BudgetCategoryOption[],
): RegisterSplitLineView[] {
  return splitLines
    .map((line) => {
      const categoryName = line.category.trim();
      const categoryOption = findCategoryOption(categoryName, categoryOptions);

      return {
        id: line.id,
        category: categoryOption?.name ?? categoryName,
        categoryId: categoryOption?.id,
        memo: line.memo.trim(),
        outflow: parseMoney(line.outflow),
        inflow: parseMoney(line.inflow),
      };
    })
    .filter(
      (line) =>
        line.category.length > 0 &&
        (line.outflow > 0 || line.inflow > 0),
    );
}

function findCategoryOption(
  categoryName: string,
  categoryOptions: BudgetCategoryOption[],
): BudgetCategoryOption | undefined {
  const normalised = normaliseCategoryName(categoryName);

  return categoryOptions.find(
    (category) =>
      normaliseCategoryName(category.name) === normalised ||
      normaliseCategoryName(category.id) === normalised,
  );
}

function normaliseCategoryName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function totalsFromSplitLines(splitLines: RegisterSplitLineView[]): {
  outflow: number;
  inflow: number;
} {
  return splitLines.reduce(
    (totals, line) => ({
      outflow: totals.outflow + line.outflow,
      inflow: totals.inflow + line.inflow,
    }),
    { outflow: 0, inflow: 0 },
  );
}

function SplitEditor({
  splitLines,
  setSplitLines,
  categoryOptions,
}: {
  splitLines: SplitLineDraft[];
  setSplitLines: (updater: (current: SplitLineDraft[]) => SplitLineDraft[]) => void;
  categoryOptions: BudgetCategoryOption[];
}) {
  if (splitLines.length === 0) {
    return null;
  }

  const totals = totalsFromSplitLines(buildSplitLines(splitLines, categoryOptions));

  return (
    <div className="register-split-editor">
      <div className="register-split-header">
        <strong>Split transaction</strong>
        <span>
          Total: {totals.outflow > 0 ? `Outflow ${totals.outflow.toFixed(2)}` : ""}
          {totals.inflow > 0 ? ` Inflow ${totals.inflow.toFixed(2)}` : ""}
        </span>
      </div>

      {splitLines.map((line) => (
        <div className="register-split-line" key={line.id}>
          <CategoryInput
            value={line.category}
            onChange={(value) =>
              setSplitLines((current) =>
                current.map((item) =>
                  item.id === line.id
                    ? {
                        ...item,
                        category: value,
                        categoryId: findCategoryOption(value, categoryOptions)?.id,
                      }
                    : item,
                ),
              )
            }
            categoryOptions={categoryOptions}
            includeSplitOption={false}
          />
          <input
            value={line.memo}
            onChange={(event) =>
              setSplitLines((current) =>
                current.map((item) =>
                  item.id === line.id ? { ...item, memo: event.target.value } : item,
                ),
              )
            }
            placeholder="Split memo"
          />
          <input
            value={line.outflow}
            onChange={(event) =>
              setSplitLines((current) =>
                current.map((item) =>
                  item.id === line.id ? { ...item, outflow: event.target.value } : item,
                ),
              )
            }
            placeholder="Outflow"
            inputMode="decimal"
          />
          <input
            value={line.inflow}
            onChange={(event) =>
              setSplitLines((current) =>
                current.map((item) =>
                  item.id === line.id ? { ...item, inflow: event.target.value } : item,
                ),
              )
            }
            placeholder="Inflow"
            inputMode="decimal"
          />
          <button
            className="button button-secondary"
            type="button"
            onClick={() =>
              setSplitLines((current) => current.filter((item) => item.id !== line.id))
            }
          >
            Remove
          </button>
        </div>
      ))}

      <button
        className="button button-secondary"
        type="button"
        onClick={() => setSplitLines((current) => [...current, createSplitLineDraft()])}
      >
        Add split line
      </button>
    </div>
  );
}

function TransactionEntryRow({
  initialDate,
  onSave,
  onSaveAndAddAnother,
  onCancel,
  categoryOptions,
  transferAccounts,
  payeeOptions,
}: {
  initialDate: string;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  onSave: (input: NewRegisterTransactionInput) => void;
  onSaveAndAddAnother: (input: NewRegisterTransactionInput) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [payee, setPayee] = useState("");
  const [payeeId, setPayeeId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [outflow, setOutflow] = useState("");
  const [inflow, setInflow] = useState("");
  const [splitLines, setSplitLines] = useState<SplitLineDraft[]>([]);

  function buildInput(): NewRegisterTransactionInput | null {
    if (!payee.trim()) {
      return null;
    }

    const parsedSplitLines = buildSplitLines(splitLines, categoryOptions);

    if (splitLines.length > 0 && parsedSplitLines.length === 0) {
      return null;
    }

    const splitTotals = totalsFromSplitLines(parsedSplitLines);
    const parsedOutflow = parsedSplitLines.length > 0 ? splitTotals.outflow : parseMoney(outflow);
    const parsedInflow = parsedSplitLines.length > 0 ? splitTotals.inflow : parseMoney(inflow);

    const categoryName = category.trim();
    const categoryOption = findCategoryOption(categoryName, categoryOptions);
    const fallbackCategory = parsedInflow > 0 && parsedOutflow === 0 ? "Ready to Assign" : "Uncategorised";

    return {
      date,
      payee: payee.trim(),
      payeeId,
      category:
        parsedSplitLines.length > 0
          ? "Split"
          : categoryOption?.name ?? (categoryName || fallbackCategory),
      categoryId:
        parsedSplitLines.length > 0
          ? undefined
          : categoryOption?.id ?? (fallbackCategory === "Ready to Assign" ? "__ready_to_assign__" : undefined),
      memo: memo.trim(),
      outflow: parsedOutflow,
      inflow: parsedInflow,
      splitLines: parsedSplitLines.length > 0 ? parsedSplitLines : undefined,
    };
  }

  function clearForNext() {
    setPayee("");
    setPayeeId(undefined);
    setCategory("");
    setMemo("");
    setOutflow("");
    setInflow("");
    setSplitLines([]);
  }

  function handleCategoryChange(value: string) {
    if (isSplitCategoryValue(value)) {
      setCategory(SPLIT_CATEGORY_LABEL);
      setSplitLines((current) =>
        current.length > 0 ? current : [createSplitLineDraft(), createSplitLineDraft()],
      );
      return;
    }

    setCategory(value);
  }

  function toggleSplitEditor() {
    setSplitLines((current) => {
      if (current.length > 0) {
        setCategory((currentCategory) =>
          isSplitCategoryValue(currentCategory) ? "" : currentCategory,
        );
        return [];
      }

      setCategory(SPLIT_CATEGORY_LABEL);
      return [createSplitLineDraft(), createSplitLineDraft()];
    });
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
    <>
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
        onChange={(value) => {
          setPayee(value);
          setPayeeId(undefined);
        }}
        onPayeeIdChange={setPayeeId}
        transferAccounts={transferAccounts}
        payeeOptions={payeeOptions}
        autoFocus
      />
      <CategoryInput
        value={category}
        onChange={handleCategoryChange}
        categoryOptions={categoryOptions}
      />
      <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Memo" />
      <input value={outflow} onChange={(event) => setOutflow(event.target.value)} placeholder="Outflow" inputMode="decimal" disabled={splitLines.length > 0} />
      <input value={inflow} onChange={(event) => setInflow(event.target.value)} placeholder="Inflow" inputMode="decimal" disabled={splitLines.length > 0} />

      <div className="register-entry-actions register-entry-actions-wide">
        <button className="button button-primary" type="button" onClick={saveAndAddAnother}>
          Save & add another
        </button>
        <button className="button button-secondary" type="button" onClick={save}>
          Save
        </button>
        <button className="button button-secondary" type="button" onClick={toggleSplitEditor}>
          Split
        </button>
        <button className="button button-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
    <SplitEditor
      splitLines={splitLines}
      setSplitLines={setSplitLines}
      categoryOptions={categoryOptions}
    />
    </>
  );
}

function TransactionEditRow({
  transaction,
  onSave,
  onCancel,
  categoryOptions,
  transferAccounts,
  payeeOptions,
}: {
  transaction: RegisterTransactionView;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  onSave: (input: {
    id: string;
    date: string;
    payee: string;
    payeeId?: string;
    category: string;
    categoryId?: string;
    memo?: string;
    inflow: number;
    outflow: number;
    splitLines?: RegisterSplitLineView[];
  }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(transaction.date);
  const [payee, setPayee] = useState(transaction.payee);
  const [payeeId, setPayeeId] = useState<string | undefined>(transaction.payeeId);
  const [category, setCategory] = useState(transaction.category);
  const [memo, setMemo] = useState(transaction.memo ?? "");
  const [outflow, setOutflow] = useState(transaction.outflow ? transaction.outflow.toFixed(2) : "");
  const [inflow, setInflow] = useState(transaction.inflow ? transaction.inflow.toFixed(2) : "");
  const [splitLines, setSplitLines] = useState<SplitLineDraft[]>(
    splitDraftsFromTransaction(transaction),
  );

  function handleCategoryChange(value: string) {
    if (isSplitCategoryValue(value)) {
      setCategory(SPLIT_CATEGORY_LABEL);
      setSplitLines((current) =>
        current.length > 0 ? current : [createSplitLineDraft(), createSplitLineDraft()],
      );
      return;
    }

    setCategory(value);
  }

  function toggleSplitEditor() {
    setSplitLines((current) => {
      if (current.length > 0) {
        setCategory((currentCategory) =>
          isSplitCategoryValue(currentCategory) ? "" : currentCategory,
        );
        return [];
      }

      setCategory(SPLIT_CATEGORY_LABEL);
      return [createSplitLineDraft(), createSplitLineDraft()];
    });
  }

  function save() {
    if (!payee.trim()) {
      return;
    }

    const parsedSplitLines = buildSplitLines(splitLines, categoryOptions);

    if (splitLines.length > 0 && parsedSplitLines.length === 0) {
      return;
    }

    const splitTotals = totalsFromSplitLines(parsedSplitLines);
    const parsedOutflow = parsedSplitLines.length > 0 ? splitTotals.outflow : parseMoney(outflow);
    const parsedInflow = parsedSplitLines.length > 0 ? splitTotals.inflow : parseMoney(inflow);

    const categoryName = category.trim();
    const categoryOption = findCategoryOption(categoryName, categoryOptions);
    const fallbackCategory = parsedInflow > 0 && parsedOutflow === 0 ? "Ready to Assign" : "Uncategorised";

    onSave({
      id: transaction.id,
      date,
      payee: payee.trim(),
      payeeId,
      category:
        parsedSplitLines.length > 0
          ? "Split"
          : categoryOption?.name ?? (categoryName || fallbackCategory),
      categoryId:
        parsedSplitLines.length > 0
          ? undefined
          : categoryOption?.id ?? (fallbackCategory === "Ready to Assign" ? "__ready_to_assign__" : undefined),
      memo: memo.trim(),
      outflow: parsedOutflow,
      inflow: parsedInflow,
      splitLines: parsedSplitLines.length > 0 ? parsedSplitLines : undefined,
    });
  }

  return (
    <>
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
        onChange={(value) => {
          setPayee(value);
          setPayeeId(undefined);
        }}
        onPayeeIdChange={setPayeeId}
        transferAccounts={transferAccounts}
        payeeOptions={payeeOptions}
      />
      <CategoryInput
        value={category}
        onChange={handleCategoryChange}
        categoryOptions={categoryOptions}
      />
      <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Memo" />
      <input value={outflow} onChange={(event) => setOutflow(event.target.value)} placeholder="Outflow" inputMode="decimal" disabled={splitLines.length > 0} />
      <input value={inflow} onChange={(event) => setInflow(event.target.value)} placeholder="Inflow" inputMode="decimal" disabled={splitLines.length > 0} />

      <div className="register-edit-actions">
        <button className="button button-primary" type="button" onClick={save}>Save</button>
        <button className="button button-secondary" type="button" onClick={toggleSplitEditor}>Split</button>
        <button className="button button-secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
    <SplitEditor
      splitLines={splitLines}
      setSplitLines={setSplitLines}
      categoryOptions={categoryOptions}
    />
    </>
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
  onManageAttachments,
}: {
  transaction: RegisterTransactionView;
  currencyCode: string;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggleCleared: () => void;
  onManageAttachments: () => void;
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
      <AttachmentIndicator
        count={transaction.attachmentCount}
        onClick={onManageAttachments}
      />

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
    addAttachment,
    removeAttachment,
  } = useAccountRegister(accountId);

  const [showEntryRow, setShowEntryRow] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [lastEntryDate, setLastEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryOptions, setCategoryOptions] = useState<BudgetCategoryOption[]>([]);
  const [payeeOptions, setPayeeOptions] = useState<PayeeView[]>([]);
  const [transferAccounts, setTransferAccounts] = useState<SidebarAccount[]>([]);
  const [isScheduledOpen, setIsScheduledOpen] = useState(false);
  const [scheduledDueCount, setScheduledDueCount] = useState(0);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isPayeeManagerOpen, setIsPayeeManagerOpen] = useState(false);
  const [attachmentTransactionId, setAttachmentTransactionId] = useState<string | null>(null);

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
    let isMounted = true;

    void payeeService.listPayees().then((payees) => {
      if (isMounted) {
        setPayeeOptions(payees);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [data?.transactions]);

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

  const attachmentTransaction = attachmentTransactionId
    ? data.transactions.find((transaction) => transaction.id === attachmentTransactionId) ?? null
    : null;

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

            <div className="register-more-menu">
              <button
                className="button button-secondary"
                type="button"
                aria-haspopup="menu"
                aria-expanded={isMoreMenuOpen}
                onClick={() => setIsMoreMenuOpen((current) => !current)}
              >
                More ▾
              </button>

              {isMoreMenuOpen && (
                <div className="register-more-menu-panel" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsPayeeManagerOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                  >
                    Manage Payees
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsScheduledOpen((current) => !current);
                      setIsMoreMenuOpen(false);
                    }}
                  >
                    Scheduled Transactions{scheduledDueCount > 0 ? ` (${scheduledDueCount})` : ""}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <ScheduledTransactionsPanel
          accountId={accountId}
          isOpen={isScheduledOpen}
          categoryOptions={categoryOptions}
          transferAccounts={transferAccounts}
          payeeOptions={payeeOptions}
          onClose={() => setIsScheduledOpen(false)}
          onDueCountChange={setScheduledDueCount}
          onEnter={async (input) => {
            await addTransaction(input);
          }}
        />

        {isPayeeManagerOpen && (
          <div className="payee-manager-overlay" role="presentation">
            <Card className="payee-manager-panel">
              <div className="payee-manager-header">
                <div>
                  <h2>Manage Payees</h2>
                  <p>Payee management will live here.</p>
                </div>

                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setIsPayeeManagerOpen(false)}
                >
                  Close
                </button>
              </div>

              <p className="payee-manager-placeholder">
                Payee list, rename, merge and archive tools will be added in the next Payee Management increments.
              </p>
            </Card>
          </div>
        )}

        {showEntryRow && (
          <TransactionEntryRow
            initialDate={lastEntryDate}
            categoryOptions={categoryOptions}
            transferAccounts={transferAccounts}
            payeeOptions={payeeOptions}
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
            <button type="button" onClick={() => setAttachmentTransactionId(selectedTransactionId)}>
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
                payeeOptions={payeeOptions}
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
                onManageAttachments={() => {
                  selectTransaction(transaction.id);
                  setAttachmentTransactionId(transaction.id);
                }}
              />
            ),
          )}
        </div>
      </Card>

      {attachmentTransaction && (
        <AttachmentManager
          transaction={attachmentTransaction}
          onClose={() => setAttachmentTransactionId(null)}
          onAddAttachment={(file) => addAttachment(attachmentTransaction.id, file)}
          onRemoveAttachment={(attachmentId) =>
            removeAttachment(attachmentTransaction.id, attachmentId)
          }
        />
      )}

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
