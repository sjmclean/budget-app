import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatDateForInput,
  parseDateInput,
} from "../apps/web/src/features/accounts/components/RegisterDateField";

assert.equal(formatDateForInput("2026-07-04"), "04/07/2026");
assert.equal(formatDateForInput(""), "");

assert.equal(parseDateInput("04/07/26"), "2026-07-04");
assert.equal(parseDateInput("040726"), "2026-07-04");
assert.equal(parseDateInput("31/02/26"), null);
assert.equal(parseDateInput("not a date"), null);

const registerPageSource = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);
const dateFieldSource = readFileSync(
  join(
    process.cwd(),
    "apps/web/src/features/accounts/components/RegisterDateField.tsx",
  ),
  "utf8",
);

assert.match(
  registerPageSource,
  /components\/RegisterDateField/,
  "Register page should import the extracted date field",
);
assert.doesNotMatch(
  registerPageSource,
  /function RegisterDateField/,
  "Register page should no longer own the date field component",
);
assert.doesNotMatch(
  registerPageSource,
  /function parseDateInput/,
  "Register page should no longer own date parsing helpers",
);
assert.match(
  dateFieldSource,
  /export function RegisterDateField/,
  "Date field component should be exported from its feature component module",
);
assert.match(
  dateFieldSource,
  /showPicker/,
  "Date field should preserve native picker support",
);

console.log("v2.52.3 register date field extraction checks passed");
