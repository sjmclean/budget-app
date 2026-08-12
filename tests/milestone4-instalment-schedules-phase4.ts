import assert from "node:assert/strict";
import { createScheduledHarness } from "./support/scheduledTransactionHarness.ts";
import {
  normaliseSpecificInstalments,
} from "../apps/web/src/features/accounts/scheduledTransactionRecurrence.ts";


const councilInstalments = [
  { date: "2026-09-30", outflow: 561.69, inflow: 0 },
  { date: "2026-11-30", outflow: 558, inflow: 0 },
  { date: "2027-02-28", outflow: 558, inflow: 0 },
  { date: "2027-05-31", outflow: 558, inflow: 0 },
] as const;

assert.deepEqual(
  normaliseSpecificInstalments(undefined, councilInstalments.map(({ date }) => date), 250, 0),
  councilInstalments.map(({ date }) => ({ date, outflow: 250, inflow: 0 })),
  "legacy specific-date schedules inherit their existing amount",
);

const service = createScheduledHarness();

const created = await service.create({
  accountId: "checking",
  nextDueDate: councilInstalments[0].date,
  recurrenceAnchorDate: councilInstalments[0].date,
  recurrenceKind: "specific-dates",
  specificInstalments: [...councilInstalments].reverse(),
  frequency: "custom",
  weekendPolicy: "same-day",
  payee: "Council rates",
  category: "Rates",
  outflow: 0,
  inflow: 0,
});

assert.deepEqual(created[0]?.specificInstalments, councilInstalments);
assert.equal(created[0]?.outflow, 561.69);
assert.equal(service.toRegisterInput(created[0]!).outflow, 561.69);

let remaining = await service.advanceAfterEnter("checking", created[0]!.id);
assert.equal(remaining[0]?.nextDueDate, "2026-11-30");
assert.equal(remaining[0]?.outflow, 558);
assert.equal(service.toRegisterInput(remaining[0]!).outflow, 558);

remaining = await service.advanceAfterEnter("checking", created[0]!.id);
assert.equal(remaining[0]?.nextDueDate, "2027-02-28");
assert.equal(remaining[0]?.outflow, 558);

remaining = await service.advanceAfterEnter("checking", created[0]!.id);
assert.equal(remaining[0]?.nextDueDate, "2027-05-31");

remaining = await service.advanceAfterEnter("checking", created[0]!.id);
assert.equal(remaining.length, 0);

console.log("Milestone 4 Phase 4 instalment schedules passed: exact per-occurrence amounts, legacy migration, progression, and completion.");
