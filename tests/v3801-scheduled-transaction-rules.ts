import assert from "node:assert/strict";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import {
  createScheduledTransactionService,
  resolveOccurrenceDate,
  shouldSkipOccurrence,
} from "../apps/web/src/features/accounts/scheduledTransactionService.ts";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

async function testCustomRecurrenceAndWeekendPolicy() {
  const service = createScheduledTransactionService({
    storage: createMemoryStorage(),
    recordPayee: async () => undefined,
    findPayeeIdByName: () => undefined,
  });

  const created = await service.create({
    accountId: "checking",
    nextDueDate: "2026-07-25",
    recurrenceAnchorDate: "2026-07-25",
    frequency: "custom",
    recurrenceInterval: 2,
    recurrenceUnit: "week",
    weekendPolicy: "previous-business-day",
    endCondition: "after-occurrences",
    occurrenceCount: 3,
    payee: "Fortnightly bill",
    category: "Bills",
    outflow: 50,
    inflow: 0,
  });

  assert.equal(created[0]?.nextDueDate, "2026-07-24");
  assert.equal(created[0]?.recurrenceAnchorDate, "2026-07-25");

  const advanced = await service.advanceAfterEnter("checking", created[0]!.id);
  assert.equal(advanced[0]?.recurrenceAnchorDate, "2026-08-08");
  assert.equal(advanced[0]?.nextDueDate, "2026-08-07");
  assert.equal(advanced[0]?.occurrencesCompleted, 1);

  const second = await service.advanceAfterEnter("checking", created[0]!.id);
  assert.equal(second.length, 1);
  const completed = await service.advanceAfterEnter("checking", created[0]!.id);
  assert.equal(completed.length, 0);
}

async function testRunOnceRemovesOnlyTheSchedule() {
  const service = createScheduledTransactionService({
    storage: createMemoryStorage(),
    recordPayee: async () => undefined,
    findPayeeIdByName: () => undefined,
  });
  const created = await service.create({
    accountId: "checking",
    nextDueDate: "2026-07-25",
    recurrenceAnchorDate: "2026-07-25",
    frequency: "once",
    payee: "One-off bill",
    category: "Bills",
    outflow: 25,
    inflow: 0,
  });

  assert.equal(created.length, 1);
  assert.equal(created[0]?.frequency, "once");
  const registerInput = service.toRegisterInput(created[0]!);
  assert.equal(registerInput.payee, "One-off bill");
  assert.equal(registerInput.outflow, 25);

  const remainingSchedules = await service.advanceAfterEnter("checking", created[0]!.id);
  assert.equal(remainingSchedules.length, 0);
  assert.equal(registerInput.payee, "One-off bill", "materialised register input remains independent of the deleted schedule");
}

function testWeekendPolicySemantics() {
  const sameDay = resolveOccurrenceDate("2026-07-25", 1, "week", "same-day");
  assert.deepEqual(sameDay, { anchorDate: "2026-07-25", dueDate: "2026-07-25" });

  const previous = resolveOccurrenceDate("2026-07-25", 1, "week", "previous-business-day");
  assert.deepEqual(previous, { anchorDate: "2026-07-25", dueDate: "2026-07-24" });

  const next = resolveOccurrenceDate("2026-07-25", 1, "week", "next-business-day");
  assert.deepEqual(next, { anchorDate: "2026-07-25", dueDate: "2026-07-27" });

  const skipped = resolveOccurrenceDate("2026-07-25", 1, "week", "skip");
  assert.deepEqual(skipped, { anchorDate: "2026-07-25", dueDate: "2026-07-25" });
  assert.equal(shouldSkipOccurrence(skipped.anchorDate, "skip"), true);
  assert.equal(shouldSkipOccurrence("2026-07-27", "skip"), false);
}

async function createSkipSchedule(input: {
  frequency: "weekly" | "fortnightly" | "monthly";
  recurrenceInterval: number;
  recurrenceUnit: "week" | "month";
  endCondition?: "never" | "on-date" | "after-occurrences";
  endDate?: string;
  occurrenceCount?: number;
}) {
  const service = createScheduledTransactionService({
    storage: createMemoryStorage(),
    recordPayee: async () => undefined,
    findPayeeIdByName: () => undefined,
  });
  const created = await service.create({
    accountId: "checking",
    nextDueDate: "2026-07-25",
    recurrenceAnchorDate: "2026-07-25",
    weekendPolicy: "skip",
    payee: "Weekend bill",
    category: "Bills",
    outflow: 10,
    inflow: 0,
    ...input,
  });
  return { service, transaction: created[0]! };
}

async function testSkipAdvancesExactlyOneRecurrence() {
  const weekly = await createSkipSchedule({
    frequency: "weekly",
    recurrenceInterval: 1,
    recurrenceUnit: "week",
  });
  const nextWeekly = await weekly.service.advanceAfterEnter("checking", weekly.transaction.id);
  assert.equal(nextWeekly[0]?.recurrenceAnchorDate, "2026-08-01");
  assert.equal(nextWeekly[0]?.nextDueDate, "2026-08-01");

  const fortnightly = await createSkipSchedule({
    frequency: "fortnightly",
    recurrenceInterval: 2,
    recurrenceUnit: "week",
  });
  const nextFortnightly = await fortnightly.service.advanceAfterEnter("checking", fortnightly.transaction.id);
  assert.equal(nextFortnightly[0]?.recurrenceAnchorDate, "2026-08-08");
  assert.equal(nextFortnightly[0]?.nextDueDate, "2026-08-08");

  const monthly = await createSkipSchedule({
    frequency: "monthly",
    recurrenceInterval: 1,
    recurrenceUnit: "month",
  });
  const nextMonthly = await monthly.service.advanceAfterEnter("checking", monthly.transaction.id);
  assert.equal(nextMonthly[0]?.recurrenceAnchorDate, "2026-08-25");
  assert.equal(nextMonthly[0]?.nextDueDate, "2026-08-25");
}

async function testSkipEndConditions() {
  const endDated = await createSkipSchedule({
    frequency: "weekly",
    recurrenceInterval: 1,
    recurrenceUnit: "week",
    endCondition: "on-date",
    endDate: "2026-07-25",
  });
  const afterEndDate = await endDated.service.advanceAfterEnter("checking", endDated.transaction.id);
  assert.equal(afterEndDate.length, 0);

  const counted = await createSkipSchedule({
    frequency: "weekly",
    recurrenceInterval: 1,
    recurrenceUnit: "week",
    endCondition: "after-occurrences",
    occurrenceCount: 2,
  });
  const afterFirst = await counted.service.advanceAfterEnter("checking", counted.transaction.id);
  assert.equal(afterFirst[0]?.occurrencesCompleted, 1);
  assert.equal(afterFirst[0]?.recurrenceAnchorDate, "2026-08-01");
  const afterSecond = await counted.service.advanceAfterEnter("checking", counted.transaction.id);
  assert.equal(afterSecond.length, 0);
}

async function testSplitLinesRoundTrip() {
  const service = createScheduledTransactionService({
    storage: createMemoryStorage(),
    recordPayee: async () => undefined,
    findPayeeIdByName: () => undefined,
  });

  const created = await service.create({
    accountId: "checking",
    nextDueDate: "2026-07-22",
    frequency: "monthly",
    payee: "Split bill",
    category: "Split",
    outflow: 100,
    inflow: 0,
    splitLines: [
      { id: "one", category: "Power", outflow: 60, inflow: 0, memo: "Electricity" },
      { id: "two", category: "Internet", outflow: 40, inflow: 0, memo: "Internet" },
    ],
  });

  assert.equal(created[0]?.splitLines?.length, 2);
  assert.equal(created[0]?.splitLines?.[1]?.category, "Internet");
}

await testCustomRecurrenceAndWeekendPolicy();
await testRunOnceRemovesOnlyTheSchedule();
testWeekendPolicySemantics();
await testSkipAdvancesExactlyOneRecurrence();
await testSkipEndConditions();
await testSplitLinesRoundTrip();
console.log("v3801 scheduled transaction rules: ok");
