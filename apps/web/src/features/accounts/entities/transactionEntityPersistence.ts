import type { AccountRegisterView, RegisterTransactionView } from "../accountRegisterTypes.js";
import type { KeyValueStoragePort } from "../../persistence/keyValueStoragePort.js";
import {
  createTransactionEntity,
  createTransactionEntityRepository,
  projectTransactionEntity,
  tombstoneTransactionEntity,
  transactionTimestampFor,
  updateTransactionEntity,
} from "./transactionEntity.js";

let counter = 0;
const timestamp = (now = new Date()) => transactionTimestampFor(now, ++counter);

export function readTransactionRegisters(storage: KeyValueStoragePort): Record<string, AccountRegisterView> {
  const registers: Record<string, AccountRegisterView> = {};
  for (const entity of createTransactionEntityRepository(storage).list()) {
    const projected = projectTransactionEntity(entity);
    const { accountId, ...transaction } = projected;
    const register = registers[accountId] ?? {
      accountId,
      accountName: "Account",
      accountType: "On budget",
      currencyCode: "AUD",
      clearedBalance: 0,
      unclearedBalance: 0,
      workingBalance: 0,
      transactions: [],
    };
    register.transactions.push(transaction);
    registers[accountId] = register;
  }
  for (const register of Object.values(registers)) {
    const chronological = [...register.transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const runningBalanceById = new Map<string, number>();
    let runningBalance = 0;
    for (const transaction of chronological) {
      runningBalance += transaction.inflow - transaction.outflow;
      runningBalanceById.set(transaction.id, runningBalance);
    }
    let clearedBalance = 0;
    let workingBalance = 0;
    register.transactions = register.transactions.map((transaction) => {
      const amount = transaction.inflow - transaction.outflow;
      workingBalance += amount;
      if (transaction.cleared || transaction.reconciled) clearedBalance += amount;
      const attachments = transaction.attachments ?? [];
      return { ...transaction, attachments, attachmentCount: attachments.length || transaction.attachmentCount || 0, runningBalance: runningBalanceById.get(transaction.id) ?? 0 };
    }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    register.clearedBalance = clearedBalance;
    register.workingBalance = workingBalance;
    register.unclearedBalance = workingBalance - clearedBalance;
  }
  return registers;
}

export function replaceTransactionRegisters(
  storage: KeyValueStoragePort,
  registers: Readonly<Record<string, AccountRegisterView>>,
  now = new Date(),
): void {
  const repository = createTransactionEntityRepository(storage);
  const desired = new Map<string, RegisterTransactionView & { accountId: string }>();
  for (const [accountId, register] of Object.entries(registers)) {
    for (const transaction of register.transactions) desired.set(transaction.id, { ...transaction, accountId });
  }
  const existing = repository.list({ includeTombstoned: true });
  const byId = new Map(existing.map((entity) => [entity.metadata.id, entity]));
  for (const transaction of desired.values()) {
    const current = byId.get(transaction.id);
    repository.save(current
      ? updateTransactionEntity(current, transaction, timestamp(now))
      : createTransactionEntity(transaction, timestamp(now)));
  }
  for (const entity of existing) {
    if (!desired.has(entity.metadata.id) && entity.metadata.tombstone === null) {
      repository.save(tombstoneTransactionEntity(entity, timestamp(now)));
    }
  }
}

export function countTransactionEntities(storage: KeyValueStoragePort): number {
  return createTransactionEntityRepository(storage).list().length;
}

export function purgeAllTransactionEntities(storage: KeyValueStoragePort): void {
  const repository = createTransactionEntityRepository(storage);
  for (const entity of repository.list({ includeTombstoned: true })) repository.purge(entity.metadata.id);
}
