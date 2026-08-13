import { useCallback, useEffect, useRef, useState } from "react";
import { getBudgetPersistenceProvider } from "../persistence";
import { usePersistenceChangeVersion } from "../persistence/persistenceChangeBus";
import { generateDueScheduledTransactionsForBudget } from "./scheduledTransactionMaintenance";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
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

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

interface UseAccountRegisterState {
  data: AccountRegisterView | null;
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
  const persistenceChangeVersion = usePersistenceChangeVersion();

  const [data, setData] = useState<AccountRegisterView | null>(null);
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

  activeAccountIdRef.current = accountId;

  const applyRegisterView = useCallback((view: AccountRegisterView) => {
    hasLoadedDataRef.current = true;
    setData(view);
  }, []);

  useEffect(() => {
    hasLoadedDataRef.current = false;
    registerCursorRef.current = null;
    loadedTransactionCountRef.current = 0;
    setData(null);
    setIsLoading(true);
    setIsSaving(false);
    setError(null);
    setTotalTransactionCount(0);
    setHasMoreTransactions(false);
  }, [accountId]);

  const reloadSqliteRegister = useCallback(async () => {
    if (!budgetId || !accountRegisterQueries) {
      throw new Error("The hosted SQLite budget engine is not configured.");
    }
    const { summary, page } =
      await accountRegisterQueries.getAccountRegisterBootstrap({
        budgetId,
        accountId,
        limit: 150,
        offset: 0,
        search: registerViewQuery.search ?? undefined,
        categoryFilter: registerViewQuery.categoryFilter,
        sort: registerViewQuery.sort,
      });
    registerCursorRef.current = page.nextCursor;
    setHasMoreTransactions(page.hasMore);
    loadedTransactionCountRef.current = page.rows.length;
    setTotalTransactionCount(page.totalCount ?? summary.transactionCount);
    setStorageMode("sqlite");
    applyRegisterView({
      accountId,
      accountName: summary.accountName,
      accountType: mapSqliteAccountType(summary.accountType, summary.participation),
      currencyCode: summary.currencyCode,
      clearedBalance: summary.clearedBalance / 100,
      unclearedBalance: summary.unclearedBalance / 100,
      workingBalance: summary.workingBalance / 100,
      transactions: mapSqliteTransactions(page.rows, summary.workingBalance),
    });
  }, [
    accountId,
    accountRegisterQueries,
    applyRegisterView,
    budgetId,
    registerViewQuery,
  ]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      mutationVersionRef.current += 1;
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
        if (budgetId && accountRegisterQueries) {
          const status = await accountRegisterQueries
            .getBudgetStatus(budgetId)
            .catch(() => null);
          if (status?.capabilities.accountRegisters) {
            const scheduledGeneration = generateDueScheduledTransactionsForBudget(provider, budgetId);
            await reloadSqliteRegister();
            if (!isMounted) return;
            setIsLoading(false);
            void scheduledGeneration.then((result) => {
              if (
                isMounted &&
                result.createdTransactions.some(
                  (transaction) => transaction.accountId === accountId,
                )
              ) {
                return reloadSqliteRegister();
              }
            }).catch(() => undefined);
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
    persistenceChangeVersion,
    provider,
    reloadSqliteRegister,
  ]);

  const loadMoreTransactions = useCallback(async () => {
    if (
      storageMode !== "sqlite" ||
      !budgetId ||
      !accountRegisterQueries ||
      !hasMoreTransactions
    ) {
      return;
    }
    const page = await accountRegisterQueries.queryTransactions({
      budgetId,
      accountId,
      limit: 150,
      offset: loadedTransactionCountRef.current,
      search: registerViewQuery.search ?? undefined,
      categoryFilter: registerViewQuery.categoryFilter,
      sort: registerViewQuery.sort,
    });
    setData((current) => {
      if (!current) return current;
      const last = current.transactions.at(-1);
      const startingBalance = last
        ? last.runningBalance - (last.inflow - last.outflow)
        : current.workingBalance;
      return {
        ...current,
        transactions: [
          ...current.transactions,
          ...mapSqliteTransactions(page.rows, startingBalance),
        ],
      };
    });
    registerCursorRef.current = page.nextCursor;
    loadedTransactionCountRef.current += page.rows.length;
    setHasMoreTransactions(page.hasMore);
  }, [
    accountId,
    accountRegisterQueries,
    budgetId,
    hasMoreTransactions,
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
      await action();
      if (
        mountedRef.current &&
        activeAccountIdRef.current === mutationAccountId &&
        mutationVersionRef.current === mutationVersion
      ) {
        await reloadSqliteRegister();
      }
    } catch (error) {
      if (
        mountedRef.current &&
        activeAccountIdRef.current === mutationAccountId &&
        mutationVersionRef.current === mutationVersion
      ) {
        setError(error instanceof Error ? error.message : "Failed to update SQLite register.");
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
  }, [accountId, reloadSqliteRegister]);


  const addTransaction = useCallback(async (input: NewRegisterTransactionInput) => {
    if (storageMode === "sqlite" && budgetId && accountRegisterQueries) {
      const transactionId = input.scheduledTransactionId && input.scheduledOccurrenceDate
        ? ["scheduled", encodeURIComponent(accountId), encodeURIComponent(input.scheduledTransactionId), encodeURIComponent(input.scheduledOccurrenceDate)].join(":")
        : createRuntimeUuid();
      await runSqliteMutation(async () => {
        await accountRegisterQueries.addTransaction({
          budgetId,
          accountId,
          id: transactionId,
          ...toTransactionWriteInput(input),
        });
        for (const attachment of input.scheduledAttachments ?? []) {
          await accountRegisterQueries.addTransactionAttachment({
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
    accountRegisters,
    budgetId,
    runMutation,
    runSqliteMutation,
    storageMode,
  ]);

  const addTransactions = useCallback(async (inputs: NewRegisterTransactionInput[]) => {
    if (storageMode === "sqlite" && budgetId && accountRegisterQueries) {
      await runSqliteMutation(() => accountRegisterQueries.commitTransactionBatch({
        budgetId,
        accountId,
        additions: inputs.map((input) => ({
          budgetId,
          accountId,
          id: input.id ?? createRuntimeUuid(),
          ...toTransactionWriteInput(input),
        })),
        updates: [],
      }));
      return;
    }
    await runMutation(
      () => accountRegisters.addTransactions({ accountId, transactions: inputs }),
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

  const commitTransactionBatch = useCallback(async (input: {
    additions: NewRegisterTransactionInput[];
    updates: UpdateRegisterTransactionInput[];
  }) => {
    if (storageMode === "sqlite" && budgetId && accountRegisterQueries) {
      await runSqliteMutation(() => accountRegisterQueries.commitTransactionBatch({
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
      }));
      return;
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
      (await accountRegisters.commitTransactionBatch!({ accountId, ...input })).register,
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

  const updateTransaction = useCallback(async (input: UpdateRegisterTransactionInput) => {
    if (storageMode === "sqlite" && budgetId && accountRegisterQueries) {
      await runSqliteMutation(() => accountRegisterQueries.updateTransaction(
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
      await runSqliteMutation(() => accountRegisterQueries.toggleTransactionCleared(
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
      await runSqliteMutation(() => accountRegisterQueries.deleteTransaction(
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
      await runSqliteMutation(() => accountRegisterQueries.moveTransactions({
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
      await runSqliteMutation(() => accountRegisterQueries.addTransactionAttachment({
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
      await runSqliteMutation(() => accountRegisterQueries.removeTransactionAttachment({
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
      category: row.transferAccountId ? "Transfer" : row.categoryName ?? "Uncategorised",
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
    transferAccountId:
      "transferAccountId" in input ? input.transferAccountId : undefined,
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
