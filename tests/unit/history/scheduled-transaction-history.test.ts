import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createScheduledTransactionCommand,
  deleteScheduledTransactionCommand,
  editScheduledTransactionCommand,
  enterScheduledTransactionCommand,
} from "../../../apps/web/src/features/history/commands/scheduled/scheduledTransactionCommands.ts";
import { ApplicationHistoryService, type ApplicationHistoryContext } from "../../../apps/web/src/features/history/applicationHistory.ts";
import { advanceScheduledTransaction, buildScheduledTransaction } from "../../../apps/web/src/features/accounts/scheduledTransactionLifecycle.ts";
import type { ScheduledTransactionView, UpsertScheduledTransactionInput } from "../../../apps/web/src/features/accounts/scheduledTransactionTypes.ts";
import type { TransactionHistorySnapshot } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.ts";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.ts";

const budgetId = "budget-scheduled";

function input(overrides: Partial<UpsertScheduledTransactionInput> = {}): UpsertScheduledTransactionInput {
  return {
    accountId: "account-a", nextDueDate: "2026-08-24", frequency: "monthly",
    recurrenceKind: "rule", recurrenceAnchorDate: "2026-08-24", recurrenceInterval: 1,
    recurrenceUnit: "month", weekendPolicy: "same-day", endCondition: "never",
    occurrencesCompleted: 0, payee: "Rent", payeeId: "payee-1", category: "Housing",
    categoryId: "category-1", memo: "scheduled", outflow: 100, inflow: 0,
    tagIds: ["tag-1"], splitLines: [], attachments: [], ...overrides,
  };
}

function harness(initial: ScheduledTransactionView[] = []) {
  const schedules = new Map(initial.map((value) => [value.id, structuredClone(value)]));
  let generated: TransactionHistorySnapshot | null = null;
  const same = (left: unknown, right: unknown) => assert.equal(JSON.stringify(left), JSON.stringify(right));
  const queries = {
    async captureScheduledTransaction(_budgetId: string, scheduleId: string) {
      return structuredClone(schedules.get(scheduleId) ?? null);
    },
    async replaceScheduledTransactionHistoryState(value: any) {
      same(schedules.get(value.scheduleId) ?? null, value.expectedSchedule);
      same(generated, value.expectedTransaction);
      if (value.replacementSchedule) schedules.set(value.scheduleId, structuredClone(value.replacementSchedule));
      else schedules.delete(value.scheduleId);
      generated = structuredClone(value.replacementTransaction);
    },
    async enterScheduledTransaction(value: any) {
      same(schedules.get(value.schedule.id), value.schedule);
      const advanced = advanceScheduledTransaction(value.schedule, "2026-08-24T12:00:00.000Z");
      const afterSchedule = advanced.action === "delete" ? null : advanced.transaction;
      generated = value.createTransaction ? {
        budgetId,
        transactions: [{
          id: value.transactionId, budgetId, accountId: value.accountId,
          date: value.schedule.nextDueDate, amount: Math.round((value.schedule.inflow - value.schedule.outflow) * 100),
          memo: value.schedule.memo ?? null, checkNumber: null, clearedStatus: "uncleared",
          payeeId: value.schedule.payeeId ?? null, payeeName: value.schedule.payee,
          categoryId: value.schedule.categoryId ?? null, categoryName: value.schedule.category,
          transferAccountId: null, transferTransactionId: null, generatedFromSchedule: true,
          scheduledTransactionId: value.schedule.id,
          scheduledOccurrenceDate: value.schedule.recurrenceAnchorDate ?? value.schedule.nextDueDate,
          splitLines: value.schedule.splitLines ?? [], tagIds: value.schedule.tagIds ?? [],
          importProvenance: [], updatedAt: "2026-08-24T12:00:00.000Z",
        }],
        attachments: (value.schedule.attachments ?? []).map((attachment: any) => ({
          id: `${value.transactionId}:attachment:${attachment.id}`, budgetId,
          transactionId: value.transactionId, fileName: attachment.fileName,
          fileSize: attachment.fileSize, mimeType: attachment.mimeType,
          attachedAt: "2026-08-24T12:00:00.000Z", contentHash: attachment.contentHash,
          content: Uint8Array.from(Buffer.from(attachment.contentBase64, "base64")),
        })),
      } : null;
      if (afterSchedule) schedules.set(value.schedule.id, structuredClone(afterSchedule));
      else schedules.delete(value.schedule.id);
      return { afterSchedule: structuredClone(afterSchedule), transaction: structuredClone(generated) };
    },
  };
  const scheduledTransactions = {
    async create(write: UpsertScheduledTransactionInput) {
      const schedule = buildScheduledTransaction(write, { id: write.id, now: "2026-08-24T10:00:00.000Z" });
      schedules.set(schedule.id, schedule); return [...schedules.values()];
    },
    async update(write: UpsertScheduledTransactionInput & { id: string }) {
      const existing = schedules.get(write.id); if (!existing) throw new Error("missing");
      schedules.set(write.id, buildScheduledTransaction(write, { existing, now: "2026-08-24T11:00:00.000Z" }));
      return [...schedules.values()];
    },
  };
  const persistence = { accountRegisterQueries: queries, scheduledTransactions } as unknown as BudgetPersistenceProvider;
  const service = new ApplicationHistoryService<ApplicationHistoryContext>({ getContext: (id) => ({ budgetId: id, persistence }) });
  return { service, schedules, getGenerated: () => generated, setGenerated: (value: TransactionHistorySnapshot | null) => { generated = value; } };
}

test("create, edit transformations and delete preserve exact scheduled state and stable ID", async () => {
  const { service, schedules } = harness();
  const attachment = { id: "template-1", fileName: "invoice.bin", fileSize: 3, mimeType: "application/octet-stream", attachedAt: "now", contentBase64: "AQID", contentHash: `sha256:${"a".repeat(64)}` };
  await service.execute(budgetId, createScheduledTransactionCommand({ scheduleId: "stable-schedule", write: input({ id: "stable-schedule", attachments: [attachment] }) }));
  assert.equal(service.getSnapshot(budgetId).undoLabel, "Create scheduled transaction");
  await service.undo(budgetId); assert.equal(schedules.has("stable-schedule"), false);
  await service.redo(budgetId); assert.equal(schedules.get("stable-schedule")!.attachments![0].contentBase64, "AQID");

  await service.execute(budgetId, editScheduledTransactionCommand({ scheduleId: "stable-schedule", write: input({
    id: "stable-schedule", recurrenceKind: "specific-dates", frequency: "custom",
    specificInstalments: [{ date: "2026-09-01", outflow: 125, inflow: 0 }, { date: "2026-10-01", outflow: 150, inflow: 0 }],
    splitLines: [{ id: "split-stable", category: "Rent", categoryId: "cat-rent", memo: "line", outflow: 125, inflow: 0 }],
    attachments: [attachment],
  }) }));
  assert.equal(schedules.get("stable-schedule")!.recurrenceKind, "specific-dates");
  assert.equal(schedules.get("stable-schedule")!.splitLines![0].id, "split-stable");
  await service.undo(budgetId); assert.equal(schedules.get("stable-schedule")!.recurrenceKind, "rule");
  await service.redo(budgetId); assert.equal(schedules.get("stable-schedule")!.specificInstalments![1].outflow, 150);

  await service.execute(budgetId, deleteScheduledTransactionCommand("stable-schedule"));
  assert.equal(service.getSnapshot(budgetId).undoLabel, "Delete scheduled transaction");
  await service.undo(budgetId); assert.equal(schedules.get("stable-schedule")!.attachments![0].contentBase64, "AQID");
  await service.redo(budgetId); assert.equal(schedules.has("stable-schedule"), false);
});

test("recurring Enter is one command and round-trips schedule, split, tags and attachment bytes", async () => {
  const schedule = buildScheduledTransaction(input({
    id: "recurring", splitLines: [{ id: "line-1", category: "Housing", categoryId: "cat", memo: "split", outflow: 100, inflow: 0 }],
    attachments: [{ id: "template", fileName: "a.bin", fileSize: 3, mimeType: "application/octet-stream", attachedAt: "now", contentBase64: "AQID", contentHash: `sha256:${"b".repeat(64)}` }],
  }), { id: "recurring", now: "created" });
  const { service, schedules, getGenerated } = harness([schedule]);
  await service.execute(budgetId, enterScheduledTransactionCommand({ accountId: "account-a", scheduleId: "recurring", transactionId: "stable-occurrence" }));
  assert.equal(service.getSnapshot(budgetId).undoDepth, 1);
  assert.equal(service.getSnapshot(budgetId).undoLabel, "Enter scheduled transaction");
  assert.equal(schedules.get("recurring")!.occurrencesCompleted, 1);
  assert.equal(getGenerated()!.transactions[0].id, "stable-occurrence");
  assert.equal(getGenerated()!.transactions[0].splitLines[0].id, "line-1");
  assert.deepEqual(getGenerated()!.transactions[0].tagIds, ["tag-1"]);
  assert.deepEqual(Array.from(getGenerated()!.attachments[0].content), [1, 2, 3]);
  await service.undo(budgetId); assert.equal(schedules.get("recurring")!.occurrencesCompleted, 0); assert.equal(getGenerated(), null);
  await service.redo(budgetId); assert.equal(getGenerated()!.transactions[0].id, "stable-occurrence");
});

test("one-time, terminal specific-date and skipped occurrences restore exact progression", async () => {
  for (const schedule of [
    buildScheduledTransaction(input({ id: "once", frequency: "once" }), { id: "once" }),
    buildScheduledTransaction(input({ id: "specific", recurrenceKind: "specific-dates", frequency: "custom", specificInstalments: [{ date: "2026-08-24", outflow: 10, inflow: 0 }] }), { id: "specific" }),
    buildScheduledTransaction(input({ id: "skip", nextDueDate: "2026-08-23", recurrenceAnchorDate: "2026-08-23", weekendPolicy: "skip" }), { id: "skip" }),
  ]) {
    const { service, schedules, getGenerated } = harness([schedule]);
    await service.execute(budgetId, enterScheduledTransactionCommand({ accountId: "account-a", scheduleId: schedule.id, transactionId: `${schedule.id}-tx` }));
    if (schedule.id !== "skip") assert.equal(schedules.has(schedule.id), false);
    if (schedule.id === "skip") assert.equal(getGenerated(), null);
    await service.undo(budgetId); assert.equal(schedules.get(schedule.id)!.id, schedule.id);
    await service.redo(budgetId);
  }
});

test("conflicting schedule state rejects compound Undo without changing either domain", async () => {
  const schedule = buildScheduledTransaction(input({ id: "conflict" }), { id: "conflict" });
  const { service, schedules, getGenerated } = harness([schedule]);
  await service.execute(budgetId, enterScheduledTransactionCommand({ accountId: "account-a", scheduleId: "conflict", transactionId: "conflict-tx" }));
  schedules.set("conflict", { ...schedules.get("conflict")!, memo: "external" });
  const beforeTransaction = structuredClone(getGenerated());
  const result = await service.undo(budgetId);
  assert.equal(result.performed, false);
  assert.equal(service.getSnapshot(budgetId).undoDepth, 1);
  assert.equal(service.getSnapshot(budgetId).redoDepth, 0);
  assert.equal(schedules.get("conflict")!.memo, "external");
  assert.deepEqual(getGenerated(), beforeTransaction);
});

test("scheduled actions share global ordering and production separates manual history from maintenance", async () => {
  const schedule = buildScheduledTransaction(input({ id: "ordering" }), { id: "ordering" });
  const { service } = harness([schedule]);
  await service.execute(budgetId, { id: "budget", label: "Assign money", execute() {}, undo() {} });
  await service.execute(budgetId, enterScheduledTransactionCommand({ accountId: "account-a", scheduleId: "ordering", transactionId: "ordering-tx" }));
  await service.execute(budgetId, { id: "register", label: "Edit transaction", execute() {}, undo() {} });
  assert.equal(service.getSnapshot(budgetId).undoLabel, "Edit transaction");
  await service.undo(budgetId); assert.equal(service.getSnapshot(budgetId).undoLabel, "Enter scheduled transaction");
  await service.undo(budgetId); assert.equal(service.getSnapshot(budgetId).undoLabel, "Assign money");

  const panel = readFileSync(new URL("../../../apps/web/src/components/accounts/ScheduledTransactionsPanel.tsx", import.meta.url), "utf8");
  const maintenance = readFileSync(new URL("../../../apps/web/src/features/accounts/scheduledTransactionMaintenance.ts", import.meta.url), "utf8");
  assert.match(panel, /useScheduledTransactionHistory\(budgetId, accountId\)/);
  assert.doesNotMatch(panel, /scheduledTransactionsPersistence\.(create|update|delete|advanceAfterEnter)\(/);
  assert.doesNotMatch(panel, /onEnter:\s*\(transaction:\s*NewRegisterTransactionInput/);
  assert.match(maintenance, /generateDueScheduledTransactions/);
  assert.doesNotMatch(maintenance, /applicationHistory|ScheduledTransactionCommand/);
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

  const client = readFileSync(new URL(
    "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
    import.meta.url,
  ), "utf8");
  const enterSource = client.slice(
    client.indexOf("async enterScheduledTransaction(input)"),
    client.indexOf("async createScheduledTransaction", client.indexOf("async enterScheduledTransaction(input)")),
  );
  assert.match(enterSource, /buildNewTransactionRecords/);
  assert.match(enterSource, /scheduledRegisterWrite/);
  assert.match(enterSource, /current\.attachments/);
  assert.match(enterSource, /replaceScheduledTransactionHistoryState/);
  assert.doesNotMatch(enterSource, /applicationHistory|createAddTransactionCommand/);
  assert.match(client, /const group: LocalBudgetOperationGroup = \{ members \}/);
});
