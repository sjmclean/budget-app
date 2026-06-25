import assert from "node:assert/strict";
import { formatDateForDisplay } from "../apps/web/src/features/settings/dateFormatting";

const sample = "2026-06-22";

assert.equal(formatDateForDisplay(sample, "DD/MM/YYYY"), "22/06/2026");
assert.equal(formatDateForDisplay(sample, "MM/DD/YYYY"), "06/22/2026");
assert.equal(formatDateForDisplay(sample, "YYYY-MM-DD"), "2026-06-22");

assert.equal(formatDateForDisplay(sample, "DD/MM/YYYY", "short"), "22/06");
assert.equal(formatDateForDisplay(sample, "MM/DD/YYYY", "short"), "06/22");
assert.equal(formatDateForDisplay(sample, "YYYY-MM-DD", "short"), "2026-06-22");

assert.equal(formatDateForDisplay("not-a-date", "DD/MM/YYYY"), "not-a-date");

console.log("v1.96 date format preference checks passed");
