import { CalendarDays, Paperclip } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { ScheduledTransactionsPanel } from "../components/accounts/ScheduledTransactionsPanel";
import { AttachmentManager } from "../features/accounts/components/AttachmentManager";
import { TransactionImportDialog } from "../features/accounts/components/TransactionImportDialog";
import {
  AttachmentIndicator,
  InlineFlagPicker,
  TransactionRow,
  type RegisterColumnId,
} from "../features/accounts/components/TransactionRow";
import { useAccountRegister } from "../features/accounts/useAccountRegister";
import {
  REGISTER_DEFAULT_PAGE_SIZE,
  getRegisterPaginationState,
  paginateRegisterItems,
} from "../features/accounts/registerPagination";
import type { SidebarAccount } from "../features/accounts/accountService";
import { getAppPersistenceGateway } from "../features/persistence";
import { confirmDialog } from "../features/ui/appDialogService";
import {
  getAutocompleteCompletion,
  rankAutocompleteOptions,
  type AutocompleteOption,
  type RankedAutocompleteOption,
} from "../features/ui/autocomplete/autocompleteEngine";
import { DropdownMenu } from "../features/ui/DropdownMenu";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
import { ColumnResizeHandle } from "../features/tableLayout/ColumnResizeHandle";
import { ColumnVisibilityMenu } from "../features/tableLayout/ColumnVisibilityMenu";
import {
  buildTableRowStyle,
  useTableLayout,
  type TableColumnDefinition,
} from "../features/tableLayout/tableLayout";
import type { PayeeView } from "../features/accounts/payeeService";
import { buildPayeeRegisterSummaries } from "../features/accounts/payeeRegisterSummaries";
import type {
  NewRegisterTransactionInput,
  RegisterSplitLineView,
  RegisterTransactionView,
  TransactionFlag,
} from "../features/accounts/accountRegisterTypes";
import type { BudgetCategoryOption } from "../features/budget/budgetViewTypes";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import { formatDateForDisplay } from "../features/settings/dateFormatting";
import { useDateFormatPreference } from "../features/settings/useDateFormatPreference";
import { useDeveloperPerformanceMode } from "../features/settings/useDeveloperPerformanceMode";
import {
  buildRegisterPerformanceSnapshot,
  formatPerformanceMs,
  getPerformanceNow,
  measureRegisterPerformance,
  type RegisterPerformanceTimings,
} from "../features/performance/registerPerformanceInstrumentation";

const SPLIT_CATEGORY_LABEL = "Split...";

function isSplitCategoryValue(value: string): boolean {
  const normalised = value.trim().toLowerCase();
  return normalised === "split" || normalised === "split...";
}

const ACTIVE_BUDGET_MONTH = "2026-06";

const REGISTER_TABLE_LAYOUT_STORAGE_KEY_PREFIX =
  "budget-app.register-columns.v1";

const REGISTER_COLUMN_DEFINITIONS: readonly TableColumnDefinition<RegisterColumnId>[] =
  [
    { id: "select", label: "Select", template: "2rem", widthRem: 2 },
    { id: "date", label: "Date", template: "6.4rem", widthRem: 6.4 },
    {
      id: "flag",
      label: "Flag",
      template: "2.6rem",
      widthRem: 2.6,
      canHide: true,
    },
    {
      id: "attachments",
      label: "Attachments",
      template: "2.6rem",
      widthRem: 2.6,
      canHide: true,
    },
    {
      id: "payee",
      label: "Payee",
      template: "minmax(9rem, 1.15fr)",
      widthRem: 9,
    },
    {
      id: "category",
      label: "Category",
      template: "minmax(8.5rem, 1fr)",
      widthRem: 8.5,
    },
    {
      id: "memo",
      label: "Memo",
      template: "minmax(7rem, 0.85fr)",
      widthRem: 7,
      canHide: true,
    },
    {
      id: "checkNumber",
      label: "Check #",
      template: "4.5rem",
      widthRem: 4.5,
      canHide: true,
    },
    { id: "outflow", label: "Outflow", template: "6.6rem", widthRem: 6.6 },
    { id: "inflow", label: "Inflow", template: "6.6rem", widthRem: 6.6 },
    {
      id: "runningBalance",
      label: "Running Balance",
      template: "7rem",
      widthRem: 7,
      canHide: true,
    },
    {
      id: "status",
      label: "Cleared",
      template: "2.6rem",
      widthRem: 2.6,
      canHide: true,
    },
  ];

const REGISTER_EDIT_COLUMN_DEFINITIONS: readonly TableColumnDefinition<RegisterColumnId>[] =
  [
    ...REGISTER_COLUMN_DEFINITIONS.filter(
      (column) => column.id !== "runningBalance" && column.id !== "status",
    ),
    { id: "actions", label: "Actions", template: "10rem", widthRem: 10 },
  ];

const REGISTER_COLUMN_LABELS = new Map(
  [...REGISTER_COLUMN_DEFINITIONS, ...REGISTER_EDIT_COLUMN_DEFINITIONS].map(
    (column) => [column.id, column.label] as const,
  ),
);

function isRegisterColumnVisible(
  column: RegisterColumnId,
  visibleColumns: Set<RegisterColumnId>,
) {
  return visibleColumns.has(column);
}

function buildRegisterEditVisibleColumnIds(
  visibleColumnIds: readonly RegisterColumnId[],
): RegisterColumnId[] {
  return REGISTER_EDIT_COLUMN_DEFINITIONS.filter((column) => {
    if (column.id === "actions") {
      return true;
    }

    return visibleColumnIds.includes(column.id);
  }).map((column) => column.id);
}

const REGISTER_ENTRY_INPUT_COLUMN_IDS = new Set<RegisterColumnId>([
  "date",
  "payee",
  "category",
  "memo",
  "checkNumber",
  "outflow",
  "inflow",
]);

function isRegisterEntryInputColumn(column: RegisterColumnId) {
  return REGISTER_ENTRY_INPUT_COLUMN_IDS.has(column);
}

function formatRegisterMonthSeparator(date: string) {
  if (!date) {
    return "Undated";
  }

  const parsedDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Undated";
  }

  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

function normalisePayeeKey(name: string) {
  return name.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function hasSamePayeeName(left: string, right: string) {
  return normalisePayeeKey(left) === normalisePayeeKey(right);
}

function formatPayeeLastUsed(
  value: string | undefined,
  dateFormat: ReturnType<typeof useDateFormatPreference>,
) {
  if (!value) {
    return "Never";
  }

  return formatDateForDisplay(value.slice(0, 10), dateFormat);
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

function normaliseDateParts(
  day: string,
  month: string,
  year: string,
): string | null {
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
        tabIndex={-1}
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

function getPayeeSuggestionSection(
  suggestion: RankedAutocompleteOption<{ payeeId?: string; label: string; type: "payee" | "transfer" }>,
) {
  return suggestion.metadata?.type === "transfer" ? "Transfers" : "Payees";
}

function getPayeeSuggestionText(
  suggestion: RankedAutocompleteOption<{ payeeId?: string; label: string; type: "payee" | "transfer" }>,
) {
  if (suggestion.metadata?.type !== "transfer") {
    return suggestion.value;
  }

  return suggestion.value.replace(/^Transfer:\s*/i, "");
}

function getCategorySuggestionSection(
  suggestion: RankedAutocompleteOption<{ label: string; groupName?: string; type: "category" | "special" }>,
) {
  return suggestion.metadata?.type === "special"
    ? "Special"
    : suggestion.metadata?.groupName ?? suggestion.label ?? "Categories";
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

  const autocompleteOptions = useMemo(
    (): Array<AutocompleteOption<{ payeeId?: string; label: string; type: "payee" | "transfer" }>> => [
      ...transferAccounts.map((account) => ({
        id: `transfer-${account.id}`,
        value: `Transfer: ${account.name}`,
        label: "Transfer",
        metadata: { payeeId: undefined, label: "Transfer", type: "transfer" as const },
      })),
      ...payeeOptions.map((payee) => ({
        id: `payee-${payee.id}`,
        value: payee.name,
        label: "Payee",
        metadata: { payeeId: payee.id, label: "Payee", type: "payee" as const },
      })),
    ],
    [payeeOptions, transferAccounts],
  );

  const suggestions = useMemo(
    () =>
      rankAutocompleteOptions({
        inputValue: value,
        options: autocompleteOptions,
        maxResults: 8,
      }),
    [autocompleteOptions, value],
  );

  const highlightedSuggestion =
    suggestions[
      Math.min(highlightedIndex, Math.max(suggestions.length - 1, 0))
    ];
  const ghostCompletion = getAutocompleteCompletion(
    value,
    highlightedSuggestion?.value,
  );
  const shouldShowGhost = Boolean(ghostCompletion);
  const shouldShowSuggestions = isOpen && suggestions.length > 0;

  function selectSuggestion(
    selectedValue: string,
    selectedPayeeId?: string,
  ) {
    onChange(selectedValue);
    onPayeeIdChange?.(selectedPayeeId);
    setIsOpen(false);
    setHighlightedIndex(0);
  }

  function acceptHighlightedSuggestion() {
    if (!highlightedSuggestion) {
      return false;
    }

    selectSuggestion(
      highlightedSuggestion.value,
      highlightedSuggestion.metadata?.payeeId,
    );
    return true;
  }

  return (
    <div className="register-payee-autocomplete">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onPayeeIdChange?.(undefined);
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "Tab" && !event.shiftKey && shouldShowGhost) {
            acceptHighlightedSuggestion();
            return;
          }

          if (event.key === "ArrowRight" && shouldShowGhost) {
            const input = event.currentTarget;
            const cursorAtEnd =
              input.selectionStart === value.length &&
              input.selectionEnd === value.length;

            if (cursorAtEnd) {
              event.preventDefault();
              acceptHighlightedSuggestion();
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
            acceptHighlightedSuggestion();
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
        <div className="register-payee-suggestions register-autocomplete-popup" role="listbox">
          {suggestions.map((suggestion, index) => {
            const section = getPayeeSuggestionSection(suggestion);
            const previousSection =
              index > 0 ? getPayeeSuggestionSection(suggestions[index - 1]) : null;
            const showSection = section !== previousSection;
            const isTransfer = suggestion.metadata?.type === "transfer";

            return (
              <div key={suggestion.id} className="register-autocomplete-suggestion-block">
                {showSection ? (
                  <div className="register-autocomplete-section-heading">
                    {section}
                  </div>
                ) : null}

                <button
                  type="button"
                  className={
                    index === highlightedIndex
                      ? "register-payee-suggestion register-payee-suggestion-active"
                      : "register-payee-suggestion"
                  }
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectSuggestion(
                      suggestion.value,
                      suggestion.metadata?.payeeId,
                    );
                  }}
                  role="option"
                  aria-selected={index === highlightedIndex}
                >
                  <span className="register-autocomplete-primary">
                    {isTransfer ? <span className="register-autocomplete-icon">↔</span> : null}
                    <span>{getPayeeSuggestionText(suggestion)}</span>
                  </span>
                  {isTransfer ? null : (
                    <small>{suggestion.metadata?.label ?? suggestion.label}</small>
                  )}
                </button>
              </div>
            );
          })}
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
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const autocompleteOptions = useMemo(
    (): Array<AutocompleteOption<{ label: string; groupName?: string; type: "category" | "special" }>> => {
      const categorySuggestions = categoryOptions.map((category) => ({
        id: category.id,
        value: category.name,
        label: category.groupName,
        metadata: { label: category.groupName, groupName: category.groupName, type: "category" as const },
      }));

      const splitSuggestion = includeSplitOption
        ? [
            {
              id: "__split",
              value: SPLIT_CATEGORY_LABEL,
              label: "Special",
              metadata: { label: "Special", type: "special" as const },
            },
          ]
        : [];

      return [...splitSuggestion, ...categorySuggestions];
    },
    [categoryOptions, includeSplitOption],
  );

  const suggestions = useMemo(
    () =>
      rankAutocompleteOptions({
        inputValue: value,
        options: autocompleteOptions,
        maxResults: 8,
        normalise: normaliseCategoryName,
      }),
    [autocompleteOptions, value],
  );

  const highlightedSuggestion =
    suggestions[
      Math.min(highlightedIndex, Math.max(suggestions.length - 1, 0))
    ];
  const ghostCompletion = getAutocompleteCompletion(
    value,
    highlightedSuggestion?.value,
  );
  const shouldShowSuggestions = isOpen && suggestions.length > 0;
  const shouldShowGhost = Boolean(ghostCompletion);

  function selectSuggestion(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
    setHighlightedIndex(0);
  }

  function acceptHighlightedSuggestion() {
    if (!highlightedSuggestion) {
      return false;
    }

    selectSuggestion(highlightedSuggestion.value);
    return true;
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
        onBlur={() => setIsOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Tab" && !event.shiftKey && shouldShowGhost) {
            acceptHighlightedSuggestion();
            return;
          }

          if (event.key === "ArrowRight" && shouldShowGhost) {
            const input = event.currentTarget;
            const cursorAtEnd =
              input.selectionStart === value.length &&
              input.selectionEnd === value.length;

            if (cursorAtEnd) {
              event.preventDefault();
              acceptHighlightedSuggestion();
              return;
            }
          }

          if (event.key === "ArrowDown" && suggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex(
              (current) => (current + 1) % suggestions.length,
            );
            return;
          }

          if (event.key === "ArrowUp" && suggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((current) =>
              current === 0 ? suggestions.length - 1 : current - 1,
            );
            return;
          }

          if (event.key === "Enter" && shouldShowSuggestions) {
            event.preventDefault();
            acceptHighlightedSuggestion();
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
        placeholder="Category"
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
        <div className="register-payee-suggestions register-autocomplete-popup register-category-suggestions" role="listbox">
          {suggestions.map((suggestion, index) => {
            const section = getCategorySuggestionSection(suggestion);
            const previousSection =
              index > 0 ? getCategorySuggestionSection(suggestions[index - 1]) : null;
            const showSection = section !== previousSection;

            return (
              <div key={suggestion.id} className="register-autocomplete-suggestion-block">
                {showSection ? (
                  <div className="register-autocomplete-section-heading">
                    {section}
                  </div>
                ) : null}

                <button
                  type="button"
                  className={
                    index === highlightedIndex
                      ? "register-payee-suggestion register-payee-suggestion-active"
                      : "register-payee-suggestion"
                  }
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectSuggestion(suggestion.value);
                  }}
                  role="option"
                  aria-selected={index === highlightedIndex}
                >
                  <span className="register-autocomplete-primary">{suggestion.value}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
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

function splitDraftsFromTransaction(
  transaction: RegisterTransactionView,
): SplitLineDraft[] {
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
        line.category.length > 0 && (line.outflow > 0 || line.inflow > 0),
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
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
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
  setSplitLines: (
    updater: (current: SplitLineDraft[]) => SplitLineDraft[],
  ) => void;
  categoryOptions: BudgetCategoryOption[];
}) {
  if (splitLines.length === 0) {
    return null;
  }

  const totals = totalsFromSplitLines(
    buildSplitLines(splitLines, categoryOptions),
  );

  return (
    <div className="register-split-editor">
      <div className="register-split-header">
        <strong>Split transaction</strong>
        <span>
          Total:{" "}
          {totals.outflow > 0 ? `Outflow ${totals.outflow.toFixed(2)}` : ""}
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
                        categoryId: findCategoryOption(value, categoryOptions)
                          ?.id,
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
                  item.id === line.id
                    ? { ...item, memo: event.target.value }
                    : item,
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
                  item.id === line.id
                    ? { ...item, outflow: event.target.value }
                    : item,
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
                  item.id === line.id
                    ? { ...item, inflow: event.target.value }
                    : item,
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
              setSplitLines((current) =>
                current.filter((item) => item.id !== line.id),
              )
            }
          >
            Remove
          </button>
        </div>
      ))}

      <button
        className="button button-secondary"
        type="button"
        onClick={() =>
          setSplitLines((current) => [...current, createSplitLineDraft()])
        }
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
  visibleColumns,
  visibleColumnIds,
  rowStyle,
}: {
  initialDate: string;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  visibleColumns: Set<RegisterColumnId>;
  visibleColumnIds: readonly RegisterColumnId[];
  rowStyle: CSSProperties;
  onSave: (input: NewRegisterTransactionInput) => void;
  onSaveAndAddAnother: (input: NewRegisterTransactionInput) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [payee, setPayee] = useState("");
  const [payeeId, setPayeeId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
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
    const parsedOutflow =
      parsedSplitLines.length > 0 ? splitTotals.outflow : parseMoney(outflow);
    const parsedInflow =
      parsedSplitLines.length > 0 ? splitTotals.inflow : parseMoney(inflow);

    const categoryName = category.trim();
    const categoryOption = findCategoryOption(categoryName, categoryOptions);
    const fallbackCategory =
      parsedInflow > 0 && parsedOutflow === 0
        ? "Ready to Assign"
        : "Uncategorised";

    return {
      date,
      payee: payee.trim(),
      payeeId,
      category:
        parsedSplitLines.length > 0
          ? "Split"
          : (categoryOption?.name ?? (categoryName || fallbackCategory)),
      categoryId:
        parsedSplitLines.length > 0
          ? undefined
          : (categoryOption?.id ??
            (fallbackCategory === "Ready to Assign"
              ? "__ready_to_assign__"
              : undefined)),
      memo: memo.trim(),
      checkNumber: checkNumber.trim(),
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
    setCheckNumber("");
    setOutflow("");
    setInflow("");
    setSplitLines([]);
  }

  function handleCategoryChange(value: string) {
    if (isSplitCategoryValue(value)) {
      setCategory(SPLIT_CATEGORY_LABEL);
      setSplitLines((current) =>
        current.length > 0
          ? current
          : [createSplitLineDraft(), createSplitLineDraft()],
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
        style={rowStyle}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCancel();
          }
        }}
      >
        {visibleColumnIds.map((columnId) => {
          if (!isRegisterEntryInputColumn(columnId)) {
            return (
              <span
                aria-hidden="true"
                className="register-entry-placeholder-cell"
                key={columnId}
              />
            );
          }

          if (columnId === "date") {
            return (
              <RegisterDateField
                key={columnId}
                value={date}
                onChange={setDate}
              />
            );
          }

          if (columnId === "payee") {
            return (
              <PayeeInput
                key={columnId}
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
            );
          }

          if (columnId === "category") {
            return (
              <CategoryInput
                key={columnId}
                value={category}
                onChange={handleCategoryChange}
                categoryOptions={categoryOptions}
              />
            );
          }

          if (columnId === "memo") {
            return (
              <input
                key={columnId}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="Memo"
              />
            );
          }

          if (columnId === "checkNumber") {
            return (
              <input
                key={columnId}
                value={checkNumber}
                onChange={(event) => setCheckNumber(event.target.value)}
                placeholder="Check #"
              />
            );
          }

          if (columnId === "outflow") {
            return (
              <input
                key={columnId}
                value={outflow}
                onChange={(event) => setOutflow(event.target.value)}
                placeholder="Outflow"
                inputMode="decimal"
                disabled={splitLines.length > 0}
              />
            );
          }

          if (columnId === "inflow") {
            return (
              <input
                key={columnId}
                value={inflow}
                onChange={(event) => setInflow(event.target.value)}
                placeholder="Inflow"
                inputMode="decimal"
                disabled={splitLines.length > 0}
              />
            );
          }

          return null;
        })}
      </div>

      <div className="register-entry-actions-panel">
        <button
          className="button button-secondary"
          type="button"
          onClick={toggleSplitEditor}
        >
          Split
        </button>
        <div className="register-entry-actions register-entry-commit-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={saveAndAddAnother}
          >
            Save & add another
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={save}
          >
            Save
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={onCancel}
          >
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
  onManageTransactionAttachments,
  categoryOptions,
  transferAccounts,
  payeeOptions,
  visibleColumns,
  rowStyle,
}: {
  transaction: RegisterTransactionView;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  onSave: (input: {
    id: string;
    date: string;
    flag?: TransactionFlag;
    payee: string;
    payeeId?: string;
    category: string;
    categoryId?: string;
    memo?: string;
    checkNumber?: string;
    inflow: number;
    outflow: number;
    splitLines?: RegisterSplitLineView[];
  }) => void;
  onCancel: () => void;
  onManageTransactionAttachments: (transactionId: string) => void;
  visibleColumns: Set<RegisterColumnId>;
  rowStyle: CSSProperties;
}) {
  const [date, setDate] = useState(transaction.date);
  const [flag, setFlag] = useState<TransactionFlag>(transaction.flag);
  const [payee, setPayee] = useState(transaction.payee);
  const [payeeId, setPayeeId] = useState<string | undefined>(
    transaction.payeeId,
  );
  const [category, setCategory] = useState(transaction.category);
  const [memo, setMemo] = useState(transaction.memo ?? "");
  const [checkNumber, setCheckNumber] = useState(transaction.checkNumber ?? "");
  const [outflow, setOutflow] = useState(
    transaction.outflow ? transaction.outflow.toFixed(2) : "",
  );
  const [inflow, setInflow] = useState(
    transaction.inflow ? transaction.inflow.toFixed(2) : "",
  );
  const [splitLines, setSplitLines] = useState<SplitLineDraft[]>(
    splitDraftsFromTransaction(transaction),
  );

  function handleCategoryChange(value: string) {
    if (isSplitCategoryValue(value)) {
      setCategory(SPLIT_CATEGORY_LABEL);
      setSplitLines((current) =>
        current.length > 0
          ? current
          : [createSplitLineDraft(), createSplitLineDraft()],
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
    const parsedOutflow =
      parsedSplitLines.length > 0 ? splitTotals.outflow : parseMoney(outflow);
    const parsedInflow =
      parsedSplitLines.length > 0 ? splitTotals.inflow : parseMoney(inflow);

    const categoryName = category.trim();
    const categoryOption = findCategoryOption(categoryName, categoryOptions);
    const fallbackCategory =
      parsedInflow > 0 && parsedOutflow === 0
        ? "Ready to Assign"
        : "Uncategorised";

    onSave({
      id: transaction.id,
      date,
      flag,
      payee: payee.trim(),
      payeeId,
      category:
        parsedSplitLines.length > 0
          ? "Split"
          : (categoryOption?.name ?? (categoryName || fallbackCategory)),
      categoryId:
        parsedSplitLines.length > 0
          ? undefined
          : (categoryOption?.id ??
            (fallbackCategory === "Ready to Assign"
              ? "__ready_to_assign__"
              : undefined)),
      memo: memo.trim(),
      checkNumber: checkNumber.trim(),
      outflow: parsedOutflow,
      inflow: parsedInflow,
      splitLines: parsedSplitLines.length > 0 ? parsedSplitLines : undefined,
    });
  }

  return (
    <>
      <div
        className="register-row register-row-editing"
        style={rowStyle}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !(event.target instanceof HTMLTextAreaElement)
          ) {
            save();
          }

          if (event.key === "Escape") {
            onCancel();
          }
        }}
      >
        <span className="register-checkbox" aria-hidden="true" />
        <RegisterDateField value={date} onChange={setDate} autoFocus />
        {isRegisterColumnVisible("flag", visibleColumns) ? (
          <InlineFlagPicker value={flag} onChange={setFlag} />
        ) : null}
        {isRegisterColumnVisible("attachments", visibleColumns) ? (
          <AttachmentIndicator
            count={transaction.attachmentCount}
            onClick={() => onManageTransactionAttachments(transaction.id)}
          />
        ) : null}
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
        {isRegisterColumnVisible("memo", visibleColumns) ? (
          <input
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="Memo"
          />
        ) : null}
        {isRegisterColumnVisible("checkNumber", visibleColumns) ? (
          <input
            value={checkNumber}
            onChange={(event) => setCheckNumber(event.target.value)}
            placeholder="Check #"
          />
        ) : null}
        <input
          value={outflow}
          onChange={(event) => setOutflow(event.target.value)}
          placeholder="Outflow"
          inputMode="decimal"
          disabled={splitLines.length > 0}
        />
        <input
          value={inflow}
          onChange={(event) => setInflow(event.target.value)}
          placeholder="Inflow"
          inputMode="decimal"
          disabled={splitLines.length > 0}
        />

        <div className="register-edit-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={save}
          >
            Save
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={toggleSplitEditor}
          >
            Split
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={onCancel}
          >
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

function clampPageForTransactionCount(
  page: number,
  transactionCount: number,
): number {
  return getRegisterPaginationState(
    transactionCount,
    page,
    REGISTER_DEFAULT_PAGE_SIZE,
  ).currentPage;
}

export function AccountRegisterPage() {
  const { accountId = "everyday" } = useParams();
  const persistenceGateway = getAppPersistenceGateway();
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const activeBudgetId = resolveActiveBudgetId(budgets, selectedBudgetId);
  const accountsPersistence = persistenceGateway.accounts;
  const payeesPersistence = persistenceGateway.payees;
  const categoriesPersistence = persistenceGateway.categories;
  const scheduledTransactionsPersistence =
    persistenceGateway.scheduledTransactions;
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
    renamePayeeReferences,
    reassignPayeeReferences,
  } = useAccountRegister(accountId);

  const [showEntryRow, setShowEntryRow] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null);
  const [lastEntryDate, setLastEntryDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [categoryOptions, setCategoryOptions] = useState<
    BudgetCategoryOption[]
  >([]);
  const [payeeOptions, setPayeeOptions] = useState<PayeeView[]>([]);
  const [archivedPayeeOptions, setArchivedPayeeOptions] = useState<PayeeView[]>(
    [],
  );
  const [transferAccounts, setTransferAccounts] = useState<SidebarAccount[]>(
    [],
  );
  const [isScheduledOpen, setIsScheduledOpen] = useState(false);
  const [scheduledDueCount, setScheduledDueCount] = useState(0);
  const [isPayeeManagerOpen, setIsPayeeManagerOpen] = useState(false);
  const [selectedPayeeId, setSelectedPayeeId] = useState<string | null>(null);
  const [payeeRenameDraft, setPayeeRenameDraft] = useState("");
  const [payeeMergeTargetId, setPayeeMergeTargetId] = useState("");
  const [payeeManagerMessage, setPayeeManagerMessage] = useState<string | null>(
    null,
  );
  const [payeeManagerError, setPayeeManagerError] = useState<string | null>(
    null,
  );
  const [attachmentTransactionId, setAttachmentTransactionId] = useState<
    string | null
  >(null);
  const [isTransactionImportOpen, setIsTransactionImportOpen] = useState(false);
  const [registerPage, setRegisterPage] = useState(1);
  const dateFormat = useDateFormatPreference();
  const developerPerformanceMode = useDeveloperPerformanceMode();
  const registerPerformanceTimingsRef = useRef<RegisterPerformanceTimings>({});
  const registerRenderStartedAt = getPerformanceNow(developerPerformanceMode);

  if (developerPerformanceMode) {
    registerPerformanceTimingsRef.current = {};
  }

  useEffect(() => {
    setRegisterPage(1);
  }, [accountId]);

  const registerTableLayout = useTableLayout<RegisterColumnId>({
    storageKeyPrefix: REGISTER_TABLE_LAYOUT_STORAGE_KEY_PREFIX,
    scopeId: activeBudgetId,
    columns: REGISTER_COLUMN_DEFINITIONS,
    minimumWidthRem: 58,
  });

  const registerEditVisibleColumnIds = useMemo(
    () =>
      buildRegisterEditVisibleColumnIds(registerTableLayout.visibleColumnIds),
    [registerTableLayout.visibleColumnIds],
  );

  const registerEditColumnSet = useMemo(
    () => new Set<RegisterColumnId>(registerEditVisibleColumnIds),
    [registerEditVisibleColumnIds, registerTableLayout.columnWidths],
  );

  const registerEditRowStyle = useMemo(
    () =>
      buildTableRowStyle(
        REGISTER_EDIT_COLUMN_DEFINITIONS,
        registerEditVisibleColumnIds,
        72,
        registerTableLayout.columnWidths,
      ),
    [registerEditVisibleColumnIds, registerTableLayout.columnWidths],
  );


  const registerEntryVisibleColumnIds = registerTableLayout.visibleColumnIds;

  const registerEntryColumnSet = registerTableLayout.visibleColumnSet;

  const registerEntryRowStyle = registerTableLayout.rowStyle;

  useEffect(() => {
    let isMounted = true;

    if (!activeBudgetId) {
      setCategoryOptions([]);
      return () => {
        isMounted = false;
      };
    }

    void categoriesPersistence
      .getCategoryOptions({
        budgetId: activeBudgetId,
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
  }, [activeBudgetId, categoriesPersistence]);

  async function refreshPayees(): Promise<PayeeView[]> {
    const [payees, archivedPayees] = await Promise.all([
      payeesPersistence.listPayees(),
      payeesPersistence.listArchivedPayees(),
    ]);

    setPayeeOptions(payees);
    setArchivedPayeeOptions(archivedPayees);
    return payees;
  }

  useEffect(() => {
    let isMounted = true;

    void Promise.all([
      payeesPersistence.listPayees(),
      payeesPersistence.listArchivedPayees(),
    ]).then(([payees, archivedPayees]) => {
      if (isMounted) {
        setPayeeOptions(payees);
        setArchivedPayeeOptions(archivedPayees);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [payeesPersistence]);

  useEffect(() => {
    let active = true;

    accountsPersistence.listAccounts().then((loadedAccounts) => {
      if (active) {
        setTransferAccounts(
          loadedAccounts.filter((account) => account.id !== accountId),
        );
      }
    });

    return () => {
      active = false;
    };
  }, [accountId, accountsPersistence]);

  const registerTransactions = data?.transactions ?? [];
  const registerPagination = getRegisterPaginationState(
    registerTransactions.length,
    registerPage,
    REGISTER_DEFAULT_PAGE_SIZE,
  );

  useEffect(() => {
    setRegisterPage((currentPage) =>
      clampPageForTransactionCount(currentPage, registerTransactions.length),
    );
  }, [registerTransactions.length]);

  const visibleTransactions = useMemo(
    () =>
      measureRegisterPerformance(
        developerPerformanceMode,
        registerPerformanceTimingsRef.current,
        "visible pagination",
        () =>
          paginateRegisterItems(
            registerTransactions,
            registerPagination.currentPage,
            registerPagination.pageSize,
          ),
      ),
    [
      registerTransactions,
      registerPagination.currentPage,
      registerPagination.pageSize,
      developerPerformanceMode,
    ],
  );

  const transactionById = useMemo(
    () =>
      measureRegisterPerformance(
        developerPerformanceMode,
        registerPerformanceTimingsRef.current,
        "transaction index",
        () =>
          new Map(
            registerTransactions.map((transaction) => [
              transaction.id,
              transaction,
            ]),
          ),
      ),
    [registerTransactions, developerPerformanceMode],
  );

  const allManagedPayees = useMemo(
    () => [...payeeOptions, ...archivedPayeeOptions],
    [payeeOptions, archivedPayeeOptions],
  );

  const payeeSummaries = useMemo(
    () =>
      isPayeeManagerOpen
        ? measureRegisterPerformance(
            developerPerformanceMode,
            registerPerformanceTimingsRef.current,
            "payee summary build",
            () =>
              buildPayeeRegisterSummaries(
                allManagedPayees,
                registerTransactions,
              ),
          )
        : [],
    [
      allManagedPayees,
      registerTransactions,
      isPayeeManagerOpen,
      developerPerformanceMode,
    ],
  );

  const activePayeeSummaries = useMemo(
    () => payeeSummaries.filter((summary) => !summary.payee.isArchived),
    [payeeSummaries],
  );

  const archivedPayeeSummaries = useMemo(
    () => payeeSummaries.filter((summary) => summary.payee.isArchived),
    [payeeSummaries],
  );

  const selectedPayeeSummary = useMemo(
    () =>
      payeeSummaries.find((summary) => summary.payee.id === selectedPayeeId) ??
      null,
    [payeeSummaries, selectedPayeeId],
  );

  const mergeTargetOptions = useMemo(
    () =>
      selectedPayeeSummary
        ? activePayeeSummaries.filter(
            (summary) => summary.payee.id !== selectedPayeeSummary.payee.id,
          )
        : [],
    [activePayeeSummaries, selectedPayeeSummary],
  );

  const registerPerformanceSnapshot = buildRegisterPerformanceSnapshot({
    enabled: developerPerformanceMode,
    renderStartedAt: registerRenderStartedAt,
    totalTransactions: registerTransactions.length,
    visibleTransactions: visibleTransactions.length,
    currentPage: registerPagination.currentPage,
    totalPages: registerPagination.totalPages,
    pageSize: registerPagination.pageSize,
    payeeManagerOpen: isPayeeManagerOpen,
    payeeSummaryCount: payeeSummaries.length,
    selectedTransaction: Boolean(selectedTransactionId),
    editingTransaction: Boolean(editingTransactionId),
    timings: registerPerformanceTimingsRef.current,
  });

  const handleSelectTransaction = useCallback(
    (transactionId: string) => {
      selectTransaction(transactionId);
    },
    [selectTransaction],
  );

  const handleEditTransaction = useCallback(
    (transactionId: string) => {
      selectTransaction(transactionId);
      setShowEntryRow(false);
      setEditingTransactionId(transactionId);
    },
    [selectTransaction],
  );

  const handleToggleClearedTransaction = useCallback(
    (transactionId: string) => {
      void toggleCleared(transactionId);
    },
    [toggleCleared],
  );

  const handleManageTransactionAttachments = useCallback(
    (transactionId: string) => {
      selectTransaction(transactionId);
      setAttachmentTransactionId(transactionId);
    },
    [selectTransaction],
  );

  const handleUpdateTransactionFlag = useCallback(
    (transaction: RegisterTransactionView, flag: TransactionFlag) => {
      if (transaction.flag === flag) {
        return;
      }

      void updateTransaction({
        id: transaction.id,
        date: transaction.date,
        flag,
        payee: transaction.payee,
        payeeId: transaction.payeeId,
        category: transaction.category,
        categoryId: transaction.categoryId,
        memo: transaction.memo,
        checkNumber: transaction.checkNumber,
        inflow: transaction.inflow,
        outflow: transaction.outflow,
        splitLines: transaction.splitLines,
      });
    },
    [updateTransaction],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Enter" ||
        !selectedTransactionId ||
        editingTransactionId
      ) {
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
    ? (transactionById.get(attachmentTransactionId) ?? null)
    : null;

  async function handleRenamePayee() {
    if (!selectedPayeeSummary) {
      return;
    }

    const nextName = payeeRenameDraft.replace(/\s+/g, " ").trim();

    setPayeeManagerMessage(null);
    setPayeeManagerError(null);

    if (!nextName) {
      setPayeeManagerError("Enter a payee name before saving.");
      return;
    }

    if (hasSamePayeeName(nextName, selectedPayeeSummary.payee.name)) {
      setPayeeManagerMessage("Payee name is unchanged.");
      return;
    }

    const duplicate = allManagedPayees.find(
      (payee) =>
        payee.id !== selectedPayeeSummary.payee.id &&
        hasSamePayeeName(payee.name, nextName),
    );

    if (duplicate) {
      setPayeeManagerError(
        "Another payee already uses that name. Merge payees will be added separately.",
      );
      return;
    }

    const previousName = selectedPayeeSummary.payee.name;

    await payeesPersistence.renamePayee({
      id: selectedPayeeSummary.payee.id,
      name: nextName,
    });
    await scheduledTransactionsPersistence.renamePayeeReferences({
      payeeId: selectedPayeeSummary.payee.id,
      previousName,
      nextName,
    });
    await renamePayeeReferences({
      payeeId: selectedPayeeSummary.payee.id,
      previousName,
      nextName,
    });
    await refreshPayees();

    setPayeeRenameDraft(nextName);
    setPayeeManagerMessage(`Renamed ${previousName} to ${nextName}.`);
  }

  async function handleArchiveSelectedPayee() {
    if (!selectedPayeeSummary || selectedPayeeSummary.payee.isArchived) {
      return;
    }

    setPayeeManagerMessage(null);
    setPayeeManagerError(null);

    const payeeName = selectedPayeeSummary.payee.name;
    await payeesPersistence.archivePayee(selectedPayeeSummary.payee.id);
    await refreshPayees();
    setPayeeManagerMessage(
      `Archived ${payeeName}. Existing transactions still keep this payee.`,
    );
  }

  async function handleRestoreSelectedPayee() {
    if (!selectedPayeeSummary || !selectedPayeeSummary.payee.isArchived) {
      return;
    }

    setPayeeManagerMessage(null);
    setPayeeManagerError(null);

    const payeeName = selectedPayeeSummary.payee.name;
    await payeesPersistence.restorePayee(selectedPayeeSummary.payee.id);
    await refreshPayees();
    setPayeeManagerMessage(
      `Restored ${payeeName}. It will appear in payee suggestions again.`,
    );
  }

  async function handleMergeSelectedPayee() {
    if (!selectedPayeeSummary) {
      return;
    }

    setPayeeManagerMessage(null);
    setPayeeManagerError(null);

    if (selectedPayeeSummary.payee.isArchived) {
      setPayeeManagerError(
        "Restore this payee before merging it into another payee.",
      );
      return;
    }

    const targetSummary = activePayeeSummaries.find(
      (summary) => summary.payee.id === payeeMergeTargetId,
    );

    if (!targetSummary) {
      setPayeeManagerError("Choose an active target payee before merging.");
      return;
    }

    const sourcePayee = selectedPayeeSummary.payee;
    const targetPayee = targetSummary.payee;

    await payeesPersistence.mergePayees({
      sourcePayeeId: sourcePayee.id,
      targetPayeeId: targetPayee.id,
    });
    await scheduledTransactionsPersistence.reassignPayeeReferences({
      sourcePayeeId: sourcePayee.id,
      sourceName: sourcePayee.name,
      targetPayeeId: targetPayee.id,
      targetName: targetPayee.name,
    });
    await reassignPayeeReferences({
      sourcePayeeId: sourcePayee.id,
      sourceName: sourcePayee.name,
      targetPayeeId: targetPayee.id,
      targetName: targetPayee.name,
    });
    await refreshPayees();

    setSelectedPayeeId(targetPayee.id);
    setPayeeRenameDraft(targetPayee.name);
    setPayeeMergeTargetId("");
    setPayeeManagerMessage(
      `Merged ${sourcePayee.name} into ${targetPayee.name}. Historical references now use ${targetPayee.name}.`,
    );
  }

  return (
    <div className="register-workspace">
      <section className="register-clean-header">
        <div>
          <h1>{data.accountName}</h1>
          <p className="muted">
            Keyboard-first date entry · Save & add another
          </p>
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

            <ColumnVisibilityMenu
              label="Columns ▾"
              columns={REGISTER_COLUMN_DEFINITIONS}
              visibleColumnSet={registerTableLayout.visibleColumnSet}
              onToggleColumn={registerTableLayout.toggleColumn}
              onReset={registerTableLayout.resetLayout}
            />

            <button
              className="button button-secondary"
              type="button"
              onClick={() => setIsTransactionImportOpen(true)}
            >
              Import
            </button>

            <button className="button button-secondary" type="button" disabled>
              Reconcile
            </button>

            <DropdownMenu
              label="More ▾"
              ariaLabel="Register actions"
              className="register-more-menu"
              panelClassName="register-more-menu-panel"
            >
              {({ closeMenu }) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsPayeeManagerOpen(true);
                      closeMenu({ restoreFocus: true });
                    }}
                  >
                    Manage Payees
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsScheduledOpen((current) => !current);
                      closeMenu({ restoreFocus: true });
                    }}
                  >
                    Scheduled Transactions
                    {scheduledDueCount > 0 ? ` (${scheduledDueCount})` : ""}
                  </button>
                </>
              )}
            </DropdownMenu>
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
                  <p>
                    Archive unused payees without changing historical
                    transactions.
                  </p>
                </div>

                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setIsPayeeManagerOpen(false)}
                >
                  Close
                </button>
              </div>

              {payeeManagerError && (
                <p className="payee-manager-error">{payeeManagerError}</p>
              )}
              {payeeManagerMessage && (
                <p className="payee-manager-message">{payeeManagerMessage}</p>
              )}

              {payeeSummaries.length === 0 ? (
                <p className="payee-manager-placeholder">
                  No saved payees yet. Payees will appear here after you enter
                  transactions.
                </p>
              ) : (
                <div className="payee-manager-content">
                  <div
                    className="payee-manager-list"
                    role="table"
                    aria-label="Saved payees"
                  >
                    <div className="payee-manager-list-head" role="row">
                      <span>Payee</span>
                      <span>Register transactions</span>
                      <span>Last used</span>
                    </div>

                    {activePayeeSummaries.length > 0 && (
                      <div className="payee-manager-section-label">Active</div>
                    )}

                    {activePayeeSummaries.map((summary) => (
                      <button
                        className={`payee-manager-list-row${
                          selectedPayeeId === summary.payee.id
                            ? " payee-manager-list-row-selected"
                            : ""
                        }`}
                        type="button"
                        role="row"
                        key={summary.payee.id}
                        onClick={() => {
                          setSelectedPayeeId(summary.payee.id);
                          setPayeeRenameDraft(summary.payee.name);
                          setPayeeMergeTargetId("");
                          setPayeeManagerMessage(null);
                          setPayeeManagerError(null);
                        }}
                      >
                        <span>
                          <strong>{summary.payee.name}</strong>
                        </span>
                        <span>{summary.registerTransactionCount}</span>
                        <span>
                          {formatPayeeLastUsed(summary.lastUsed, dateFormat)}
                        </span>
                      </button>
                    ))}

                    {archivedPayeeSummaries.length > 0 && (
                      <div className="payee-manager-section-label">
                        Archived
                      </div>
                    )}

                    {archivedPayeeSummaries.map((summary) => (
                      <button
                        className={`payee-manager-list-row payee-manager-list-row-archived${
                          selectedPayeeId === summary.payee.id
                            ? " payee-manager-list-row-selected"
                            : ""
                        }`}
                        type="button"
                        role="row"
                        key={summary.payee.id}
                        onClick={() => {
                          setSelectedPayeeId(summary.payee.id);
                          setPayeeRenameDraft(summary.payee.name);
                          setPayeeMergeTargetId("");
                          setPayeeManagerMessage(null);
                          setPayeeManagerError(null);
                        }}
                      >
                        <span>
                          <strong>{summary.payee.name}</strong>
                          <em>Archived</em>
                        </span>
                        <span>{summary.registerTransactionCount}</span>
                        <span>
                          {formatPayeeLastUsed(summary.lastUsed, dateFormat)}
                        </span>
                      </button>
                    ))}
                  </div>

                  <aside
                    className="payee-manager-detail"
                    aria-label="Selected payee details"
                  >
                    {selectedPayeeSummary ? (
                      <>
                        <div>
                          <h3>{selectedPayeeSummary.payee.name}</h3>
                          <p className="muted">
                            {selectedPayeeSummary.payee.isArchived
                              ? "Archived"
                              : "Active"}{" "}
                            · {selectedPayeeSummary.registerTransactionCount}{" "}
                            register transaction
                            {selectedPayeeSummary.registerTransactionCount === 1
                              ? ""
                              : "s"}{" "}
                            · Last used{" "}
                            {formatPayeeLastUsed(
                              selectedPayeeSummary.lastUsed,
                              dateFormat,
                            )}
                          </p>
                        </div>

                        <label className="field-label">
                          Rename payee
                          <input
                            className="text-input"
                            value={payeeRenameDraft}
                            onChange={(event) =>
                              setPayeeRenameDraft(event.target.value)
                            }
                          />
                        </label>

                        {!selectedPayeeSummary.payee.isArchived &&
                          mergeTargetOptions.length > 0 && (
                            <div className="payee-manager-merge-box">
                              <label className="field-label">
                                Merge into
                                <select
                                  className="text-input"
                                  value={payeeMergeTargetId}
                                  onChange={(event) =>
                                    setPayeeMergeTargetId(event.target.value)
                                  }
                                >
                                  <option value="">Choose target payee…</option>
                                  {mergeTargetOptions.map((summary) => (
                                    <option
                                      key={summary.payee.id}
                                      value={summary.payee.id}
                                    >
                                      {summary.payee.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <p className="muted">
                                Merge reassigns existing transactions and
                                scheduled transactions to the target, then
                                archives this payee.
                              </p>
                            </div>
                          )}

                        <div className="payee-manager-detail-actions">
                          <button
                            className="button button-primary"
                            type="button"
                            onClick={() => {
                              void handleRenamePayee();
                            }}
                          >
                            Save rename
                          </button>

                          {!selectedPayeeSummary.payee.isArchived && (
                            <button
                              className="button button-secondary"
                              type="button"
                              disabled={!payeeMergeTargetId}
                              onClick={() => {
                                void handleMergeSelectedPayee();
                              }}
                            >
                              Merge payee
                            </button>
                          )}

                          {selectedPayeeSummary.payee.isArchived ? (
                            <button
                              className="button button-secondary"
                              type="button"
                              onClick={() => {
                                void handleRestoreSelectedPayee();
                              }}
                            >
                              Restore payee
                            </button>
                          ) : (
                            <button
                              className="button button-secondary"
                              type="button"
                              onClick={() => {
                                void handleArchiveSelectedPayee();
                              }}
                            >
                              Archive payee
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="payee-manager-placeholder">
                        Select a payee to rename, archive, or restore it.
                      </p>
                    )}
                  </aside>
                </div>
              )}
            </Card>
          </div>
        )}

        {isTransactionImportOpen && (
          <TransactionImportDialog
            accountName={data.accountName}
            transactions={data.transactions}
            currencyCode={data.currencyCode}
            onClose={() => setIsTransactionImportOpen(false)}
            onImportTransactions={async (transactions) => {
              for (const transaction of transactions) {
                await addTransaction(transaction);
              }
            }}
          />
        )}


        {selectedTransactionId && !editingTransactionId && (
          <div className="register-selection-bar">
            <span>1 selected</span>
            <button
              type="button"
              onClick={() => setEditingTransactionId(selectedTransactionId)}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setAttachmentTransactionId(selectedTransactionId)}
            >
              Attach
            </button>
            <button type="button" disabled>
              Duplicate
            </button>
            <button type="button" disabled>
              Move
            </button>
            <button type="button" disabled>
              Flag
            </button>
            <button type="button" disabled>
              Add note
            </button>
            <button
              type="button"
              onClick={() => {
                const confirmed = confirmDialog({
                  message:
                    "Delete this transaction? This cannot be undone yet.",
                });

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
          <div
            className="register-row register-head register-row-with-attachments"
            style={registerTableLayout.rowStyle}
          >
            {registerTableLayout.visibleColumns.map((column) => (
              <span
                className={
                  column.id === "attachments"
                    ? "register-head-icon table-layout-resizable-head-cell"
                    : "table-layout-resizable-head-cell"
                }
                key={column.id}
                aria-label={
                  column.id === "attachments" ? "Attachments" : undefined
                }
              >
                {column.id === "attachments" ? (
                  <Paperclip size={13} />
                ) : column.id === "runningBalance" ? (
                  "Balance"
                ) : column.id === "status" ? (
                  "C"
                ) : column.id === "select" ? (
                  ""
                ) : (
                  column.label
                )}
                <ColumnResizeHandle
                  columnId={column.id}
                  label={column.label}
                  onResizeStart={registerTableLayout.startColumnResize}
                  onNudgeColumnWidth={registerTableLayout.nudgeColumnWidth}
                  onResetColumnWidth={registerTableLayout.resetColumnWidth}
                />
              </span>
            ))}
          </div>

          {showEntryRow && (
            <TransactionEntryRow
              initialDate={lastEntryDate}
              categoryOptions={categoryOptions}
              transferAccounts={transferAccounts}
              payeeOptions={payeeOptions}
              visibleColumns={registerEntryColumnSet}
              visibleColumnIds={registerEntryVisibleColumnIds}
              rowStyle={registerEntryRowStyle}
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

          {visibleTransactions.map((transaction, transactionIndex) => {
            const previousTransaction =
              transactionIndex > 0 ? visibleTransactions[transactionIndex - 1] : null;
            const showMonthSeparator =
              transactionIndex === 0 ||
              formatRegisterMonthSeparator(previousTransaction?.date ?? "") !==
                formatRegisterMonthSeparator(transaction.date);

            return (
              <div className="register-transaction-with-month" key={transaction.id}>
                {showMonthSeparator ? (
                  <div className="register-month-separator">
                    {formatRegisterMonthSeparator(transaction.date)}
                  </div>
                ) : null}
                {editingTransactionId === transaction.id ? (
                  <TransactionEditRow
                    transaction={transaction}
                    categoryOptions={categoryOptions}
                    transferAccounts={transferAccounts}
                    payeeOptions={payeeOptions}
                    onSave={(input) => {
                      updateTransaction(input);
                      setEditingTransactionId(null);
                    }}
                    onCancel={() => setEditingTransactionId(null)}
                    onManageTransactionAttachments={
                      handleManageTransactionAttachments
                    }
                    visibleColumns={registerEditColumnSet}
                    rowStyle={registerEditRowStyle}
                  />
                ) : (
                  <TransactionRow
                    transaction={transaction}
                    currencyCode={data.currencyCode}
                    dateFormat={dateFormat}
                    isSelected={selectedTransactionId === transaction.id}
                    onSelectTransaction={handleSelectTransaction}
                    onEditTransaction={handleEditTransaction}
                    onToggleClearedTransaction={handleToggleClearedTransaction}
                    onManageTransactionAttachments={
                      handleManageTransactionAttachments
                    }
                    onUpdateTransactionFlag={handleUpdateTransactionFlag}
                    visibleColumns={registerTableLayout.visibleColumnSet}
                    rowStyle={registerTableLayout.rowStyle}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="register-pagination" aria-label="Register pagination">
          <span>
            Showing {registerPagination.visibleStart}–
            {registerPagination.visibleEnd} of {registerPagination.totalItems}
          </span>
          <div className="register-pagination-controls">
            <button
              className="button button-secondary"
              type="button"
              disabled={!registerPagination.hasPreviousPage}
              onClick={() =>
                setRegisterPage((currentPage) => Math.max(1, currentPage - 1))
              }
            >
              Previous
            </button>
            <strong>
              Page {registerPagination.currentPage} of{" "}
              {registerPagination.totalPages}
            </strong>
            <button
              className="button button-secondary"
              type="button"
              disabled={!registerPagination.hasNextPage}
              onClick={() =>
                setRegisterPage((currentPage) =>
                  Math.min(registerPagination.totalPages, currentPage + 1),
                )
              }
            >
              Next
            </button>
          </div>
        </div>

        {registerPerformanceSnapshot ? (
          <section
            className={`register-performance-panel register-performance-panel-${registerPerformanceSnapshot.warningLevel}`}
            aria-label="Register performance diagnostics"
          >
            <div>
              <p className="eyebrow">Developer performance mode</p>
              <h3>Register diagnostics</h3>
              <p className="muted">
                {registerPerformanceSnapshot.visibleTransactions} visible of{" "}
                {registerPerformanceSnapshot.totalTransactions} transactions ·
                page {registerPerformanceSnapshot.currentPage} of{" "}
                {registerPerformanceSnapshot.totalPages}
              </p>
            </div>
            <div className="register-performance-grid">
              <span>
                <strong>
                  {formatPerformanceMs(
                    registerPerformanceSnapshot.renderElapsedMs,
                  )}
                </strong>
                <small>Render pass</small>
              </span>
              <span>
                <strong>
                  {formatPerformanceMs(
                    registerPerformanceSnapshot.timings["visible pagination"],
                  )}
                </strong>
                <small>Pagination</small>
              </span>
              <span>
                <strong>
                  {formatPerformanceMs(
                    registerPerformanceSnapshot.timings["transaction index"],
                  )}
                </strong>
                <small>Transaction index</small>
              </span>
              <span>
                <strong>
                  {formatPerformanceMs(
                    registerPerformanceSnapshot.timings["payee summary build"],
                  )}
                </strong>
                <small>Payee summaries</small>
              </span>
              <span>
                <strong>{registerPerformanceSnapshot.pageSize}</strong>
                <small>Rows per page</small>
              </span>
              <span>
                <strong>
                  {registerPerformanceSnapshot.payeeManagerOpen
                    ? "Open"
                    : "Closed"}
                </strong>
                <small>Payee manager</small>
              </span>
            </div>
          </section>
        ) : null}
      </Card>

      {attachmentTransaction && (
        <AttachmentManager
          transaction={attachmentTransaction}
          onClose={() => setAttachmentTransactionId(null)}
          onAddAttachment={(file) =>
            addAttachment(attachmentTransaction.id, file)
          }
          onRemoveAttachment={(attachmentId) =>
            removeAttachment(attachmentTransaction.id, attachmentId)
          }
        />
      )}

      <div className="register-legend">
        <span>
          <span className="transaction-flag transaction-flag-red" /> Needs
          attention
        </span>
        <span>
          <span className="transaction-flag transaction-flag-orange" /> Waiting
          for receipt
        </span>
        <span>
          <span className="transaction-flag transaction-flag-yellow" /> Tax
          related
        </span>
        <span>
          <span className="transaction-flag transaction-flag-green" />{" "}
          Reimbursable
        </span>
        <span>
          <span className="transaction-flag transaction-flag-blue" /> Business
        </span>
        <span>
          <span className="transaction-flag transaction-flag-purple" /> Review
          later
        </span>
        <span className="register-legend-spacer" />
        <span>
          <Paperclip size={13} /> Attachment
        </span>
        <span>
          <span className="register-status register-status-cleared">C</span>{" "}
          Cleared
        </span>
        <span>
          <span className="register-status register-status-empty" /> Uncleared
        </span>
      </div>
    </div>
  );
}
