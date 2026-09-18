import assert from "node:assert/strict";
import test from "node:test";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import { createTransactionHistoryCommands } from "../../../apps/web/src/features/persistence/localFirst/engine/transactionHistoryCommands.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import type { ImportHistorySnapshot, LocalTransactionRecord, TransactionHistorySnapshot } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

const budgetId = "budget";
const transaction = (id: string, transferId: string | null = null): LocalTransactionRecord => ({
  id, budgetId, accountId: id === "left" ? "account-a" : "account-b", date: "2026-09-17", amount: id === "left" ? -500 : 500,
  memo: "memo", checkNumber: null, clearedStatus: "cleared", payeeId: "payee", payeeName: "Payee",
  categoryId: "category", categoryName: "Category", transferAccountId: transferId ? (id === "left" ? "account-b" : "account-a") : null,
  transferTransactionId: transferId, generatedFromSchedule: false, scheduledTransactionId: null,
  scheduledOccurrenceDate: null, splitLines: [], tagIds: ["tag"], importProvenance: [], updatedAt: "now",
});
const snapshot = (transactions = [transaction("left", "right"), transaction("right", "left")]): TransactionHistorySnapshot => ({
  budgetId, transactions, attachments: [{ id: "attachment", budgetId, transactionId: transactions[0]!.id,
    fileName: "receipt.bin", fileSize: 3, mimeType: "application/octet-stream", attachedAt: "now",
    contentHash: "sha256:abc", content: Uint8Array.from([1, 2, 3]) }],
});

function harness() {
  let sequence = 0; let fail = false; const allocated: LocalBudgetMutation[] = []; const committed: LocalBudgetMutation[] = [];
  const requests: { kind: string; mutations: readonly LocalBudgetMutation[] }[] = [];
  let importHistoryOptions: { historyTransactionIds: readonly string[]; historyPayeeIds: readonly string[] } | null = null;
  const commit = (kind: string, mutations: readonly LocalBudgetMutation[]) => { if (fail) throw new Error("worker failed"); requests.push({ kind, mutations }); committed.push(...mutations); };
  const database = {
    async restoreTransactionHistorySnapshot(_snapshot: TransactionHistorySnapshot, mutations: readonly LocalBudgetMutation[]) { commit("restore", mutations); },
    async deleteTransactionHistorySnapshot(_snapshot: TransactionHistorySnapshot, mutations: readonly LocalBudgetMutation[]) { commit("delete", mutations); },
    async replaceTransactionHistorySnapshot(_expected: TransactionHistorySnapshot, _replacement: TransactionHistorySnapshot, mutations: readonly LocalBudgetMutation[]) { commit("replace", mutations); },
    async replaceImportHistorySnapshot(_expected: ImportHistorySnapshot, _replacement: ImportHistorySnapshot, mutations: readonly LocalBudgetMutation[]) { commit("import-replace", mutations); },
    async writeImportBatch(payees: readonly { mutation: LocalBudgetMutation }[], transactions: readonly { mutation: LocalBudgetMutation }[]) {
      commit("import", [...transactions.map(({ mutation }) => mutation), ...payees.map(({ mutation }) => mutation)]); return {};
    },
    async writeImportBatchWithHistory(payees: readonly { mutation: LocalBudgetMutation }[], transactions: readonly { mutation: LocalBudgetMutation }[], options: { historyTransactionIds: readonly string[]; historyPayeeIds: readonly string[] }) {
      commit("import-history", [...transactions.map(({ mutation }) => mutation), ...payees.map(({ mutation }) => mutation)]); importHistoryOptions = options;
      return { before: { budgetId, transactions: { budgetId, transactions: [], attachments: [] }, payees: [], transactionIds: options.historyTransactionIds, payeeIds: options.historyPayeeIds },
        after: { budgetId, transactions: { budgetId, transactions: [], attachments: [] }, payees: [], transactionIds: options.historyTransactionIds, payeeIds: options.historyPayeeIds } };
    },
  } as unknown as LocalBudgetDatabaseClient;
  const commands = createTransactionHistoryCommands({ requireDatabase: async () => database,
    createMutation(id, domain, entityId, operation, payload, operationGroupId, operationGroup) { sequence += 1;
      const value: LocalBudgetMutation = { mutationId: `m-${sequence}`, budgetId: id, syncEpoch: "epoch", deviceId: "device",
        deviceSequence: sequence, baseCursor: 0, domain, entityId, operation, payload, createdAt: "now",
        ...(operationGroupId ? { operationGroupId } : {}), ...(operationGroup ? { operationGroup } : {}) };
      allocated.push(value); return value; }, encodeBase64: (bytes) => Buffer.from(bytes).toString("base64") });
  return { commands, allocated, committed, requests, historyOptions: () => importHistoryOptions, fail: () => { fail = true; } };
}

function assertExactGroup(mutations: readonly LocalBudgetMutation[]) {
  assert.equal(new Set(mutations.map(({ mutationId }) => mutationId)).size, mutations.length);
  assert.equal(new Set(mutations.map(({ operationGroupId }) => operationGroupId)).size, 1);
  const members = mutations.map(({ domain, entityId, operation, payload }) => ({ domain, entityId, operation, payload }));
  for (const mutation of mutations) assert.deepEqual(mutation.operationGroup?.members, members);
}

test("restore groups a complete transfer pair and attachment content in one atomic request", async () => {
  const h = harness(); await h.commands.restoreTransactionHistorySnapshot(snapshot());
  const request = h.requests[0]!; assert.equal(request.kind, "restore"); assert.equal(request.mutations.length, 3); assertExactGroup(request.mutations);
  const attachment = request.mutations.find(({ entityId }) => entityId.startsWith("attachment:"))!;
  assert.equal((attachment.payload as { contentBase64: string }).contentBase64, "AQID");
  assert.deepEqual(h.allocated.map(({ mutationId }) => mutationId), h.committed.map(({ mutationId }) => mutationId));
});

test("delete preserves financial and attachment metadata in one exact group", async () => {
  const h = harness(); await h.commands.deleteTransactionHistorySnapshot(snapshot());
  const mutations = h.requests[0]!.mutations; assertExactGroup(mutations);
  assert.deepEqual(mutations[0]!.payload, { accountId: "account-a", amount: -500, transferAccountId: "account-b", transferTransactionId: "right" });
  assert.equal("content" in ((mutations[2]!.payload as { attachment: object }).attachment), false);
});

test("replacement groups exact deletes and replacements without deleting retained IDs", async () => {
  const h = harness(); const expected = snapshot(); const replacement = snapshot([transaction("left", null)]);
  await h.commands.replaceTransactionHistorySnapshot({ expected, replacement });
  const mutations = h.requests[0]!.mutations; assertExactGroup(mutations);
  assert.deepEqual(mutations.map(({ entityId, operation }) => [entityId, operation]), [
    ["right", "delete"], ["left", "upsert"], ["attachment:attachment", "upsert"],
  ]);
});

test("multi-domain import replacement has exact group membership and failure publishes nothing", async () => {
  const h = harness(); const transactions = snapshot();
  const payee = { id: "payee", budgetId, name: "Payee", note: "", archived: false, createdAt: "now", updatedAt: "now" };
  const expected: ImportHistorySnapshot = { budgetId, transactions, payees: [payee], transactionIds: ["left", "right"], payeeIds: ["payee"] };
  const replacement: ImportHistorySnapshot = { ...expected, transactions: snapshot([transaction("left")]), payees: [] };
  await h.commands.replaceImportHistorySnapshot({ expected, replacement });
  assertExactGroup(h.requests[0]!.mutations); assert.equal(h.requests[0]!.mutations.some(({ domain, operation }) => domain === "payees" && operation === "delete"), true);
  const failed = harness(); failed.fail(); await assert.rejects(() => failed.commands.replaceImportHistorySnapshot({ expected, replacement }), /worker failed/);
  assert.equal(failed.committed.length, 0);
});

const importInput = { budgetId, accountId: "account-a", additions: [{ id: "imported", budgetId,
  accountId: "account-a", date: "2026-09-17", amount: -250, payeeId: "new-payee", payeeName: "New Payee" }],
  updates: [], provenanceAssignments: [], payeeCreations: [{ id: "new-payee", name: "  New   Payee  " }] };

test("import transaction and normalized payee commit atomically as one exact group", async () => {
  const h = harness(); await h.commands.commitImportBatch(importInput);
  const mutations = h.requests[0]!.mutations; assert.equal(h.requests[0]!.kind, "import"); assert.equal(mutations.length, 2); assertExactGroup(mutations);
  assert.equal((mutations.find(({ domain }) => domain === "payees")!.payload as { name: string }).name, "New Payee");
  assert.deepEqual(h.allocated.map(({ mutationId }) => mutationId), h.committed.map(({ mutationId }) => mutationId));
  assert.equal(new Set(h.committed.map(({ mutationId }) => mutationId)).size, h.committed.length);
});

test("import with history deduplicates roots, returns worker snapshots, and rejects empty history", async () => {
  const h = harness(); const result = await h.commands.commitImportBatchWithHistory({ ...importInput,
    provenanceAssignments: [{ transactionId: "imported", fileType: "csv" as const, identity: "row", occurrence: 1, importedAt: "now" }],
    payeeCreations: [{ id: "new-payee", name: "New Payee" }, { id: "new-payee", name: "New Payee" }] });
  assert.equal(h.requests[0]!.kind, "import-history"); assertExactGroup(h.requests[0]!.mutations);
  assert.deepEqual(h.historyOptions()?.historyTransactionIds, ["imported"]); assert.deepEqual(h.historyOptions()?.historyPayeeIds, ["new-payee"]);
  assert.deepEqual(result.result.before.transactionIds, ["imported"]);
  const empty = harness(); await assert.rejects(() => empty.commands.commitImportBatchWithHistory({ budgetId, accountId: "account-a",
    additions: [], updates: [], provenanceAssignments: [], payeeCreations: [] }), /requires at least one persisted object/);
  assert.equal(empty.requests.length, 0);
});
