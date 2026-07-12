import { Paperclip, Tag } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { SelectionBar } from "../components/ui/SelectionBar";
import { ScheduledTransactionsPanel } from "../components/accounts/ScheduledTransactionsPanel";
import { AttachmentManager } from "../features/accounts/components/AttachmentManager";
import { TransactionImportDialog } from "../features/accounts/components/TransactionImportDialog";
import { RegisterToolbar } from "../features/accounts/components/RegisterToolbar";
import {
  TransactionEditRow,
  TransactionEntryRow,
} from "../features/accounts/components/RegisterTransactionEditor";
import {
  TransactionRow,
  type RegisterColumnId,
} from "../features/accounts/components/TransactionRow";
import { useAccountRegister } from "../features/accounts/useAccountRegister";
import { useRegisterLayoutMode } from "../features/accounts/registerLayoutMode";
import { useRegisterSelection } from "../features/accounts/useRegisterSelection";
import { useRegisterSelectionActions } from "../features/accounts/useRegisterSelectionActions";
import { useRegisterCommands } from "../features/accounts/useRegisterCommands";
import { usePayeeManagerWorkflow } from "../features/accounts/usePayeeManagerWorkflow";
import { useRegisterAttachmentWorkflow } from "../features/accounts/useRegisterAttachmentWorkflow";
import { useRegisterViewModel } from "../features/accounts/useRegisterViewModel";
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
import { getAppPersistenceGateway } from "../features/persistence";
import { browserLocalStorageKeyValueStorage } from "../features/persistence/keyValueStoragePort";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
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
import {
  buildRegisterPerformanceSnapshot,
  formatPerformanceMs,
  getPerformanceNow,
  type RegisterPerformanceTimings,
} from "../features/performance/registerPerformanceInstrumentation";

const ACTIVE_BUDGET_MONTH = "2026-06";

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
      Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
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
  const persistenceGateway = getAppPersistenceGateway();
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const activeBudgetId = resolveActiveBudgetId(budgets, selectedBudgetId);
  const transactionTagStorage = useMemo(
    () => createBudgetScopedStorage(browserLocalStorageKeyValueStorage),
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
    moveTransactions,
    addAttachment,
    removeAttachment,
    renamePayeeReferences,
    reassignPayeeReferences,
  } = useAccountRegister(accountId);

  const [showEntryRow, setShowEntryRow] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null);
  const [editingTransactionFocusField, setEditingTransactionFocusField] =
    useState<"date" | "category">("date");
  const [lastEntryDate, setLastEntryDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [categoryOptions, setCategoryOptions] = useState<
    BudgetCategoryOption[]
  >([]);
  const [transferAccounts, setTransferAccounts] = useState<SidebarAccount[]>(
    [],
  );
  const [moveAccountMenuPosition, setMoveAccountMenuPosition] =
    useState<{ bottom: number; left: number } | null>(null);
  const [isScheduledOpen, setIsScheduledOpen] = useState(false);
  const [scheduledDueCount, setScheduledDueCount] = useState(0);
  const [isTransactionTagManagerOpen, setIsTransactionTagManagerOpen] =
    useState(false);
  const [isTransactionImportOpen, setIsTransactionImportOpen] = useState(false);
  const [registerContextMenuPosition, setRegisterContextMenuPosition] =
    useState<RegisterContextMenuPosition | null>(null);
  const [registerSearchDraft, setRegisterSearchDraft] = useState("");
  const [committedRegisterSearch, setCommittedRegisterSearch] =
    useState<RegisterSearchCommit | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "uncategorised">("all");
  const [isRegisterSearchOpen, setIsRegisterSearchOpen] = useState(false);
  const [
    activeRegisterSearchSuggestionIndex,
    setActiveRegisterSearchSuggestionIndex,
  ] = useState<number | null>(null);
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

  useEffect(() => {
    let active = true;

    accountsPersistence.listAccounts().then((loadedAccounts) => {
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
  }, [accountId, accountsPersistence]);

  const registerTransactions = data?.transactions ?? [];
  const {
    setRegisterPage,
    registerSearchSuggestions,
    searchedRegisterTransactions,
    categoryFilteredRegisterTransactions,
    registerPagination,
    visibleTransactions,
    visibleTransactionIds,
  } = useRegisterViewModel({
    transactions: registerTransactions,
    searchDraft: registerSearchDraft,
    committedSearch: committedRegisterSearch,
    categoryFilter,
    developerPerformanceMode,
    performanceTimingsRef: registerPerformanceTimingsRef,
  });

  useEffect(() => {
    setActiveRegisterSearchSuggestionIndex(null);
  }, [registerSearchDraft]);

  const registerSelection = useRegisterSelection(visibleTransactionIds);
  const selectedRegisterTransactionIds = registerSelection.selectedIds;
  const selectedRegisterTransactionCount = registerSelection.selectedCount;
  const selectedRegisterActionTransactionIds = selectedRegisterTransactionIds;
  const selectedRegisterActionTransactions = useMemo(() => {
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

  useEffect(() => {
    registerSelection.prune(
      registerTransactions.map((transaction) => transaction.id),
    );
  }, [registerSelection.prune, registerTransactions]);

  const registerAttachmentWorkflow = useRegisterAttachmentWorkflow({
    transactions: registerTransactions,
    addAttachment,
    removeAttachment,
  });

  const {
    payeeOptions,
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
    registerTransactions,
    renamePayeeReferences,
    reassignPayeeReferences,
    developerPerformanceMode,
    performanceTimingsRef: registerPerformanceTimingsRef,
  });

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
  const handleEditTransaction = (transactionId: string) => {
    setEditingTransactionFocusField("date");
    registerCommands.editTransaction(transactionId);
  };
  const handleEditTransactionCategory = (transactionId: string) => {
    setEditingTransactionFocusField("category");
    registerCommands.editTransaction(transactionId);
  };
  const handleToggleClearedTransaction =
    registerCommands.toggleClearedTransaction;
  const handleManageTransactionAttachments =
    registerCommands.manageTransactionAttachments;
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

  const registerSelectionActions = useRegisterSelectionActions({
    selectedTransactionIds: selectedRegisterActionTransactionIds,
    selectedTransactions: selectedRegisterActionTransactions,
    toggleCleared,
    deleteTransaction,
    clearSelection: clearRegisterSelection,
    editTransaction: (transactionId) => {
      setEditingTransactionFocusField("date");
      setEditingTransactionId(transactionId);
    },
    openMoveTransactions: openMoveTransactionDialog,
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
        <span className="register-compact-head-date">Date</span>
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
          <RegisterToolbar
            accountName={data.accountName}
            workingBalance={data.workingBalance}
            currencyCode={data.currencyCode}
            formatMoney={formatMoney}
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
            columns={REGISTER_COLUMN_DEFINITIONS}
            visibleColumnSet={registerTableLayout.visibleColumnSet}
            onToggleColumn={registerTableLayout.toggleColumn}
            onResetColumns={registerTableLayout.resetLayout}
            onOpenImport={() => setIsTransactionImportOpen(true)}
            onOpenPayeeManager={() => setIsPayeeManagerOpen(true)}
            onOpenTagManager={() => setIsTransactionTagManagerOpen(true)}
            onToggleScheduled={() => setIsScheduledOpen((current) => !current)}
            scheduledDueCount={scheduledDueCount}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
          />

          {registerColumnHeader}
          {committedRegisterSearch ? (
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
              <TransactionTagManager service={transactionTagService} />
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
                  {selectedTransferTransactionCount === 1 ? " was" : "s were"}{" "}
                  excluded. Edit or delete transfers instead.
                </p>
              ) : null}

              {selectedReconciledTransactionCount > 0 ? (
                <p className="register-move-warning">
                  {selectedReconciledTransactionCount} reconciled transaction
                  {selectedReconciledTransactionCount === 1 ? " was" : "s were"}{" "}
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
                        action.pressed ? "register-context-menu-item-pressed" : "",
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
                      setEditingTransactionFocusField("date");
                    }}
                    onCancel={() => {
                      setEditingTransactionId(null);
                      setEditingTransactionFocusField("date");
                    }}
                    onManageTransactionAttachments={
                      handleManageTransactionAttachments
                    }
                    visibleColumns={registerEditColumnSet}
                    visibleColumnIds={registerEditVisibleColumnIds}
                    rowStyle={registerEditRowStyle}
                    layoutMode={registerLayoutMode}
                    autoFocusField={editingTransactionFocusField}
                  />
                ) : (
                  <TransactionRow
                    transaction={transaction}
                    currencyCode={data.currencyCode}
                    dateFormat={dateFormat}
                    isSelected={registerSelection.isSelected(transaction.id)}
                    onSelectTransaction={handleSelectTransaction}
                    onToggleTransactionSelection={
                      handleToggleTransactionSelection
                    }
                    onEditTransaction={handleEditTransaction}
                    onEditTransactionCategory={handleEditTransactionCategory}
                    onToggleClearedTransaction={handleToggleClearedTransaction}
                    onManageTransactionAttachments={
                      handleManageTransactionAttachments
                    }
                    tags={transactionTags}
                    onUpdateTransactionTags={handleUpdateTransactionTags}
                    onOpenContextMenu={handleOpenRegisterContextMenu}
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

      {registerAttachmentWorkflow.attachmentTransaction && (
        <AttachmentManager
          transaction={registerAttachmentWorkflow.attachmentTransaction}
          onClose={registerAttachmentWorkflow.closeAttachmentManager}
          onAddAttachment={registerAttachmentWorkflow.handleAddAttachment}
          onRemoveAttachment={registerAttachmentWorkflow.handleRemoveAttachment}
        />
      )}


    </div>
  );
}
