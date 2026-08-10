import type { AccountRegisterView, RegisterTransactionView } from "../../apps/web/src/features/accounts/accountRegisterTypes.js";
import type { KeyValueStoragePort } from "../../apps/web/src/features/persistence/keyValueStoragePort.js";
import { readTransactionRegisters, replaceTransactionRegisters } from "../../apps/web/src/features/accounts/entities/transactionEntityPersistence.js";

export function seedTransactionRegisters(storage: KeyValueStoragePort, raw: Record<string, any>): void {
  const registers: Record<string, AccountRegisterView> = {};
  for (const [accountId, register] of Object.entries(raw)) {
    const transactions: RegisterTransactionView[] = (register.transactions ?? []).map((transaction: any) => ({
      id: transaction.id,
      date: transaction.date ?? "1970-01-01",
      tagIds: transaction.tagIds ?? [],
      attachmentCount: transaction.attachmentCount ?? 0,
      attachments: transaction.attachments ?? [],
      payee: transaction.payee ?? "",
      payeeId: transaction.payeeId,
      category: transaction.category ?? "Uncategorised",
      categoryId: transaction.categoryId,
      memo: transaction.memo,
      checkNumber: transaction.checkNumber,
      inflow: transaction.inflow ?? 0,
      outflow: transaction.outflow ?? 0,
      runningBalance: transaction.runningBalance ?? 0,
      cleared: transaction.cleared ?? false,
      reconciled: transaction.reconciled ?? false,
      transferId: transaction.transferId,
      transferAccountId: transaction.transferAccountId,
      transferTransactionId: transaction.transferTransactionId,
      splitLines: transaction.splitLines,
      generatedFromSchedule: transaction.generatedFromSchedule,
      scheduledTransactionId: transaction.scheduledTransactionId,
      scheduledOccurrenceDate: transaction.scheduledOccurrenceDate,
    }));
    registers[accountId] = {
      accountId,
      accountName: register.accountName ?? accountId,
      accountType: register.accountType ?? "On budget",
      currencyCode: register.currencyCode ?? "AUD",
      clearedBalance: register.clearedBalance ?? 0,
      unclearedBalance: register.unclearedBalance ?? 0,
      workingBalance: register.workingBalance ?? 0,
      transactions,
    };
  }
  replaceTransactionRegisters(storage, registers, new Date("2026-01-01T00:00:00.000Z"));
}
export const readSeededTransactionRegisters = readTransactionRegisters;
