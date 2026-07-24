import { useCallback, useEffect, useRef, useState } from "react";
import { getBudgetPersistenceProvider } from "../persistence";
import { generateDueScheduledTransactions } from "./scheduledTransactionGenerationService";
import {
  calculateAttachmentContentHash,
  getAttachmentContentStore,
} from "../attachments/attachmentContentStore";
import type {
  AccountRegisterView,
  NewRegisterTransactionInput,
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


export function useAccountRegister(accountId: string): UseAccountRegisterState {
  const accountRegisters = getBudgetPersistenceProvider().accountRegisters;

  const [data, setData] = useState<AccountRegisterView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const activeAccountIdRef = useRef(accountId);
  const mutationVersionRef = useRef(0);

  activeAccountIdRef.current = accountId;

  const applyRegisterView = useCallback((view: AccountRegisterView) => {
    setData(view);
  }, []);

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
      setIsLoading(true);
      setError(null);

      try {
        await generateDueScheduledTransactions(getBudgetPersistenceProvider());
        const result = await accountRegisters.getAccountRegisterView({
          accountId,
        });

        if (!isMounted) {
          return;
        }

        applyRegisterView(result);
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
  }, [accountId, accountRegisters, applyRegisterView]);

  const runMutation = useCallback(async (
    action: () => Promise<AccountRegisterView>,
  ) => {
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
  }, [accountId, applyRegisterView]);


  const addTransaction = useCallback(async (input: NewRegisterTransactionInput) => {
    await runMutation(
      () => accountRegisters.addTransaction({ accountId, transaction: input }),
    );
  }, [accountId, accountRegisters, runMutation]);

  const addTransactions = useCallback(async (inputs: NewRegisterTransactionInput[]) => {
    await runMutation(
      () => accountRegisters.addTransactions({ accountId, transactions: inputs }),
    );
  }, [accountId, accountRegisters, runMutation]);

  const commitTransactionBatch = useCallback(async (input: {
    additions: NewRegisterTransactionInput[];
    updates: UpdateRegisterTransactionInput[];
  }) => {
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
  }, [accountId, accountRegisters, runMutation]);

  const updateTransaction = useCallback(async (input: UpdateRegisterTransactionInput) => {
    await runMutation(
      () => accountRegisters.updateTransaction({ accountId, transaction: input }),
    );
  }, [accountId, accountRegisters, runMutation]);

  const toggleCleared = useCallback(async (transactionId: string) => {
    await runMutation(
      () => accountRegisters.toggleCleared({ accountId, transactionId }),
    );
  }, [accountId, accountRegisters, runMutation]);

  const deleteTransaction = useCallback(async (transactionId: string) => {
    await runMutation(
      () => accountRegisters.deleteTransaction({ accountId, transactionId }),
    );
  }, [accountId, accountRegisters, runMutation]);


  const moveTransactions = useCallback(async (
    targetAccountId: string,
    transactionIds: string[],
  ) => {
    await runMutation(
      () => accountRegisters.moveTransactions({
        sourceAccountId: accountId,
        targetAccountId,
        transactionIds,
      }),
    );
  }, [accountId, accountRegisters, runMutation]);

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
  }, [accountId, accountRegisters, runMutation]);

  const removeAttachment = useCallback(async (transactionId: string, attachmentId: string) => {
    const attachment = data?.transactions
      .find((transaction) => transaction.id === transactionId)
      ?.attachments?.find((candidate) => candidate.id === attachmentId);

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
  }, [accountId, accountRegisters, data, runMutation]);

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


function createAttachmentId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
