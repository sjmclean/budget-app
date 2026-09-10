import type {
  LocalTransactionImportProvenanceRecord,
  LocalTransactionRecord,
  LocalTransactionSplitRecord,
  TransactionHistoryAttachmentSnapshot,
  TransactionHistorySnapshot,
} from "./registerSchema";

export function canonicalTransactionHistorySnapshot(
  snapshot: TransactionHistorySnapshot,
): unknown {
  return {
    budgetId: snapshot.budgetId,
    transactions: [...snapshot.transactions]
      .map((transaction) => ({
        id: transaction.id,
        budgetId: transaction.budgetId,
        accountId: transaction.accountId,
        date: transaction.date,
        amount: transaction.amount,
        memo: transaction.memo,
        checkNumber: transaction.checkNumber,
        clearedStatus: transaction.clearedStatus,
        payeeId: transaction.payeeId,
        payeeName: transaction.payeeName,
        rawPayeeName: transaction.rawPayeeName ?? null,
        categoryId: transaction.categoryId,
        categoryName: transaction.categoryName,
        transferAccountId: transaction.transferAccountId,
        transferTransactionId: transaction.transferTransactionId,
        generatedFromSchedule: transaction.generatedFromSchedule,
        scheduledTransactionId: transaction.scheduledTransactionId,
        scheduledOccurrenceDate: transaction.scheduledOccurrenceDate,
        splitLines: [...transaction.splitLines]
          .map((line) => ({
            id: line.id,
            categoryId: line.categoryId,
            categoryName: line.categoryName,
            transferAccountId: line.transferAccountId,
            transferTransactionId: line.transferTransactionId,
            memo: line.memo,
            amount: line.amount,
          }) satisfies Record<keyof LocalTransactionSplitRecord, unknown>)
          .sort((a, b) => a.id.localeCompare(b.id)),
        tagIds: [...transaction.tagIds].sort(),
        importProvenance: [...transaction.importProvenance]
          .map((provenance) => ({
            fileType: provenance.fileType,
            identity: provenance.identity,
            occurrence: provenance.occurrence,
            importedAt: provenance.importedAt,
          }) satisfies Record<keyof LocalTransactionImportProvenanceRecord, unknown>)
          .sort(
            (a, b) =>
              a.fileType.localeCompare(b.fileType) ||
              a.identity.localeCompare(b.identity) ||
              a.occurrence - b.occurrence,
          ),
        updatedAt: transaction.updatedAt,
      }) satisfies Record<keyof LocalTransactionRecord, unknown>)
      .sort((a, b) => a.id.localeCompare(b.id)),
    attachments: [...snapshot.attachments]
      .map((attachment) => ({
        id: attachment.id,
        budgetId: attachment.budgetId,
        transactionId: attachment.transactionId,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        attachedAt: attachment.attachedAt,
        contentHash: attachment.contentHash,
        content: Array.from(attachment.content),
      }) satisfies Record<keyof TransactionHistoryAttachmentSnapshot, unknown>)
      .sort((a, b) => a.transactionId.localeCompare(b.transactionId) || a.id.localeCompare(b.id)),
  };
}

export function transactionHistorySnapshotsEqual(
  left: TransactionHistorySnapshot,
  right: TransactionHistorySnapshot,
): boolean {
  return JSON.stringify(canonicalTransactionHistorySnapshot(left)) ===
    JSON.stringify(canonicalTransactionHistorySnapshot(right));
}
