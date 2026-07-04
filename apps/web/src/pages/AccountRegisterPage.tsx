import { CalendarDays, Paperclip } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { SelectionBar } from "../components/ui/SelectionBar";
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
  useRegisterLayoutMode,
  type RegisterLayoutMode,
} from "../features/accounts/registerLayoutMode";
import {
  REGISTER_DEFAULT_PAGE_SIZE,
  getRegisterPaginationState,
  paginateRegisterItems,
} from "../features/accounts/registerPagination";
import { useRegisterSelection } from "../features/accounts/useRegisterSelection";
import { useRegisterSelectionActions } from "../features/accounts/useRegisterSelectionActions";
import type { SidebarAccount } from "../features/accounts/accountService";
import { getAppPersistenceGateway } from "../features/persistence";
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
    {
      id: "select",
      label: "Select",
      template: "1.8rem",
      widthRem: 1.8,
      minWidthRem: 1.6,
    },
    {
      id: "date",
      label: "Date",
      template: "minmax(5.2rem, 6.4rem)",
      widthRem: 6.4,
      minWidthRem: 5.2,
    },
    {
      id: "flag",
      label: "Flag",
      template: "2.2rem",
      widthRem: 2.2,
      minWidthRem: 2,
      canHide: true,
    },
    {
      id: "attachments",
      label: "Attachments",
      template: "2.2rem",
      widthRem: 2.2,
      minWidthRem: 2,
      canHide: true,
    },
    {
      id: "payee",
      label: "Payee",
      template: "minmax(6.5rem, 1.45fr)",
      widthRem: 11,
      minWidthRem: 6.5,
    },
    {
      id: "category",
      label: "Category",
      template: "minmax(6.5rem, 1.2fr)",
      widthRem: 10,
      minWidthRem: 6.5,
    },
    {
      id: "memo",
      label: "Memo",
      template: "minmax(5.5rem, 1.3fr)",
      widthRem: 10,
      minWidthRem: 5.5,
      canHide: true,
    },
    {
      id: "checkNumber",
      label: "Check #",
      template: "minmax(3.4rem, 4.5rem)",
      widthRem: 4.5,
      minWidthRem: 3.4,
      canHide: true,
    },
    {
      id: "amount",
      label: "Amount",
      template: "minmax(6.4rem, 8.4rem)",
      widthRem: 8.4,
      minWidthRem: 6.4,
    },
    {
      id: "runningBalance",
      label: "Running Balance",
      template: "minmax(6.2rem, 7.5rem)",
      widthRem: 7.5,
      minWidthRem: 6.2,
      canHide: true,
    },
    {
      id: "status",
      label: "Cleared",
      template: "2.2rem",
      widthRem: 2.2,
      minWidthRem: 2,
      canHide: true,
    },
  ];

const REGISTER_OUTFLOW_COLUMN_DEFINITION: TableColumnDefinition<RegisterColumnId> = {
  id: "outflow",
  label: "Outflow",
  template: "minmax(5.6rem, 7.2rem)",
  widthRem: 7.2,
  minWidthRem: 5.6,
};

const REGISTER_INFLOW_COLUMN_DEFINITION: TableColumnDefinition<RegisterColumnId> = {
  id: "inflow",
  label: "Inflow",
  template: "minmax(5.6rem, 7.2rem)",
  widthRem: 7.2,
  minWidthRem: 5.6,
};

const REGISTER_EDIT_COLUMN_DEFINITIONS: readonly TableColumnDefinition<RegisterColumnId>[] =
  REGISTER_COLUMN_DEFINITIONS.flatMap((column) => {
    if (column.id === "amount") {
      return [REGISTER_OUTFLOW_COLUMN_DEFINITION, REGISTER_INFLOW_COLUMN_DEFINITION];
    }

    if (column.id === "runningBalance" || column.id === "status") {
      return [];
    }

    return [column];
  });

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
  const editColumnIds: RegisterColumnId[] = [];

  for (const columnId of visibleColumnIds) {
    if (columnId === "amount") {
      editColumnIds.push("outflow", "inflow");
      continue;
    }

    if (columnId !== "runningBalance" && columnId !== "status") {
      editColumnIds.push(columnId);
    }
  }

  return editColumnIds;
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



type RegisterSearchScope = "all" | "payee" | "category" | "memo" | "amount";

interface RegisterSearchCommit {
  query: string;
  scope: RegisterSearchScope;
  label: string;
}

interface RegisterSearchSuggestion {
  id: string;
  group: "payees" | "categories" | "memos" | "search";
  label: string;
  detail?: string;
  query: string;
  scope: RegisterSearchScope;
  count: number;
}

const REGISTER_SEARCH_SCOPE_LABELS: Record<RegisterSearchScope, string> = {
  all: "all fields",
  payee: "payees",
  category: "categories",
  memo: "memos",
  amount: "amounts",
};

function normaliseSearchText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function amountSearchTokens(transaction: RegisterTransactionView): string[] {
  const amounts = [transaction.outflow, transaction.inflow].filter(
    (amount) => amount > 0,
  );

  return amounts.flatMap((amount) => {
    const fixed = amount.toFixed(2);
    return [fixed, fixed.replace(/\.00$/, ""), String(amount)];
  });
}

function transactionMatchesSearch(
  transaction: RegisterTransactionView,
  search: RegisterSearchCommit,
): boolean {
  const query = normaliseSearchText(search.query);

  if (!query) {
    return true;
  }

  const splitCategories = transaction.splitLines?.map((line) => line.category) ?? [];
  const splitMemos = transaction.splitLines?.map((line) => line.memo ?? "") ?? [];

  const payeeText = normaliseSearchText(transaction.payee);
  const categoryText = normaliseSearchText(
    [transaction.category, ...splitCategories].join(" "),
  );
  const memoText = normaliseSearchText(
    [transaction.memo, transaction.checkNumber, ...splitMemos].join(" "),
  );
  const amountText = amountSearchTokens(transaction).join(" ").toLocaleLowerCase();

  switch (search.scope) {
    case "payee":
      return payeeText.includes(query);
    case "category":
      return categoryText.includes(query);
    case "memo":
      return memoText.includes(query);
    case "amount":
      return amountText.includes(query);
    case "all":
    default:
      return (
        payeeText.includes(query) ||
        categoryText.includes(query) ||
        memoText.includes(query) ||
        amountText.includes(query)
      );
  }
}

function countMatchingTransactions(
  transactions: readonly RegisterTransactionView[],
  query: string,
  scope: RegisterSearchScope,
): number {
  return transactions.filter((transaction) =>
    transactionMatchesSearch(transaction, {
      query,
      scope,
      label: query,
    }),
  ).length;
}

function buildRegisterSearchSuggestions(
  transactions: readonly RegisterTransactionView[],
  query: string,
): RegisterSearchSuggestion[] {
  const normalisedQuery = normaliseSearchText(query);

  if (!normalisedQuery) {
    return [];
  }

  const byPayee = new Map<string, { label: string; count: number }>();
  const byCategory = new Map<string, { label: string; count: number }>();
  const byMemo = new Map<string, { label: string; count: number }>();

  for (const transaction of transactions) {
    const payee = transaction.payee.trim();
    if (payee && normaliseSearchText(payee).includes(normalisedQuery)) {
      const key = normaliseSearchText(payee);
      byPayee.set(key, {
        label: payee,
        count: (byPayee.get(key)?.count ?? 0) + 1,
      });
    }

    const categoryNames = [
      transaction.category,
      ...(transaction.splitLines?.map((line) => line.category) ?? []),
    ];

    for (const category of categoryNames) {
      const cleanCategory = category.trim();
      if (
        cleanCategory &&
        normaliseSearchText(cleanCategory).includes(normalisedQuery)
      ) {
        const key = normaliseSearchText(cleanCategory);
        byCategory.set(key, {
          label: cleanCategory,
          count: (byCategory.get(key)?.count ?? 0) + 1,
        });
      }
    }

    const memoValues = [
      transaction.memo ?? "",
      ...(transaction.splitLines?.map((line) => line.memo ?? "") ?? []),
    ];

    for (const memo of memoValues) {
      const cleanMemo = memo.replace(/\s+/g, " ").trim();
      if (cleanMemo && normaliseSearchText(cleanMemo).includes(normalisedQuery)) {
        const key = normaliseSearchText(cleanMemo);
        byMemo.set(key, {
          label: cleanMemo,
          count: (byMemo.get(key)?.count ?? 0) + 1,
        });
      }
    }
  }

  const ranked = (entries: Iterable<{ label: string; count: number }>) =>
    [...entries].sort((left, right) => {
      const leftExact = normaliseSearchText(left.label) === normalisedQuery ? 1 : 0;
      const rightExact = normaliseSearchText(right.label) === normalisedQuery ? 1 : 0;

      if (leftExact !== rightExact) {
        return rightExact - leftExact;
      }

      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.label.localeCompare(right.label);
    });

  const suggestions: RegisterSearchSuggestion[] = [
    ...ranked(byPayee.values())
      .slice(0, 8)
      .map((match) => ({
        id: `payee:${match.label}`,
        group: "payees" as const,
        label: match.label,
        detail: `${match.count} transaction${match.count === 1 ? "" : "s"}`,
        query: match.label,
        scope: "payee" as const,
        count: match.count,
      })),
    ...ranked(byCategory.values())
      .slice(0, 6)
      .map((match) => ({
        id: `category:${match.label}`,
        group: "categories" as const,
        label: match.label,
        detail: `${match.count} transaction${match.count === 1 ? "" : "s"}`,
        query: match.label,
        scope: "category" as const,
        count: match.count,
      })),
    ...ranked(byMemo.values())
      .slice(0, 4)
      .map((match) => ({
        id: `memo:${match.label}`,
        group: "memos" as const,
        label: match.label,
        detail: `${match.count} transaction${match.count === 1 ? "" : "s"}`,
        query: match.label,
        scope: "memo" as const,
        count: match.count,
      })),
  ];

  const searchEverywhereAction: RegisterSearchSuggestion = {
    id: "search:all",
    group: "search",
    label: `Search "${query.trim()}" in all fields`,
    query: query.trim(),
    scope: "all",
    count: countMatchingTransactions(transactions, query, "all"),
  };

  const searchActions: RegisterSearchSuggestion[] = [
    {
      id: "search:payee",
      group: "search",
      label: `Find "${query.trim()}" in payees`,
      query: query.trim(),
      scope: "payee",
      count: countMatchingTransactions(transactions, query, "payee"),
    },
    {
      id: "search:category",
      group: "search",
      label: `Find "${query.trim()}" in categories`,
      query: query.trim(),
      scope: "category",
      count: countMatchingTransactions(transactions, query, "category"),
    },
    {
      id: "search:memo",
      group: "search",
      label: `Find "${query.trim()}" in memos`,
      query: query.trim(),
      scope: "memo",
      count: countMatchingTransactions(transactions, query, "memo"),
    },
  ];

  if (/^-?\d+(?:\.\d{1,2})?$/.test(query.trim())) {
    searchActions.push({
      id: "search:amount",
      group: "search",
      label: `Find amount "${query.trim()}"`,
      query: query.trim(),
      scope: "amount",
      count: countMatchingTransactions(transactions, query, "amount"),
    });
  }

  return [searchEverywhereAction, ...suggestions, ...searchActions];
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
  suggestion: RankedAutocompleteOption<{
    payeeId?: string;
    label: string;
    type: "payee" | "transfer";
  }>,
) {
  return suggestion.metadata?.type === "transfer" ? "Transfers" : "Payees";
}

function getPayeeSuggestionText(
  suggestion: RankedAutocompleteOption<{
    payeeId?: string;
    label: string;
    type: "payee" | "transfer";
  }>,
) {
  if (suggestion.metadata?.type !== "transfer") {
    return suggestion.value;
  }

  return suggestion.value.replace(/^Transfer:\s*/i, "");
}

function getCategorySuggestionSection(
  suggestion: RankedAutocompleteOption<{
    label: string;
    groupName?: string;
    type: "category" | "special";
  }>,
) {
  return suggestion.metadata?.type === "special"
    ? "Special"
    : (suggestion.metadata?.groupName ?? suggestion.label ?? "Categories");
}

function useRegisterAutocompletePopupStyle(isOpen: boolean) {
  const anchorRef = useRef<HTMLInputElement | null>(null);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});

  const updatePopupStyle = useCallback(() => {
    const anchor = anchorRef.current;

    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();

    setPopupStyle({
      left: rect.left,
      minWidth: Math.max(rect.width, 384),
      position: "fixed",
      top: rect.bottom + 4,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePopupStyle();

    window.addEventListener("resize", updatePopupStyle);
    window.addEventListener("scroll", updatePopupStyle, true);

    return () => {
      window.removeEventListener("resize", updatePopupStyle);
      window.removeEventListener("scroll", updatePopupStyle, true);
    };
  }, [isOpen, updatePopupStyle]);

  return { anchorRef, popupStyle };
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
    (): Array<
      AutocompleteOption<{
        payeeId?: string;
        label: string;
        type: "payee" | "transfer";
      }>
    > => [
      ...transferAccounts.map((account) => ({
        id: `transfer-${account.id}`,
        value: `Transfer: ${account.name}`,
        label: "Transfer",
        metadata: {
          payeeId: undefined,
          label: "Transfer",
          type: "transfer" as const,
        },
        ranking: { priority: 0 },
      })),
      ...payeeOptions.map((payee) => ({
        id: `payee-${payee.id}`,
        value: payee.name,
        label: "Payee",
        metadata: { payeeId: payee.id, label: "Payee", type: "payee" as const },
        ranking: {
          priority: 1,
          recentAt: payee.lastUsedAt,
          useCount: payee.useCount,
        },
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
  const shouldShowSuggestions = isOpen && suggestions.length > 0;
  const shouldShowGhost = shouldShowSuggestions && Boolean(ghostCompletion);
  const { anchorRef, popupStyle } = useRegisterAutocompletePopupStyle(
    shouldShowSuggestions,
  );

  function selectSuggestion(selectedValue: string, selectedPayeeId?: string) {
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
        ref={anchorRef}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;

          onChange(nextValue);
          onPayeeIdChange?.(undefined);
          setIsOpen(nextValue.trim().length > 0);
          setHighlightedIndex(0);
        }}
        onFocus={() => setIsOpen(false)}
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

          if (event.key === "ArrowDown" && suggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((current) =>
              shouldShowSuggestions && current < suggestions.length - 1
                ? current + 1
                : 0,
            );
            return;
          }

          if (event.key === "ArrowUp" && suggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((current) =>
              shouldShowSuggestions && current > 0
                ? current - 1
                : suggestions.length - 1,
            );
            return;
          }

          if (!shouldShowSuggestions) {
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
        <div
          className="register-payee-suggestions register-autocomplete-popup"
          role="listbox"
          style={popupStyle}
        >
          {suggestions.map((suggestion, index) => {
            const section = getPayeeSuggestionSection(suggestion);
            const previousSection =
              index > 0
                ? getPayeeSuggestionSection(suggestions[index - 1])
                : null;
            const showSection = section !== previousSection;
            const isTransfer = suggestion.metadata?.type === "transfer";

            return (
              <div
                key={suggestion.id}
                className="register-autocomplete-suggestion-block"
              >
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
                    {isTransfer ? (
                      <span className="register-autocomplete-icon">↔</span>
                    ) : null}
                    <span>{getPayeeSuggestionText(suggestion)}</span>
                  </span>
                  {isTransfer ? null : (
                    <small>
                      {suggestion.metadata?.label ?? suggestion.label}
                    </small>
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

  const autocompleteOptions = useMemo((): Array<
    AutocompleteOption<{
      label: string;
      groupName?: string;
      type: "category" | "special";
    }>
  > => {
    const categorySuggestions = categoryOptions.map((category) => ({
      id: category.id,
      value: category.name,
      label: category.groupName,
      metadata: {
        label: category.groupName,
        groupName: category.groupName,
        type: "category" as const,
      },
    }));

    const splitSuggestion = includeSplitOption
      ? [
          {
            id: "__split",
            value: SPLIT_CATEGORY_LABEL,
            label: "Special",
            metadata: { label: "Special", type: "special" as const },
            ranking: { priority: 0 },
          },
        ]
      : [];

    return [...splitSuggestion, ...categorySuggestions];
  }, [categoryOptions, includeSplitOption]);

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
  const shouldShowGhost = shouldShowSuggestions && Boolean(ghostCompletion);
  const { anchorRef, popupStyle } = useRegisterAutocompletePopupStyle(
    shouldShowSuggestions,
  );

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
        ref={anchorRef}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;

          onChange(nextValue);
          setIsOpen(nextValue.trim().length > 0);
          setHighlightedIndex(0);
        }}
        onFocus={() => setIsOpen(false)}
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
        <div
          className="register-payee-suggestions register-autocomplete-popup register-category-suggestions"
          role="listbox"
          style={popupStyle}
        >
          {suggestions.map((suggestion, index) => {
            const section = getCategorySuggestionSection(suggestion);
            const previousSection =
              index > 0
                ? getCategorySuggestionSection(suggestions[index - 1])
                : null;
            const showSection = section !== previousSection;

            return (
              <div
                key={suggestion.id}
                className="register-autocomplete-suggestion-block"
              >
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
                  <span className="register-autocomplete-primary">
                    {suggestion.value}
                  </span>
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

function totalsFromSplitDrafts(splitLines: readonly SplitLineDraft[]): {
  outflow: number;
  inflow: number;
} {
  return splitLines.reduce(
    (totals, line) => ({
      outflow: totals.outflow + parseMoney(line.outflow),
      inflow: totals.inflow + parseMoney(line.inflow),
    }),
    { outflow: 0, inflow: 0 },
  );
}

function hasIncompleteSplitDrafts(
  splitLines: readonly SplitLineDraft[],
): boolean {
  return splitLines.some((line) => {
    const hasAmount =
      parseMoney(line.outflow) > 0 || parseMoney(line.inflow) > 0;
    return hasAmount && line.category.trim().length === 0;
  });
}

const SPLIT_BALANCE_TOLERANCE = 0.005;

function normaliseMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getSplitBalanceStatus({
  parentOutflow,
  parentInflow,
  splitOutflow,
  splitInflow,
}: {
  parentOutflow: number;
  parentInflow: number;
  splitOutflow: number;
  splitInflow: number;
}): {
  parentAmount: number;
  splitAmount: number;
  remaining: number;
  isBalanced: boolean;
  isOverAssigned: boolean;
  activeSide: "outflow" | "inflow";
} {
  const activeSide = parentInflow > parentOutflow ? "inflow" : "outflow";
  const parentAmount = activeSide === "inflow" ? parentInflow : parentOutflow;
  const splitAmount = activeSide === "inflow" ? splitInflow : splitOutflow;
  const remaining = normaliseMoney(parentAmount - splitAmount);

  return {
    parentAmount,
    splitAmount,
    remaining,
    isBalanced: Math.abs(remaining) < SPLIT_BALANCE_TOLERANCE,
    isOverAssigned: remaining < -SPLIT_BALANCE_TOLERANCE,
    activeSide,
  };
}

function isSplitBalanced(
  parentOutflow: number,
  parentInflow: number,
  splitLines: RegisterSplitLineView[],
): boolean {
  const totals = totalsFromSplitLines(splitLines);
  return getSplitBalanceStatus({
    parentOutflow,
    parentInflow,
    splitOutflow: totals.outflow,
    splitInflow: totals.inflow,
  }).isBalanced;
}

function isSplitDraftBalanced(
  parentOutflow: number,
  parentInflow: number,
  splitLines: readonly SplitLineDraft[],
): boolean {
  const totals = totalsFromSplitDrafts(splitLines);
  return getSplitBalanceStatus({
    parentOutflow,
    parentInflow,
    splitOutflow: totals.outflow,
    splitInflow: totals.inflow,
  }).isBalanced;
}

function SplitEditor({
  splitLines,
  setSplitLines,
  categoryOptions,
  parentOutflow,
  parentInflow,
  currencyCode,
  visibleColumnIds,
  rowStyle,
  layoutMode,
  children,
}: {
  splitLines: SplitLineDraft[];
  setSplitLines: (
    updater: (current: SplitLineDraft[]) => SplitLineDraft[],
  ) => void;
  categoryOptions: BudgetCategoryOption[];
  parentOutflow: number;
  parentInflow: number;
  currencyCode: string;
  visibleColumnIds: readonly RegisterColumnId[];
  rowStyle: CSSProperties;
  layoutMode: RegisterLayoutMode;
  children?: ReactNode;
}) {
  if (splitLines.length === 0) {
    return null;
  }

  const totals = totalsFromSplitDrafts(splitLines);
  const balanceStatus = getSplitBalanceStatus({
    parentOutflow,
    parentInflow,
    splitOutflow: totals.outflow,
    splitInflow: totals.inflow,
  });
  const visibleSplitInputColumns = visibleColumnIds.filter((columnId) =>
    ["category", "memo", "outflow", "inflow"].includes(columnId),
  );
  const splitRemoveColumn = visibleSplitInputColumns[0] ?? "category";
  const balanceLabelColumn: RegisterColumnId = visibleColumnIds.includes(
    "checkNumber",
  )
    ? "checkNumber"
    : visibleColumnIds.includes("memo")
      ? "memo"
      : visibleColumnIds.includes("category")
        ? "category"
        : visibleColumnIds.includes("outflow")
          ? "outflow"
          : "inflow";

  function renderSplitRemoveButton(line: SplitLineDraft) {
    return (
      <button
        className="register-split-remove-button"
        type="button"
        aria-label="Remove split line"
        title="Remove split line"
        onClick={() =>
          setSplitLines((current) =>
            current.filter((item) => item.id !== line.id),
          )
        }
      >
        ×
      </button>
    );
  }

  function renderWithOptionalRemove(
    columnId: RegisterColumnId,
    line: SplitLineDraft,
    child: ReactNode,
  ) {
    if (columnId !== splitRemoveColumn) {
      return child;
    }

    return (
      <div className="register-split-cell-with-remove" key={columnId}>
        {renderSplitRemoveButton(line)}
        {child}
      </div>
    );
  }

  function addSplitOnTab(
    event: KeyboardEvent<HTMLInputElement>,
    line: SplitLineDraft,
  ) {
    if (
      event.key !== "Tab" ||
      event.shiftKey ||
      line.id !== splitLines[splitLines.length - 1]?.id
    ) {
      return;
    }

    const hasAmount =
      parseMoney(line.outflow) > 0 || parseMoney(line.inflow) > 0;

    if (!hasAmount) {
      return;
    }

    setSplitLines((current) => [...current, createSplitLineDraft()]);
  }

  function renderSplitCell(columnId: RegisterColumnId, line: SplitLineDraft) {
    if (columnId === "category") {
      return renderWithOptionalRemove(
        columnId,
        line,
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
        />,
      );
    }

    if (columnId === "memo") {
      return renderWithOptionalRemove(
        columnId,
        line,
        <input
          key={columnId}
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
        />,
      );
    }

    if (columnId === "outflow") {
      return renderWithOptionalRemove(
        columnId,
        line,
        <input
          className="register-money-input"
          key={columnId}
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
          onKeyDown={(event) => addSplitOnTab(event, line)}
        />,
      );
    }

    if (columnId === "inflow") {
      return renderWithOptionalRemove(
        columnId,
        line,
        <input
          className="register-money-input"
          key={columnId}
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
          onKeyDown={(event) => addSplitOnTab(event, line)}
        />,
      );
    }

    return (
      <span
        aria-hidden="true"
        className="register-split-placeholder-cell"
        key={columnId}
      />
    );
  }

  function renderSplitFooterCell(columnId: RegisterColumnId) {
    if (columnId === splitRemoveColumn) {
      return (
        <button
          className="button button-secondary register-split-add-button"
          key={columnId}
          type="button"
          onClick={() =>
            setSplitLines((current) => [...current, createSplitLineDraft()])
          }
        >
          + Add another split
        </button>
      );
    }

    if (columnId === balanceLabelColumn) {
      return (
        <span className="register-split-footer-status" key={columnId}>
          {balanceStatus.isBalanced ? "✓ Balanced" : ""}
        </span>
      );
    }

    return (
      <span
        aria-hidden="true"
        className="register-split-placeholder-cell"
        key={columnId}
      />
    );
  }

  function renderAssignCell(columnId: RegisterColumnId) {
    if (columnId === balanceLabelColumn) {
      return (
        <span className="register-split-balance-label" key={columnId}>
          Amount to assign
        </span>
      );
    }

    if (columnId === "outflow") {
      return (
        <strong
          className="register-split-assign-amount register-split-assign-outflow"
          key={columnId}
        >
          {balanceStatus.activeSide === "outflow"
            ? formatMoney(
                balanceStatus.isBalanced
                  ? 0
                  : -Math.abs(balanceStatus.remaining),
                currencyCode,
              )
            : ""}
        </strong>
      );
    }

    if (columnId === "inflow") {
      return (
        <strong
          className={[
            "register-split-assign-amount register-split-assign-inflow",
            balanceStatus.isOverAssigned ? "register-split-assign-over" : "",
          ].join(" ")}
          key={columnId}
        >
          {balanceStatus.activeSide === "inflow"
            ? formatMoney(
                balanceStatus.isBalanced ? 0 : balanceStatus.remaining,
                currencyCode,
              )
            : ""}
        </strong>
      );
    }

    return (
      <span
        aria-hidden="true"
        className="register-split-placeholder-cell"
        key={columnId}
      />
    );
  }

  function renderActionCell(columnId: RegisterColumnId) {
    if (columnId === "outflow") {
      return children ? (
        <div className="register-split-commit-actions" key={columnId}>
          {children}
        </div>
      ) : (
        <span
          aria-hidden="true"
          className="register-split-placeholder-cell"
          key={columnId}
        />
      );
    }

    if (columnId === "inflow") {
      return null;
    }

    return (
      <span
        aria-hidden="true"
        className="register-split-placeholder-cell"
        key={columnId}
      />
    );
  }

  if (layoutMode === "compact") {
    return (
      <div
        className={[
          "register-split-editor register-split-editor-compact",
          balanceStatus.isBalanced
            ? "register-split-editor-balanced"
            : balanceStatus.isOverAssigned
              ? "register-split-editor-over"
              : "register-split-editor-unbalanced",
        ].join(" ")}
      >
        <div className="register-split-compact-header">
          <strong>Split transaction</strong>
          <span>{splitLines.length} lines</span>
        </div>

        {splitLines.map((line) => (
          <div className="register-split-compact-line" key={line.id}>
            {renderSplitRemoveButton(line)}

            <div className="register-split-compact-main">
              <CategoryInput
                value={line.category}
                onChange={(value) =>
                  setSplitLines((current) =>
                    current.map((item) =>
                      item.id === line.id
                        ? {
                            ...item,
                            category: value,
                            categoryId: findCategoryOption(
                              value,
                              categoryOptions,
                            )?.id,
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
            </div>

            <div className="register-split-compact-money">
              <input
                className="register-money-input"
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
                onKeyDown={(event) => addSplitOnTab(event, line)}
              />

              <input
                className="register-money-input"
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
                onKeyDown={(event) => addSplitOnTab(event, line)}
              />
            </div>
          </div>
        ))}

        <div className="register-split-compact-footer">
          <div className="register-split-compact-footer-top">
            <button
              className="button button-secondary register-split-add-button"
              type="button"
              onClick={() =>
                setSplitLines((current) => [...current, createSplitLineDraft()])
              }
            >
              + Add another split
            </button>

            <span className="register-split-footer-status">
              {balanceStatus.isBalanced ? "✓ Balanced" : ""}
            </span>
          </div>

          <div className="register-split-compact-assign" aria-live="polite">
            <span className="register-split-balance-label">
              Amount to assign
            </span>
            <strong className="register-split-assign-amount register-split-assign-outflow">
              {balanceStatus.activeSide === "outflow"
                ? formatMoney(
                    balanceStatus.isBalanced
                      ? 0
                      : -Math.abs(balanceStatus.remaining),
                    currencyCode,
                  )
                : ""}
            </strong>
            <strong
              className={[
                "register-split-assign-amount register-split-assign-inflow",
                balanceStatus.isOverAssigned
                  ? "register-split-assign-over"
                  : "",
              ].join(" ")}
            >
              {balanceStatus.activeSide === "inflow"
                ? formatMoney(
                    balanceStatus.isBalanced ? 0 : balanceStatus.remaining,
                    currencyCode,
                  )
                : ""}
            </strong>
          </div>

          {children ? (
            <div className="register-split-commit-actions register-split-compact-actions">
              {children}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "register-split-editor register-split-allocation-panel",
        balanceStatus.isBalanced
          ? "register-split-editor-balanced"
          : balanceStatus.isOverAssigned
            ? "register-split-editor-over"
            : "register-split-editor-unbalanced",
      ].join(" ")}
    >
      <div className="register-split-allocation-header">
        <strong>Split allocation</strong>
        <span className="register-split-footer-status">
          {balanceStatus.isBalanced ? "✓ Balanced" : ""}
        </span>
      </div>

      <div
        className="register-split-allocation-grid register-split-allocation-grid-heading"
        aria-hidden="true"
      >
        <span>Remove</span>
        <span>Category</span>
        <span>Memo</span>
        <span>Outflow</span>
        <span>Inflow</span>
      </div>

      {splitLines.map((line) => (
        <div
          className="register-split-allocation-grid register-split-allocation-line"
          key={line.id}
        >
          <div className="register-split-allocation-remove">
            {renderSplitRemoveButton(line)}
          </div>

          <div className="register-split-allocation-category">
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
          </div>

          <input
            className="register-split-allocation-memo"
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
            className="register-money-input register-split-allocation-amount register-split-allocation-outflow"
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
            onKeyDown={(event) => addSplitOnTab(event, line)}
          />

          <input
            className="register-money-input register-split-allocation-amount register-split-allocation-inflow"
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
            onKeyDown={(event) => addSplitOnTab(event, line)}
          />
        </div>
      ))}

      <div className="register-split-allocation-footer">
        <button
          className="button button-secondary register-split-add-button"
          type="button"
          onClick={() =>
            setSplitLines((current) => [...current, createSplitLineDraft()])
          }
        >
          + Add another split
        </button>

        <div className="register-split-allocation-balance" aria-live="polite">
          <span className="register-split-balance-label">Amount to assign</span>
          <strong className="register-split-assign-amount register-split-assign-outflow">
            {balanceStatus.activeSide === "outflow"
              ? formatMoney(
                  balanceStatus.isBalanced
                    ? 0
                    : -Math.abs(balanceStatus.remaining),
                  currencyCode,
                )
              : ""}
          </strong>
          <strong
            className={[
              "register-split-assign-amount register-split-assign-inflow",
              balanceStatus.isOverAssigned ? "register-split-assign-over" : "",
            ].join(" ")}
          >
            {balanceStatus.activeSide === "inflow"
              ? formatMoney(
                  balanceStatus.isBalanced ? 0 : balanceStatus.remaining,
                  currencyCode,
                )
              : ""}
          </strong>
        </div>
      </div>

      {children ? (
        <div className="register-split-commit-actions register-split-allocation-actions">
          {children}
        </div>
      ) : null}
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
  currencyCode,
  visibleColumns,
  visibleColumnIds,
  rowStyle,
  layoutMode,
}: {
  initialDate: string;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  currencyCode: string;
  visibleColumns: Set<RegisterColumnId>;
  visibleColumnIds: readonly RegisterColumnId[];
  rowStyle: CSSProperties;
  layoutMode: RegisterLayoutMode;
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

    if (
      splitLines.length > 0 &&
      (parsedSplitLines.length === 0 || hasIncompleteSplitDrafts(splitLines))
    ) {
      return null;
    }

    const parsedOutflow = parseMoney(outflow);
    const parsedInflow = parseMoney(inflow);

    if (
      splitLines.length > 0 &&
      !isSplitDraftBalanced(parsedOutflow, parsedInflow, splitLines)
    ) {
      return null;
    }

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
                className="register-money-input"
                key={columnId}
                value={outflow}
                onChange={(event) => setOutflow(event.target.value)}
                placeholder="Outflow"
                inputMode="decimal"
              />
            );
          }

          if (columnId === "inflow") {
            return (
              <input
                className="register-money-input"
                key={columnId}
                value={inflow}
                onChange={(event) => setInflow(event.target.value)}
                placeholder="Inflow"
                inputMode="decimal"
              />
            );
          }

          return null;
        })}
      </div>

      {splitLines.length === 0 ? (
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
      ) : null}

      <SplitEditor
        splitLines={splitLines}
        setSplitLines={setSplitLines}
        categoryOptions={categoryOptions}
        parentOutflow={parseMoney(outflow)}
        parentInflow={parseMoney(inflow)}
        currencyCode={currencyCode}
        visibleColumnIds={visibleColumnIds}
        rowStyle={rowStyle}
        layoutMode={layoutMode}
      >
        <button
          className="button button-primary"
          type="button"
          onClick={saveAndAddAnother}
          disabled={
            !isSplitDraftBalanced(
              parseMoney(outflow),
              parseMoney(inflow),
              splitLines,
            )
          }
        >
          Save & add another
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={save}
          disabled={
            !isSplitDraftBalanced(
              parseMoney(outflow),
              parseMoney(inflow),
              splitLines,
            )
          }
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
      </SplitEditor>
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
  currencyCode,
  visibleColumns,
  visibleColumnIds,
  rowStyle,
  layoutMode,
}: {
  transaction: RegisterTransactionView;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  currencyCode: string;
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
  visibleColumnIds: readonly RegisterColumnId[];
  rowStyle: CSSProperties;
  layoutMode: RegisterLayoutMode;
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

    const parsedOutflow = parseMoney(outflow);
    const parsedInflow = parseMoney(inflow);

    if (
      splitLines.length > 0 &&
      !isSplitDraftBalanced(parsedOutflow, parsedInflow, splitLines)
    ) {
      return;
    }

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

  const outflowColumnIndex = visibleColumnIds.indexOf("outflow");
  const inflowColumnIndex = visibleColumnIds.indexOf("inflow");
  const editActionGridColumn =
    outflowColumnIndex >= 0 && inflowColumnIndex >= outflowColumnIndex
      ? `${outflowColumnIndex + 1} / ${inflowColumnIndex + 2}`
      : "1 / -1";

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
          className="register-money-input"
          value={outflow}
          onChange={(event) => setOutflow(event.target.value)}
          placeholder="Outflow"
          inputMode="decimal"
        />
        <input
          className="register-money-input"
          value={inflow}
          onChange={(event) => setInflow(event.target.value)}
          placeholder="Inflow"
          inputMode="decimal"
        />
      </div>
      {splitLines.length > 0 ? (
        <SplitEditor
          splitLines={splitLines}
          setSplitLines={setSplitLines}
          categoryOptions={categoryOptions}
          parentOutflow={parseMoney(outflow)}
          parentInflow={parseMoney(inflow)}
          currencyCode={currencyCode}
          visibleColumnIds={visibleColumnIds}
          rowStyle={rowStyle}
          layoutMode={layoutMode}
        >
          <button
            className="button button-primary"
            type="button"
            onClick={save}
            disabled={
              !isSplitDraftBalanced(
                parseMoney(outflow),
                parseMoney(inflow),
                splitLines,
              )
            }
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
        </SplitEditor>
      ) : (
        <div className="register-edit-actions-panel" style={rowStyle}>
          <div
            className="register-edit-actions register-edit-commit-actions"
            style={{ gridColumn: editActionGridColumn }}
          >
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
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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


function RegisterSearchDropdown({
  query,
  suggestions,
  activeIndex,
  onCommit,
  onHighlight,
}: {
  query: string;
  suggestions: readonly RegisterSearchSuggestion[];
  activeIndex: number | null;
  onCommit: (suggestion: RegisterSearchSuggestion) => void;
  onHighlight: (index: number) => void;
}) {
  if (!query.trim() || suggestions.length === 0) {
    return null;
  }

  const groups: Array<{
    key: RegisterSearchSuggestion["group"];
    label: string;
    icon: string;
  }> = [
    { key: "search", label: "Search", icon: "🔎" },
    { key: "payees", label: "Payees", icon: "👤" },
    { key: "categories", label: "Categories", icon: "🏷" },
    { key: "memos", label: "Memos", icon: "📝" },
  ];

  let renderedIndex = -1;

  return (
    <div className="register-search-dropdown" role="listbox">
      {groups.map((group) => {
        const items = suggestions.filter((suggestion) => suggestion.group === group.key);

        if (items.length === 0) {
          return null;
        }

        return (
          <section className="register-search-group" key={group.key}>
            <div className="register-search-group-title">{group.label}</div>
            {items.map((suggestion) => {
              renderedIndex += 1;
              const suggestionIndex = renderedIndex;
              const isActive = suggestionIndex === activeIndex;

              return (
                <button
                  className={`register-search-suggestion${isActive ? " register-search-suggestion-active" : ""}`}
                  key={suggestion.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => onHighlight(suggestionIndex)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onCommit(suggestion);
                  }}
                >
                  <span className="register-search-suggestion-icon" aria-hidden="true">
                    {group.icon}
                  </span>
                  <span className="register-search-suggestion-main">
                    <strong>{suggestion.label}</strong>
                    {suggestion.detail ? <small>{suggestion.detail}</small> : null}
                  </span>
                  <span className="register-search-suggestion-count">
                    {suggestion.count}
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
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
    addTransaction,
    addTransactions,
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
  const [registerSearchDraft, setRegisterSearchDraft] = useState("");
  const [committedRegisterSearch, setCommittedRegisterSearch] =
    useState<RegisterSearchCommit | null>(null);
  const [isRegisterSearchOpen, setIsRegisterSearchOpen] = useState(false);
  const [activeRegisterSearchSuggestionIndex, setActiveRegisterSearchSuggestionIndex] =
    useState<number | null>(null);
  const registerSearchInputRef = useRef<HTMLInputElement | null>(null);
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

  const registerLayoutMode = useRegisterLayoutMode();

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
        58,
        registerTableLayout.columnWidths,
      ),
    [registerEditVisibleColumnIds, registerTableLayout.columnWidths],
  );

  const registerEntryVisibleColumnIds = useMemo(
    () => buildRegisterEditVisibleColumnIds(
      registerTableLayout.visibleColumns.map((column) => column.id),
    ),
    [registerTableLayout.visibleColumns],
  );

  const registerEntryColumnSet = useMemo(
    () => new Set<RegisterColumnId>(registerEntryVisibleColumnIds),
    [registerEntryVisibleColumnIds],
  );

  const registerEntryRowStyle = registerEditRowStyle;

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
  const registerSearchSuggestions = useMemo(
    () => buildRegisterSearchSuggestions(registerTransactions, registerSearchDraft),
    [registerTransactions, registerSearchDraft],
  );
  const searchedRegisterTransactions = useMemo(
    () =>
      committedRegisterSearch
        ? registerTransactions.filter((transaction) =>
            transactionMatchesSearch(transaction, committedRegisterSearch),
          )
        : registerTransactions,
    [registerTransactions, committedRegisterSearch],
  );
  const registerPagination = getRegisterPaginationState(
    searchedRegisterTransactions.length,
    registerPage,
    REGISTER_DEFAULT_PAGE_SIZE,
  );

  useEffect(() => {
    setRegisterPage((currentPage) =>
      clampPageForTransactionCount(
        currentPage,
        searchedRegisterTransactions.length,
      ),
    );
  }, [searchedRegisterTransactions.length]);

  useEffect(() => {
    setRegisterPage(1);
  }, [committedRegisterSearch]);

  useEffect(() => {
    setActiveRegisterSearchSuggestionIndex(null);
  }, [registerSearchDraft]);

  const visibleTransactions = useMemo(
    () =>
      measureRegisterPerformance(
        developerPerformanceMode,
        registerPerformanceTimingsRef.current,
        "visible pagination",
        () =>
          paginateRegisterItems(
            searchedRegisterTransactions,
            registerPagination.currentPage,
            registerPagination.pageSize,
          ),
      ),
    [
      searchedRegisterTransactions,
      registerPagination.currentPage,
      registerPagination.pageSize,
      developerPerformanceMode,
    ],
  );

  const visibleTransactionIds = useMemo(
    () => visibleTransactions.map((transaction) => transaction.id),
    [visibleTransactions],
  );

  const registerSelection = useRegisterSelection(visibleTransactionIds);
  const selectedRegisterTransactionIds = registerSelection.selectedIds;
  const selectedRegisterTransactionCount = registerSelection.selectedCount;
  const selectedRegisterActionTransactionIds = selectedRegisterTransactionIds;
  const selectedRegisterActionTransactions = useMemo(() => {
    if (selectedRegisterActionTransactionIds.length === 0) {
      return [];
    }

    const selectedRegisterActionIdSet = new Set(selectedRegisterActionTransactionIds);
    return registerTransactions.filter((transaction) =>
      selectedRegisterActionIdSet.has(transaction.id),
    );
  }, [registerTransactions, selectedRegisterActionTransactionIds]);

  useEffect(() => {
    registerSelection.prune(registerTransactions.map((transaction) => transaction.id));
  }, [registerSelection.prune, registerTransactions]);

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
    selectedTransaction: selectedRegisterTransactionCount > 0,
    editingTransaction: Boolean(editingTransactionId),
    timings: registerPerformanceTimingsRef.current,
  });


  const commitRegisterSearch = useCallback(
    (suggestion: RegisterSearchSuggestion | RegisterSearchCommit) => {
      const query = suggestion.query.trim();

      if (!query) {
        setCommittedRegisterSearch(null);
        setRegisterSearchDraft("");
        setIsRegisterSearchOpen(false);
        return;
      }

      setCommittedRegisterSearch({
        query,
        scope: suggestion.scope,
        label: suggestion.label,
      });
      setRegisterSearchDraft(query);
      setIsRegisterSearchOpen(false);
    },
    [],
  );

  const clearRegisterSearch = useCallback(() => {
    setCommittedRegisterSearch(null);
    setRegisterSearchDraft("");
    setIsRegisterSearchOpen(false);
    registerSearchInputRef.current?.focus();
  }, []);

  const handleRegisterSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setIsRegisterSearchOpen(true);
        setActiveRegisterSearchSuggestionIndex((current) =>
          current === null
            ? 0
            : Math.min(current + 1, Math.max(0, registerSearchSuggestions.length - 1)),
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setIsRegisterSearchOpen(true);
        setActiveRegisterSearchSuggestionIndex((current) =>
          current === null
            ? Math.max(0, registerSearchSuggestions.length - 1)
            : Math.max(0, current - 1),
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();

        if (activeRegisterSearchSuggestionIndex !== null) {
          const suggestion =
            registerSearchSuggestions[activeRegisterSearchSuggestionIndex];

          if (suggestion) {
            commitRegisterSearch(suggestion);
            return;
          }
        }

        if (registerSearchDraft.trim()) {
          commitRegisterSearch({
            query: registerSearchDraft,
            scope: "all",
            label: registerSearchDraft,
          });
        }
        return;
      }

      if (event.key === "Escape") {
        if (isRegisterSearchOpen) {
          event.preventDefault();
          setIsRegisterSearchOpen(false);
          return;
        }

        if (committedRegisterSearch) {
          event.preventDefault();
          clearRegisterSearch();
        }
      }
    },
    [
      activeRegisterSearchSuggestionIndex,
      clearRegisterSearch,
      commitRegisterSearch,
      committedRegisterSearch,
      isRegisterSearchOpen,
      registerSearchDraft,
      registerSearchSuggestions,
    ],
  );

  const handleSelectTransaction = useCallback(
    (transactionId: string, event?: MouseEvent<HTMLElement>) => {
      setEditingTransactionId(null);

      registerSelection.selectFromPointer(transactionId, {
        shiftKey: event?.shiftKey,
        metaKey: event?.metaKey,
        ctrlKey: event?.ctrlKey,
      });
    },
    [registerSelection],
  );


  const handleToggleTransactionSelection = useCallback(
    (transactionId: string) => {
      setEditingTransactionId(null);

      registerSelection.toggle(transactionId);
    },
    [registerSelection],
  );

  const handleEditTransaction = useCallback((transactionId: string) => {
    registerSelection.selectSingle(transactionId);
    setShowEntryRow(false);
    setEditingTransactionId(transactionId);
  }, [registerSelection]);

  const handleToggleClearedTransaction = useCallback(
    (transactionId: string) => {
      void toggleCleared(transactionId);
    },
    [toggleCleared],
  );

  const clearRegisterSelection = registerSelection.clear;
  const registerSelectionActions = useRegisterSelectionActions({
    selectedTransactionIds: selectedRegisterActionTransactionIds,
    selectedTransactions: selectedRegisterActionTransactions,
    toggleCleared,
    deleteTransaction,
    clearSelection: clearRegisterSelection,
    editTransaction: setEditingTransactionId,
  });
  const hasRegisterActionSelection = registerSelectionActions.hasSelection;



  const handleManageTransactionAttachments = useCallback((transactionId: string) => {
    registerSelection.selectSingle(transactionId);
    setAttachmentTransactionId(transactionId);
  }, [registerSelection]);

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
    function handleRegisterSearchShortcut(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setIsRegisterSearchOpen(true);
        registerSearchInputRef.current?.focus();
        registerSearchInputRef.current?.select();
      }
    }

    window.addEventListener("keydown", handleRegisterSearchShortcut);
    return () =>
      window.removeEventListener("keydown", handleRegisterSearchShortcut);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (
        event.key !== "Enter" ||
        selectedRegisterTransactionCount !== 1 ||
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

      const transactionId = selectedRegisterTransactionIds[0];
      if (transactionId) {
        setEditingTransactionId(transactionId);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingTransactionId, selectedRegisterTransactionCount, selectedRegisterTransactionIds]);

  useEffect(() => {
    function handleRegisterSelectionKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || selectedRegisterTransactionCount === 0) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTypingTarget) {
        return;
      }

      event.preventDefault();
      clearRegisterSelection();
    }

    window.addEventListener("keydown", handleRegisterSelectionKeyDown);
    return () => {
      window.removeEventListener("keydown", handleRegisterSelectionKeyDown);
    };
  }, [clearRegisterSelection, selectedRegisterTransactionCount]);

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

  const registerColumnHeader =
    registerLayoutMode === "compact" ? (
      <div
        className="register-row-compact register-head register-head-compact"
        aria-label="Register column headings"
      >
        <span className="register-compact-head-select" aria-label="Select" />
        <span className="register-compact-head-date">Date</span>
        <span className="register-compact-head-flag">Flag</span>
        <span
          className="register-compact-head-attachments"
          aria-label="Attachments"
        >
          <Paperclip size={13} aria-hidden="true" />
        </span>
        <span className="register-compact-head-transaction">
          Payee / Category / Memo
        </span>
        <span className="register-compact-head-amount">Amount / Balance</span>
        <span className="register-compact-head-status">C</span>
      </div>
    ) : registerLayoutMode === "desktop" ? (
      <div
        className="register-row register-head register-row-with-attachments"
        style={registerTableLayout.rowStyle}
        aria-label="Register column headings"
      >
        {registerTableLayout.visibleColumns.map((column) => (
          <span
            className={[
              column.id === "attachments" ? "register-head-icon" : "",
              column.id === "amount" ||
              column.id === "runningBalance"
                ? "register-head-money"
                : "",
              "table-layout-resizable-head-cell",
            ]
              .filter(Boolean)
              .join(" ")}
            key={column.id}
            aria-label={column.id === "attachments" ? "Attachments" : undefined}
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
    ) : null;

  return (
    <div className="register-workspace">
      <Card
        className={`register-table-card register-layout-${registerLayoutMode}`}
      >
        <div className="register-sticky-stack">
          <section className="register-clean-header">
            <div>
              <h1>{data.accountName}</h1>
              <p className="muted">
                Keyboard-first date entry · Save & add another
              </p>
            </div>

            <div className="register-main-balance">
              <span>Balance</span>
              <strong>
                {formatMoney(data.workingBalance, data.currencyCode)}
              </strong>
            </div>
          </section>

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

              <div className="register-search-shell">
                <input
                  ref={registerSearchInputRef}
                  className="register-search"
                  placeholder="Search payees, categories, memos or amounts…"
                  aria-label="Search transactions"
                  value={registerSearchDraft}
                  onChange={(event) => {
                    setRegisterSearchDraft(event.target.value);
                    setIsRegisterSearchOpen(true);
                  }}
                  onFocus={() => setIsRegisterSearchOpen(true)}
                  onKeyDown={handleRegisterSearchKeyDown}
                />
                {committedRegisterSearch ? (
                  <button
                    className="register-search-clear"
                    type="button"
                    onClick={clearRegisterSearch}
                  >
                    Clear
                  </button>
                ) : null}
                {isRegisterSearchOpen ? (
                  <RegisterSearchDropdown
                    query={registerSearchDraft}
                    suggestions={registerSearchSuggestions}
                    activeIndex={activeRegisterSearchSuggestionIndex}
                    onCommit={commitRegisterSearch}
                    onHighlight={setActiveRegisterSearchSuggestionIndex}
                  />
                ) : null}
              </div>

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

              <button
                className="button button-secondary"
                type="button"
                disabled
              >
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


          {registerColumnHeader}
          {committedRegisterSearch ? (
            <div className="register-search-status" role="status">
              <strong>Searching {REGISTER_SEARCH_SCOPE_LABELS[committedRegisterSearch.scope]}</strong>
              <span>
                “{committedRegisterSearch.query}” · {searchedRegisterTransactions.length} of {registerTransactions.length} transactions
              </span>
              <button type="button" onClick={clearRegisterSearch}>
                Clear search
              </button>
            </div>
          ) : null}
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
              await addTransactions(transactions);
            }}
          />
        )}

        <div className="register-table">
          {showEntryRow && (
            <TransactionEntryRow
              initialDate={lastEntryDate}
              categoryOptions={categoryOptions}
              transferAccounts={transferAccounts}
              payeeOptions={payeeOptions}
              currencyCode={data.currencyCode}
              visibleColumns={registerEntryColumnSet}
              visibleColumnIds={registerEntryVisibleColumnIds}
              rowStyle={registerEntryRowStyle}
              layoutMode={registerLayoutMode}
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
              transactionIndex > 0
                ? visibleTransactions[transactionIndex - 1]
                : null;
            const showMonthSeparator =
              transactionIndex === 0 ||
              formatRegisterMonthSeparator(previousTransaction?.date ?? "") !==
                formatRegisterMonthSeparator(transaction.date);

            return (
              <div
                className="register-transaction-with-month"
                key={transaction.id}
              >
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
                    currencyCode={data.currencyCode}
                    onSave={(input) => {
                      updateTransaction(input);
                      setEditingTransactionId(null);
                    }}
                    onCancel={() => setEditingTransactionId(null)}
                    onManageTransactionAttachments={
                      handleManageTransactionAttachments
                    }
                    visibleColumns={registerEditColumnSet}
                    visibleColumnIds={registerEditVisibleColumnIds}
                    rowStyle={registerEditRowStyle}
                    layoutMode={registerLayoutMode}
                  />
                ) : (
                  <TransactionRow
                    transaction={transaction}
                    currencyCode={data.currencyCode}
                    dateFormat={dateFormat}
                    isSelected={registerSelection.isSelected(transaction.id)}
                    onSelectTransaction={handleSelectTransaction}
                    onToggleTransactionSelection={handleToggleTransactionSelection}
                    onEditTransaction={handleEditTransaction}
                    onToggleClearedTransaction={handleToggleClearedTransaction}
                    onManageTransactionAttachments={
                      handleManageTransactionAttachments
                    }
                    onUpdateTransactionFlag={handleUpdateTransactionFlag}
                    visibleColumns={registerTableLayout.visibleColumnSet}
                    rowStyle={registerTableLayout.rowStyle}
                    layoutMode={registerLayoutMode}
                  />
                )}
              </div>
            );
          })}
        </div>

        {hasRegisterActionSelection && !editingTransactionId ? (
          <SelectionBar
            selectionCount={registerSelectionActions.selectedCount}
            itemLabel="Transaction"
            ariaLabel="Selected transaction actions"
            actions={registerSelectionActions.actions}
            onClearSelection={clearRegisterSelection}
          />
        ) : null}

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
