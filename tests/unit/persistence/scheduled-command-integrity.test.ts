import assert from "node:assert/strict";
import test from "node:test";
import { buildScheduledTransaction } from "../../../apps/web/src/features/accounts/scheduledTransactionLifecycle.js";
import type { ScheduledTransactionView, UpsertScheduledTransactionInput } from "../../../apps/web/src/features/accounts/scheduledTransactionTypes.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import { createScheduledTransactionCommands } from "../../../apps/web/src/features/persistence/localFirst/engine/scheduledTransactionCommands.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";

const budgetId = "budget";
const input = (overrides: Partial<UpsertScheduledTransactionInput> = {}): UpsertScheduledTransactionInput => ({
  id: "schedule", accountId: "account", nextDueDate: "2026-10-01", frequency: "monthly",
  recurrenceKind: "rule", recurrenceAnchorDate: "2026-10-01", recurrenceInterval: 1, recurrenceUnit: "month",
  weekendPolicy: "same-day", endCondition: "never", occurrencesCompleted: 0, payee: "Rent", payeeId: "payee",
  category: "Housing", categoryId: "category", memo: "memo", outflow: 100, inflow: 0,
  tagIds: [], splitLines: [], attachments: [], ...overrides,
});

function harness(initial: ScheduledTransactionView[] = []) {
  let rows = initial.map((row) => structuredClone(row)); let sequence = 0; let fail = false;
  const allocated: LocalBudgetMutation[] = []; const committed: LocalBudgetMutation[] = [];
  const batches: LocalBudgetMutation[][] = [];
  let historyRequest: { mutations: readonly LocalBudgetMutation[]; replacementSchedule: ScheduledTransactionView | null; replacementTransaction: unknown } | null = null;
  const database = {
    async listEntities<T>() { return rows.map((row) => structuredClone(row)) as T[]; },
    async mutate(mutation: LocalBudgetMutation) { if (fail) throw new Error("worker failed"); committed.push(mutation); rows = mutation.operation === "delete" ? rows.filter(({ id }) => id !== mutation.entityId) : [...rows.filter(({ id }) => id !== mutation.entityId), structuredClone(mutation.payload as ScheduledTransactionView)]; return {}; },
    async mutateBatch(mutations: readonly LocalBudgetMutation[]) { if (fail) throw new Error("worker failed"); batches.push([...mutations]); committed.push(...mutations); for (const mutation of mutations) rows = [...rows.filter(({ id }) => id !== mutation.entityId), structuredClone(mutation.payload as ScheduledTransactionView)]; return {}; },
    async replaceScheduledTransactionHistoryState(request: typeof historyRequest & { mutations: readonly LocalBudgetMutation[] }) { if (fail) throw new Error("worker failed"); historyRequest = request; committed.push(...request.mutations); return {}; },
  } as unknown as LocalBudgetDatabaseClient;
  const commands = createScheduledTransactionCommands({ requireDatabase: async () => database,
    createMutation(id, domain, entityId, operation, payload, operationGroupId, operationGroup) { sequence += 1; const mutation = { mutationId: `m-${sequence}`, budgetId: id, syncEpoch: "epoch", deviceId: "device", deviceSequence: sequence, baseCursor: 0, domain, entityId, operation, payload, createdAt: "now", ...(operationGroupId ? { operationGroupId } : {}), ...(operationGroup ? { operationGroup } : {}) }; allocated.push(mutation); return mutation; },
    encodeBase64: (bytes) => Buffer.from(bytes).toString("base64"), decodeBase64: (value) => Uint8Array.from(Buffer.from(value, "base64")) });
  return { commands, allocated, committed, batches, rows: () => rows, history: () => historyRequest, fail: () => { fail = true; } };
}

test("create, update, delete and advance commit exactly one scheduled mutation", async () => {
  const h = harness(); const results = [await h.commands.createScheduledTransaction(budgetId, input()),
    await h.commands.updateScheduledTransaction(budgetId, "schedule", input({ memo: "changed" })),
    await h.commands.advanceScheduledTransaction(budgetId, "account", "schedule"),
    await h.commands.deleteScheduledTransaction(budgetId, "account", "schedule")];
  assert.deepEqual(h.allocated.map(({ mutationId }) => mutationId), h.committed.map(({ mutationId }) => mutationId));
  assert.equal(h.committed.length, 4); assert.deepEqual(results.map(({ change }) => change.domains), Array(4).fill(["scheduled-transactions"]));
});

test("failed scheduled write records no committed scope or worker mutation", async () => {
  const h = harness(); h.fail(); await assert.rejects(() => h.commands.createScheduledTransaction(budgetId, input()), /worker failed/);
  assert.equal(h.allocated.length, 1); assert.equal(h.committed.length, 0);
});

test("history and Enter share one exact operation group and preserve generated attachment", async () => {
  const schedule = buildScheduledTransaction(input({ frequency: "once", attachments: [{ id: "template", fileName: "a.bin", fileSize: 3, mimeType: "application/octet-stream", attachedAt: "template-time", contentHash: `sha256:${"a".repeat(64)}`, contentBase64: "AQID" }] }), { id: "schedule", now: "created" });
  const h = harness([schedule]); const result = await h.commands.enterScheduledTransaction({ budgetId, accountId: "account", schedule, transactionId: "transaction-id", createTransaction: true });
  const request = h.history()!; const groupIds = new Set(request.mutations.map(({ operationGroupId }) => operationGroupId));
  assert.equal(groupIds.size, 1); assert.deepEqual(request.mutations[0]?.operationGroup?.members, request.mutations.map(({ domain, entityId, operation, payload }) => ({ domain, entityId, operation, payload })));
  assert.deepEqual(h.allocated.map(({ mutationId }) => mutationId), h.committed.map(({ mutationId }) => mutationId));
  assert.equal(result.result.transaction?.transactions[0]?.id, "transaction-id");
  const attachment = result.result.transaction?.attachments[0]; assert.equal(attachment?.id, "transaction-id:attachment:template");
  assert.equal(attachment?.budgetId, budgetId); assert.equal(attachment?.transactionId, "transaction-id");
  assert.equal(attachment?.fileName, "a.bin"); assert.equal(attachment?.fileSize, 3); assert.equal(attachment?.mimeType, "application/octet-stream");
  assert.equal(attachment?.contentHash, `sha256:${"a".repeat(64)}`); assert.deepEqual([...attachment!.content], [1, 2, 3]); assert.ok(attachment?.attachedAt);
});

function assertExactGroup(batch: readonly LocalBudgetMutation[]) {
  assert.equal(batch.length, 2); assert.equal(new Set(batch.map(({ mutationId }) => mutationId)).size, 2);
  const groupIds = new Set(batch.map(({ operationGroupId }) => operationGroupId)); assert.equal(groupIds.size, 1);
  assert.ok(batch[0]?.operationGroupId);
  const descriptors = batch.map(({ domain, entityId, operation, payload }) => ({ domain, entityId, operation, payload }));
  for (const mutation of batch) assert.deepEqual(mutation.operationGroup?.members, descriptors);
}

test("rename selects matches and commits one exact replication group", async () => {
  const base = buildScheduledTransaction(input(), { id: "id-match", now: "created" });
  const nameMatch = { ...base, id: "name-match", payeeId: "other", payee: "Rent" };
  const unrelated = { ...base, id: "other", payeeId: "other", payee: "Other", memo: "keep" };
  const h = harness([base, nameMatch, unrelated]); const result = await h.commands.renameScheduledPayeeReferences(budgetId, { payeeId: "payee", previousName: "Rent", nextName: "Renamed" });
  assert.equal(h.batches.length, 1); assertExactGroup(h.batches[0]!);
  assert.deepEqual(h.allocated.map(({ mutationId }) => mutationId), h.committed.map(({ mutationId }) => mutationId));
  assert.equal(h.rows().find(({ id }) => id === "other")?.memo, "keep"); assert.deepEqual(result.change.domains, ["scheduled-transactions"]);
});

test("reassign selects matches and commits one exact replication group", async () => {
  const base = buildScheduledTransaction(input(), { id: "id-match", now: "created" });
  const nameMatch = { ...base, id: "name-match", payeeId: "other", payee: "Rent" };
  const unrelated = { ...base, id: "other", payeeId: "other", payee: "Other", memo: "keep" };
  const h = harness([base, nameMatch, unrelated]);
  const result = await h.commands.reassignScheduledPayeeReferences(budgetId, { sourcePayeeId: "payee", sourceName: "Rent", targetPayeeId: "target", targetName: "Target" });
  assert.equal(h.batches.length, 1); assertExactGroup(h.batches[0]!);
  assert.deepEqual(h.allocated.map(({ mutationId }) => mutationId), h.committed.map(({ mutationId }) => mutationId));
  assert.equal(h.rows().find(({ id }) => id === "other")?.memo, "keep"); assert.deepEqual(result.change.domains, ["scheduled-transactions"]);
});

test("payee reference no-match allocates no group, mutation, batch, or scope", async () => {
  const schedule = buildScheduledTransaction(input({ payeeId: "other", payee: "Other" }), { id: "other", now: "created" });
  const h = harness([schedule]);
  const renamed = await h.commands.renameScheduledPayeeReferences(budgetId, { payeeId: "missing", previousName: "Missing", nextName: "Nope" });
  const reassigned = await h.commands.reassignScheduledPayeeReferences(budgetId, { sourcePayeeId: "missing", sourceName: "Missing", targetPayeeId: "target", targetName: "Target" });
  assert.equal(h.allocated.length, 0); assert.equal(h.committed.length, 0); assert.equal(h.batches.length, 0);
  assert.deepEqual(renamed.change.domains, []); assert.deepEqual(reassigned.change.domains, []);
});
