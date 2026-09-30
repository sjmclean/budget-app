import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  addLocalCalendarDays,
  localCalendarDate,
} from "../../../apps/web/src/features/dates/localCalendarDate.js";
import { parseDateInput } from "../../../apps/web/src/features/accounts/components/RegisterDateField.js";

function withTimezone<T>(timezone: string, run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = timezone;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test("local calendar dates follow the user timezone instead of UTC", () => {
  const instant = new Date("2026-09-29T22:30:00.000Z");

  withTimezone("Australia/Melbourne", () => {
    assert.equal(localCalendarDate(instant), "2026-09-30");
    assert.equal(parseDateInput("today", instant), "2026-09-30");
    assert.equal(parseDateInput("yesterday", instant), "2026-09-29");
    assert.equal(parseDateInput("tomorrow", instant), "2026-10-01");
    assert.equal(parseDateInput("+2", instant), "2026-10-02");
  });

  withTimezone("America/Los_Angeles", () => {
    assert.equal(localCalendarDate(instant), "2026-09-29");
    assert.equal(parseDateInput("today", instant), "2026-09-29");
    assert.equal(parseDateInput("tomorrow", instant), "2026-09-30");
  });
});

test("calendar day arithmetic is timezone-independent across month and year boundaries", () => {
  for (const timezone of ["UTC", "Australia/Melbourne", "America/Los_Angeles", "Pacific/Auckland"]) {
    withTimezone(timezone, () => {
      assert.equal(addLocalCalendarDays("2026-09-30", 1), "2026-10-01");
      assert.equal(addLocalCalendarDays("2026-12-31", 1), "2027-01-01");
      assert.equal(addLocalCalendarDays("2027-01-01", -1), "2026-12-31");
    });
  }
});

test("register calendar-date paths do not derive civil dates through UTC ISO conversion", () => {
  const registerPage = readFileSync(
    new URL("../../../apps/web/src/pages/AccountRegisterPage.tsx", import.meta.url),
    "utf8",
  );
  const dateField = readFileSync(
    new URL("../../../apps/web/src/features/accounts/components/RegisterDateField.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(registerPage, /toISOString\(\)\.slice\(0,\s*10\)/u);
  assert.doesNotMatch(dateField, /toISOString\(\)\.slice\(0,\s*10\)/u);
  assert.match(registerPage, /localCalendarDate\(\)/u);
});
