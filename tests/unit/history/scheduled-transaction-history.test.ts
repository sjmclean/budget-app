import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ScheduledTransactionView } from "../../../apps/web/src/features/accounts/scheduledTransactionTypes.js";
import { advanceScheduledTransaction, buildScheduledTransaction } from "../../../apps/web/src/features/accounts/scheduledTransactionLifecycle.js";
import { createApplicationHistoryEngine } from "../../../apps/web/src/features/history/applicationHistory.js";
import { createScheduledTransactionHistoryCommands } from "../../../apps/web/src/features/history/commands/scheduledTransactionHistoryCommands.js";
import type { TransactionHistorySnapshot } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";
import type { UpsertScheduledTransactionInput } from "../../../apps/web/src/features/accounts/scheduledTransactionTypes.js";

const budgetId = "budget-a";
const accountId = "account-a";

function schedule(overrides: Partial<ScheduledTransactionView> = {}): ScheduledTransactionView {
  return {
    id: "schedule-a",
    accountId,
    payee: "Rent",
    payeeId: "payee-rent",
    transferAccountId: null,
    category: "Housing",
    categoryId: "category-housing",
    memo: "Monthly",
    outflow: 1000,
    inflow: 0,
    tagIds: ["tag-a"],
    frequency: "monthly",
    interval: 1,
    startDate: "2026-01-01",
    nextDueDate: "2026-01-01",
    endDate: null,
    dayOfMonth: 1,
    dayOfWeek: null,
    weekOfMonth: null,
    monthOfYear: null,
    specificDates: [],
    splitLines: [],
    attachments: [],
    createdAt: "2025-12-01T00:00:00.000Z",
    updatedAt: "2025-12-01T00:00:00.000Z",
    ...overrides,
  };
}

function input(overrides: Partial<UpsertScheduledTransactionInput> = {}): UpsertScheduledTransactionInput {
  return {
    accountId,
    payee: "Rent",
    payeeId: "payee-rent",
    transferAccountId: null,
    category: "Housing",
    categoryId: "category-housing",
    memo: "Monthly",
    outflow: 1000,
    inflow: 0,
    tagIds: ["tag-a"],
    frequency: "monthly",
    interval: 1,
    startDate: "2026-01-01",
    endDate: null,
    dayOfMonth: 1,
    dayOfWeek: null,
    weekOfMonth: null,
    monthOfYear: null,
    specificDates: [],
    splitLines: [],
    attachments: [],
    ...overrides,
  };
}

function transactionSnapshot(id = "tx-a"): TransactionHistorySnapshot {
  return {
    budgetId,
    transactions: [{
      id, budgetId, accountId, date: "2026-01-01", amount: -100000,
      payeeId: "payee-rent", payeeName: "Rent", categoryId: "category-housing",
      categoryName: "Housing", memo: "Monthly", clearedStatus: "uncleared",
      reconciliationId: null, reconciledAt: null, provenance: null,
      rawPayee: null, transferAccountId: null, transferTransactionId: null,
      generatedFromSchedule: true, scheduledTransactionId: "schedule-a",
      scheduledOccurrenceDate: "2026-01-01", splitLines: [], tagIds: ["tag-a"],
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    }],
    attachments: [],
  };
}

function harness(initialSchedule: ScheduledTransactionView | null = null) {
  let currentSchedule = initialSchedule;
  let currentTransaction: TransactionHistorySnapshot | null = null;
  const commands = createScheduledTransactionHistoryCommands({
    captureSchedule: async () => currentSchedule,
    createSchedule: async (_budgetId, next) => {
      currentSchedule = buildScheduledTransaction(next, { id: next.id });
      return currentSchedule;
    },
    updateSchedule: async (_budgetId, id, next) => {
      currentSchedule = buildScheduledTransaction(next, { id, existing: currentSchedule ?? undefined });
      return currentSchedule;
    },
    deleteSchedule: async () => { currentSchedule = null; },
    captureTransaction: async () => currentTransaction,
    enterSchedule: async (_budgetId, scheduleId, transactionId, createTransaction) => {
      assert.equal(currentSchedule?.id, scheduleId);
      const before = currentSchedule!;
      const advanced = advanceScheduledTransaction(before);
      currentSchedule = advanced.action === "delete" ? null : advanced.transaction;
      currentTransaction = createTransaction ? transactionSnapshot(transactionId) : null;
      return { afterSchedule: currentSchedule, transaction: currentTransaction };
    },
    replaceState: async (replacement) => {
      if (JSON.stringify(currentSchedule) !== JSON.stringify(replacement.expectedSchedule)) {
        throw new Error("schedule conflict");
      }
      if (JSON.stringify(currentTransaction) !== JSON.stringify(replacement.expectedTransaction)) {
        throw new Error("transaction conflict");
      }
      currentSchedule = replacement.replacementSchedule;
      currentTransaction = replacement.replacementTransaction;
    },
    now: () => "2026-01-01T00:00:00.000Z",
    createId: () => "schedule-a",
    createTransactionId: () => "tx-a",
  });
  return {
    commands,
    schedule: () => currentSchedule,
    transaction: () => currentTransaction,
    mutateSchedule: (next: ScheduledTransactionView | null) => { currentSchedule = next; },
  };
}

test("create, edit transformations and delete preserve exact scheduled state and stable ID", async () => {
  const h = harness();
  const engine = createApplicationHistoryEngine();
  await engine.execute(h.commands.create(budgetId, input()));
  const created = h.schedule();
  assert.equal(created?.id, "schedule-a");
  await engine.execute(h.commands.update(budgetId, "schedule-a", input({ payee: "Power", payeeId: "payee-power" })));
  assert.equal(h.schedule()?.id, "schedule-a");
  assert.equal(h.schedule()?.payee, "Power");
  await engine.undo(budgetId);
  assert.deepEqual(h.schedule(), created);
  await engine.redo(budgetId);
  assert.equal(h.schedule()?.payee, "Power");
  await engine.execute(h.commands.delete(budgetId, "schedule-a"));
  assert.equal(h.schedule(), null);
  await engine.undo(budgetId);
  assert.equal(h.schedule()?.payee, "Power");
});

test("recurring Enter is one command and round-trips schedule, split, tags and attachment bytes", async () => {
  const initial = schedule({
    splitLines: [{ id: "split-a", categoryId: "category-a", category: "Groceries", outflow: 1000, inflow: 0, memo: "split" }],
    attachments: [{ id: "att-a", fileName: "receipt.pdf", fileSize: 3, mimeType: "application/pdf", contentHash: "sha256:" + "a".repeat(64), contentBase64: "AQID" }],
  });
  const h = harness(initial);
  const engine = createApplicationHistoryEngine();
  await engine.execute(h.commands.enter(budgetId, "schedule-a", true));
  assert.equal(engine.getSnapshot(budgetId).undoCount, 1);
  assert.equal(h.schedule()?.nextDueDate, "2026-02-01");
  assert.equal(h.transaction()?.transactions[0]?.tagIds[0], "tag-a");
  await engine.undo(budgetId);
  assert.deepEqual(h.schedule(), initial);
  assert.equal(h.transaction(), null);
  await engine.redo(budgetId);
  assert.equal(h.schedule()?.nextDueDate, "2026-02-01");
  assert.equal(h.transaction()?.transactions[0]?.splitLines.length, 0);
});

test("future Enter retains occurrence date and skip advances without a transaction with Undo/Redo", async () => {
  const h = harness(schedule({ nextDueDate: "2026-04-15", startDate: "2026-04-15", dayOfMonth: 15 }));
  const engine = createApplicationHistoryEngine();
  await engine.execute(h.commands.enter(budgetId, "schedule-a", true));
  assert.equal(h.transaction()?.transactions[0]?.scheduledOccurrenceDate, "2026-01-01");
  await engine.undo(budgetId);
  assert.equal(h.schedule()?.nextDueDate, "2026-04-15");
  await engine.redo(budgetId);
  assert.equal(h.transaction()?.transactions[0]?.scheduledOccurrenceDate, "2026-01-01");
  const beforeSkip = h.schedule();
  await engine.execute(h.commands.enter(budgetId, "schedule-a", false));
  assert.equal(h.transaction(), null);
  assert.notEqual(h.schedule()?.nextDueDate, beforeSkip?.nextDueDate);
  await engine.undo(budgetId);
  assert.deepEqual(h.schedule(), beforeSkip);
});

test("one-time, terminal specific-date and skipped occurrences restore exact progression", async () => {
  const cases = [
    schedule({ frequency: "once", nextDueDate: "2026-01-01" }),
    schedule({ frequency: "specific-dates", specificDates: ["2026-01-01"], nextDueDate: "2026-01-01" }),
    schedule({ frequency: "monthly", nextDueDate: "2026-01-01" }),
  ];
  for (const original of cases) {
    const h = harness(original);
    const engine = createApplicationHistoryEngine();
    await engine.execute(h.commands.enter(budgetId, original.id, false));
    await engine.undo(budgetId);
    assert.deepEqual(h.schedule(), original);
    await engine.redo(budgetId);
    if (original.frequency === "monthly") assert.equal(h.schedule()?.nextDueDate, "2026-02-01");
    else assert.equal(h.schedule(), null);
  }
});

test("conflicting schedule state rejects compound Undo without changing either domain", async () => {
  const initial = schedule();
  const h = harness(initial);
  const engine = createApplicationHistoryEngine();
  await engine.execute(h.commands.enter(budgetId, "schedule-a", true));
  const enteredSchedule = h.schedule();
  const enteredTransaction = h.transaction();
  h.mutateSchedule(schedule({ id: "schedule-a", payee: "Concurrent" }));
  const result = await engine.undo(budgetId);
  assert.equal(result.performed, false);
  assert.equal(result.reason, "failed");
  assert.notDeepEqual(h.schedule(), enteredSchedule);
  assert.deepEqual(h.transaction(), enteredTransaction);
  assert.equal(engine.getSnapshot(budgetId).undoCount, 1);
});

test("scheduled actions share global ordering and production separates manual history from maintenance", async () => {
  const runtime = readFileSync(new URL(
    "../../../apps/web/src/features/persistence/accountRegisterQueryContracts.ts",
    import.meta.url,
  ), "utf8");
  assert.match(runtime, /enterScheduledTransaction/);
  assert.match(runtime, /advanceScheduledTransaction/);
  const source = readFileSync(new URL(
    "../../../apps/web/src/features/history/commands/scheduledTransactionHistoryCommands.ts",
    import.meta.url,
  ), "utf8");
  assert.match(source, /enterSchedule/);
  assert.match(source, /createSchedule/);
  assert.match(source, /updateSchedule/);
  assert.match(source, /deleteSchedule/);
});

test("worker compound replacement validates both domains before one SQLite transaction commits", () => {
  const worker = readFileSync(new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ), "utf8");
  const source = worker.slice(
    worker.indexOf("function replaceScheduledTransactionHistoryState("),
    worker.indexOf("function deleteTransaction(", worker.indexOf("function replaceScheduledTransactionHistoryState(")),
  );
  assert.match(source, /execute\("BEGIN IMMEDIATE"\)/);
  assert.match(source, /readScheduledTransactionForHistory/);
  assert.match(source, /captureTransactionHistorySnapshots/);
  assert.match(source, /TRANSACTION_ALREADY_EXISTS/);
  assert.match(source, /upsertTransactionAttachment/);
  assert.match(source, /writeNormalisedDomainEntity\("scheduledTransactions"/);
  assert.match(source, /execute\("COMMIT"\)/);
  assert.match(source, /execute\("ROLLBACK"\)/);
  assert.ok(source.indexOf("readScheduledTransactionForHistory") < source.indexOf("DELETE FROM local_transactions"));
  assert.ok(source.indexOf("captureTransactionHistorySnapshots") < source.indexOf("DELETE FROM local_transactions"));

  const commandSource = readFileSync(new URL(
    "../../../apps/web/src/features/persistence/localFirst/engine/scheduledTransactionCommands.ts",
    import.meta.url,
  ), "utf8");
  const enterSource = commandSource.slice(
    commandSource.indexOf("async enterScheduledTransaction(input)"),
    commandSource.indexOf("async createScheduledTransaction", commandSource.indexOf("async enterScheduledTransaction(input)")),
  );
  assert.match(enterSource, /buildNewTransactionRecords/);
  assert.match(enterSource, /scheduledRegisterWrite/);
  assert.match(enterSource, /current\.attachments/);
  assert.match(enterSource, /replaceScheduledTransactionHistoryState/);
  assert.doesNotMatch(enterSource, /applicationHistory|createAddTransactionCommand/);
  assert.match(commandSource, /const group: LocalBudgetOperationGroup = \{ members \}/);
});
