import assert from "node:assert/strict";
import {
  advanceDateByRule,
} from "../apps/web/src/features/accounts/scheduledTransactionRecurrence";

const monthEndOptions = {
  anchorDay: 30,
  monthDayPolicy: "last-day-of-month" as const,
};

const november = "2026-11-30";
const february = advanceDateByRule(november, 3, "month", monthEndOptions);
const may = advanceDateByRule(february, 3, "month", monthEndOptions);

assert.equal(february, "2027-02-28");
assert.equal(may, "2027-05-31");
assert.equal(
  advanceDateByRule("2027-05-31", 3, "month", monthEndOptions),
  "2027-08-31",
);

const anchoredSameDay = {
  anchorDay: 30,
  monthDayPolicy: "same-day-number" as const,
};
assert.equal(
  advanceDateByRule("2026-11-30", 3, "month", anchoredSameDay),
  "2027-02-28",
);
assert.equal(
  advanceDateByRule("2027-02-28", 3, "month", anchoredSameDay),
  "2027-05-30",
);

assert.equal(
  advanceDateByRule("2024-02-29", 1, "year", {
    anchorDay: 29,
    monthDayPolicy: "same-day-number",
  }),
  "2025-02-28",
);
assert.equal(
  advanceDateByRule("2025-02-28", 3, "year", {
    anchorDay: 29,
    monthDayPolicy: "same-day-number",
  }),
  "2028-02-29",
);

assert.equal(advanceDateByRule("2026-09-30", 2, "week"), "2026-10-14");

console.log(
  "Milestone 4 scheduled month-end policy passed: anchored day numbers, month-end quarters, and leap years.",
);
