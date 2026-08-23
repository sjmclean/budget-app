import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createAddTransactionCommand,
  createDeleteTransactionsCommand,
  createEditTransactionCommand,
  createMoveTransactionsCommand,
  createSetTransactionsClearedCommand,
  createToggleTransactionClearedCommand,
} from "../../../apps/web/src/features/history/commands/transactions/transactionCommands.ts";
import { ApplicationHistoryService, type ApplicationHistoryContext } from "../../../apps/web/src/features/history/applicationHistory.ts";
import type { TransactionHistorySnapshot, LocalTransactionRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.ts";
import { transactionHistorySnapshotsEqual } from "../../../apps/web/src/features/persistence/localFirst/transactionHistorySnapshot.ts";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.ts";

const budgetId = "budget-a";

function record(id: string, overrides: Partial<LocalTransactionRecord> = {}): LocalTransactionRecord {
  return {
    id, budgetId, accountId: "account-a", date: "2026-08-20", amount: -100,
    memo: "before", checkNumber: null, clearedStatus: "uncleared",
    payeeId: "payee-1", payeeName: "Woolworths", rawPayeeName: "WOOLWORTHS 123",
    categoryId: "category-1", categoryName: "Groceries",
    transferAccountId: null, transferTransactionId: null,
    generatedFromSchedule: false, scheduledTransactionId: null, scheduledOccurrenceDate: null,
    splitLines: [], tagIds: ["tag-1"],
    importProvenance: [{ fileType: "ofx", identity: "source-1", occurrence: 1, importedAt: "2026-08-20T00:00:00Z" }],
    updatedAt: "2026-08-20T00:00:00Z", ...overrides,
  };
}

function harness(initial: LocalTransactionRecord[] = []) {
  const records = new Map(initial.map((value) => [value.id, structuredClone(value)]));
  const attachments = new Map<string, TransactionHistorySnapshot["attachments"][number]>();
  const capture = (ids: readonly string[]): TransactionHistorySnapshot => {
    const graphIds = new Set(ids);
    let changed = true;
    while (changed) {
      changed = false;
      for (const value of records.values()) {
        const links = [value.transferTransactionId, ...value.splitLines.map((line) => line.transferTransactionId)].filter(Boolean) as string[];
        if (graphIds.has(value.id) || links.some((id) => graphIds.has(id))) {
          if (!graphIds.has(value.id)) { graphIds.add(value.id); changed = true; }
          for (const id of links) if (!graphIds.has(id)) { graphIds.add(id); changed = true; }
        }
      }
    }
    const transactions = [...graphIds].map((id) => records.get(id)).filter(Boolean).map((value) => structuredClone(value!));
    if (transactions.length === 0) throw new Error("Transaction was not found.");
    return {
      budgetId,
      transactions,
      attachments: [...attachments.values()].filter((item) => graphIds.has(item.transactionId)).map((item) => structuredClone(item)),
    };
  };
  const assertCurrent = (expected: TransactionHistorySnapshot) => {
    if (!transactionHistorySnapshotsEqual(capture(expected.transactions.map(({ id }) => id)), expected)) {
      throw new Error("Persisted transaction graph no longer matches expected state.");
    }
  };
  const queries = {
    async captureTransactionHistorySnapshots(input: { transactionIds: readonly string[] }) { return capture(input.transactionIds); },
    async deleteTransactionHistorySnapshot(snapshot: TransactionHistorySnapshot) {
      assertCurrent(snapshot);
      for (const value of snapshot.transactions) records.delete(value.id);
      for (const item of snapshot.attachments) attachments.delete(item.id);
    },
    async restoreTransactionHistorySnapshot(snapshot: TransactionHistorySnapshot) {
      for (const value of snapshot.transactions) if (records.has(value.id)) throw new Error("Transaction already exists.");
      for (const value of snapshot.transactions) records.set(value.id, structuredClone(value));
      for (const item of snapshot.attachments) attachments.set(item.id, structuredClone(item));
    },
    async replaceTransactionHistorySnapshot(input: { expected: TransactionHistorySnapshot; replacement: TransactionHistorySnapshot }) {
      assertCurrent(input.expected);
      for (const value of input.expected.transactions) records.delete(value.id);
      for (const item of input.expected.attachments) attachments.delete(item.id);
      for (const value of input.replacement.transactions) records.set(value.id, structuredClone(value));
      for (const item of input.replacement.attachments) attachments.set(item.id, structuredClone(item));
    },
    async addTransaction(input: any) {
      if (records.has(input.id)) throw new Error("Transaction already exists.");
      records.set(input.id, record(input.id, {
        accountId: input.accountId, date: input.date, amount: input.amount, memo: input.memo ?? null,
        payeeId: input.payeeId ?? null, payeeName: input.payeeName ?? null,
        categoryId: input.categoryId ?? null, categoryName: input.categoryName ?? null,
        splitLines: input.splitLines ?? [], tagIds: input.tagIds ?? [], importProvenance: [],
      }));
    },
    async updateTransaction(id: string, input: any) {
      const current = records.get(id); if (!current) throw new Error("Transaction missing.");
      const updated = { ...current, ...input, id, splitLines: input.splitLines ?? [], updatedAt: "after" };
      records.set(id, updated);
      if (current.transferTransactionId) {
        const counterpart = records.get(current.transferTransactionId);
        if (!counterpart) throw new Error("Transfer counterpart missing.");
        records.set(counterpart.id, {
          ...counterpart,
          date: updated.date,
          amount: -updated.amount,
          memo: updated.memo,
          updatedAt: "after",
        });
      }
    },
    async setTransactionsCleared(input: { transactionIds: readonly string[]; cleared: boolean }) {
      for (const id of input.transactionIds) records.set(id, { ...records.get(id)!, clearedStatus: input.cleared ? "cleared" : "uncleared", updatedAt: "after" });
    },
    async moveTransactions(input: { transactionIds: readonly string[]; targetAccountId: string }) {
      for (const id of input.transactionIds) records.set(id, { ...records.get(id)!, accountId: input.targetAccountId, updatedAt: "after" });
    },
  };
  const persistence = { accountRegisterQueries: queries } as unknown as BudgetPersistenceProvider;
  const service = new ApplicationHistoryService<ApplicationHistoryContext>({ getContext: (id) => ({ budgetId: id, persistence }) });
  return { service, records, attachments, queries };
}

test("delete restores a complete transfer/split/tag/provenance/attachment graph", async () => {
  const left = record("left", { transferAccountId: "account-b", transferTransactionId: "right", splitLines: [{ id: "split-1", categoryId: "category-2", categoryName: "Dining", transferAccountId: null, transferTransactionId: null, memo: "line", amount: -100 }] });
  const right = record("right", { accountId: "account-b", amount: 100, transferAccountId: "account-a", transferTransactionId: "left", importProvenance: [], tagIds: [] });
  const { service, records, attachments } = harness([left, right]);
  attachments.set("attachment-1", { id: "attachment-1", budgetId, transactionId: "left", fileName: "receipt.bin", fileSize: 3, mimeType: "application/octet-stream", attachedAt: "now", contentHash: "hash", content: Uint8Array.from([1, 2, 3]) });
  await service.execute(budgetId, createDeleteTransactionsCommand(["left", "right"]));
  assert.equal(service.getSnapshot(budgetId).undoDepth, 1);
  assert.equal(records.size, 0);
  await service.undo(budgetId);
  assert.deepEqual([...records.keys()].sort(), ["left", "right"]);
  assert.deepEqual(Array.from(attachments.get("attachment-1")!.content), [1, 2, 3]);
  assert.equal(records.get("left")!.importProvenance[0].identity, "source-1");
  await service.redo(budgetId);
  assert.equal(records.size, 0);
});

test("add, edit split conversion, clear and move preserve stable history states", async () => {
  const { service, records } = harness();
  const write = { budgetId, accountId: "account-a", date: "2026-08-20", amount: -500, memo: "new", splitLines: [], tagIds: [] };
  await service.execute(budgetId, createAddTransactionCommand({ transactionId: "stable-id", write }));
  await service.undo(budgetId); assert.equal(records.has("stable-id"), false);
  await service.redo(budgetId); assert.equal(records.has("stable-id"), true);

  await service.execute(budgetId, createEditTransactionCommand({ transactionId: "stable-id", write: { ...write, memo: "edited", amount: -600, splitLines: [{ id: "stable-line", categoryId: "cat", categoryName: "Food", memo: "split", amount: -600 }] } }));
  assert.equal(records.get("stable-id")!.splitLines[0].id, "stable-line");
  await service.undo(budgetId); assert.equal(records.get("stable-id")!.memo, "new");
  await service.redo(budgetId); assert.equal(records.get("stable-id")!.memo, "edited");

  await service.execute(budgetId, createToggleTransactionClearedCommand("stable-id"));
  assert.equal(records.get("stable-id")!.clearedStatus, "cleared");
  await service.undo(budgetId); assert.equal(records.get("stable-id")!.clearedStatus, "uncleared");
  await service.redo(budgetId);

  await service.execute(budgetId, createMoveTransactionsCommand({ sourceAccountId: "account-a", targetAccountId: "account-b", transactionIds: ["stable-id"] }));
  assert.equal(records.get("stable-id")!.accountId, "account-b");
  await service.undo(budgetId); assert.equal(records.get("stable-id")!.accountId, "account-a");
});

test("bulk clear and bulk move are one entry and conflicting state rejects unsafe undo", async () => {
  const { service, records } = harness([record("one"), record("two")]);
  await service.execute(budgetId, createSetTransactionsClearedCommand({ transactionIds: ["one", "two"], cleared: true }));
  assert.equal(service.getSnapshot(budgetId).undoDepth, 1);
  assert.equal(service.getSnapshot(budgetId).undoLabel, "Clear 2 transactions");
  await service.execute(budgetId, createMoveTransactionsCommand({ sourceAccountId: "account-a", targetAccountId: "account-b", transactionIds: ["one", "two"] }));
  assert.equal(service.getSnapshot(budgetId).undoLabel, "Move 2 transactions");
  records.set("one", { ...records.get("one")!, memo: "external change" });
  const failed = await service.undo(budgetId);
  assert.equal(failed.performed, false);
  assert.match(failed.error ?? "", /no longer matches/);
  assert.equal(service.getSnapshot(budgetId).undoDepth, 2);
  assert.equal(service.getSnapshot(budgetId).redoDepth, 0);
  assert.equal(records.get("one")!.memo, "external change");
});

test("bulk delete and unclear are single entries, and a new action invalidates redo", async () => {
  const { service, records } = harness([
    record("one", { clearedStatus: "cleared" }),
    record("two", { clearedStatus: "cleared" }),
    record("three"),
  ]);

  await service.execute(budgetId, createDeleteTransactionsCommand(["one", "two"]));
  assert.equal(service.getSnapshot(budgetId).undoDepth, 1);
  assert.equal(service.getSnapshot(budgetId).undoLabel, "Delete 2 transactions");
  assert.deepEqual([...records.keys()], ["three"]);
  await service.undo(budgetId);
  assert.equal(service.getSnapshot(budgetId).redoDepth, 1);

  await service.execute(budgetId, createSetTransactionsClearedCommand({
    transactionIds: ["one", "two"],
    cleared: false,
  }));
  assert.equal(service.getSnapshot(budgetId).undoLabel, "Unclear 2 transactions");
  assert.equal(service.getSnapshot(budgetId).redoDepth, 0);
  assert.equal(records.get("one")!.clearedStatus, "uncleared");
  assert.equal(records.get("two")!.importProvenance[0].identity, "source-1");
});

test("ordinary, split and transfer edits round-trip their authoritative graphs", async () => {
  const split = record("split", {
    splitLines: [
      { id: "line-a", categoryId: "cat-a", categoryName: "A", memo: "A", amount: -40, transferAccountId: null, transferTransactionId: null },
      { id: "line-b", categoryId: "cat-b", categoryName: "B", memo: "B", amount: -60, transferAccountId: null, transferTransactionId: null },
    ],
  });
  const left = record("left", { transferAccountId: "account-b", transferTransactionId: "right" });
  const right = record("right", { accountId: "account-b", amount: 100, transferAccountId: "account-a", transferTransactionId: "left" });
  const { service, records } = harness([split, left, right]);

  await service.execute(budgetId, createEditTransactionCommand({ transactionId: "split", write: {
    budgetId, accountId: "account-a", date: "2026-08-21", amount: -125,
    memo: "changed", payeeId: "payee-2", payeeName: "New payee",
    categoryId: "category-2", categoryName: "Dining",
    splitLines: [{ id: "line-c", categoryId: "cat-c", categoryName: "C", memo: "C", amount: -125 }],
    tagIds: ["tag-2"],
  } }));
  assert.deepEqual(records.get("split")!.splitLines.map(({ id }) => id), ["line-c"]);
  await service.undo(budgetId);
  assert.deepEqual(records.get("split")!.splitLines.map(({ id }) => id), ["line-a", "line-b"]);
  assert.equal(records.get("split")!.importProvenance[0].identity, "source-1");
  await service.redo(budgetId);
  assert.equal(records.get("split")!.amount, -125);
  assert.equal(records.get("split")!.payeeName, "New payee");

  await service.execute(budgetId, createEditTransactionCommand({ transactionId: "split", write: {
    budgetId, accountId: "account-a", date: "2026-08-21", amount: -125,
    memo: "normal", categoryId: "category-3", categoryName: "Fuel", splitLines: [], tagIds: [],
  } }));
  assert.deepEqual(records.get("split")!.splitLines, []);
  await service.undo(budgetId);
  assert.deepEqual(records.get("split")!.splitLines.map(({ id }) => id), ["line-c"]);

  await service.execute(budgetId, createEditTransactionCommand({ transactionId: "left", write: {
    budgetId, accountId: "account-a", date: "2026-08-22", amount: -250,
    memo: "transfer changed", splitLines: [], tagIds: [],
  } }));
  assert.equal(records.get("right")!.amount, 250);
  await service.undo(budgetId);
  assert.equal(records.get("left")!.amount, -100);
  assert.equal(records.get("right")!.amount, 100);
  assert.equal(records.get("left")!.transferTransactionId, "right");
  assert.equal(records.get("right")!.transferTransactionId, "left");
});

test("Register commands share global ordering and survive consumer navigation", async () => {
  const { service } = harness([record("existing")]);
  await service.execute(budgetId, { id: "budget", label: "Assign money", execute() {}, undo() {} });
  await service.execute(budgetId, createAddTransactionCommand({ transactionId: "added", write: { budgetId, accountId: "account-a", date: "2026-08-20", amount: -1 } }));
  await service.execute(budgetId, createDeleteTransactionsCommand(["existing"]));
  assert.equal(service.getSnapshot(budgetId).undoLabel, "Delete transaction");
  const unsubscribe = service.subscribe(budgetId, () => undefined); unsubscribe();
  await service.undo(budgetId); await service.undo(budgetId); await service.undo(budgetId);
  assert.equal(service.getSnapshot(budgetId).redoLabel, "Assign money");
  await service.redo(budgetId); await service.redo(budgetId); await service.redo(budgetId);
  assert.equal(service.getSnapshot(budgetId).undoLabel, "Delete transaction");
});

test("production source routes normal UI mutations through the shared command hook", () => {
  const page = readFileSync(new URL("../../../apps/web/src/pages/AccountRegisterPage.tsx", import.meta.url), "utf8");
  const selection = readFileSync(new URL("../../../apps/web/src/features/accounts/useRegisterSelectionActions.ts", import.meta.url), "utf8");
  assert.match(page, /useRegisterTransactionHistory\(activeBudgetId, accountId\)/);
  assert.match(page, /onSave=\{async \(input, targetAccountId\) => \{\s*await addTransaction\(input, targetAccountId\)/);
  assert.match(page, /onSave=\{async \(input\) => \{\s*await updateTransaction\(input\)/);
  assert.match(page, /onEnter=\{async \(input\) => \{\s*await addTransactionWithoutHistory\(input\)/);
  assert.match(selection, /await deleteTransactions\(selectedTransactionIds\)/);
  assert.doesNotMatch(selection, /for \(const transactionId of selectedTransactionIds\)/);
});
