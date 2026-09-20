import { runAccountRegisterSqliteMutation } from "./accountRegisterMutationRunner";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getBudgetPersistenceProvider } from "../persistence";
import { ensureActiveBudgetPersistenceReady } from "../persistence/budgetDatabaseLifecycle";
import { requireLocalBudgetEngine } from "../persistence/budgetPersistenceProvider";
import { getPersistenceChangesSince, getPersistenceRevisionForInterest, usePersistenceChange } from "../persistence/persistenceChangeBus";
import { reconcileRegisterDelta, type LoadedRegisterPage } from "./registerDeltaReconciliation";
import type { AccountTransactionRow } from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import { generateDueScheduledTransactionsForBudget } from "./scheduledTransactionMaintenance";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import { resolveRegisterTransactionCategory } from "./registerCategoryMatching";
import { getRegisterLoadMoreContinuation } from "./registerPagination";
import {
  calculateAttachmentContentHash,
  getAttachmentContentStore,
} from "../attachments/attachmentContentStore";
import type {
  AccountRegisterView,
  NewRegisterTransactionInput,
  RegisterTransactionView,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";
import type { ScheduledTransactionView } from "./scheduledTransactionTypes";

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

interface UseAccountRegisterState {
  data: AccountRegisterView | null;
  scheduledTransactions: readonly ScheduledTransactionView[] | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  totalTransactionCount: number;
  hasMoreTransactions: boolean;
  loadMoreTransactions: () => Promise<void>;
  storageMode: "legacy" | "sqlite";
  setRegisterViewQuery: (query: RegisterViewQuery) => void;
  addTransaction: (input: NewRegisterTransactionInput) => Promise<void>;
  addTransactions: (inputs: NewRegisterTransactionInput[]) => Promise<void>;
  commitTransactionBatch: (input: {
    additions: NewRegisterTransactionInput[];
    updates: UpdateRegisterTransactionInput[];
    provenanceAssignments: readonly import("../persistence/accountRegisterQueryContracts").RegisterTransactionImportProvenanceAssignment[];
    payeeCreations: readonly import("../persistence/accountRegisterQueryContracts").RegisterTransactionImportPayeeCreation[];
  }) => Promise<void>;
  updateTransaction: (input: UpdateRegisterTransactionInput) => Promise<void>;
  toggleCleared: (transactionId: string) => Promise<void>;
  deleteTransaction: (transactionId: string) => Promise<void>;
  moveTransactions: (
    targetAccountId: string,
    transactionIds: string[],
  ) => Promise<void>;
  addAttachment: (transactionId: string, file: File) => Promise<void>;
  removeAttachment: (transactionId: string, attachmentId: string) => Promise<void>;
  renamePayeeReferences: (input: {
    payeeId: string;
    previousName: string;
    nextName: string;
  }) => Promise<void>;
  reassignPayeeReferences: (input: {
    sourcePayeeId: string;
    sourceName: string;
    targetPayeeId: string;
    targetName: string;
  }) => Promise<void>;
}

export interface RegisterViewQuery {
  search: {
    query: string;
    scope: "all" | "payee" | "category" | "memo" | "amount";
  } | null;
  categoryFilter: "all" | "uncategorised";
  sort: {
    column: "date" | "payee" | "category" | "memo" | "outflow" | "inflow";
    direction: "ascending" | "descending";
  };
}

const DEFAULT_REGISTER_VIEW_QUERY: RegisterViewQuery = {
  search: null,
  categoryFilter: "all",
  sort: { column: "date", direction: "descending" },
};

export function useAccountRegister(
  accountId: string,
  budgetId?: string | null,
): UseAccountRegisterState {
  const provider = getBudgetPersistenceProvider();
  const accountRegisters = provider.accountRegisters;
  const accountRegisterQueries = provider.accountRegisterQueries;
  const localBudgetEngine = provider.localBudgetEngine;
  const persistenceInterest = useMemo(() => ({ budgetId: budgetId ?? "legacy", accountId, domains: ["accounts", "transactions", "categories", "attachments", "payees"] as const }), [budgetId, accountId]);
  const persistenceChangeVersion = usePersistenceChange(persistenceInterest);
  const ensureSqliteReady = useCallback(async () => {
    if (
      budgetId &&
      accountRegisterQueries &&
      provider.syncArchitecture === "local-first-relay"
    ) {
      await ensureActiveBudgetPersistenceReady(budgetId);
    }
  }, [accountRegisterQueries, budgetId, provider.syncArchitecture]);

  const [legacyData, setLegacyData] = useState<AccountRegisterView | null>(null);
  const [sqlitePage, setSqlitePage] = useState<LoadedRegisterPage | null>(null);
  const [scheduledTransactions, setScheduledTransactions] =
    useState<readonly ScheduledTransactionView[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalTransactionCount, setTotalTransactionCount] = useState(0);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [storageMode, setStorageMode] = useState<"legacy" | "sqlite">("legacy");
  const [registerViewQuery, setRegisterViewQuery] = useState(DEFAULT_REGISTER_VIEW_QUERY);
  const registerCursorRef = useRef<{ date: string; id: string } | null>(null);
  const loadedTransactionCountRef = useRef(0);
  const mountedRef = useRef(true);
  const activeAccountIdRef = useRef(accountId);
  const mutationVersionRef = useRef(0);
  const hasLoadedDataRef = useRef(false);
  const sqlitePageRef = useRef<LoadedRegisterPage | null>(null);
  const appliedRevisionRef = useRef(0);
  const loadGenerationRef = useRef(0);
  const claimedWarmBootstrapRef = useRef<{
    readonly key: string;
    readonly value: NonNullable<
      ReturnType<
        NonNullable<
          NonNullable<typeof accountRegisterQueries>["consumePrefetchedAccountRegister"]
        >
      >
    >;
  } | null>(null);

  const data = useMemo<AccountRegisterView | null>(() => {
    if (storageMode !== "sqlite" || !sqlitePage) return legacyData;
    const { summary, rows } = sqlitePage;
    return {
      accountId, accountName: summary.accountName,
      accountType: mapSqliteAccountType(summary.accountType, summary.participation),
      currencyCode: summary.currencyCode,
      clearedBalance: summary.clearedBalance / 100,
      unclearedBalance: summary.unclearedBalance / 100,
      workingBalance: summary.workingBalance / 100,
      transactions: mapSqliteTransactions(rows, summary.workingBalance),
    };
  }, [accountId, legacyData, sqlitePage, storageMode]);

  activeAccountIdRef.current = accountId;

  const applyRegisterView = useCallback((view: AccountRegisterView) => {
    hasLoadedDataRef.current = true;
    setLegacyData(view);
  }, []);

  useLayoutEffect(() => {
    hasLoadedDataRef.current = false;
    registerCursorRef.current = null;
    loadedTransactionCountRef.current = 0;
    setLegacyData(null);
    setSqlitePage(null);
    setScheduledTransactions(null);
    sqlitePageRef.current = null;
    appliedRevisionRef.current = 0;
    loadGenerationRef.current += 1;
    setIsSaving(false);
    setError(null);
    setTotalTransactionCount(0);
    setHasMoreTransactions(false);

    const warmKey = JSON.stringify({
      budgetId: budgetId ?? null,
      accountId,
      search: registerViewQuery.search ?? null,
      categoryFilter: registerViewQuery.categoryFilter,
      sort: registerViewQuery.sort,
    });
    const claimedWarm = claimedWarmBootstrapRef.current;
    const warm = claimedWarm?.key === warmKey
      ? claimedWarm.value
      : budgetId && accountRegisterQueries?.consumePrefetchedAccountRegister
        ? accountRegisterQueries.consumePrefetchedAccountRegister({
            budgetId,
            accountId,
            limit: 150,
            offset: 0,
            search: registerViewQuery.search ?? undefined,
            categoryFilter: registerViewQuery.categoryFilter,
            sort: registerViewQuery.sort,
          })
        : null;

    if (warm && claimedWarm?.key !== warmKey) {
      claimedWarmBootstrapRef.current = { key: warmKey, value: warm };
    }

    if (!warm) {
      setIsLoading(true);
      return;
    }

    const { summary, page, scheduledTransactions: warmScheduledTransactions } = warm.bootstrap;
    const next = {
      summary,
      rows: page.rows,
      totalCount: page.totalCount ?? summary.transactionCount,
    };
    sqlitePageRef.current = next;
    setSqlitePage(next);
    setScheduledTransactions(warmScheduledTransactions);
    appliedRevisionRef.current = warm.revision;
    registerCursorRef.current = page.nextCursor;
    loadedTransactionCountRef.current = page.rows.length;
    setTotalTransactionCount(next.totalCount);
    setHasMoreTransactions(page.hasMore);
    setStorageMode("sqlite");
    hasLoadedDataRef.current = true;
    setIsLoading(false);
  }, [accountId]);

  const reloadSqliteRegister = useCallback(async () => {
    if (!budgetId || !accountRegisterQueries) {
      throw new Error("The hosted SQLite budget engine is not configured.");
    }
    await ensureSqliteReady();
    const generation = ++loadGenerationRef.current;
    for (;;) {
      const beforeRevision = getPersistenceRevisionForInterest(persistenceInterest);
      const { summary, page, scheduledTransactions: nextScheduledTransactions } =
        await accountRegisterQueries.getAccountRegisterBootstrap({
        budgetId,
        accountId,
        limit: 150,
        offset: 0,
        search: registerViewQuery.search ?? undefined,
        categoryFilter: registerViewQuery.categoryFilter,
        sort: registerViewQuery.sort,
      });
      if (generation !== loadGenerationRef.current) return;
      const afterRevision = getPersistenceRevisionForInterest(persistenceInterest);
      if (beforeRevision !== afterRevision) continue;
      const next = { summary, rows: page.rows, totalCount: page.totalCount ?? summary.transactionCount };
      sqlitePageRef.current = next;
      setSqlitePage(next);
      setScheduledTransactions(nextScheduledTransactions);
      appliedRevisionRef.current = afterRevision;
      registerCursorRef.current = page.nextCursor;
      setHasMoreTransactions(page.hasMore);
      loadedTransactionCountRef.current = page.rows.length;
      setTotalTransactionCount(next.totalCount);
      setStorageMode("sqlite");
      hasLoadedDataRef.current = true;
      return;
    }
  }, [
    accountId,
    accountRegisterQueries,
    budgetId,
    ensureSqliteReady,
    persistenceInterest,
    registerViewQuery,
  ]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      mutationVersionRef.current += 1;
      loadGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    mutationVersionRef.current += 1;
    setIsSaving(false);

    async function loadRegister() {
      setIsLoading(!hasLoadedDataRef.current);
      setError(null);

      try {
        if (
          budgetId &&
          accountRegisterQueries &&
          provider.syncArchitecture === "local-first-relay"
        ) {
          await ensureSqliteReady();
          void generateDueScheduledTransactionsForBudget(provider, budgetId).catch(() => undefined);
          await reloadSqliteRegister();
          if (!isMounted) return;
          setIsLoading(false);
          return;
        }
        if (budgetId && accountRegisterQueries) {
          const status = await accountRegisterQueries
            .getBudgetStatus(budgetId)
            .catch(() => null);
          if (status?.capabilities.accountRegisters) {
            void generateDueScheduledTransactionsForBudget(provider, budgetId).catch(() => undefined);
            await reloadSqliteRegister();
            if (!isMounted) return;
            setIsLoading(false);
            return;
          }
        }
        await generateDueScheduledTransactionsForBudget(provider, budgetId ?? "legacy");
        const result = await accountRegisters.getAccountRegisterView({
          accountId,
        });

        if (!isMounted) {
          return;
        }

        applyRegisterView(result);
        setStorageMode("legacy");
        setTotalTransactionCount(result.transactions.length);
        setHasMoreTransactions(false);
        setIsLoading(false);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : "Failed to load account register.",
        );
        setIsLoading(false);
      }
    }

    void loadRegister();

    return () => {
      isMounted = false;
    };
  }, [
    accountId,
    accountRegisters,
    accountRegisterQueries,
    applyRegisterView,
    budgetId,
    ensureSqliteReady,
    provider,
    reloadSqliteRegister,
  ]);

  useEffect(() => {
    if (storageMode !== "sqlite" || !budgetId || !accountRegisterQueries || !sqlitePageRef.current) return;
    if (persistenceChangeVersion <= appliedRevisionRef.current) return;
    let cancelled = false;
    async function consumePublications() {
      if (!accountRegisterQueries || !budgetId) return;
      const history = getPersistenceChangesSince(persistenceInterest, appliedRevisionRef.current);
      const refresh = async () => { if (!cancelled) await reloadSqliteRegister(); };
      if (!history.complete) { await refresh(); return; }
      let next = sqlitePageRef.current;
      if (!next) return;
      const initialWindowSize = next.rows.length;
      for (const { event } of history.changes) {
        if (event.source !== "local" || event.scope.broad || !event.registerDelta) { await refresh(); return; }
        const reconciled = reconcileRegisterDelta({ accountId, query: registerViewQuery, page: next, delta: event.registerDelta });
        if (reconciled.mode !== "patch") { await refresh(); return; }
        next = reconciled.page;
      }
      const desired = Math.min(next.totalCount, Math.max(150, initialWindowSize));
      const missing = Math.max(0, desired - next.rows.length);
      if (missing > 0) {
        await ensureSqliteReady();
        const refill = await accountRegisterQueries.queryLocalTransactions({
          budgetId, accountId, limit: missing, offset: next.rows.length,
          search: registerViewQuery.search ?? undefined,
          categoryFilter: registerViewQuery.categoryFilter,
          sort: registerViewQuery.sort,
        });
        next = { ...next, rows: [...next.rows, ...refill.rows] };
      }
      if (cancelled || getPersistenceRevisionForInterest(persistenceInterest) !== history.latestRevision) return;
      sqlitePageRef.current = next;
      setSqlitePage(next);
      appliedRevisionRef.current = history.latestRevision;
      loadedTransactionCountRef.current = next.rows.length;
      setTotalTransactionCount(next.totalCount);
      setHasMoreTransactions(next.totalCount > next.rows.length);
      const last = next.rows.at(-1);
      registerCursorRef.current = last ? { date: last.date, id: last.id } : null;
    }
    void consumePublications().catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Failed to refresh account register.");
    });
    return () => { cancelled = true; };
  }, [accountId, accountRegisterQueries, budgetId, ensureSqliteReady, persistenceChangeVersion, persistenceInterest, registerViewQuery, reloadSqliteRegister, sqlitePage, storageMode]);

  const loadMoreTransactions = useCallback(async () => {
    if (
      storageMode !== "sqlite" ||
      !budgetId ||
      !accountRegisterQueries ||
      !hasMoreTransactions
    ) {
      return;
    }
    const continuation = getRegisterLoadMoreContinuation({
      sort: registerViewQuery.sort,
      cursor: registerCursorRef.current,
      loadedCount: loadedTransactionCountRef.current,
    });
    const generation = loadGenerationRef.current;
    const revision = getPersistenceRevisionForInterest(persistenceInterest);

    await ensureSqliteReady();
    const page = await accountRegisterQueries.queryTransactions({
      budgetId,
      accountId,
      limit: 150,
      ...continuation,
      search: registerViewQuery.search ?? undefined,
      categoryFilter: registerViewQuery.categoryFilter,
      sort: registerViewQuery.sort,
    });
    if (generation !== loadGenerationRef.current || revision !== getPersistenceRevisionForInterest(persistenceInterest)) return;
    const current = sqlitePageRef.current;
    if (!current) return;
    const next = { ...current, rows: [...current.rows, ...page.rows] };
    sqlitePageRef.current = next;
    setSqlitePage(next);
    registerCursorRef.current = page.nextCursor;
    loadedTransactionCountRef.current += page.rows.length;
    setHasMoreTransactions(page.hasMore);
  }, [
    accountId,
    accountRegisterQueries,
    budgetId,
    ensureSqliteReady,
    hasMoreTransactions,
    persistenceInterest,
    registerViewQuery,
    storageMode,
  ]);

  const runMutation = useCallback(async (
    action: () => Promise<AccountRegisterView>,
  ) => {
    if (storageMode === "sqlite") {
      const message =
        "This operation is not yet available for imported SQLite budgets. No budget data was changed.";
      setError(message);
      throw new Error(message);
    }
    const mutationAccountId = accountId;
    const mutationVersion = ++mutationVersionRef.current;
    setIsSaving(true);
    setError(null);

    try {
      const result = await action();

      if (
        mountedRef.current &&
        activeAccountIdRef.current === mutationAccountId &&
        mutationVersionRef.current === mutationVersion
      ) {
        applyRegisterView(result);
      }
    } catch (error) {
      if (
        mountedRef.current &&
        activeAccountIdRef.current === mutationAccountId &&
        mutationVersionRef.current === mutationVersion
      ) {
        setError(
          error instanceof Error
            ? error.message
            : "Failed to update account register.",
        );
      }
    } finally {
      if (
        mountedRef.current &&
        activeAccountIdRef.current === mutationAccountId &&
        mutationVersionRef.current === mutationVersion
      ) {
        setIsSaving(false);
      }
    }
  }, [accountId, applyRegisterView, storageMode]);

  const runSqliteMutation = useCallback(async (action: () => Promise<void>) => {
    const mutationAccountId = accountId;
    const mutationVersion = ++mutationVersionRef.current;
    setIsSaving(true);
    setError(null);
    try {
      await ensureSqliteReady();
      await runAccountRegisterSqliteMutation(action, (message) => {
        if (
          mountedRef.current &&
          activeAccountIdRef.current === mutationAccountId &&
          mutationVersionRef.current === mutationVersion
        ) {
          setError(message);
        }
      });
    } finally {
      if (
        mountedRef.current &&
        activeAccountIdRef.current === mutationAccountId &&
        mutationVersionRef.current === mutationVersion
      ) {
        setIsSaving(false);
      }
    }
  }, [accountId, ensureSqliteReady]);


  const addTransaction = useCallback(async (input: NewRegisterTransactionInput) => {
    if (storageMode === "sqlite" && budgetId && accountRegisterQueries && localBudgetEngine) {
      const transactionId = input.scheduledTransactionId && input.scheduledOccurrenceDate
        ? ["scheduled", encodeURIComponent(accountId), encodeURIComponent(input.scheduledTransactionId), encodeURIComponent(input.scheduledOccurrenceDate)].join(":")
        : createRuntimeUuid();
      await runSqliteMutation(async () => {
        await localBudgetEngine.addTransaction({
          budgetId,
          accountId,
          id: transactionId,
          ...toTransactionWriteInput(input),
        });
        for (const attachment of input.scheduledAttachments ?? []) {
          await localBudgetEngine.addTransactionAttachment({
            budgetId,
            accountId,
            transactionId,
            attachment: {
              id: `${transactionId}:attachment:${attachment.id}`,
              fileName: attachment.fileName,
              fileSize: attachment.fileSize,
              mimeType: attachment.mimeType,
              attachedAt: new Date().toISOString(),
              contentHash: attachment.contentHash,
            },
            content: decodeScheduledAttachment(attachment.contentBase64),
          });
        }
      });
      return;
    }
    await runMutation(
      () => accountRegisters.addTransaction({ accountId, transaction: input }),
    );
  }, [
    accountId,
    accountRegisterQueries,
    localBudgetEngine,
    accountRegisters,
    budgetId,
    runMutation,
    runSqliteMutation,
    storageMode,
  ]);

  const addTransactions = useCallback(async (inputs: NewRegisterTransactionInput[]) => {
    if (storageMode === "sqlite" && budgetId && localBudgetEngine) {
      await runSqliteMutation(() => localBudgetEngine.commitTransactionBatch({
        budgetId,
        accountId,
        additions: inputs.map((input) => ({
          budgetId,
          accountId,
          id: input.id ?? createRuntimeUuid(),
          ...toTransactionWriteInput(input),
        })),
        updates: [],
        provenanceAssignments: [],
      }));
      return;
    }
    await runMutation(
      () => accountRegisters.addTransactions({ accountId, transactions: inputs }),
    );
  }, [
    accountId,
    localBudgetEngine,
    accountRegisters,
    budgetId,
    runMutation,
    runSqliteMutation,
    storageMode,
  ]);

  const commitTransactionBatch = useCallback(async (input: {
    additions: NewRegisterTransactionInput[];
    updates: UpdateRegisterTransactionInput[];
    provenanceAssignments: readonly import("../persistence/accountRegisterQueryContracts").RegisterTransactionImportProvenanceAssignment[];
    payeeCreations: readonly import("../persistence/accountRegisterQueryContracts").RegisterTransactionImportPayeeCreation[];
  }) => {
    if (input.provenanceAssignments.length > 0) {
      const missingStableId = input.additions.find(
        (transaction) => !transaction.id?.trim(),
      );
      if (missingStableId) {
        throw new Error(
          "An imported transaction lost its planned stable ID before persistence.",
        );
      }
    }

    if (storageMode === "sqlite" && budgetId && localBudgetEngine) {
      await runSqliteMutation(() => localBudgetEngine.commitImportBatch({
        budgetId,
        accountId,
        additions: input.additions.map((transaction) => ({
          budgetId,
          accountId,
          id: transaction.id ?? createRuntimeUuid(),
          ...toTransactionWriteInput(transaction),
        })),
        updates: input.updates.map((transaction) => ({
          budgetId,
          accountId,
          id: transaction.id,
          ...toTransactionWriteInput(transaction),
        })),
        provenanceAssignments: input.provenanceAssignments,
        payeeCreations: input.payeeCreations,
      }));
      return;
    }
    if (
      input.provenanceAssignments.length > 0 ||
      input.payeeCreations.length > 0
    ) {
      throw new Error(
        "Import provenance or staged payee creation requires SQLite transaction persistence.",
      );
    }

    if (!accountRegisters.commitTransactionBatch) {
      await runMutation(async () => {
        if (input.additions.length > 0) {
          await accountRegisters.addTransactions({
            accountId,
            transactions: input.additions,
          });
        }
        for (const transaction of input.updates) {
          await accountRegisters.updateTransaction({ accountId, transaction });
        }
        return accountRegisters.getAccountRegisterView({ accountId });
      });
      return;
    }

    await runMutation(async () =>
      (await accountRegisters.commitTransactionBatch!({
        accountId,
        additions: input.additions,
        updates: input.updates,
      })).register,
    );
  }, [
    accountId,
    localBudgetEngine,
    accountRegisters,
    budgetId,
    runMutation,
    runSqliteMutation,
    storageMode,
  ]);

  const updateTransaction = useCallback(async (input: UpdateRegisterTransactionInput) => {
    if (storageMode === "sqlite" && budgetId && accountRegisterQueries) {
      await runSqliteMutation(() => requireLocalBudgetEngine(localBudgetEngine).updateTransaction(
        input.id,
        { budgetId, accountId, ...toTransactionWriteInput(input) },
      ));
      return;
    }
    await runMutation(
      () => accountRegisters.updateTransaction({ accountId, transaction: input }),
    );
  }, [
    accountId,
    accountRegisterQueries,
    accountRegisters,
    budgetId,
    runMutation,
    runSqliteMutation,
    storageMode,
  ]);

  const toggleCleared = useCallback(async (transactionId: string) => {
    if (storageMode === "sqlite" && budgetId && accountRegisterQueries) {
      await runSqliteMutation(() => requireLocalBudgetEngine(localBudgetEngine).toggleTransactionCleared(
        transactionId,
        { budgetId, accountId },
      ));
      return;
    }
    await runMutation(
      () => accountRegisters.toggleCleared({ accountId, transactionId }),
    );
  }, [
    accountId,
    accountRegisterQueries,
    accountRegisters,
    budgetId,
    runMutation,
    runSqliteMutation,
    storageMode,
  ]);

  const deleteTransaction = useCallback(async (transactionId: string) => {
    if (storageMode === "sqlite" && budgetId && accountRegisterQueries) {
      await runSqliteMutation(() => requireLocalBudgetEngine(localBudgetEngine).deleteTransaction(
        transactionId,
        { budgetId, accountId },
      ));
      return;
    }
    await runMutation(
      () => accountRegisters.deleteTransaction({ accountId, transactionId }),
    );
  }, [
    accountId,
    accountRegisterQueries,
    accountRegisters,
    budgetId,
    runMutation,
    runSqliteMutation,
    storageMode,
  ]);


  const moveTransactions = useCallback(async (
    targetAccountId: string,
    transactionIds: string[],
  ) => {
    if (storageMode === "sqlite" && budgetId && accountRegisterQueries) {
      await runSqliteMutation(() => requireLocalBudgetEngine(localBudgetEngine).moveTransactions({
        budgetId,
        sourceAccountId: accountId,
        targetAccountId,
        transactionIds,
      }));
      return;
    }
    await runMutation(
      () => accountRegisters.moveTransactions({
        sourceAccountId: accountId,
        targetAccountId,
        transactionIds,
      }),
    );
  }, [
    accountId,
    accountRegisterQueries,
    accountRegisters,
    budgetId,
    runMutation,
    runSqliteMutation,
    storageMode,
  ]);

  const addAttachment = useCallback(async (transactionId: string, file: File) => {
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setError("Attachment is too large. Maximum supported size is 5 MB.");
      return;
    }

    const mimeType = file.type || "application/octet-stream";

    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType)) {
      setError("Unsupported attachment type. Attach PDF, JPG, PNG, or WEBP files.");
      return;
    }

    const attachmentId = createAttachmentId();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentHash = await calculateAttachmentContentHash(bytes);
    if (storageMode === "sqlite" && budgetId && accountRegisterQueries) {
      await runSqliteMutation(() => requireLocalBudgetEngine(localBudgetEngine).addTransactionAttachment({
        budgetId,
        accountId,
        transactionId,
        attachment: {
          id: attachmentId,
          fileName: file.name,
          fileSize: file.size,
          mimeType,
          attachedAt: new Date().toISOString(),
          contentHash,
        },
        content: bytes,
      }));
      return;
    }
    const contentStore = getAttachmentContentStore();
    const stored = await contentStore.put({
      attachmentId,
      bytes,
      mimeType,
      contentHash,
    });

    try {
      await runMutation(
        () => accountRegisters.addAttachment({
          accountId,
          transactionId,
          attachment: {
            id: attachmentId,
            fileName: file.name,
            fileSize: file.size,
            mimeType,
            contentRef: stored.contentRef,
            contentHash: stored.contentHash,
            storageType: "browser-indexeddb",
          },
        }),
      );
    } catch (error) {
      await contentStore.delete(stored.contentRef).catch(() => undefined);
      throw error;
    }
  }, [
    accountId,
    accountRegisterQueries,
    accountRegisters,
    budgetId,
    runMutation,
    runSqliteMutation,
    storageMode,
  ]);

  const removeAttachment = useCallback(async (transactionId: string, attachmentId: string) => {
    const attachment = data?.transactions
      .find((transaction) => transaction.id === transactionId)
      ?.attachments?.find((candidate) => candidate.id === attachmentId);

    if (storageMode === "sqlite" && budgetId && accountRegisterQueries) {
      await runSqliteMutation(() => requireLocalBudgetEngine(localBudgetEngine).removeTransactionAttachment({
        budgetId,
        accountId,
        transactionId,
        attachmentId,
      }));
      return;
    }

    await runMutation(
      () => accountRegisters.removeAttachment({
        accountId,
        transactionId,
        attachmentId,
      }),
    );

    if (attachment?.contentRef) {
      await getAttachmentContentStore()
        .delete(attachment.contentRef)
        .catch(() => undefined);
    }
  }, [
    accountId,
    accountRegisterQueries,
    accountRegisters,
    budgetId,
    data,
    runMutation,
    runSqliteMutation,
    storageMode,
  ]);

  const renamePayeeReferences = useCallback(async (input: {
    payeeId: string;
    previousName: string;
    nextName: string;
  }) => {
    await runMutation(
      () => accountRegisters.renamePayeeReferences({
        accountId,
        ...input,
      }),
    );
  }, [accountId, accountRegisters, runMutation]);

  const reassignPayeeReferences = useCallback(async (input: {
    sourcePayeeId: string;
    sourceName: string;
    targetPayeeId: string;
    targetName: string;
  }) => {
    await runMutation(
      () => accountRegisters.reassignPayeeReferences({
        accountId,
        ...input,
      }),
    );
  }, [accountId, accountRegisters, runMutation]);

  return {
    data,
    scheduledTransactions,
    isLoading,
    isSaving,
    error,
    totalTransactionCount,
    hasMoreTransactions,
    loadMoreTransactions,
    storageMode,
    setRegisterViewQuery,
    addTransaction,
    addTransactions,
    commitTransactionBatch,
    updateTransaction,
    toggleCleared,
    deleteTransaction,
    moveTransactions,
    addAttachment,
    removeAttachment,
    renamePayeeReferences,
    reassignPayeeReferences,
  };
}

export function mapSqliteTransactions(
  rows: readonly import("../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort").AccountTransactionRow[],
  startingBalanceMinor: number,
): RegisterTransactionView[] {
  let runningBalance = startingBalanceMinor / 100;
  return rows.map((row) => {
    const amount = row.amount / 100;
    const transaction: RegisterTransactionView = {
      id: row.id,
      date: row.date,
      attachmentCount: Math.max(row.attachmentCount ?? 0, row.attachments?.length ?? 0),
      attachments: row.attachments?.map((attachment) => ({ ...attachment })),
      payee: row.transferAccountId
        ? formatTransferPayee(readTransferAccountName(row))
        : row.payeeName ?? "Imported Payee",
      rawPayee: row.rawPayeeName ?? undefined,
      payeeId: row.payeeId ?? undefined,
      category: resolveRegisterTransactionCategory({
        splitLineCount: row.splitLines.length,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        transferAccountId: row.transferAccountId,
      }),
      categoryId: row.categoryId ?? undefined,
      memo: row.memo ?? undefined,
      checkNumber: row.checkNumber ?? undefined,
      inflow: amount > 0 ? amount : 0,
      outflow: amount < 0 ? -amount : 0,
      runningBalance,
      cleared: row.clearedStatus === "cleared" || row.clearedStatus === "reconciled",
      reconciled: row.clearedStatus === "reconciled",
      transferId: row.transferTransactionId
        ? `sqlite:${row.id}:${row.transferTransactionId}`
        : undefined,
      transferAccountId: row.transferAccountId ?? undefined,
      transferAccountParticipation: row.transferAccountParticipation ?? undefined,
      transferTransactionId: row.transferTransactionId ?? undefined,
      generatedFromSchedule: row.generatedFromSchedule || undefined,
      scheduledTransactionId: row.scheduledTransactionId ?? undefined,
      scheduledOccurrenceDate: row.scheduledOccurrenceDate ?? undefined,
      tagIds: [...(row.tagIds ?? [])],
      splitLines: row.splitLines.length > 0
        ? row.splitLines.map((line) => {
            const amount = line.amount / 100;
            return {
              id: line.id,
              category: line.transferAccountId
                ? formatTransferPayee(readTransferAccountName(line))
                : line.categoryName ?? "Uncategorised",
              categoryId: line.categoryId ?? undefined,
              memo: line.memo ?? undefined,
              inflow: amount > 0 ? amount : 0,
              outflow: amount < 0 ? -amount : 0,
              transferId: line.transferTransactionId
                ? `sqlite:${line.id}:${line.transferTransactionId}`
                : undefined,
              transferAccountId: line.transferAccountId ?? undefined,
              transferAccountParticipation: line.transferAccountParticipation ?? undefined,
              transferTransactionId: line.transferTransactionId ?? undefined,
            };
          })
        : undefined,
    };
    runningBalance -= amount;
    return transaction;
  });
}

function readTransferAccountName(value: unknown): string | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("transferAccountName" in value)
  ) {
    return null;
  }

  const name = value.transferAccountName;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function formatTransferPayee(accountName: string | null): string {
  return `Transfer: ${accountName ?? "Unknown account"}`;
}

export function toTransactionWriteInput(
  input: NewRegisterTransactionInput | UpdateRegisterTransactionInput,
) {
  return {
    date: input.date,
    amount: Math.round((input.inflow - input.outflow) * 100),
    payeeId: input.payeeId,
    rawPayee: input.rawPayee,
    categoryId: input.categoryId,
    categoryName: input.category,
    transferAccountId: input.transferAccountId,
    memo: input.memo,
    checkNumber: input.checkNumber,
    payeeName: input.payee,
    tagIds: input.tagIds,
    generatedFromSchedule: "generatedFromSchedule" in input
      ? input.generatedFromSchedule
      : undefined,
    scheduledTransactionId: "scheduledTransactionId" in input
      ? input.scheduledTransactionId
      : undefined,
    scheduledOccurrenceDate: "scheduledOccurrenceDate" in input
      ? input.scheduledOccurrenceDate
      : undefined,
    splitLines: (input.splitLines ?? []).map((line) => ({
      id: line.id,
      categoryId: line.categoryId,
      categoryName: line.category,
      transferAccountId: line.transferAccountId,
      transferTransactionId: line.transferTransactionId,
      memo: line.memo,
      amount: Math.round((line.inflow - line.outflow) * 100),
    })),
  };
}

function mapSqliteAccountType(
  type: string,
  participation: string,
): AccountRegisterView["accountType"] {
  if (participation === "off-budget" || type === "tracking") return "Tracking";
  if (type === "credit-card") return "Credit card";
  return "On budget";
}


function createAttachmentId(): string {
  return `attachment-${createRuntimeUuid()}`;
}

function decodeScheduledAttachment(contentBase64: string): Uint8Array {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
