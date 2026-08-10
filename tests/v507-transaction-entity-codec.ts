import assert from "node:assert/strict";
import { ReplicatedEntityDecodeError } from "../packages/sync/src/index.js";
import {
  createTransactionEntity,
  createTransactionEntityRepository,
  projectTransactionEntity,
  tombstoneTransactionEntity,
  transactionEntityCodec,
  transactionTimestampFor,
  updateTransactionEntity,
} from "../apps/web/src/features/accounts/entities/transactionEntity.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

class MemoryStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  listKeys() { return [...this.values.keys()].sort(); }
}

const minimal = {
  id: "txn-minimal",
  accountId: "checking",
  date: "2026-07-26",
  payee: "Corner shop",
  category: "Groceries",
  inflow: 0,
  outflow: 24.5,
  cleared: false,
  reconciled: false,
};

const created = createTransactionEntity(minimal, transactionTimestampFor(new Date("2026-07-26T00:00:00.000Z")));
const roundTripped = transactionEntityCodec.deserialize(transactionEntityCodec.serialize(created));
assert.deepEqual(roundTripped, created, "minimal transaction entity must round-trip through JSON codec");
assert.equal(projectTransactionEntity(roundTripped).memo, undefined);
assert.equal(projectTransactionEntity(roundTripped).attachmentCount, 0);
assert.equal(projectTransactionEntity(roundTripped).runningBalance, 0);

const complete = {
  ...minimal,
  id: "txn-complete",
  tagIds: ["tax", "tax", "work"],
  attachments: [{
    id: "attachment-1",
    fileName: "receipt.pdf",
    fileSize: 1234,
    mimeType: "application/pdf",
    attachedAt: "2026-07-26T00:00:00.000Z",
    contentRef: "receipts/attachment-1",
    contentHash: "sha256:abc",
    storageType: "external-file" as const,
  }],
  payeeId: "payee-1",
  categoryId: "category-1",
  memo: "Client lunch",
  checkNumber: "1042",
  cleared: true,
  reconciled: true,
  transferId: "transfer-1",
  transferAccountId: "savings",
  transferTransactionId: "txn-pair",
  splitLines: [{
    id: "split-1",
    category: "Meals",
    categoryId: "category-meals",
    memo: "Meal component",
    inflow: 0,
    outflow: 20,
  }],
  generatedFromSchedule: true,
  scheduledTransactionId: "schedule-1",
  scheduledOccurrenceDate: "2026-07-26",
};
const completeEntity = createTransactionEntity(complete, transactionTimestampFor(new Date("2026-07-26T00:00:01.000Z")));
const completeProjection = projectTransactionEntity(transactionEntityCodec.deserialize(transactionEntityCodec.serialize(completeEntity)), 975.5);
assert.deepEqual(completeProjection.tagIds, ["tax", "work"], "tag ids are canonicalised");
assert.equal(completeProjection.attachmentCount, 1);
assert.equal(completeProjection.runningBalance, 975.5);
assert.equal(completeProjection.attachments?.[0]?.contentDataUrl, undefined);
assert.equal(completeProjection.splitLines?.[0]?.transferId, undefined);

const updated = updateTransactionEntity(
  completeEntity,
  { ...complete, memo: "Updated client lunch" },
  transactionTimestampFor(new Date("2026-07-26T00:00:02.000Z")),
);
assert.deepEqual(updated.fields.payee.timestamp, completeEntity.fields.payee.timestamp, "unchanged fields retain timestamps");
assert.notDeepEqual(updated.fields.memo.timestamp, completeEntity.fields.memo.timestamp, "changed fields receive a new timestamp");

const storage = new MemoryStorage();
const repository = createTransactionEntityRepository(storage);
repository.save(updated);
assert.equal(repository.list({ accountId: "checking" }).length, 1);
assert.equal(repository.list({ accountId: "savings" }).length, 0);
repository.save(tombstoneTransactionEntity(updated, transactionTimestampFor(new Date("2026-07-26T00:00:03.000Z"))));
assert.equal(repository.list().length, 0);
assert.equal(repository.list({ includeTombstoned: true }).length, 1);

const invalid = JSON.parse(transactionEntityCodec.serialize(created));
invalid.fields.inflow.value = Number.NaN;
assert.throws(
  () => transactionEntityCodec.deserialize(JSON.stringify(invalid)),
  ReplicatedEntityDecodeError,
  "non-finite money values must be rejected",
);

const missingCanonicalField = JSON.parse(transactionEntityCodec.serialize(created));
delete missingCanonicalField.fields.memo;
assert.throws(
  () => transactionEntityCodec.deserialize(JSON.stringify(missingCanonicalField)),
  ReplicatedEntityDecodeError,
  "missing canonical optional fields must be rejected",
);

console.log("PASS: Transaction entity codec round-trips canonical optional fields, nested values, timestamps, indexes and tombstones");
