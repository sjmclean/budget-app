import assert from "node:assert/strict";
import test from "node:test";

import { mapYnab4Recurrence } from "../../../packages/ynab4-importer/src/scheduled/mapYnab4Recurrence.js";

test("maps standard YNAB4 scheduled frequencies", () => {
  assert.deepEqual(mapYnab4Recurrence({ frequency: "Daily" }), {
    frequency: "daily",
    interval: 1,
    unit: "day",
  });
  assert.deepEqual(mapYnab4Recurrence({ repeat: "Every Other Week" }), {
    frequency: "fortnightly",
    interval: 2,
    unit: "week",
  });
  assert.deepEqual(mapYnab4Recurrence({ recurrence: "Quarterly" }), {
    frequency: "custom",
    interval: 3,
    unit: "month",
  });
  assert.deepEqual(mapYnab4Recurrence({ frequency: "Annually" }), {
    frequency: "yearly",
    interval: 1,
    unit: "year",
  });
});

test("maps explicit every-N recurrence rules", () => {
  assert.deepEqual(mapYnab4Recurrence({ frequency: "Every 5 days" }), {
    frequency: "custom",
    interval: 5,
    unit: "day",
  });
  assert.deepEqual(mapYnab4Recurrence({ frequency: "Every 7 Months" }), {
    frequency: "custom",
    interval: 7,
    unit: "month",
  });
});

test("defaults a missing recurrence to monthly", () => {
  assert.deepEqual(mapYnab4Recurrence({}), {
    frequency: "monthly",
    interval: 1,
    unit: "month",
  });
});

test("rejects unsupported non-uniform and unknown recurrence rules", () => {
  assert.throws(
    () => mapYnab4Recurrence({ frequency: "Twice Monthly" }),
    /Unsupported YNAB4 scheduled frequency: Twice Monthly/,
  );
  assert.throws(
    () => mapYnab4Recurrence({ frequency: "Whenever" }),
    /Unsupported YNAB4 scheduled frequency: Whenever/,
  );
});
