import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverScheduledTransactions,
  scheduledTransactionDiscoveryStartDate,
  type ScheduledTransactionDiscoveryRecord,
} from "../../../apps/web/src/features/accounts/scheduledTransactionDiscovery.js";
import type { ScheduledTransactionView } from "../../../apps/web/src/features/accounts/scheduledTransactionTypes.js";

function tx(
  id: string,
  date: string,
  amount: number,
  overrides: Partial<ScheduledTransactionDiscoveryRecord> = {},
): ScheduledTransactionDiscoveryRecord {
  return {
    id,
    date,
    payee: "Netflix",
    payeeId: "payee-netflix",
    category: "Entertainment",
    categoryId: "category-entertainment",
    amount,
    splitLineCount: 0,
    ...overrides,
  };
}

const asOfDate = "2026-09-23";

test("discovery uses an 18 month lookback", () => {
  assert.equal(scheduledTransactionDiscoveryStartDate(asOfDate), "2025-03-23");
});

test("stable monthly transactions become a high-confidence fixed suggestion", () => {
  const suggestions = discoverScheduledTransactions({
    asOfDate,
    existingSchedules: [],
    transactions: [
      tx("a", "2026-04-18", -25.99),
      tx("b", "2026-05-18", -25.99),
      tx("c", "2026-06-17", -25.99),
      tx("d", "2026-07-18", -25.99),
      tx("e", "2026-08-18", -25.99),
      tx("f", "2026-09-18", -25.99),
    ],
  });

  assert.equal(suggestions.length, 1);
  const suggestion = suggestions[0]!;
  assert.equal(suggestion.recurrenceLabel, "Monthly");
  assert.equal(suggestion.recurrenceInterval, 1);
  assert.equal(suggestion.recurrenceUnit, "month");
  assert.equal(suggestion.amount.kind, "fixed");
  assert.equal(suggestion.amount.suggested, 25.99);
  assert.equal(suggestion.category, "Entertainment");
  assert.equal(suggestion.confidence, "high");
  assert.equal(suggestion.requiresReview, false);
  assert.equal(suggestion.nextDueDate, "2026-10-18");
});

test("monthly detection tolerates one missed occurrence", () => {
  const suggestions = discoverScheduledTransactions({
    asOfDate,
    existingSchedules: [],
    transactions: [
      tx("a", "2026-03-15", -20),
      tx("b", "2026-04-15", -20),
      tx("c", "2026-06-15", -20),
      tx("d", "2026-07-15", -20),
      tx("e", "2026-08-15", -20),
    ],
  });
  assert.equal(suggestions[0]?.recurrenceLabel, "Monthly");
});

test("fortnightly inflows are detected separately from outflows", () => {
  const suggestions = discoverScheduledTransactions({
    asOfDate,
    existingSchedules: [],
    transactions: [
      tx("a", "2026-07-03", 2500, { payee: "Employer", payeeId: "payee-employer", category: "Ready to Assign" }),
      tx("b", "2026-07-17", 2500, { payee: "Employer", payeeId: "payee-employer", category: "Ready to Assign" }),
      tx("c", "2026-07-31", 2500, { payee: "Employer", payeeId: "payee-employer", category: "Ready to Assign" }),
      tx("d", "2026-08-14", 2500, { payee: "Employer", payeeId: "payee-employer", category: "Ready to Assign" }),
      tx("e", "2026-08-28", -2500, { payee: "Employer", payeeId: "payee-employer", category: "Ready to Assign" }),
    ],
  });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.direction, "inflow");
  assert.equal(suggestions[0]?.recurrenceLabel, "Fortnightly");
});

test("variable recurring amounts require review", () => {
  const suggestions = discoverScheduledTransactions({
    asOfDate,
    existingSchedules: [],
    transactions: [
      tx("a", "2025-09-05", -180, { payee: "Energy Co", payeeId: "energy" }),
      tx("b", "2025-12-05", -240, { payee: "Energy Co", payeeId: "energy" }),
      tx("c", "2026-03-06", -195, { payee: "Energy Co", payeeId: "energy" }),
      tx("d", "2026-06-05", -225, { payee: "Energy Co", payeeId: "energy" }),
      tx("e", "2026-09-04", -205, { payee: "Energy Co", payeeId: "energy" }),
    ],
  });

  const suggestion = suggestions[0]!;
  assert.equal(suggestion.recurrenceLabel, "Quarterly");
  assert.equal(suggestion.amount.kind, "variable");
  assert.equal(suggestion.requiresReview, true);
  assert.equal(suggestion.confidence, "possible");
});

test("yearly recurrence is surfaced from two strong occurrences but requires review", () => {
  const suggestions = discoverScheduledTransactions({
    asOfDate,
    existingSchedules: [],
    transactions: [
      tx("a", "2025-08-20", -450, { payee: "Car Insurance", payeeId: "insurance" }),
      tx("b", "2026-08-19", -450, { payee: "Car Insurance", payeeId: "insurance" }),
    ],
  });

  assert.equal(suggestions[0]?.recurrenceLabel, "Yearly");
  assert.equal(suggestions[0]?.confidence, "possible");
  assert.equal(suggestions[0]?.requiresReview, true);
});

test("dominant category must cover at least three quarters of evidence", () => {
  const suggestions = discoverScheduledTransactions({
    asOfDate,
    existingSchedules: [],
    transactions: [
      tx("a", "2026-05-10", -30, { category: "Entertainment", categoryId: "ent" }),
      tx("b", "2026-06-10", -30, { category: "Entertainment", categoryId: "ent" }),
      tx("c", "2026-07-10", -30, { category: "Dining", categoryId: "dining" }),
      tx("d", "2026-08-10", -30, { category: "Bills", categoryId: "bills" }),
    ],
  });

  assert.equal(suggestions[0]?.category, "");
  assert.equal(suggestions[0]?.requiresReview, true);
});

test("generated schedules, transfers, splits, and old transactions do not contribute", () => {
  const suggestions = discoverScheduledTransactions({
    asOfDate,
    existingSchedules: [],
    transactions: [
      tx("old", "2025-02-18", -25.99),
      tx("scheduled", "2026-05-18", -25.99, { generatedFromSchedule: true }),
      tx("transfer", "2026-06-18", -25.99, { transferAccountId: "savings" }),
      tx("split", "2026-07-18", -25.99, { splitLineCount: 2 }),
      tx("one", "2026-08-18", -25.99),
      tx("two", "2026-09-18", -25.99),
    ],
  });

  assert.deepEqual(suggestions, []);
});

test("an existing equivalent schedule suppresses the suggestion", () => {
  const existing: ScheduledTransactionView = {
    id: "schedule-netflix",
    accountId: "checking",
    nextDueDate: "2026-10-18",
    frequency: "monthly",
    recurrenceInterval: 1,
    recurrenceUnit: "month",
    payee: "Netflix",
    payeeId: "payee-netflix",
    category: "Entertainment",
    categoryId: "category-entertainment",
    outflow: 25.99,
    inflow: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const suggestions = discoverScheduledTransactions({
    asOfDate,
    existingSchedules: [existing],
    transactions: [
      tx("a", "2026-05-18", -25.99),
      tx("b", "2026-06-18", -25.99),
      tx("c", "2026-07-18", -25.99),
      tx("d", "2026-08-18", -25.99),
    ],
  });

  assert.deepEqual(suggestions, []);
});

test("ignored fingerprints suppress future discovery", () => {
  const first = discoverScheduledTransactions({
    asOfDate,
    existingSchedules: [],
    transactions: [
      tx("a", "2026-05-18", -25.99),
      tx("b", "2026-06-18", -25.99),
      tx("c", "2026-07-18", -25.99),
      tx("d", "2026-08-18", -25.99),
    ],
  });
  assert.equal(first.length, 1);

  const second = discoverScheduledTransactions({
    asOfDate,
    existingSchedules: [],
    ignoredFingerprints: new Set([first[0]!.fingerprint]),
    transactions: [
      tx("a", "2026-05-18", -25.99),
      tx("b", "2026-06-18", -25.99),
      tx("c", "2026-07-18", -25.99),
      tx("d", "2026-08-18", -25.99),
    ],
  });
  assert.deepEqual(second, []);
});
