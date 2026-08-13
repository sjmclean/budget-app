import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceDateByRule,
  frequencyFromRecurrence,
  recurrenceFromFrequency,
  resolveOccurrenceDate,
  shouldSkipOccurrence,
} from "../../../apps/web/src/features/accounts/scheduledTransactionRecurrence.ts";
import { createSchedule, createScheduledHarness } from "../../support/scheduledTransactionHarness.ts";

describe("scheduled transaction recurrence", () => {
  it("maps standard frequencies to recurrence rules", () => {
    assert.deepEqual(recurrenceFromFrequency("daily"), { interval: 1, unit: "day" });
    assert.deepEqual(recurrenceFromFrequency("weekly"), { interval: 1, unit: "week" });
    assert.deepEqual(recurrenceFromFrequency("fortnightly"), { interval: 2, unit: "week" });
    assert.deepEqual(recurrenceFromFrequency("monthly"), { interval: 1, unit: "month" });
    assert.deepEqual(recurrenceFromFrequency("yearly"), { interval: 1, unit: "year" });
  });

  it("maps recurrence rules back to standard or custom frequencies", () => {
    assert.equal(frequencyFromRecurrence(1, "day"), "daily");
    assert.equal(frequencyFromRecurrence(1, "week"), "weekly");
    assert.equal(frequencyFromRecurrence(2, "week"), "fortnightly");
    assert.equal(frequencyFromRecurrence(1, "month"), "monthly");
    assert.equal(frequencyFromRecurrence(1, "year"), "yearly");
    assert.equal(frequencyFromRecurrence(3, "week"), "custom");
  });

  for (const scenario of [
    { name: "daily", start: "2026-07-24", interval: 1, unit: "day" as const, expected: "2026-07-25" },
    { name: "weekly", start: "2026-07-24", interval: 1, unit: "week" as const, expected: "2026-07-31" },
    { name: "fortnightly", start: "2026-07-24", interval: 2, unit: "week" as const, expected: "2026-08-07" },
    { name: "monthly", start: "2026-07-24", interval: 1, unit: "month" as const, expected: "2026-08-24" },
    { name: "yearly", start: "2026-07-24", interval: 1, unit: "year" as const, expected: "2027-07-24" },
  ]) {
    it(`advances ${scenario.name} recurrence`, () => {
      assert.equal(advanceDateByRule(scenario.start, scenario.interval, scenario.unit), scenario.expected);
    });
  }

  it("keeps the recurrence anchor independent from weekend execution adjustment", () => {
    assert.deepEqual(resolveOccurrenceDate("2026-07-25", 1, "week", "same-day"), {
      anchorDate: "2026-07-25",
      dueDate: "2026-07-25",
    });
    assert.deepEqual(resolveOccurrenceDate("2026-07-25", 1, "week", "previous-business-day"), {
      anchorDate: "2026-07-25",
      dueDate: "2026-07-24",
    });
    assert.deepEqual(resolveOccurrenceDate("2026-07-25", 1, "week", "next-business-day"), {
      anchorDate: "2026-07-25",
      dueDate: "2026-07-27",
    });
  });

  it("identifies skipped weekend occurrences without changing their anchor", () => {
    const saturday = resolveOccurrenceDate("2026-07-25", 1, "week", "skip");
    const sunday = resolveOccurrenceDate("2026-07-26", 1, "week", "skip");
    assert.deepEqual(saturday, { anchorDate: "2026-07-25", dueDate: "2026-07-25" });
    assert.deepEqual(sunday, { anchorDate: "2026-07-26", dueDate: "2026-07-26" });
    assert.equal(shouldSkipOccurrence(saturday.anchorDate, "skip"), true);
    assert.equal(shouldSkipOccurrence(sunday.anchorDate, "skip"), true);
    assert.equal(shouldSkipOccurrence("2026-07-27", "skip"), false);
  });

  it("advances one recurrence at a time after a skipped weekend", async () => {
    for (const scenario of [
      { frequency: "weekly" as const, interval: 1, unit: "week" as const, expected: "2026-08-01" },
      { frequency: "fortnightly" as const, interval: 2, unit: "week" as const, expected: "2026-08-08" },
      { frequency: "monthly" as const, interval: 1, unit: "month" as const, expected: "2026-08-25" },
    ]) {
      const service = createScheduledHarness();
      const schedule = await createSchedule(service, {
        frequency: scenario.frequency,
        recurrenceInterval: scenario.interval,
        recurrenceUnit: scenario.unit,
        weekendPolicy: "skip",
      });
      const advanced = await service.advanceAfterEnter("checking", schedule.id);
      assert.equal(advanced[0]?.recurrenceAnchorDate, scenario.expected);
      assert.equal(advanced[0]?.nextDueDate, scenario.expected);
      assert.equal(advanced[0]?.occurrencesCompleted, 1);
    }
  });
});
