import assert from "node:assert/strict";
import { generateDueScheduledTransactions } from "../apps/web/src/features/accounts/scheduledTransactionGenerationService";

const schedules = [
  {
    id: "schedule-overdue",
    accountId: "sqlite-account",
    payee: "Overdue payment",
    category: "Bills",
    nextDueDate: "2026-08-01",
    recurrenceAnchorDate: "2026-08-01",
    inflow: 0,
    outflow: 25,
    frequency: "once",
    weekendPolicy: "same-day",
    splitLines: [],
  },
  {
    id: "schedule-future",
    accountId: "sqlite-account",
    payee: "Future payment",
    category: "Bills",
    nextDueDate: "2026-08-08",
    recurrenceAnchorDate: "2026-08-08",
    inflow: 0,
    outflow: 30,
    frequency: "once",
    weekendPolicy: "same-day",
    splitLines: [],
  },
];
const added: string[] = [];
const advanced: string[] = [];

const provider = {
  // This intentionally represents the empty legacy key/value account domain.
  accounts: { async listAccounts() { return []; } },
  scheduledTransactions: {
    async listByAccount() {
      return schedules.filter(({ id }) => !advanced.includes(id));
    },
    toRegisterInput(schedule: (typeof schedules)[number]) {
      return {
        date: schedule.nextDueDate,
        payee: schedule.payee,
        category: schedule.category,
        inflow: schedule.inflow,
        outflow: schedule.outflow,
      };
    },
    async advanceAfterEnter(_accountId: string, scheduleId: string) {
      advanced.push(scheduleId);
      return [];
    },
  },
} as never;

const result = await generateDueScheduledTransactions(provider, {
  today: "2026-08-05",
  force: true,
  scope: "sqlite-budget",
  async listAccounts() {
    return [{ id: "sqlite-account", name: "SQLite account" }];
  },
  hostedTransactions: {
    async listRecent() { return []; },
    async add(_accountId, transaction) { added.push(transaction.payee); },
  },
});

assert.deepEqual(added, ["Overdue payment"]);
assert.deepEqual(advanced, ["schedule-overdue"]);
assert.deepEqual(
  result.createdTransactions.map(({ scheduledTransactionId }) => scheduledTransactionId),
  ["schedule-overdue"],
);
assert.equal(schedules[1]?.nextDueDate, "2026-08-08");

console.log("Milestone 4 scheduled SQLite account discovery passed: overdue entered, future retained.");
