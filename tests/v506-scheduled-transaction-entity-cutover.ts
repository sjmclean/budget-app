import assert from "node:assert/strict";
import {
  SCHEDULED_TRANSACTION_ENTITY_INDEX_KEY,
  createScheduledTransactionEntityRepository,
  projectScheduledTransaction,
  replaceScheduledTransactionEntities,
} from "../apps/web/src/features/accounts/entities/scheduledTransactionEntity.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

class MemoryStorage implements KeyValueStoragePort {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  listKeys() { return [...this.values.keys()].sort(); }
}

const storage = new MemoryStorage();
const base = {
  id: "rent", accountId: "checking", tagIds: [], nextDueDate: "2026-08-01", frequency: "monthly" as const,
  recurrenceInterval: 1, recurrenceUnit: "month" as const, recurrenceAnchorDate: "2026-08-01",
  endCondition: "never" as const, occurrencesCompleted: 0, weekendPolicy: "same-day" as const,
  payee: "Landlord", category: "Rent", memo: "Monthly rent", outflow: 2100, inflow: 0,
  createdAt: "2026-07-26T00:00:00.000Z", updatedAt: "2026-07-26T00:00:00.000Z",
};
replaceScheduledTransactionEntities(storage, [base], new Date("2026-07-26T00:00:00.000Z"));
assert.deepEqual(JSON.parse(storage.getItem(SCHEDULED_TRANSACTION_ENTITY_INDEX_KEY)!), ["rent"]);
assert.equal(storage.getItem("budget-app.scheduled-transactions.v1"), null);
const before = createScheduledTransactionEntityRepository(storage).get("rent")!;
replaceScheduledTransactionEntities(storage, [{ ...base, memo: "Updated rent" }], new Date("2026-07-26T00:00:01.000Z"));
const after = createScheduledTransactionEntityRepository(storage).get("rent")!;
assert.deepEqual(after.fields.payee.timestamp, before.fields.payee.timestamp, "unchanged fields retain their LWW timestamp");
assert.notDeepEqual(after.fields.memo.timestamp, before.fields.memo.timestamp, "changed fields receive a new LWW timestamp");
assert.equal(projectScheduledTransaction(after).memo, "Updated rent");
replaceScheduledTransactionEntities(storage, [], new Date("2026-07-26T00:00:02.000Z"));
assert.equal(createScheduledTransactionEntityRepository(storage).list().length, 0);
assert.equal(createScheduledTransactionEntityRepository(storage).list({ includeTombstoned: true })[0]?.metadata.tombstone !== null, true);
console.log("PASS: Scheduled transactions persist as replicated entities with field-level LWW updates and tombstones");
