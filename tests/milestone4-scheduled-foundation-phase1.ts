import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { advanceScheduledDate } from "../packages/budget-engine/src/services/scheduledRecurrence";
import { advanceScheduledTransactionDate } from "../packages/budget-engine/src/services/advanceScheduledTransactionDate";
import { ScheduledFrequency } from "../packages/types/src/ScheduledFrequency";
import { localCalendarDate } from "../apps/web/src/features/dates/localCalendarDate";

assert.equal(advanceScheduledDate("2026-01-31", 1, "month", { anchorDay: 31 }), "2026-02-28");
assert.equal(advanceScheduledDate("2028-01-31", 1, "month", { anchorDay: 31 }), "2028-02-29");
assert.equal(advanceScheduledDate("2027-02-28", 1, "month", { anchorDay: 31 }), "2027-03-31");
assert.equal(advanceScheduledDate("2024-02-29", 1, "year", { anchorDay: 29 }), "2025-02-28");
assert.equal(advanceScheduledDate("2096-02-29", 4, "year", { anchorDay: 29 }), "2100-02-28");
assert.equal(
  advanceScheduledDate("2026-11-30", 3, "month", { monthDayPolicy: "last-day-of-month" }),
  "2027-02-28",
);
assert.equal(
  advanceScheduledDate("2027-02-28", 3, "month", { monthDayPolicy: "last-day-of-month" }),
  "2027-05-31",
);
assert.equal(advanceScheduledDate("2026-12-28", 1, "week"), "2027-01-04");
assert.throws(() => advanceScheduledDate("2026-02-30", 1, "month"), /Invalid scheduled transaction date/);

assert.equal(
  advanceScheduledTransactionDate("2026-01-31", ScheduledFrequency.Monthly),
  "2026-02-28",
  "The package compatibility service must not use Date.setMonth overflow semantics.",
);

const localDate = new Date(2026, 7, 6, 0, 5, 0);
assert.equal(localCalendarDate(localDate), "2026-08-06");

const registerPage = readFileSync(
  new URL("../apps/web/src/pages/AccountRegisterPage.tsx", import.meta.url),
  "utf8",
);
const registerHook = readFileSync(
  new URL("../apps/web/src/features/accounts/useAccountRegister.ts", import.meta.url),
  "utf8",
);
assert.match(registerPage, /setActiveRegisterView\("register"\);[\s\S]*?\}, \[accountId\]\);/);
assert.match(registerPage, /<ScheduledTransactionsPanel\s+key=\{accountId\}/);
assert.match(registerHook, /hasLoadedDataRef\.current = false;[\s\S]*?setData\(null\);[\s\S]*?\}, \[accountId\]\);/);

console.log("Milestone 4 scheduled foundation Phase 1 passed: account isolation, local dates, leap years, and month-end recurrence.");
