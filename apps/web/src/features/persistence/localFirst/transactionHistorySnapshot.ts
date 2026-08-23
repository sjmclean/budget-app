import type { TransactionHistorySnapshot } from "./registerSchema";

export function canonicalTransactionHistorySnapshot(
  snapshot: TransactionHistorySnapshot,
): unknown {
  return {
    budgetId: snapshot.budgetId,
    transactions: [...snapshot.transactions]
      .map((transaction) => ({
        ...transaction,
        splitLines: [...transaction.splitLines].sort((a, b) => a.id.localeCompare(b.id)),
        tagIds: [...transaction.tagIds].sort(),
        importProvenance: [...transaction.importProvenance].sort(
          (a, b) => a.fileType.localeCompare(b.fileType) ||
            a.identity.localeCompare(b.identity) || a.occurrence - b.occurrence,
        ),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    attachments: [...snapshot.attachments]
      .map((attachment) => ({
        ...attachment,
        content: Array.from(attachment.content),
      }))
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
