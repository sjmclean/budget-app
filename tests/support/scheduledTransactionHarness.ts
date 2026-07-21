import type { KeyValueStoragePort } from "../../apps/web/src/features/persistence/keyValueStoragePort.ts";
import {
  createScheduledTransactionService,
  type BrowserPersistentScheduledTransactionService,
  type UpsertScheduledTransactionInput,
} from "../../apps/web/src/features/accounts/scheduledTransactionService.ts";

export function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

export function createScheduledHarness(): BrowserPersistentScheduledTransactionService {
  return createScheduledTransactionService({
    storage: createMemoryStorage(),
    recordPayee: async () => undefined,
    findPayeeIdByName: () => undefined,
  });
}

export async function createSchedule(
  service: BrowserPersistentScheduledTransactionService,
  overrides: Partial<UpsertScheduledTransactionInput> = {},
) {
  const created = await service.create({
    accountId: "checking",
    nextDueDate: "2026-07-25",
    recurrenceAnchorDate: "2026-07-25",
    frequency: "weekly",
    payee: "Scheduled bill",
    category: "Bills",
    outflow: 10,
    inflow: 0,
    ...overrides,
  });
  const transaction = created.find((item) => item.payee === (overrides.payee ?? "Scheduled bill"));
  if (!transaction) throw new Error("Scheduled transaction was not created");
  return transaction;
}
