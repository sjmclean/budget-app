import assert from "node:assert/strict";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import {
  createScheduledTransactionService,
  normaliseSpecificDates,
} from "../apps/web/src/features/accounts/scheduledTransactionService.ts";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

assert.deepEqual(
  normaliseSpecificDates([
    "2027-05-31",
    "2026-11-30",
    "2026-09-30",
    "2027-02-28",
    "2026-11-30",
    "2027-02-30",
    "not-a-date",
  ]),
  ["2026-09-30", "2026-11-30", "2027-02-28", "2027-05-31"],
);

const service = createScheduledTransactionService({
  storage: createMemoryStorage(),
  recordPayee: async () => undefined,
  findPayeeIdByName: () => undefined,
});

const dates = ["2026-09-30", "2026-11-30", "2027-02-28", "2027-05-31"];
const created = await service.create({
  accountId: "checking",
  nextDueDate: dates[0],
  recurrenceAnchorDate: dates[0],
  recurrenceKind: "specific-dates",
  specificDates: [...dates].reverse(),
  frequency: "custom",
  weekendPolicy: "same-day",
  payee: "Council rates",
  category: "Rates",
  outflow: 250,
  inflow: 0,
});

assert.equal(created.length, 1);
assert.equal(created[0]?.recurrenceKind, "specific-dates");
assert.deepEqual(created[0]?.specificDates, dates);
assert.equal(created[0]?.specificDateIndex, 0);
assert.equal(created[0]?.nextDueDate, "2026-09-30");

let remaining = await service.advanceAfterEnter("checking", created[0]!.id);
assert.equal(remaining[0]?.specificDateIndex, 1);
assert.equal(remaining[0]?.nextDueDate, "2026-11-30");

remaining = await service.advanceAfterEnter("checking", created[0]!.id);
assert.equal(remaining[0]?.specificDateIndex, 2);
assert.equal(remaining[0]?.recurrenceAnchorDate, "2027-02-28");
assert.equal(remaining[0]?.nextDueDate, "2027-02-28", "same-day policy preserves the Sunday occurrence");

remaining = await service.advanceAfterEnter("checking", created[0]!.id);
assert.equal(remaining[0]?.specificDateIndex, 3);
assert.equal(remaining[0]?.nextDueDate, "2027-05-31");

remaining = await service.advanceAfterEnter("checking", created[0]!.id);
assert.equal(remaining.length, 0, "the schedule completes after its final exact date");

const shifted = await service.create({
  accountId: "checking",
  nextDueDate: "2027-02-28",
  recurrenceAnchorDate: "2027-02-28",
  recurrenceKind: "specific-dates",
  specificDates: ["2027-02-28"],
  frequency: "custom",
  weekendPolicy: "next-business-day",
  payee: "Weekend occurrence",
  category: "Rates",
  outflow: 10,
  inflow: 0,
});
assert.equal(shifted[0]?.recurrenceAnchorDate, "2027-02-28");
assert.equal(shifted[0]?.nextDueDate, "2027-03-01");

console.log("Milestone 4 specific-date schedules passed: exact dates, weekend policy, progression, and completion.");
