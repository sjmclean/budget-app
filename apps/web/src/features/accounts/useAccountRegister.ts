import { useCallback, useEffect, useMemo, useState } from "react";
import { accountRegisterService } from "./accountRegisterService";
import type {
  AccountRegisterView,
  NewRegisterTransactionInput,
  RegisterTransactionView,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";

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
}

export function useAccountRegister(accountId: string): UseAccountRegisterState {
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
        const result = await accountRegisterService.getAccountRegisterView({
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
  }, [accountId, applyRegisterView]);

  const selectedTransaction = useMemo(() => {
    if (!data || !selectedTransactionId) {
      return null;
    }

    return (
      data.transactions.find((transaction) => transaction.id === selectedTransactionId) ??
      null
    );
  }, [data, selectedTransactionId]);

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
      () => accountRegisterService.addTransaction({ accountId, transaction: input }),
    );
  }, [accountId, runMutation]);

  const updateTransaction = useCallback(async (input: UpdateRegisterTransactionInput) => {
    await runMutation(
      () => accountRegisterService.updateTransaction({ accountId, transaction: input }),
      input.id,
    );
  }, [accountId, runMutation]);

  const toggleCleared = useCallback(async (transactionId: string) => {
    await runMutation(
      () => accountRegisterService.toggleCleared({ accountId, transactionId }),
      transactionId,
    );
  }, [accountId, runMutation]);

  const deleteTransaction = useCallback(async (transactionId: string) => {
    await runMutation(
      () => accountRegisterService.deleteTransaction({ accountId, transactionId }),
    );
  }, [accountId, runMutation]);

  const addAttachment = useCallback(async (transactionId: string, file: File) => {
    await runMutation(
      () => accountRegisterService.addAttachment({
        accountId,
        transactionId,
        attachment: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      }),
      transactionId,
    );
  }, [accountId, runMutation]);

  const removeAttachment = useCallback(async (transactionId: string, attachmentId: string) => {
    await runMutation(
      () => accountRegisterService.removeAttachment({
        accountId,
        transactionId,
        attachmentId,
      }),
      transactionId,
    );
  }, [accountId, runMutation]);

  const renamePayeeReferences = useCallback(async (input: {
    payeeId: string;
    previousName: string;
    nextName: string;
  }) => {
    await runMutation(
      () => accountRegisterService.renamePayeeReferences({
        accountId,
        ...input,
      }),
    );
  }, [accountId, runMutation]);

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
  };
}
