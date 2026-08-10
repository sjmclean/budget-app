import type { BudgetPersistenceProvider } from "../persistence/budgetPersistenceProvider";
import type { AccountTransactionRow } from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import type { RegisterTransactionView } from "./accountRegisterTypes";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import { generateDueScheduledTransactions } from "./scheduledTransactionGenerationService";

export function scheduledOccurrenceTransactionId(
  accountId: string,
  scheduleId: string,
  occurrenceDate: string,
): string {
  return [
    "scheduled",
    encodeURIComponent(accountId),
    encodeURIComponent(scheduleId),
    encodeURIComponent(occurrenceDate),
  ].join(":");
}

export async function generateDueScheduledTransactionsForBudget(
  provider: BudgetPersistenceProvider,
  budgetId: string,
) {
  const queries = provider.accountRegisterQueries;
  if (!queries) return generateDueScheduledTransactions(provider, { scope: budgetId });
  const status = await queries.getBudgetStatus(budgetId).catch(() => null);
  if (!status?.capabilities.accountRegisters) {
    return generateDueScheduledTransactions(provider, { scope: budgetId });
  }
  return generateDueScheduledTransactions(provider, {
    scope: budgetId,
    listAccounts: () => queries.listAccounts(budgetId),
    hostedTransactions: {
      async listRecent(accountId) {
        const page = await queries.queryTransactions({ budgetId, accountId, limit: 250 });
        return page.rows.map(toScheduledOccurrenceView);
      },
      async add(accountId, transaction) {
        const scheduleId = transaction.scheduledTransactionId;
        const occurrenceDate = transaction.scheduledOccurrenceDate;
        const id = scheduleId && occurrenceDate
          ? scheduledOccurrenceTransactionId(accountId, scheduleId, occurrenceDate)
          : createRuntimeUuid();
        await queries.addTransaction({
          budgetId,
          accountId,
          id,
          date: transaction.date,
          amount: Math.round((transaction.inflow - transaction.outflow) * 100),
          payeeId: transaction.payeeId,
          payeeName: transaction.payee,
          categoryId: transaction.categoryId,
          categoryName: transaction.category,
          memo: transaction.memo,
          checkNumber: transaction.checkNumber,
          tagIds: transaction.tagIds,
          generatedFromSchedule: transaction.generatedFromSchedule,
          scheduledTransactionId: transaction.scheduledTransactionId,
          scheduledOccurrenceDate: transaction.scheduledOccurrenceDate,
          splitLines: (transaction.splitLines ?? []).map((line) => ({
            id: line.id,
            categoryId: line.categoryId,
            categoryName: line.category,
            transferAccountId: line.transferAccountId,
            transferTransactionId: line.transferTransactionId,
            memo: line.memo,
            amount: Math.round((line.inflow - line.outflow) * 100),
          })),
        });
        for (const attachment of transaction.scheduledAttachments ?? []) {
          await queries.addTransactionAttachment({
            budgetId,
            accountId,
            transactionId: id,
            attachment: {
              id: `${id}:attachment:${attachment.id}`,
              fileName: attachment.fileName,
              fileSize: attachment.fileSize,
              mimeType: attachment.mimeType,
              attachedAt: new Date().toISOString(),
              contentHash: attachment.contentHash,
            },
            content: decodeScheduledAttachment(attachment.contentBase64),
          });
        }
      },
    },
  });
}

function decodeScheduledAttachment(contentBase64: string): Uint8Array {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toScheduledOccurrenceView(row: AccountTransactionRow): RegisterTransactionView {
  const amount = row.amount / 100;
  return {
    id: row.id,
    date: row.date,
    attachmentCount: 0,
    attachments: [],
    payee: row.payeeName ?? "Imported Payee",
    payeeId: row.payeeId ?? undefined,
    category: row.categoryName ?? "Uncategorised",
    categoryId: row.categoryId ?? undefined,
    memo: row.memo ?? undefined,
    checkNumber: row.checkNumber ?? undefined,
    inflow: amount > 0 ? amount : 0,
    outflow: amount < 0 ? -amount : 0,
    runningBalance: 0,
    cleared: row.clearedStatus !== "uncleared",
    reconciled: row.clearedStatus === "reconciled",
    generatedFromSchedule: row.generatedFromSchedule,
    scheduledTransactionId: row.scheduledTransactionId ?? undefined,
    scheduledOccurrenceDate: row.scheduledOccurrenceDate ?? undefined,
    splitLines: row.splitLines.map((line) => {
      const lineAmount = line.amount / 100;
      return {
        id: line.id,
        category: line.categoryName ?? "Uncategorised",
        categoryId: line.categoryId ?? undefined,
        inflow: lineAmount > 0 ? lineAmount : 0,
        outflow: lineAmount < 0 ? -lineAmount : 0,
        memo: line.memo ?? undefined,
        transferAccountId: line.transferAccountId ?? undefined,
        transferTransactionId: line.transferTransactionId ?? undefined,
      };
    }),
  };
}
