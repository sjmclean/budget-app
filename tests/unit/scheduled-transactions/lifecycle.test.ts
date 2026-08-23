import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSchedule, createScheduledHarness } from "../../support/scheduledTransactionHarness.ts";

describe("scheduled transaction lifecycle", () => {
  it("removes a one-off schedule after materialisation without mutating the register input", async () => {
    const service = createScheduledHarness();
    const schedule = await createSchedule(service, {
      frequency: "once",
      payee: "One-off bill",
      outflow: 25,
    });
    const registerInput = service.toRegisterInput(schedule);
    const remaining = await service.advanceAfterEnter("checking", schedule.id);
    assert.equal(remaining.length, 0);
    assert.equal(registerInput.payee, "One-off bill");
    assert.equal(registerInput.outflow, 25);
  });

  it("honours an occurrence-count end condition", async () => {
    const service = createScheduledHarness();
    const schedule = await createSchedule(service, {
      endCondition: "after-occurrences",
      occurrenceCount: 2,
    });
    const afterFirst = await service.advanceAfterEnter("checking", schedule.id);
    assert.equal(afterFirst[0]?.occurrencesCompleted, 1);
    const afterSecond = await service.advanceAfterEnter("checking", schedule.id);
    assert.equal(afterSecond.length, 0);
  });

  it("removes a schedule when its next anchor would exceed the end date", async () => {
    const service = createScheduledHarness();
    const schedule = await createSchedule(service, {
      endCondition: "on-date",
      endDate: "2026-07-25",
    });
    const remaining = await service.advanceAfterEnter("checking", schedule.id);
    assert.equal(remaining.length, 0);
  });

  it("round-trips split lines into the register input without sharing object references", async () => {
    const service = createScheduledHarness();
    const schedule = await createSchedule(service, {
      frequency: "monthly",
      nextDueDate: "2026-07-22",
      recurrenceAnchorDate: "2026-07-22",
      payee: "Split bill",
      category: "Split",
      outflow: 100,
      splitLines: [
        { id: "power", category: "Power", outflow: 60, inflow: 0, memo: "Electricity" },
        { id: "internet", category: "Internet", outflow: 40, inflow: 0, memo: "Internet" },
      ],
    });
    const input = service.toRegisterInput(schedule);
    assert.equal(input.splitLines?.length, 2);
    assert.equal(input.splitLines?.[1]?.category, "Internet");
    assert.notEqual(input.splitLines, schedule.splitLines);
    assert.notEqual(input.splitLines?.[0], schedule.splitLines?.[0]);
  });

  it("round-trips a scheduled transfer target into generated Register input", async () => {
    const service = createScheduledHarness();
    const schedule = await createSchedule(service, {
      payee: "Transfer: Savings",
      transferAccountId: "savings",
      category: "",
      outflow: 250,
    });
    const input = service.toRegisterInput(schedule);
    assert.equal(schedule.transferAccountId, "savings");
    assert.equal(input.transferAccountId, "savings");
  });

  it("preserves split lines when editing transaction details", async () => {
    const service = createScheduledHarness();
    const schedule = await createSchedule(service, {
      frequency: "fortnightly",
      payee: "Split income",
      category: "Split",
      outflow: 0,
      inflow: 100,
      splitLines: [
        { id: "base", category: "Base", outflow: 0, inflow: 60 },
        { id: "allowance", category: "Allowance", outflow: 0, inflow: 40 },
      ],
    });

    const [updated] = await service.update({
      id: schedule.id,
      accountId: schedule.accountId,
      tagIds: ["important"],
      nextDueDate: "2026-08-08",
      frequency: "monthly",
      payee: schedule.payee,
      category: schedule.category,
      memo: "Edited memo",
      outflow: schedule.outflow,
      inflow: schedule.inflow,
    });

    assert.equal(updated?.memo, "Edited memo");
    assert.deepEqual(updated?.tagIds, ["important"]);
    assert.equal(updated?.splitLines?.length, 2);
    assert.equal(updated?.splitLines?.[0]?.category, "Base");
    assert.equal(updated?.splitLines?.[1]?.inflow, 40);
  });

  it("normalises empty categories according to transaction direction", async () => {
    const service = createScheduledHarness();
    const income = await createSchedule(service, {
      payee: "Income",
      category: "",
      outflow: 0,
      inflow: 100,
    });
    assert.equal(income.category, "Ready to Assign");

    const expense = await createSchedule(service, {
      payee: "Expense",
      category: "",
      outflow: 100,
      inflow: 0,
    });
    assert.equal(expense.category, "Uncategorised");
  });
});
