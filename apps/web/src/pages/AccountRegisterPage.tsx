import { ArrowDown, ArrowUp, Paperclip, Tag } from "lucide-react";
import "../styles/register.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import {
  WorkspaceBody,
  WorkspaceHeader,
  WorkspaceLayout,
  WorkspaceStickyHeader,
} from "../components/workspace";
import { SelectionBar } from "../components/ui/SelectionBar";
import { ScheduledTransactionsPanel } from "../components/accounts/ScheduledTransactionsPanel";
import { AttachmentManager } from "../features/accounts/components/AttachmentManager";
import { TransactionImportDialog } from "../features/accounts/components/TransactionImportDialog";
import { RegisterToolbar } from "../features/accounts/components/RegisterToolbar";
import {
  TransactionEditRow,
  TransactionEntryRow,
} from "../features/accounts/components/RegisterTransactionEditor";
import type { RegisterInlineCategoryCreateInput } from "../features/accounts/components/RegisterCategoryInput";
import {
  TransactionRow,
  type RegisterColumnId,
} from "../features/accounts/components/TransactionRow";
import {
  mapSqliteTransactions,
  toTransactionWriteInput,
  useAccountRegister,
} from "../features/accounts/useAccountRegister";
import { createRuntimeUuid } from "../features/ids/createRuntimeUuid";
import { loadTransactionImportRegisterEvidence } from "../features/accounts/loadTransactionImportRegisterEvidence";
import { useRegisterLayoutMode } from "../features/accounts/registerLayoutMode";
import { useRegisterSelection } from "../features/accounts/useRegisterSelection";
import { useRegisterSelectionActions } from "../features/accounts/useRegisterSelectionActions";
import {
  getRegisterMonthCheckboxState,
  getRegisterMonthKey,
  loadRegisterTransactionIdsForMonth,
} from "../features/accounts/registerMonthSelection";
import {
  buildSortedSelectedTransactionsCsv,
  createSelectedTransactionsFilename,
  downloadCsv,
  loadSelectedAccountTransactionRows,
} from "../features/accounts/registerSelectedTransactionsCsv";
import { useRegisterCommands } from "../features/accounts/useRegisterCommands";
import { usePayeeManagerWorkflow } from "../features/accounts/usePayeeManagerWorkflow";
import { usePayeeHistory } from "../features/accounts/usePayeeHistory";
import { useRegisterAttachmentWorkflow } from "../features/accounts/useRegisterAttachmentWorkflow";
import { useRegisterViewModel } from "../features/accounts/useRegisterViewModel";
import { getRegisterTransactions } from "../features/accounts/registerTransactionData";
import { useRegisterTransactionHistory } from "../features/accounts/useRegisterTransactionHistory";
import {
  nextRegisterSort,
  readRegisterSort,
  writeRegisterSort,
  type RegisterSortColumn,
  type RegisterSortState,
} from "../features/accounts/registerSorting";
import {
  REGISTER_COLUMN_DEFINITIONS,
  REGISTER_COLUMN_ID_ALIASES,
  REGISTER_COLUMN_LABELS,
  REGISTER_EDIT_COLUMN_DEFINITIONS,
  REGISTER_TABLE_LAYOUT_STORAGE_KEY_PREFIX,
  buildRegisterEditVisibleColumnIds,
} from "../features/accounts/registerColumns";
import {
  REGISTER_SEARCH_SCOPE_LABELS,
  type RegisterSearchCommit,
  type RegisterSearchSuggestion,
} from "../features/accounts/registerSearch";
import type { SidebarAccount } from "../features/accounts/accountService";
import {
  countTransactionTagReferences,
  removeTransactionTagReferences,
} from "../features/accounts/accountRegisterService";
import { getBudgetPersistenceProvider } from "../features/persistence";
import { getActiveKeyValueStorage } from "../features/persistence/activeKeyValueStorage";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
import { useCurrentBudgetMonth } from "../features/budget/useCurrentBudgetMonth";
import { useApplicationHistory } from "../features/history";
import { setTransactionTagsCommand } from "../features/history/commands/management/tagCommands";
import type {
  TransactionEditableField,
  TransactionEditIntent,
} from "../features/transactions/transactionEditIntent";
import { createImportTransactionsCommand } from "../features/history/commands/imports/importCommands";
import { createBudgetScopedStorage } from "../features/budget/budgetDataScope";
import {
  TransactionTagManager,
  createTransactionTagService,
} from "../features/tags";
import { ColumnResizeHandle } from "../features/tableLayout/ColumnResizeHandle";
import {
  buildTableRowStyle,
  useTableLayout,
} from "../features/tableLayout/tableLayout";
import type { RegisterTransactionView } from "../features/accounts/accountRegisterTypes";
import type { BudgetCategoryOption } from "../features/budget/budgetViewTypes";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import { formatDateForDisplay } from "../features/settings/dateFormatting";
import { useDateFormatPreference } from "../features/settings/useDateFormatPreference";
import { useDeveloperPerformanceMode } from "../features/settings/useDeveloperPerformanceMode";
import { useRegisterMerchantIconsPreference } from "../features/settings/useRegisterMerchantIconsPreference";
import { resolveRegisterPayee } from "../features/accounts/registerMerchantIcons";
import {
  buildRegisterPerformanceSnapshot,
  formatPerformanceMs,
  getPerformanceNow,
  type RegisterPerformanceTimings,
} from "../features/performance/registerPerformanceInstrumentation";

interface RecentImportActivity {
  readonly version: 1;
  readonly budgetId: string;
  readonly accountId: string;
  readonly importedTransactionIds: readonly string[];
  readonly matchedTransactionIds: readonly string[];
}

const RECENT_IMPORT_ACTIVITY_STORAGE_PREFIX =
  "budget-app.recent-import-activity.v1";

function recentImportActivityStorageKey(
  budgetId: string,
  accountId: string,
): string {
  return `${RECENT_IMPORT_ACTIVITY_STORAGE_PREFIX}/${encodeURIComponent(
    budgetId,
  )}/${encodeURIComponent(accountId)}`;
}

function readRecentImportActivity(
  budgetId: string,
  accountId: string,
): RecentImportActivity | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(
      recentImportActivityStorageKey(budgetId, accountId),
    );
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const value = parsed as Record<string, unknown>;
    if (
      value.version !== 1 ||
      value.budgetId !== budgetId ||
      value.accountId !== accountId ||
      !Array.isArray(value.importedTransactionIds) ||
      !value.importedTransactionIds.every(
        (transactionId) => typeof transactionId === "string",
      ) ||
      !Array.isArray(value.matchedTransactionIds) ||
      !value.matchedTransactionIds.every(
        (transactionId) => typeof transactionId === "string",
      )
    ) {
      return null;
    }

    return {
      version: 1,
      budgetId,
      accountId,
      importedTransactionIds: [
        ...new Set(value.importedTransactionIds as string[]),
      ],
      matchedTransactionIds: [
        ...new Set(value.matchedTransactionIds as string[]),
      ],
    };
  } catch {
    return null;
  }
}

function writeRecentImportActivity(
  activity: RecentImportActivity,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      recentImportActivityStorageKey(
        activity.budgetId,
        activity.accountId,
      ),
      JSON.stringify(activity),
    );
  } catch {
    // Highlighting is presentation-only. A storage failure must not affect
    // a successfully committed import.
  }
}

interface RegisterContextMenuPosition {
  transactionId: string;
  top: number;
  left: number;
}

function resolveRegisterContextMenuPosition(
  event: MouseEvent<HTMLElement>,
): Omit<RegisterContextMenuPosition, "transactionId"> {
  const menuWidth = 230;
  const viewportPadding = 12;
  const left = Math.min(
    Math.max(viewportPadding, event.clientX),
    Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
  );

  return {
    top: Math.max(viewportPadding, event.clientY),
    left,
  };
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

function RegisterMonthSelectionCheckbox({
  label,
  state,
  disabled,
  onChange,
}: {
  label: string;
  state: "unchecked" | "checked" | "mixed";
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "mixed";
  }, [state]);
  const selecting = state !== "checked";
  return (
    <input
      ref={ref}
      className="register-month-selection-checkbox"
      type="checkbox"
      checked={state === "checked"}
      disabled={disabled}
      aria-checked={state === "mixed" ? "mixed" : state === "checked"}
      aria-label={`${selecting ? "Select" : "Deselect"} all ${label} transactions`}
      onChange={onChange}
    />
  );
}

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
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

function resolveMoveAccountMenuPositionFromPoint(point: {
  top: number;
  left: number;
}) {
  const menuWidth = 280;
  const viewportPadding = 12;
  const left = Math.min(
    Math.max(viewportPadding, point.left),
    Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
  );

  return {
    bottom: Math.max(viewportPadding, window.innerHeight - point.top + 6),
    left,
  };
}

function resolveMoveAccountMenuPositionFromSelectionBar() {
  const menuWidth = 280;
  const viewportPadding = 12;
  const centeredLeft = (window.innerWidth - menuWidth) / 2;

  return {
    bottom: 86,
    left: Math.min(
      Math.max(viewportPadding, centeredLeft),
      Math.max(
        viewportPadding,
        window.innerWidth - menuWidth - viewportPadding,
      ),
    ),
  };
}

function getMoveAccountIcon(account: SidebarAccount) {
  if (account.type === "credit-card") {
    return "💳";
  }

  if (account.type === "tracking") {
    return "📈";
  }

  return "🏦";
}

export function AccountRegisterPage() {
  const { accountId = "everyday" } = useParams();
  const [searchParams] = useSearchParams();
  const requestedCategoryFilter = searchParams.get("categoryFilter");
  const persistenceGateway = getBudgetPersistenceProvider();
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const activeBudgetId = resolveActiveBudgetId(budgets, selectedBudgetId);
  const payeeHistory = usePayeeHistory(activeBudgetId);
  const currentBudgetMonth = useCurrentBudgetMonth();
  const { canUndo, canRedo, undoLabel, redoLabel, undoDepth, redoDepth, isBusy: isHistoryBusy, execute: executeHistory, undo, redo } = useApplicationHistory();
  const undoTitle = canUndo && undoLabel ? `Undo ${undoLabel}` : "Nothing to undo";
  const redoTitle = canRedo && redoLabel ? `Redo ${redoLabel}` : "Nothing to redo";
  const transactionTagStorage = useMemo(
    () => createBudgetScopedStorage(getActiveKeyValueStorage()),
    [activeBudgetId],
  );
  const transactionTagService = useMemo(
    () =>
      createTransactionTagService({
        storage: transactionTagStorage,
        countUsage: (tagId) =>
          countTransactionTagReferences(transactionTagStorage, tagId),
        removeTagReferences: (tagId) =>
          removeTransactionTagReferences(transactionTagStorage, tagId),
      }),
    [transactionTagStorage],
  );
  const [transactionTags, setTransactionTags] = useState(() =>
    transactionTagService.listTags(),
  );

  useEffect(() => {
    setTransactionTags(transactionTagService.listTags());
  }, [transactionTagService]);
  const accountsPersistence = persistenceGateway.accounts;
  const legacyPayeesPersistence = persistenceGateway.payees;
  const categoriesPersistence = persistenceGateway.categories;
  const scheduledTransactionsPersistence =
    persistenceGateway.scheduledTransactions;
  const {
    data,
    isLoading,
    error,
    commitTransactionBatch,
    addAttachment,
    removeAttachment,
    renamePayeeReferences,
    reassignPayeeReferences,
    totalTransactionCount,
    hasMoreTransactions,
    loadMoreTransactions,
    storageMode,
    setRegisterViewQuery,
  } = useAccountRegister(accountId, activeBudgetId);
  const {
    addTransaction,
    updateTransaction,
    deleteTransactions,
    toggleCleared,
    setTransactionsCleared,
    moveTransactions,
  } = useRegisterTransactionHistory(activeBudgetId, accountId);

  const syncTransactionTagsToPersistence = useCallback(async (label = "Update tags") => {
    const queries = persistenceGateway.accountRegisterQueries;
    if (storageMode !== "sqlite" || !activeBudgetId || !queries) return;
    const result = await executeHistory(setTransactionTagsCommand(
      `tags:${Date.now()}`,
      label,
      transactionTagService.listTags({ includeArchived: true }),
    ));
    if (!result.performed) throw new Error(result.error ?? "Tag history command failed.");
  }, [
    activeBudgetId,
    persistenceGateway.accountRegisterQueries,
    storageMode,
    transactionTagService,
    executeHistory,
  ]);

  useEffect(() => {
    const queries = persistenceGateway.accountRegisterQueries;
    if (storageMode !== "sqlite" || !activeBudgetId || !queries) return;
    let cancelled = false;
    void queries.listTransactionTags(activeBudgetId).then((tags) => {
      if (cancelled) return;
      transactionTagService.replaceAllTags(tags);
      setTransactionTags(transactionTagService.listTags());
    });
    return () => {
      cancelled = true;
    };
  }, [
    activeBudgetId,
    persistenceGateway.accountRegisterQueries,
    storageMode,
    transactionTagService,
    undoDepth,
    redoDepth,
  ]);

  const payeesPersistence = useMemo(() => {
    const queries = persistenceGateway.accountRegisterQueries;
    if (storageMode !== "sqlite" || !activeBudgetId || !queries) {
      return legacyPayeesPersistence;
    }
    return {
      async listPayees() {
        return [...await queries.listPayees(activeBudgetId, false)];
      },
      async listArchivedPayees() {
        return [...await queries.listPayees(activeBudgetId, true)];
      },
      async recordPayee(name: string) {
        return await payeeHistory.createPayee(name);
      },
      async renamePayee(input: { id: string; name: string }) {
        return await payeeHistory.updatePayee(input);
      },
      async archivePayee(id: string) {
        return await payeeHistory.setPayeeArchived(id, true);
      },
      async restorePayee(id: string) {
        return await payeeHistory.setPayeeArchived(id, false);
      },
      async mergePayees(input: {
        sourcePayeeId: string;
        targetPayeeId: string;
      }) {
        return [...await queries.mergePayees(activeBudgetId, input)];
      },
    };
  }, [
    activeBudgetId,
    legacyPayeesPersistence,
    persistenceGateway.accountRegisterQueries,
    payeeHistory,
    storageMode,
  ]);

  useEffect(() => {
    if (data) {
      window.dispatchEvent(new Event("budget-app:account-navigation-updated"));
    }
  }, [data]);

  const [showEntryRow, setShowEntryRow] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null);
  const [transactionEditIntent, setTransactionEditIntent] =
    useState<TransactionEditIntent>({ field: "date" });
  const [lastEntryDate, setLastEntryDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [categoryOptions, setCategoryOptions] = useState<
    BudgetCategoryOption[]
  >([]);
  const [transferAccounts, setTransferAccounts] = useState<SidebarAccount[]>(
    [],
  );
  const [moveAccountMenuPosition, setMoveAccountMenuPosition] = useState<{
    bottom: number;
    left: number;
  } | null>(null);
  const [activeRegisterView, setActiveRegisterView] = useState<"register" | "scheduled">("register");
  const [scheduledDueCount, setScheduledDueCount] = useState(0);
  useEffect(() => {
    setActiveRegisterView("register");
    setScheduledDueCount(0);
  }, [accountId]);
  const [isTransactionTagManagerOpen, setIsTransactionTagManagerOpen] =
    useState(false);
  const [isTransactionImportOpen, setIsTransactionImportOpen] = useState(false);
  const [isTransactionImportOpening, setIsTransactionImportOpening] = useState(false);
  const [recentImportActivity, setRecentImportActivity] =
    useState<RecentImportActivity | null>(() =>
      activeBudgetId
        ? readRecentImportActivity(activeBudgetId, accountId)
        : null,
    );
  const [registerContextMenuPosition, setRegisterContextMenuPosition] =
    useState<RegisterContextMenuPosition | null>(null);
  useEffect(() => {
    setRecentImportActivity(
      activeBudgetId
        ? readRecentImportActivity(activeBudgetId, accountId)
        : null,
    );
  }, [activeBudgetId, accountId]);

  const recentlyImportedTransactionIds = useMemo(
    () =>
      new Set(
        recentImportActivity?.importedTransactionIds ?? [],
      ),
    [recentImportActivity],
  );
  const recentlyMatchedTransactionIds = useMemo(
    () =>
      new Set(
        recentImportActivity?.matchedTransactionIds ?? [],
      ),
    [recentImportActivity],
  );

  const [registerSearchDraft, setRegisterSearchDraft] = useState("");
  const [committedRegisterSearch, setCommittedRegisterSearch] =
    useState<RegisterSearchCommit | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "uncategorised">(
    requestedCategoryFilter === "uncategorised"
      ? "uncategorised"
      : "all",
  );
  useEffect(() => {
    setCategoryFilter(
      requestedCategoryFilter === "uncategorised"
        ? "uncategorised"
        : "all",
    );
  }, [accountId, requestedCategoryFilter]);
  const registerSortScopeId = `${activeBudgetId ?? "unscoped"}.${accountId}`;
  const [registerSort, setRegisterSort] = useState<RegisterSortState>(() =>
    readRegisterSort(registerSortScopeId),
  );

  useEffect(() => {
    setRegisterViewQuery({
      search: committedRegisterSearch
        ? {
            query: committedRegisterSearch.query,
            scope: committedRegisterSearch.scope,
          }
        : null,
      categoryFilter:
        data?.accountType === "Tracking" ? "all" : categoryFilter,
      sort: registerSort,
    });
  }, [
    categoryFilter,
    committedRegisterSearch,
    data?.accountType,
    registerSort,
    setRegisterViewQuery,
  ]);
  const [isRegisterSearchOpen, setIsRegisterSearchOpen] = useState(false);
  const [
    activeRegisterSearchSuggestionIndex,
    setActiveRegisterSearchSuggestionIndex,
  ] = useState<number | null>(null);
  const registerSearchInputRef = useRef<HTMLInputElement | null>(null);
  const dateFormat = useDateFormatPreference();
  const developerPerformanceMode = useDeveloperPerformanceMode();
  const showMerchantIconsInRegister = useRegisterMerchantIconsPreference();
  const registerPerformanceTimingsRef = useRef<RegisterPerformanceTimings>({});
  const registerRenderStartedAt = getPerformanceNow(developerPerformanceMode);

  if (developerPerformanceMode) {
    registerPerformanceTimingsRef.current = {};
  }

  useEffect(() => {
    setRegisterSort(readRegisterSort(registerSortScopeId));
  }, [registerSortScopeId]);

  useEffect(() => {
    setRegisterPage(1);
  }, [accountId]);

  const registerLayoutMode = useRegisterLayoutMode();

  const registerTableLayout = useTableLayout<RegisterColumnId>({
    storageKeyPrefix: REGISTER_TABLE_LAYOUT_STORAGE_KEY_PREFIX,
    scopeId: activeBudgetId,
    columns: REGISTER_COLUMN_DEFINITIONS,
    columnIdAliases: REGISTER_COLUMN_ID_ALIASES,
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
    () =>
      buildRegisterEditVisibleColumnIds(
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
        month: currentBudgetMonth,
      })
      .then((options) => {
        if (isMounted) {
          setCategoryOptions(options);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeBudgetId, categoriesPersistence, currentBudgetMonth]);

  const createInlineCategory = useCallback(
    async (
      input: RegisterInlineCategoryCreateInput,
    ): Promise<BudgetCategoryOption> => {
      if (!activeBudgetId) {
        throw new Error("Open a budget before creating a category.");
      }

      await categoriesPersistence.createCategory({
        budgetId: activeBudgetId,
        month: currentBudgetMonth,
        ...input,
      });

      const nextOptions = await categoriesPersistence.getCategoryOptions({
        budgetId: activeBudgetId,
        month: currentBudgetMonth,
      });
      setCategoryOptions(nextOptions);

      const created = nextOptions.find(
        (option) =>
          option.name.trim().toLowerCase() ===
            input.name.trim().toLowerCase() &&
          (!input.groupId || option.groupId === input.groupId) &&
          (!input.groupName ||
            option.groupName.trim().toLowerCase() ===
              input.groupName.trim().toLowerCase()),
      );

      if (!created) {
        throw new Error("The category was created but could not be selected.");
      }

      return created;
    },
    [activeBudgetId, categoriesPersistence, currentBudgetMonth],
  );

  useEffect(() => {
    let active = true;

    const accountQueries = persistenceGateway.accountRegisterQueries;
    const loadAccounts = storageMode === "sqlite" && activeBudgetId && accountQueries
      ? accountQueries.listAccounts(activeBudgetId)
      : accountsPersistence.listAccounts();
    loadAccounts.then((loadedAccounts) => {
      if (active) {
        setTransferAccounts(
          loadedAccounts.filter(
            (account) => account.id !== accountId && !account.closedAt,
          ),
        );
      }
    });

    return () => {
      active = false;
    };
  }, [
    accountId,
    accountsPersistence,
    activeBudgetId,
    persistenceGateway.accountRegisterQueries,
    storageMode,
  ]);

  const registerTransactions = getRegisterTransactions(data);
  const {
    setRegisterPage,
    registerSearchSuggestions,
    searchedRegisterTransactions,
    categoryFilteredRegisterTransactions,
    sortedRegisterTransactions,
    registerPagination,
    visibleTransactions,
    visibleTransactionIds,
  } = useRegisterViewModel({
    transactions: registerTransactions,
    searchDraft: registerSearchDraft,
    committedSearch: committedRegisterSearch,
    categoryFilter,
    categoriesEnabled: data?.accountType !== "Tracking",
    sort: registerSort,
    developerPerformanceMode,
    performanceTimingsRef: registerPerformanceTimingsRef,
    totalItemsOverride:
      storageMode === "sqlite" ? totalTransactionCount : undefined,
  });

  useEffect(() => {
    setActiveRegisterSearchSuggestionIndex(null);
  }, [registerSearchDraft]);

  useEffect(() => {
    if (data?.accountType === "Tracking" && categoryFilter !== "all") {
      setCategoryFilter("all");
    }
  }, [categoryFilter, data?.accountType]);

  const registerSelection = useRegisterSelection(visibleTransactionIds);
  const [monthTransactionIds, setMonthTransactionIds] = useState<
    Record<string, string[]>
  >({});
  const [selectionExportError, setSelectionExportError] = useState<string | null>(null);
  const selectedRegisterTransactionIds = registerSelection.selectedIds;
  const selectedRegisterTransactionCount = registerSelection.selectedCount;
  const selectedRegisterActionTransactionIds = selectedRegisterTransactionIds;
  const loadedSelectedRegisterActionTransactions = useMemo(() => {
    if (selectedRegisterActionTransactionIds.length === 0) {
      return [];
    }

    const selectedRegisterActionIdSet = new Set(
      selectedRegisterActionTransactionIds,
    );
    return registerTransactions.filter((transaction) =>
      selectedRegisterActionIdSet.has(transaction.id),
    );
  }, [registerTransactions, selectedRegisterActionTransactionIds]);
  const [authoritativeSelectedRegisterTransactions, setAuthoritativeSelectedRegisterTransactions] =
    useState<RegisterTransactionView[]>([]);
  const selectedRegisterActionTransactions = storageMode === "sqlite"
    ? authoritativeSelectedRegisterTransactions
    : loadedSelectedRegisterActionTransactions;

  useEffect(() => {
    let active = true;
    if (storageMode !== "sqlite") {
      setAuthoritativeSelectedRegisterTransactions([]);
      return () => { active = false; };
    }
    if (selectedRegisterActionTransactionIds.length === 0) {
      setAuthoritativeSelectedRegisterTransactions([]);
      return () => { active = false; };
    }
    const queries = persistenceGateway.accountRegisterQueries;
    if (!activeBudgetId || !queries?.getTransactionsByIds) {
      return () => { active = false; };
    }
    const getTransactionsByIds = queries.getTransactionsByIds.bind(queries);
    const selectedIds = [...selectedRegisterActionTransactionIds];
    void (async () => {
      const rows: Awaited<ReturnType<typeof getTransactionsByIds>>[number][] = [];
      for (let offset = 0; offset < selectedIds.length; offset += 250) {
        rows.push(...await getTransactionsByIds({
          budgetId: activeBudgetId,
          accountId,
          ids: selectedIds.slice(offset, offset + 250),
        }));
      }
      if (!active) return;
      registerSelection.prune(rows.map((row) => row.id));
      setAuthoritativeSelectedRegisterTransactions(mapSqliteTransactions(rows, 0));
    })().catch(() => {
      if (active) setSelectionExportError("Selected transactions could not be revalidated. Please retry.");
    });
    return () => { active = false; };
  }, [
    accountId,
    activeBudgetId,
    persistenceGateway.accountRegisterQueries,
    registerSelection.prune,
    selectedRegisterActionTransactionIds,
    storageMode,
  ]);

  useEffect(() => {
    registerSelection.clear();
    setMonthTransactionIds({});
    setSelectionExportError(null);
  }, [accountId, categoryFilter, committedRegisterSearch, registerSort]);

  const visibleMonthKeys = useMemo(
    () => [...new Set(visibleTransactions
      .map((transaction) => getRegisterMonthKey(transaction.date))
      .filter((monthKey): monthKey is string => monthKey !== null))],
    [visibleTransactions],
  );

  useEffect(() => {
    let active = true;
    if (storageMode !== "sqlite") {
      const idsByMonth: Record<string, string[]> = {};
      for (const transaction of sortedRegisterTransactions) {
        const monthKey = getRegisterMonthKey(transaction.date);
        if (monthKey) (idsByMonth[monthKey] ??= []).push(transaction.id);
      }
      setMonthTransactionIds(idsByMonth);
      return () => { active = false; };
    }

    const queries = persistenceGateway.accountRegisterQueries;
    if (!activeBudgetId || !queries) return () => { active = false; };
    setMonthTransactionIds({});
    void Promise.all(visibleMonthKeys.map(async (monthKey) => [
      monthKey,
      await loadRegisterTransactionIdsForMonth({
        monthKey,
        query: {
          budgetId: activeBudgetId,
          accountId,
          search: committedRegisterSearch ?? undefined,
          categoryFilter: data?.accountType === "Tracking" ? "all" : categoryFilter,
          sort: registerSort,
        },
        queryPage: (query) => queries.queryTransactions(query),
      }),
    ] as const)).then((entries) => {
      if (active) setMonthTransactionIds(Object.fromEntries(entries));
    }).catch(() => {
      if (active) setSelectionExportError("Could not load all transactions for month selection. Please retry.");
    });
    return () => { active = false; };
  }, [
    accountId,
    activeBudgetId,
    categoryFilter,
    committedRegisterSearch,
    data?.accountType,
    persistenceGateway.accountRegisterQueries,
    registerSort,
    sortedRegisterTransactions,
    storageMode,
    visibleMonthKeys,
  ]);

  const registerAttachmentWorkflow = useRegisterAttachmentWorkflow({
    budgetId: activeBudgetId,
    transactions: registerTransactions,
    addAttachment,
    removeAttachment,
  });

  const {
    payeeOptions,
    allManagedPayees,
    createInlinePayee,
    isPayeeManagerOpen,
    setIsPayeeManagerOpen,
    selectedPayeeId,
    setSelectedPayeeId,
    payeeRenameDraft,
    setPayeeRenameDraft,
    payeeMergeTargetId,
    setPayeeMergeTargetId,
    payeeManagerMessage,
    setPayeeManagerMessage,
    payeeManagerError,
    setPayeeManagerError,
    payeeSummaries,
    activePayeeSummaries,
    archivedPayeeSummaries,
    selectedPayeeSummary,
    mergeTargetOptions,
    handleRenamePayee,
    handleArchiveSelectedPayee,
    handleRestoreSelectedPayee,
    handleMergeSelectedPayee,
  } = usePayeeManagerWorkflow({
    payeesPersistence,
    scheduledTransactionsPersistence,
    persistenceAlreadyPropagatedPayeeReferences: storageMode === "sqlite",
    registerTransactions,
    renamePayeeReferences:
      storageMode === "sqlite" ? async () => undefined : renamePayeeReferences,
    reassignPayeeReferences:
      storageMode === "sqlite" ? async () => undefined : reassignPayeeReferences,
    developerPerformanceMode,
    performanceTimingsRef: registerPerformanceTimingsRef,
  });

  const registerPayeesById = useMemo(
    () => showMerchantIconsInRegister
      ? new Map(allManagedPayees.map((payee) => [payee.id, payee]))
      : new Map(),
    [allManagedPayees, showMerchantIconsInRegister],
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
            : Math.min(
                current + 1,
                Math.max(0, registerSearchSuggestions.length - 1),
              ),
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

  const registerCommands = useRegisterCommands({
    registerSelection,
    setEditingTransactionId,
    setShowEntryRow,
    openAttachmentManager: registerAttachmentWorkflow.openAttachmentManager,
    toggleCleared,
    updateTransaction,
  });

  const handleSelectTransaction = registerCommands.selectTransaction;
  const handleToggleTransactionSelection =
    registerCommands.toggleTransactionSelection;
  const handleEditTransaction = (
    transactionId: string,
    field: TransactionEditableField,
  ) => {
    setTransactionEditIntent({ field });
    registerCommands.editTransaction(transactionId);
  };
  const handleToggleClearedTransaction =
    registerCommands.toggleClearedTransaction;
  const handleManageTransactionAttachments =
    registerCommands.manageTransactionAttachments;
  const handleCreateTransactionTag = useCallback(
    (name: string) => {
      const tag = transactionTagService.createTag({
        name,
        colour: "blue",
      });
      setTransactionTags(transactionTagService.listTags());
      void syncTransactionTagsToPersistence("Create tag");
      return tag;
    },
    [syncTransactionTagsToPersistence, transactionTagService],
  );

  const handleUpdateTransactionTags = useCallback(
    (transaction: RegisterTransactionView, tagIds: string[]) => {
      void updateTransaction({
        id: transaction.id,
        date: transaction.date,
        tagIds,
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

  const handleOpenRegisterContextMenu = useCallback(
    (transactionId: string, event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!registerSelection.isSelected(transactionId)) {
        registerSelection.selectSingle(transactionId);
      }

      setEditingTransactionId(null);
      setRegisterContextMenuPosition({
        transactionId,
        ...resolveRegisterContextMenuPosition(event),
      });
    },
    [registerSelection],
  );

  const clearRegisterSelection = registerSelection.clear;

  const moveableSelectedTransactions = useMemo(
    () =>
      selectedRegisterActionTransactions.filter(
        (transaction) =>
          !transaction.transferId &&
          !transaction.transferAccountId &&
          !transaction.transferTransactionId &&
          !transaction.reconciled,
      ),
    [selectedRegisterActionTransactions],
  );
  const moveTargetAccounts = transferAccounts;
  const selectedTransferTransactionCount =
    selectedRegisterActionTransactions.filter(
      (transaction) =>
        transaction.transferId ||
        transaction.transferAccountId ||
        transaction.transferTransactionId,
    ).length;
  const selectedReconciledTransactionCount =
    selectedRegisterActionTransactions.filter(
      (transaction) => transaction.reconciled,
    ).length;

  const openMoveTransactionDialog = useCallback(() => {
    if (
      moveableSelectedTransactions.length === 0 ||
      moveTargetAccounts.length === 0
    ) {
      return;
    }

    setMoveAccountMenuPosition(
      registerContextMenuPosition
        ? resolveMoveAccountMenuPositionFromPoint(registerContextMenuPosition)
        : resolveMoveAccountMenuPositionFromSelectionBar(),
    );
  }, [
    moveTargetAccounts.length,
    moveableSelectedTransactions.length,
    registerContextMenuPosition,
  ]);

  const handleMoveSelectedTransactions = useCallback(
    async (targetAccountId: string) => {
      if (!targetAccountId || moveableSelectedTransactions.length === 0) {
        return;
      }

      await moveTransactions(
        targetAccountId,
        moveableSelectedTransactions.map((transaction) => transaction.id),
      );
      setMoveAccountMenuPosition(null);
      clearRegisterSelection();
      setEditingTransactionId(null);
    },
    [clearRegisterSelection, moveTransactions, moveableSelectedTransactions],
  );

  const handleExportSelectedTransactions = useCallback(async () => {
    const selectedIds = [...selectedRegisterActionTransactionIds];
    if (selectedIds.length === 0) return;
    setSelectionExportError(null);

    try {
      let transactions: RegisterTransactionView[];
      if (storageMode === "sqlite") {
        const queries = persistenceGateway.accountRegisterQueries;
        if (!activeBudgetId || !queries?.getTransactionsByIds) {
          throw new Error("Authoritative transaction loading is unavailable.");
        }
        const rows = await loadSelectedAccountTransactionRows({
          selectedIds,
          loadByIds: (ids) => queries.getTransactionsByIds!({
            budgetId: activeBudgetId,
            accountId,
            ids,
          }),
        });
        transactions = mapSqliteTransactions(rows, 0);
      } else {
        const selected = new Set(selectedIds);
        transactions = registerTransactions.filter((transaction) => selected.has(transaction.id));
        if (transactions.length !== selected.size) {
          throw new Error("One or more selected transactions no longer exist. Nothing was exported.");
        }
      }

      const tagNamesById = new Map(transactionTags.map((tag) => [tag.id, tag.name]));
      const accountNamesById = new Map([
        [data?.accountId ?? accountId, data?.accountName ?? accountId],
        ...transferAccounts.map((account) => [account.id, account.name] as const),
      ]);
      const csv = buildSortedSelectedTransactionsCsv({
        transactions,
        sort: registerSort,
        tagNamesById,
        accountNamesById,
      });
      downloadCsv(
        csv,
        createSelectedTransactionsFilename(
          data?.accountName ?? "account",
          new Date().toISOString().slice(0, 10),
        ),
      );
    } catch (error) {
      setSelectionExportError(
        error instanceof Error
          ? error.message
          : "Selected transactions could not be exported. Please retry.",
      );
    }
  }, [
    accountId,
    activeBudgetId,
    data?.accountId,
    data?.accountName,
    persistenceGateway.accountRegisterQueries,
    registerSort,
    registerTransactions,
    selectedRegisterActionTransactionIds,
    storageMode,
    transactionTags,
    transferAccounts,
  ]);

  const registerSelectionActions = useRegisterSelectionActions({
    selectedTransactionIds: selectedRegisterActionTransactionIds,
    selectedTransactions: selectedRegisterActionTransactions,
    deleteTransactions,
    setTransactionsCleared,
    clearSelection: clearRegisterSelection,
    editTransaction: (transactionId) => {
      setTransactionEditIntent({ field: "date" });
      setEditingTransactionId(transactionId);
    },
    openMoveTransactions: openMoveTransactionDialog,
    exportTransactions: () => { void handleExportSelectedTransactions(); },
  });
  const hasRegisterActionSelection = registerSelectionActions.hasSelection;
  const visibleSelectedRegisterTransactionCount = visibleTransactionIds.filter(
    (transactionId) => registerSelection.isSelected(transactionId),
  ).length;
  const areAllVisibleRegisterTransactionsSelected =
    visibleTransactionIds.length > 0 &&
    visibleSelectedRegisterTransactionCount === visibleTransactionIds.length;
  const isVisibleRegisterSelectionPartial =
    visibleSelectedRegisterTransactionCount > 0 &&
    !areAllVisibleRegisterTransactionsSelected;
  const handleToggleVisibleRegisterSelection = useCallback(() => {
    setEditingTransactionId(null);

    if (areAllVisibleRegisterTransactionsSelected) {
      clearRegisterSelection();
      return;
    }

    registerSelection.selectAll(visibleTransactionIds);
  }, [
    areAllVisibleRegisterTransactionsSelected,
    clearRegisterSelection,
    registerSelection,
    visibleTransactionIds,
  ]);

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
        setTransactionEditIntent({ field: "date" });
        setEditingTransactionId(transactionId);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    editingTransactionId,
    selectedRegisterTransactionCount,
    selectedRegisterTransactionIds,
  ]);

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

  useEffect(() => {
    if (!moveAccountMenuPosition) {
      return;
    }

    function handleMoveAccountMenuKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoveAccountMenuPosition(null);
      }
    }

    window.addEventListener("keydown", handleMoveAccountMenuKeyDown);
    return () => {
      window.removeEventListener("keydown", handleMoveAccountMenuKeyDown);
    };
  }, [moveAccountMenuPosition]);

  useEffect(() => {
    if (!registerContextMenuPosition) {
      return;
    }

    function closeRegisterContextMenu() {
      setRegisterContextMenuPosition(null);
    }

    function handleRegisterContextMenuDismissKeyDown(
      event: globalThis.KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRegisterContextMenu();
      }
    }

    window.addEventListener("keydown", handleRegisterContextMenuDismissKeyDown);
    window.addEventListener("scroll", closeRegisterContextMenu, true);

    return () => {
      window.removeEventListener(
        "keydown",
        handleRegisterContextMenuDismissKeyDown,
      );
      window.removeEventListener("scroll", closeRegisterContextMenu, true);
    };
  }, [registerContextMenuPosition]);

  if (isLoading) {
    return (
      <WorkspaceLayout className="page-stack">
        <WorkspaceHeader title="Account Register" subtitle="Loading account register…" />
        <WorkspaceBody>
          <Card>Loading account register.</Card>
        </WorkspaceBody>
      </WorkspaceLayout>
    );
  }

  if (error || !data) {
    return (
      <WorkspaceLayout className="page-stack">
        <WorkspaceHeader
          title="Account Register"
          subtitle="Unable to load account register."
        />
        <WorkspaceBody>
          <Card>{error ?? "Unknown error."}</Card>
        </WorkspaceBody>
      </WorkspaceLayout>
    );
  }

  const handleRegisterSort = (column: RegisterSortColumn) => {
    setRegisterSort((current) => {
      const next = nextRegisterSort(current, column);
      writeRegisterSort(registerSortScopeId, next);
      return next;
    });
  };

  const renderRegisterSortIndicator = (column: RegisterSortColumn) => {
    if (registerSort.column !== column) return null;
    return registerSort.direction === "ascending" ? (
      <ArrowUp size={12} aria-hidden="true" />
    ) : (
      <ArrowDown size={12} aria-hidden="true" />
    );
  };

  const sortableHeader = (column: RegisterSortColumn, label: string) => (
    <button
      type="button"
      className="register-sort-button"
      aria-label={`Sort by ${label}`}
      aria-pressed={registerSort.column === column}
      onClick={() => handleRegisterSort(column)}
    >
      <span>{label}</span>
      {renderRegisterSortIndicator(column)}
    </button>
  );

  const registerColumnHeader =
    registerLayoutMode === "compact" ? (
      <div
        className="register-row-compact register-head register-head-compact"
        aria-label="Register column headings"
      >
        <span className="register-compact-head-select">
          <input
            className="register-checkbox register-checkbox-input register-head-select-checkbox"
            type="checkbox"
            checked={areAllVisibleRegisterTransactionsSelected}
            aria-label={
              areAllVisibleRegisterTransactionsSelected
                ? "Deselect visible transactions"
                : "Select visible transactions"
            }
            aria-checked={
              isVisibleRegisterSelectionPartial
                ? "mixed"
                : areAllVisibleRegisterTransactionsSelected
            }
            ref={(node) => {
              if (node) {
                node.indeterminate = isVisibleRegisterSelectionPartial;
              }
            }}
            onChange={handleToggleVisibleRegisterSelection}
          />
        </span>
        <span className="register-compact-head-date">
          {sortableHeader("date", "Date")}
        </span>
        <span
          className="register-compact-head-tags register-head-icon"
          aria-label="Tags"
          title="Tags"
        >
          <Tag size={14} aria-hidden="true" />
        </span>
        <span
          className="register-compact-head-attachments"
          aria-label="Attachments"
        >
          <Paperclip size={13} aria-hidden="true" />
        </span>
        <span className="register-compact-head-transaction">
          {sortableHeader("payee", "Payee / Category / Memo")}
        </span>
        <span className="register-compact-head-amount register-sort-money-pair">
          {sortableHeader("outflow", "Outflow")}
          {sortableHeader("inflow", "Inflow")}
        </span>
        <span className="register-compact-head-status">C</span>
      </div>
    ) : registerLayoutMode === "desktop" ? (
      <div
        className="register-row register-head register-row-with-attachments"
        style={registerTableLayout.rowStyle}
        aria-label="Register column headings"
      >
        {registerTableLayout.visibleColumns.filter((column) => data.accountType !== "Tracking" || column.id !== "category").map((column) => (
          <span
            className={[
              column.id === "attachments" || column.id === "tags"
                ? "register-head-icon"
                : "",
              column.id === "amount" || column.id === "runningBalance"
                ? "register-head-money"
                : "",
              "table-layout-resizable-head-cell",
            ]
              .filter(Boolean)
              .join(" ")}
            key={column.id}
            aria-label={
              column.id === "attachments"
                ? "Attachments"
                : column.id === "tags"
                  ? "Tags"
                  : undefined
            }
            title={column.id === "tags" ? "Tags" : undefined}
          >
            {column.id === "attachments" ? (
              <Paperclip size={13} aria-hidden="true" />
            ) : column.id === "tags" ? (
              <Tag size={14} aria-hidden="true" />
            ) : column.id === "runningBalance" ? (
              "Balance"
            ) : column.id === "status" ? (
              "C"
            ) : column.id === "select" ? (
              <input
                className="register-checkbox register-checkbox-input register-head-select-checkbox"
                type="checkbox"
                checked={areAllVisibleRegisterTransactionsSelected}
                aria-label={
                  areAllVisibleRegisterTransactionsSelected
                    ? "Deselect visible transactions"
                    : "Select visible transactions"
                }
                aria-checked={
                  isVisibleRegisterSelectionPartial
                    ? "mixed"
                    : areAllVisibleRegisterTransactionsSelected
                }
                ref={(node) => {
                  if (node) {
                    node.indeterminate = isVisibleRegisterSelectionPartial;
                  }
                }}
                onChange={handleToggleVisibleRegisterSelection}
              />
            ) : column.id === "date" ||
              column.id === "payee" ||
              column.id === "category" ||
              column.id === "memo" ? (
              sortableHeader(column.id, column.label)
            ) : column.id === "amount" ? (
              <span className="register-sort-money-pair">
                {sortableHeader("outflow", "Outflow")}
                {sortableHeader("inflow", "Inflow")}
              </span>
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
    <WorkspaceLayout className="register-workspace">
      <WorkspaceBody className="register-workspace-body">
      <Card
        className={`register-table-card register-layout-${registerLayoutMode} register-view-${activeRegisterView}`}
      >
        <WorkspaceStickyHeader className="register-sticky-stack">
          <RegisterToolbar
            accountName={data.accountName}
            workingBalance={data.workingBalance}
            clearedBalance={data.clearedBalance}
            unclearedBalance={data.unclearedBalance}
            currencyCode={data.currencyCode}
            formatMoney={formatMoney}
            activeView={activeRegisterView}
            onViewChange={setActiveRegisterView}
            onToggleEntryRow={() => {
              setEditingTransactionId(null);
              setShowEntryRow((current) => !current);
            }}
            searchInputRef={registerSearchInputRef}
            searchDraft={registerSearchDraft}
            committedSearch={committedRegisterSearch}
            isSearchOpen={isRegisterSearchOpen}
            searchSuggestions={registerSearchSuggestions}
            activeSearchSuggestionIndex={activeRegisterSearchSuggestionIndex}
            onSearchDraftChange={setRegisterSearchDraft}
            onSearchOpenChange={setIsRegisterSearchOpen}
            onSearchKeyDown={handleRegisterSearchKeyDown}
            onCommitSearch={commitRegisterSearch}
            onHighlightSearchSuggestion={setActiveRegisterSearchSuggestionIndex}
            onClearSearch={clearRegisterSearch}
            columns={data.accountType === "Tracking" ? REGISTER_COLUMN_DEFINITIONS.filter((column) => column.id !== "category") : REGISTER_COLUMN_DEFINITIONS}
            visibleColumnSet={data.accountType === "Tracking" ? new Set([...registerTableLayout.visibleColumnSet].filter((columnId) => columnId !== "category")) : registerTableLayout.visibleColumnSet}
            onToggleColumn={registerTableLayout.toggleColumn}
            onResetColumns={registerTableLayout.resetLayout}
            onOpenImport={() => {
              setIsTransactionImportOpening(true);
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  setIsTransactionImportOpen(true);
                  setIsTransactionImportOpening(false);
                });
              });
            }}
            onOpenTagManager={() => setIsTransactionTagManagerOpen(true)}
            scheduledDueCount={scheduledDueCount}
            categoryFilter={categoryFilter}
            categoriesEnabled={data.accountType !== "Tracking"}
            onCategoryFilterChange={setCategoryFilter}
            canUndo={canUndo}
            canRedo={canRedo}
            isHistoryBusy={isHistoryBusy}
            undoTitle={undoTitle}
            redoTitle={redoTitle}
            onUndo={() => void undo()}
            onRedo={() => void redo()}
          />

          {activeRegisterView === "register" ? registerColumnHeader : null}
          {activeRegisterView === "register" && committedRegisterSearch ? (
            <div className="register-search-status" role="status">
              <strong>
                Searching{" "}
                {REGISTER_SEARCH_SCOPE_LABELS[committedRegisterSearch.scope]}
              </strong>
              <span>
                “{committedRegisterSearch.query}” ·{" "}
                {searchedRegisterTransactions.length} of{" "}
                {registerTransactions.length} transactions
              </span>
              <button type="button" onClick={clearRegisterSearch}>
                Clear search
              </button>
            </div>
          ) : null}
        </WorkspaceStickyHeader>

        <ScheduledTransactionsPanel
          key={accountId}
          budgetId={activeBudgetId}
          accountId={accountId}
          isOpen={activeRegisterView === "scheduled"}
          categoryOptions={categoryOptions}
          transferAccounts={transferAccounts}
          payeeOptions={payeeOptions}
          tags={transactionTags}
          onCreateTag={handleCreateTransactionTag}
          onClose={() => setActiveRegisterView("register")}
          presentation="workspace"
          onDueCountChange={setScheduledDueCount}
        />

        {isTransactionTagManagerOpen ? (
          <div className="payee-manager-overlay" role="presentation">
            <Card className="payee-manager-panel transaction-tag-manager-panel">
              <div className="payee-manager-header">
                <div>
                  <h2>Manage Tags</h2>
                  <p>Create and maintain reusable transaction tags.</p>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    setTransactionTags(transactionTagService.listTags());
                    setIsTransactionTagManagerOpen(false);
                  }}
                >
                  Close
                </button>
              </div>
              <TransactionTagManager
                service={transactionTagService}
                onPersist={syncTransactionTagsToPersistence}
              />
            </Card>
          </div>
        ) : null}

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

        {isTransactionImportOpening && !isTransactionImportOpen ? (
          <div className="transaction-import-backdrop" role="presentation">
            <section
              className="transaction-import-dialog transaction-import-wizard"
              role="dialog"
              aria-modal="true"
              aria-labelledby="transaction-import-opening-title"
            >
              <div className="transaction-import-header">
                <div>
                  <h2 id="transaction-import-opening-title">Import Transactions</h2>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setIsTransactionImportOpening(false)}
                >
                  Close
                </button>
              </div>
              <div className="transaction-import-upload-step">
                <div className="transaction-import-dropzone" aria-hidden="true">
                  <span className="transaction-import-dropzone-icon">↑</span>
                  <strong>Drop your transaction file here</strong>
                  <span>or click to browse files</span>
                  <small>Supports CSV, QIF, and OFX/QFX files</small>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {isTransactionImportOpen && (
          <TransactionImportDialog
            initialAccountId={accountId}
            accounts={[
              { id: accountId, name: data.accountName },
              ...transferAccounts
                .filter(
                  (account) => account.id !== accountId && !account.closedAt,
                )
                .map((account) => ({ id: account.id, name: account.name })),
            ]}
            currencyCode={data.currencyCode}
            payeeOptions={payeeOptions}
            categoryOptions={categoryOptions}
            transferAccounts={transferAccounts}
            onCreateCategory={createInlineCategory}
            onClose={() => {
              setIsTransactionImportOpen(false);
            }}
            onImportCommitComplete={(activity) => {
              if (!activeBudgetId) {
                return;
              }

              const recentActivity: RecentImportActivity = {
                version: 1,
                budgetId: activeBudgetId,
                accountId: activity.accountId,
                importedTransactionIds: activity.importedTransactionIds,
                matchedTransactionIds: activity.matchedTransactionIds,
              };

              writeRecentImportActivity(recentActivity);

              if (activity.accountId === accountId) {
                setRecentImportActivity(recentActivity);
              }
            }}
            loadAccountTransactions={async (
              destinationAccountId,
              dateRange,
            ) => {
              const queries = persistenceGateway.accountRegisterQueries;

              if (storageMode === "sqlite" && activeBudgetId && queries) {
                if (dateRange) {
                  const rows = await loadTransactionImportRegisterEvidence({
                    budgetId: activeBudgetId,
                    accountId: destinationAccountId,
                    dateRange,
                    queryPage: (input) =>
                      queries.queryTransactions(input),
                  });

                  return mapSqliteTransactions(rows, 0);
                }

                const page = await queries.queryTransactions({
                  budgetId: activeBudgetId,
                  accountId: destinationAccountId,
                  limit: 250,
                });

                return mapSqliteTransactions(page.rows, 0);
              }

              const view =
                await persistenceGateway.accountRegisters.getAccountRegisterView(
                  {
                    accountId: destinationAccountId,
                  },
                );

              if (!dateRange) {
                return view.transactions;
              }

              return view.transactions.filter(
                (transaction) =>
                  transaction.date >= dateRange.startDate &&
                  transaction.date <= dateRange.endDate,
              );
            }}
            loadTransactionsByIds={async (destinationAccountId, transactionIds) => {
              const queries = persistenceGateway.accountRegisterQueries;
              if (
                storageMode === "sqlite" &&
                activeBudgetId &&
                queries?.getTransactionsByIds
              ) {
                const rows = await queries.getTransactionsByIds({
                  budgetId: activeBudgetId,
                  accountId: destinationAccountId,
                  ids: transactionIds,
                });
                return mapSqliteTransactions(rows, 0);
              }
              const view =
                await persistenceGateway.accountRegisters.getAccountRegisterView({
                  accountId: destinationAccountId,
                });
              const requested = new Set(transactionIds);
              return view.transactions.filter((transaction) =>
                requested.has(transaction.id),
              );
            }}
            loadImportedTransactionSourceOccurrences={async (
              destinationAccountId,
              sourceFileType,
            ) => {
              const queries = persistenceGateway.accountRegisterQueries;
              if (
                storageMode !== "sqlite" ||
                !activeBudgetId ||
                !queries
              ) {
                throw new Error(
                  "Transaction import duplicate detection requires SQLite transaction persistence.",
                );
              }

              const occurrences =
                await queries.getImportedTransactionSourceOccurrences({
                  budgetId: activeBudgetId,
                  accountId: destinationAccountId,
                  fileType: sourceFileType,
                });

              return Object.fromEntries(
                occurrences.map(({ identity, occurrenceCount }) => [
                  identity,
                  occurrenceCount,
                ]),
              );
            }}
            loadAccountWorkingBalance={async (destinationAccountId) => {
              const queries = persistenceGateway.accountRegisterQueries;
              if (activeBudgetId && queries) {
                const navigation = await queries.listAccountNavigation(activeBudgetId);
                return navigation.find((entry) => entry.account.id === destinationAccountId)?.workingBalance ?? 0;
              }
              const view = await persistenceGateway.accountRegisters.getAccountRegisterView({
                accountId: destinationAccountId,
              });
              return view.workingBalance;
            }}
            onCommitRegisterChanges={async (
              destinationAccountId,
              additions,
              transactions,
              provenanceAssignments,
              payeeCreations,
            ) => {
              const updates = transactions.map((transaction) => ({
                id: transaction.id,
                date: transaction.date,
                tagIds: transaction.tagIds,
                payee: transaction.payee,
                payeeId: transaction.payeeId,
                rawPayee: transaction.rawPayee,
                category: transaction.category,
                categoryId: transaction.categoryId,
                memo: transaction.memo,
                checkNumber: transaction.checkNumber,
                inflow: transaction.inflow,
                outflow: transaction.outflow,
                splitLines: transaction.splitLines,
              }));

              const queries = persistenceGateway.accountRegisterQueries;
              if (storageMode === "sqlite" && activeBudgetId && queries) {
                if (
                  provenanceAssignments.length > 0 &&
                  additions.some((transaction) => !transaction.id?.trim())
                ) {
                  throw new Error(
                    "An imported transaction lost its planned stable ID before persistence.",
                  );
                }

                const result = await executeHistory(createImportTransactionsCommand({
                  budgetId: activeBudgetId,
                  accountId: destinationAccountId,
                  additions: additions.map((transaction) => ({
                    budgetId: activeBudgetId,
                    accountId: destinationAccountId,
                    id: transaction.id ?? createRuntimeUuid(),
                    ...toTransactionWriteInput(transaction),
                  })),
                  updates: updates.map((transaction) => ({
                    budgetId: activeBudgetId,
                    accountId: destinationAccountId,
                    id: transaction.id,
                    ...toTransactionWriteInput(transaction),
                  })),
                  provenanceAssignments,
                  payeeCreations,
                }));
                if (!result.performed) {
                  throw new Error(result.error ?? "Import history command failed.");
                }
                return;
              }

              if (destinationAccountId === accountId) {
                await commitTransactionBatch({ additions, updates, provenanceAssignments, payeeCreations });
                return;
              }

              if (
                provenanceAssignments.length > 0 ||
                payeeCreations.length > 0
              ) {
                throw new Error(
                  "Import provenance or staged payee creation requires SQLite transaction persistence.",
                );
              }

              const adapter = persistenceGateway.accountRegisters;
              if (adapter.commitTransactionBatch) {
                await adapter.commitTransactionBatch({
                  accountId: destinationAccountId,
                  additions,
                  updates,
                });
                return;
              }

              if (additions.length > 0) {
                await adapter.addTransactions({
                  accountId: destinationAccountId,
                  transactions: additions,
                });
              }
              for (const transaction of updates) {
                await adapter.updateTransaction({
                  accountId: destinationAccountId,
                  transaction,
                });
              }
            }}
          />
        )}

        {moveAccountMenuPosition ? (
          <div
            className="register-move-popover-layer"
            role="presentation"
            onMouseDown={() => setMoveAccountMenuPosition(null)}
          >
            <div
              className="register-move-popover"
              role="menu"
              aria-label="Move selected transactions to account"
              style={{
                bottom: moveAccountMenuPosition.bottom,
                left: moveAccountMenuPosition.left,
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="register-move-popover-heading">
                <strong>Move to Account</strong>
                <span>
                  {moveableSelectedTransactions.length} transaction
                  {moveableSelectedTransactions.length === 1 ? "" : "s"}
                </span>
              </div>

              {selectedTransferTransactionCount > 0 ? (
                <p className="register-move-warning">
                  {selectedTransferTransactionCount} transfer transaction
                  {selectedTransferTransactionCount === 1
                    ? " was"
                    : "s were"}{" "}
                  excluded. Edit or delete transfers instead.
                </p>
              ) : null}

              {selectedReconciledTransactionCount > 0 ? (
                <p className="register-move-warning">
                  {selectedReconciledTransactionCount} reconciled transaction
                  {selectedReconciledTransactionCount === 1
                    ? " was"
                    : "s were"}{" "}
                  excluded. Reconciled history is locked.
                </p>
              ) : null}

              <div className="register-move-account-list">
                {moveTargetAccounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void handleMoveSelectedTransactions(account.id);
                    }}
                  >
                    <span
                      className="register-move-account-icon"
                      aria-hidden="true"
                    >
                      {getMoveAccountIcon(account)}
                    </span>
                    <span>{account.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {registerContextMenuPosition ? (
          <div
            className="register-context-menu-layer"
            role="presentation"
            onMouseDown={() => setRegisterContextMenuPosition(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setRegisterContextMenuPosition(null);
            }}
          >
            <div
              className="register-context-menu"
              role="menu"
              aria-label="Transaction actions"
              style={{
                top: registerContextMenuPosition.top,
                left: registerContextMenuPosition.left,
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="register-context-menu-heading">
                <strong>
                  {registerSelectionActions.selectedCount === 1
                    ? "Transaction"
                    : `${registerSelectionActions.selectedCount} transactions`}
                </strong>
                <span>Actions</span>
              </div>

              <div className="register-context-menu-list">
                {registerSelectionActions.actions.map((action) => {
                  const Icon = action.icon ?? null;

                  return (
                    <button
                      key={action.id}
                      className={[
                        "register-context-menu-item",
                        action.variant === "danger"
                          ? "register-context-menu-item-danger"
                          : "",
                        action.variant === "success"
                          ? "register-context-menu-item-success"
                          : "",
                        action.pressed
                          ? "register-context-menu-item-pressed"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      type="button"
                      role="menuitem"
                      aria-pressed={action.pressed ?? undefined}
                      title={action.title}
                      onClick={() => {
                        setRegisterContextMenuPosition(null);
                        action.onClick();
                      }}
                    >
                      {Icon ? <Icon size={15} aria-hidden="true" /> : null}
                      <span>{action.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        <div className="register-table">
          {showEntryRow && (
            <TransactionEntryRow
              initialDate={lastEntryDate}
              categoryOptions={categoryOptions}
              transferAccounts={transferAccounts}
              currentAccount={{ id: data.accountId, name: data.accountName }}
              payeeOptions={payeeOptions}
              onCreatePayee={createInlinePayee}
              currencyCode={data.currencyCode}
              visibleColumns={data.accountType === "Tracking" ? new Set([...registerEntryColumnSet].filter((columnId) => columnId !== "category")) : registerEntryColumnSet}
              visibleColumnIds={data.accountType === "Tracking" ? registerEntryVisibleColumnIds.filter((columnId) => columnId !== "category") : registerEntryVisibleColumnIds}
              rowStyle={registerEntryRowStyle}
              layoutMode={registerLayoutMode}
              onCreateCategory={createInlineCategory}
              onSave={async (input, targetAccountId) => {
                await addTransaction(input, targetAccountId);
                setLastEntryDate(input.date);
                setShowEntryRow(false);
              }}
              onSaveAndAddAnother={async (input, targetAccountId) => {
                await addTransaction(input, targetAccountId);
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
            const monthKey = getRegisterMonthKey(transaction.date);
            const previousMonthKey = getRegisterMonthKey(previousTransaction?.date ?? "");
            const showMonthSeparator =
              transactionIndex === 0 ||
              previousMonthKey !== monthKey;
            const monthLabel = formatRegisterMonthSeparator(transaction.date);
            const idsForMonth = monthKey ? monthTransactionIds[monthKey] : undefined;
            const monthCheckboxState = getRegisterMonthCheckboxState(
              idsForMonth ?? [],
              selectedRegisterTransactionIds,
            );

            return (
              <div
                className="register-transaction-with-month"
                key={transaction.id}
              >
                {showMonthSeparator ? (
                  <div className="register-month-separator">
                    {monthKey ? (
                      <RegisterMonthSelectionCheckbox
                        label={monthLabel}
                        state={monthCheckboxState}
                        disabled={!idsForMonth}
                        onChange={() => {
                          setEditingTransactionId(null);
                          if (!idsForMonth) return;
                          if (monthCheckboxState === "checked") {
                            registerSelection.deselect(idsForMonth);
                          } else {
                            registerSelection.add(idsForMonth);
                          }
                        }}
                      />
                    ) : null}
                    <span>{monthLabel}</span>
                  </div>
                ) : null}
                {editingTransactionId === transaction.id ? (
                  <TransactionEditRow
                    transaction={transaction}
                    categoryOptions={categoryOptions}
                    transferAccounts={transferAccounts}
                    payeeOptions={payeeOptions}
                    onCreatePayee={createInlinePayee}
                    currencyCode={data.currencyCode}
                    onSave={async (input) => {
                      await updateTransaction(input);
                      setEditingTransactionId(null);
                      setTransactionEditIntent({ field: "date" });
                    }}
                    onCancel={() => {
                      setEditingTransactionId(null);
                      setTransactionEditIntent({ field: "date" });
                    }}
                    onManageTransactionAttachments={
                      handleManageTransactionAttachments
                    }
                    visibleColumns={data.accountType === "Tracking" ? new Set([...registerEditColumnSet].filter((columnId) => columnId !== "category")) : registerEditColumnSet}
                    visibleColumnIds={data.accountType === "Tracking" ? registerEditVisibleColumnIds.filter((columnId) => columnId !== "category") : registerEditVisibleColumnIds}
                    rowStyle={registerEditRowStyle}
                    layoutMode={registerLayoutMode}
                    editIntent={transactionEditIntent}
                  />
                ) : (
                  <TransactionRow
                    transaction={transaction}
                    currencyCode={data.currencyCode}
                    dateFormat={dateFormat}
                    isSelected={registerSelection.isSelected(transaction.id)}
                    recentImportStatus={
                      recentlyImportedTransactionIds.has(transaction.id)
                        ? "imported"
                        : recentlyMatchedTransactionIds.has(transaction.id)
                          ? "matched"
                          : null
                    }
                    onSelectTransaction={handleSelectTransaction}
                    onToggleTransactionSelection={
                      handleToggleTransactionSelection
                    }
                    onEditTransaction={handleEditTransaction}
                    onToggleClearedTransaction={handleToggleClearedTransaction}
                    onManageTransactionAttachments={
                      handleManageTransactionAttachments
                    }
                    tags={transactionTags}
                    onUpdateTransactionTags={handleUpdateTransactionTags}
                    onCreateTransactionTag={handleCreateTransactionTag}
                    onOpenContextMenu={handleOpenRegisterContextMenu}
                    visibleColumns={data.accountType === "Tracking" ? new Set([...registerTableLayout.visibleColumnSet].filter((columnId) => columnId !== "category")) : registerTableLayout.visibleColumnSet}
                    rowStyle={registerTableLayout.rowStyle}
                    layoutMode={registerLayoutMode}
                    categoriesEnabled={data.accountType !== "Tracking"}
                    canonicalPayee={showMerchantIconsInRegister
                      ? resolveRegisterPayee(registerPayeesById, transaction)
                      : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>

        {hasRegisterActionSelection && !editingTransactionId ? (
          <>
            <SelectionBar
              selectionCount={registerSelectionActions.selectedCount}
              itemLabel="Transaction"
              ariaLabel="Selected transaction actions"
              actions={registerSelectionActions.actions}
              onClearSelection={clearRegisterSelection}
            />
            {selectionExportError ? (
              <p className="register-selection-error" role="alert">
                {selectionExportError}
              </p>
            ) : null}
          </>
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
              onClick={async () => {
                const nextPage = Math.min(
                  registerPagination.totalPages,
                  registerPagination.currentPage + 1,
                );
                if (
                  storageMode === "sqlite" &&
                  hasMoreTransactions &&
                  nextPage * registerPagination.pageSize >
                    registerTransactions.length
                ) {
                  await loadMoreTransactions();
                }
                setRegisterPage(nextPage);
              }}
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

      {registerAttachmentWorkflow.attachmentTransaction && (
        <AttachmentManager
          transaction={registerAttachmentWorkflow.attachmentTransaction}
          onClose={registerAttachmentWorkflow.closeAttachmentManager}
          onAddAttachment={registerAttachmentWorkflow.handleAddAttachment}
          onRemoveAttachment={registerAttachmentWorkflow.handleRemoveAttachment}
        />
      )}
      </WorkspaceBody>
    </WorkspaceLayout>
  );
}
