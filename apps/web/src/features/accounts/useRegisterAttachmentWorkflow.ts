import { useCallback, useMemo, useState } from "react";
import type { RegisterTransactionView } from "./accountRegisterTypes";
import { applicationHistory, createTransactionGraphChangeCommand } from "../history";

interface UseRegisterAttachmentWorkflowInput {
  budgetId: string | null;
  transactions: readonly RegisterTransactionView[];
  addAttachment: (transactionId: string, file: File) => Promise<void>;
  removeAttachment: (
    transactionId: string,
    attachmentId: string,
  ) => Promise<void>;
}

export function useRegisterAttachmentWorkflow({
  budgetId,
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

      if (!budgetId) throw new Error("A budget is required for attachment history.");
      await applicationHistory.execute(budgetId, createTransactionGraphChangeCommand({
        id: `add-attachment:${attachmentTransaction.id}:${Date.now()}`,
        label: "Add attachment",
        transactionIds: [attachmentTransaction.id],
        mutate: () => addAttachment(attachmentTransaction.id, file),
      }));
    },
    [addAttachment, attachmentTransaction, budgetId],
  );

  const handleRemoveAttachment = useCallback(
    async (attachmentId: string) => {
      if (!attachmentTransaction) {
        return;
      }

      if (!budgetId) throw new Error("A budget is required for attachment history.");
      await applicationHistory.execute(budgetId, createTransactionGraphChangeCommand({
        id: `remove-attachment:${attachmentTransaction.id}:${attachmentId}:${Date.now()}`,
        label: "Remove attachment",
        transactionIds: [attachmentTransaction.id],
        mutate: () => removeAttachment(attachmentTransaction.id, attachmentId),
      }));
    },
    [attachmentTransaction, budgetId, removeAttachment],
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
