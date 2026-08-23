import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApplicationHistoryService, type ApplicationHistoryContext } from "../../../apps/web/src/features/history/applicationHistory.ts";
import { createImportTransactionsCommand } from "../../../apps/web/src/features/history/commands/imports/importCommands.ts";
import { keepPayeesSeparateCommand } from "../../../apps/web/src/features/history/commands/management/payeeCommands.ts";
import type { ImportHistorySnapshot, LocalPayeeRecord, LocalTransactionRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.ts";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.ts";

const budgetId = "import-history-budget";
const accountId = "checking";

function transaction(id: string, provenance: LocalTransactionRecord["importProvenance"] = []): LocalTransactionRecord {
  return { id, budgetId, accountId, date: "2026-08-23", amount: -1234, memo: null, checkNumber: null,
    clearedStatus: "uncleared", payeeId: null, payeeName: "Shop", rawPayeeName: "SHOP 123",
    categoryId: "category", categoryName: "Groceries", transferAccountId: null, transferTransactionId: null,
    generatedFromSchedule: false, scheduledTransactionId: null, scheduledOccurrenceDate: null,
    splitLines: [], tagIds: [], importProvenance: provenance, updatedAt: "after" };
}

function snapshot(transactions: readonly LocalTransactionRecord[], payees: readonly LocalPayeeRecord[] = []): ImportHistorySnapshot {
  return { budgetId, transactionIds: ["added", "matched"], payeeIds: ["created-payee"], payees,
    transactions: { budgetId, transactions, attachments: [] } };
}

function harness(fileType: "csv" | "qif" | "ofx" | "qfx" = "qif") {
  const beforeMatched = { ...transaction("matched"), rawPayeeName: null, importProvenance: [], updatedAt: "before" };
  const provenance = (id: string) => [{ fileType, identity: `${fileType}:${id}`, occurrence: 1, importedAt: "2026-08-23T00:00:00.000Z" }] as const;
  const createdPayee: LocalPayeeRecord = { id: "created-payee", budgetId, name: "Shop", note: "", archived: false, createdAt: "created", updatedAt: "created" };
  const before = snapshot([beforeMatched]);
  const after = snapshot([transaction("added", provenance("added")), { ...transaction("matched", provenance("matched")), updatedAt: "after" }], [createdPayee]);
  let current = structuredClone(before);
  let rejectReplacement = false;
  const queries = {
    async commitImportBatchWithHistory() { current = structuredClone(after); return { before: structuredClone(before), after: structuredClone(after) }; },
    async replaceImportHistorySnapshot(input: { expected: ImportHistorySnapshot; replacement: ImportHistorySnapshot }) {
      if (rejectReplacement || JSON.stringify(current) !== JSON.stringify(input.expected)) throw new Error("IMPORT_HISTORY_CONFLICT");
      current = structuredClone(input.replacement);
    },
  };
  const persistence = { accountRegisterQueries: queries } as unknown as BudgetPersistenceProvider;
  const history = new ApplicationHistoryService<ApplicationHistoryContext>({ getContext: () => ({ budgetId, persistence }) });
  const command = createImportTransactionsCommand({ budgetId, accountId,
    additions: [{ id: "added", budgetId, accountId, date: "2026-08-23", amount: -1234 }],
    updates: [{ id: "matched", budgetId, accountId, date: "2026-08-23", amount: -1234 }],
    provenanceAssignments: [
      { transactionId: "added", fileType, identity: `${fileType}:added`, occurrence: 1, importedAt: "2026-08-23T00:00:00.000Z" },
      { transactionId: "matched", fileType, identity: `${fileType}:matched`, occurrence: 1, importedAt: "2026-08-23T00:00:00.000Z" },
    ], payeeCreations: [{ id: "created-payee", name: "Shop" }] });
  return { history, command, before, after, current: () => current, reject: () => { rejectReplacement = true; } };
}

for (const fileType of ["qif", "csv", "ofx", "qfx"] as const) {
  test(`${fileType.toUpperCase()} mixed import is one exact Undo/Redo entry with source identity`, async () => {
    const value = harness(fileType);
    await value.history.execute(budgetId, value.command);
    assert.equal(value.history.getSnapshot(budgetId).undoLabel, "Import 2 transactions");
    assert.deepEqual(value.current(), value.after);
    await value.history.undo(budgetId);
    assert.deepEqual(value.current(), value.before, "Undo removes additions, payee and source occurrences while preserving matched pre-state");
    await value.history.redo(budgetId);
    assert.deepEqual(value.current(), value.after, "Redo restores captured IDs and provenance without re-running matching");
  });
}

test("later transaction/payee state rejects Import Undo and preserves the stack", async () => {
  const value = harness();
  await value.history.execute(budgetId, value.command);
  value.reject();
  const result = await value.history.undo(budgetId);
  assert.equal(result.performed, false);
  assert.equal(value.history.getSnapshot(budgetId).undoDepth, 1);
  assert.deepEqual(value.current(), value.after);
});

test("additions-only and matched-only batches each produce one correctly counted entry", async () => {
  for (const kind of ["addition", "match"] as const) {
    const empty = snapshot([]);
    const post = snapshot([transaction(kind === "addition" ? "added" : "matched")]);
    const queries = {
      async commitImportBatchWithHistory() { return { before: empty, after: post }; },
      async replaceImportHistorySnapshot() {},
    };
    const persistence = { accountRegisterQueries: queries } as unknown as BudgetPersistenceProvider;
    const history = new ApplicationHistoryService<ApplicationHistoryContext>({ getContext: () => ({ budgetId, persistence }) });
    await history.execute(budgetId, createImportTransactionsCommand({ budgetId, accountId,
      additions: kind === "addition" ? [{ id: "added", budgetId, accountId, date: "2026-08-23", amount: -1 }] : [],
      updates: kind === "match" ? [{ id: "matched", budgetId, accountId, date: "2026-08-23", amount: -1 }] : [],
      provenanceAssignments: [{ transactionId: kind === "addition" ? "added" : "matched", fileType: "qif", identity: kind, occurrence: 1, importedAt: "now" }],
      payeeCreations: [] }));
    assert.equal(history.getSnapshot(budgetId).undoLabel, "Import 1 transaction");
    assert.equal(history.getSnapshot(budgetId).undoDepth, 1);
  }
});

test("production import wiring has one command and worker replacement is transactional", () => {
  const register = readFileSync(new URL("../../../apps/web/src/pages/AccountRegisterPage.tsx", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url), "utf8");
  assert.match(register, /executeHistory\(createImportTransactionsCommand/);
  assert.doesNotMatch(register, /executeHistory\(createAddTransactionCommand/);
  const start = worker.indexOf("function replaceImportHistorySnapshot(");
  const source = worker.slice(start, worker.indexOf("\nfunction ", start + 10));
  assert.match(source, /BEGIN IMMEDIATE/);
  assert.match(source, /IMPORT_HISTORY_CONFLICT/);
  assert.match(source, /IMPORT_PAYEE_IN_USE/);
  assert.match(source, /IMPORT_HISTORY_VERIFICATION_FAILED/);
  assert.match(source, /COMMIT/);
  assert.match(source, /ROLLBACK/);
  const writeStart = worker.indexOf("function writeImportBatch(");
  const writeSource = worker.slice(writeStart, worker.indexOf("\nfunction captureTransactionHistorySnapshots", writeStart));
  assert.ok(writeSource.indexOf("const before = history") < writeSource.indexOf("applyTransactionBatchInCurrentTransaction"));
  assert.ok(writeSource.indexOf("const after = history") < writeSource.indexOf('execute("COMMIT")'));
});

test("restore, reset and delete are explicit history boundaries", () => {
  const settings = readFileSync(new URL("../../../apps/web/src/pages/SettingsPage.tsx", import.meta.url), "utf8");
  const deletion = readFileSync(new URL("../../../apps/web/src/features/budget/completeBudgetDeletion.ts", import.meta.url), "utf8");
  assert.ok((settings.match(/applicationHistory\.clear/g) ?? []).length >= 5);
  assert.match(deletion, /applicationHistory\.destroy\(budgetId\)/);
});

test("duplicate-payee suppression uses exact before/after replacement", async () => {
  type Pair = { leftPayeeId: string; rightPayeeId: string };
  let pairs: Pair[] = [{ leftPayeeId: "a", rightPayeeId: "b" }];
  const queries = {
    async listPayeeDuplicateSuppressions() { return structuredClone(pairs); },
    async keepPayeesSeparate(_budgetId: string, additions: readonly Pair[]) { pairs = [...pairs, ...structuredClone(additions)]; },
    async replacePayeeDuplicateSuppressionsHistoryState(input: { expected: readonly Pair[]; replacement: readonly Pair[] }) {
      assert.equal(JSON.stringify(pairs), JSON.stringify(input.expected));
      pairs = structuredClone(input.replacement);
    },
  };
  const persistence = { accountRegisterQueries: queries } as unknown as BudgetPersistenceProvider;
  const history = new ApplicationHistoryService<ApplicationHistoryContext>({ getContext: () => ({ budgetId, persistence }) });
  await history.execute(budgetId, keepPayeesSeparateCommand([{ leftPayeeId: "a", rightPayeeId: "c" }]));
  assert.equal(history.getSnapshot(budgetId).undoLabel, "Keep payees separate");
  await history.undo(budgetId);
  assert.deepEqual(pairs, [{ leftPayeeId: "a", rightPayeeId: "b" }]);
  await history.redo(budgetId);
  assert.deepEqual(pairs, [{ leftPayeeId: "a", rightPayeeId: "b" }, { leftPayeeId: "a", rightPayeeId: "c" }]);
});
