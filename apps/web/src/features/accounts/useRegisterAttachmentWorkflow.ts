import { useCallback, useMemo, useState } from "react";
import type { RegisterTransactionView } from "./accountRegisterTypes";

interface UseRegisterAttachmentWorkflowInput {
  transactions: readonly RegisterTransactionView[];
  addAttachment: (transactionId: string, file: File) => Promise<void>;
  removeAttachment: (
    transactionId: string,
    attachmentId: string,
  ) => Promise<void>;
}

export function useRegisterAttachmentWorkflow({
  transactions,
  addAttachment,
  removeAttachment,
}: UseRegisterAttachmentWorkflowInput) {
  const [attachmentTransactionId, setAttachmentTransactionId] = useState<
    string | null
  >(null);

  const transactionById = useMemo(
    () =>
      new Map(
        transactions.map((transaction) => [transaction.id, transaction]),
      ),
    [transactions],
  );

  const attachmentTransaction = attachmentTransactionId
    ? (transactionById.get(attachmentTransactionId) ?? null)
    : null;

  const openAttachmentManager = useCallback((transactionId: string) => {
    setAttachmentTransactionId(transactionId);
  }, []);

  const closeAttachmentManager = useCallback(() => {
    setAttachmentTransactionId(null);
  }, []);

  const handleAddAttachment = useCallback(
    async (file: File) => {
      if (!attachmentTransaction) {
        return;
      }

      await addAttachment(attachmentTransaction.id, file);
    },
    [addAttachment, attachmentTransaction],
  );

  const handleRemoveAttachment = useCallback(
    async (attachmentId: string) => {
      if (!attachmentTransaction) {
        return;
      }

      await removeAttachment(attachmentTransaction.id, attachmentId);
    },
    [attachmentTransaction, removeAttachment],
  );

  return {
    attachmentTransactionId,
    attachmentTransaction,
    openAttachmentManager,
    closeAttachmentManager,
    handleAddAttachment,
    handleRemoveAttachment,
  };
}
