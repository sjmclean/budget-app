import assert from "node:assert/strict";
import test from "node:test";
import { generateDueScheduledTransactions } from "../../../apps/web/src/features/accounts/scheduledTransactionGenerationService";
import type { ScheduledTransactionView } from "../../../apps/web/src/features/accounts/scheduledTransactionTypes";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider";

test("due-today automatic generation uses one hosted atomic occurrence entry", async () => {
  const schedule: ScheduledTransactionView = {
    id: "schedule-due-today",
    accountId: "checking",
    nextDueDate: "2026-09-30",
    recurrenceAnchorDate: "2026-09-30",
    frequency: "once",
    payee: "Due today",
    category: "Bills",
    outflow: 42,
    inflow: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };

  let active = true;
  let atomicCalls = 0;

  const gateway = {
    scheduledTransactions: {
      async listByAccount() {
        return active ? [schedule] : [];
      },
      toRegisterInput() {
        throw new Error("atomic hosted entry should not need a legacy register input");
      },
      async advanceAfterEnter() {
        throw new Error("automatic local-first entry must not separately advance the schedule");
      },
    },
  } as unknown as BudgetPersistenceProvider;

  const result = await generateDueScheduledTransactions(gateway, {
    today: "2026-09-30",
    force: true,
    scope: "due-today-atomic-test",
    listAccounts: async () => [{ id: "checking", name: "Checking" }],
    hostedTransactions: {
      async listRecent() {
        return [];
      },
      async add() {
        throw new Error("automatic local-first entry must not use the split add path");
      },
      async enterOccurrence(accountId, enteredSchedule, occurrenceDate, createTransaction) {
        atomicCalls += 1;
        assert.equal(accountId, "checking");
        assert.equal(enteredSchedule.id, schedule.id);
        assert.equal(occurrenceDate, "2026-09-30");
        assert.equal(createTransaction, true);
        active = false;
      },
    },
  });

  assert.equal(atomicCalls, 1);
  assert.deepEqual(result.createdTransactions, [{
    accountId: "checking",
    scheduledTransactionId: schedule.id,
    occurrenceDate: "2026-09-30",
    payee: "Due today",
  }]);
  assert.deepEqual(result.advancedScheduleIds, [schedule.id]);
});
