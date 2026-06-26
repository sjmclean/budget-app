import { useCallback, useEffect, useMemo, useState } from "react";
import { getAppPersistenceGateway } from "../persistence";
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
  selectedTransaction: RegisterTransactionView | null;
  selectedTransactionId: string | null;
  selectTransaction: (transactionId: string) => void;
  addTransaction: (input: NewRegisterTransactionInput) => Promise<void>;
  updateTransaction: (input: UpdateRegisterTransactionInput) => Promise<void>;
  toggleCleared: (transactionId: string) => Promise<void>;
  deleteTransaction: (transactionId: string) => Promise<void>;
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
  const accountRegisters = getAppPersistenceGateway().accountRegisters;

  const [data, setData] = useState<AccountRegisterView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const applyRegisterView = useCallback((view: AccountRegisterView) => {
    setData(view);
    setSelectedTransactionId((current) => {
      if (current && view.transactions.some((transaction) => transaction.id === current)) {
        return current;
      }

      return view.transactions[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadRegister() {
      setIsLoading(true);
      setError(null);

      try {
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

  const transactionById = useMemo(() => {
    if (!data) {
      return new Map<string, RegisterTransactionView>();
    }

    return new Map(data.transactions.map((transaction) => [transaction.id, transaction]));
  }, [data]);

  const selectedTransaction = useMemo(() => {
    if (!selectedTransactionId) {
      return null;
    }

    return transactionById.get(selectedTransactionId) ?? null;
  }, [selectedTransactionId, transactionById]);

  const runMutation = useCallback(async (
    action: () => Promise<AccountRegisterView>,
    selectTransactionId?: string,
  ) => {
    setIsSaving(true);
    setError(null);

    try {
      const result = await action();
      applyRegisterView(result);

      if (selectTransactionId) {
        setSelectedTransactionId(selectTransactionId);
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to update account register.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [applyRegisterView]);

  const addTransaction = useCallback(async (input: NewRegisterTransactionInput) => {
    await runMutation(
      () => accountRegisters.addTransaction({ accountId, transaction: input }),
    );
  }, [accountId, accountRegisters, runMutation]);

  const updateTransaction = useCallback(async (input: UpdateRegisterTransactionInput) => {
    await runMutation(
      () => accountRegisters.updateTransaction({ accountId, transaction: input }),
      input.id,
    );
  }, [accountId, accountRegisters, runMutation]);

  const toggleCleared = useCallback(async (transactionId: string) => {
    await runMutation(
      () => accountRegisters.toggleCleared({ accountId, transactionId }),
      transactionId,
    );
  }, [accountId, accountRegisters, runMutation]);

  const deleteTransaction = useCallback(async (transactionId: string) => {
    await runMutation(
      () => accountRegisters.deleteTransaction({ accountId, transactionId }),
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

    const contentDataUrl = await readFileAsDataUrl(file);

    await runMutation(
      () => accountRegisters.addAttachment({
        accountId,
        transactionId,
        attachment: {
          fileName: file.name,
          fileSize: file.size,
          mimeType,
          contentDataUrl,
        },
      }),
      transactionId,
    );
  }, [accountId, accountRegisters, runMutation]);

  const removeAttachment = useCallback(async (transactionId: string, attachmentId: string) => {
    await runMutation(
      () => accountRegisters.removeAttachment({
        accountId,
        transactionId,
        attachmentId,
      }),
      transactionId,
    );
  }, [accountId, accountRegisters, runMutation]);

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
    selectedTransaction,
    selectedTransactionId,
    selectTransaction: setSelectedTransactionId,
    addTransaction,
    updateTransaction,
    toggleCleared,
    deleteTransaction,
    addAttachment,
    removeAttachment,
    renamePayeeReferences,
    reassignPayeeReferences,
  };
}


function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read attachment content."));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("Failed to read attachment content."));
    };

    reader.readAsDataURL(file);
  });
}
