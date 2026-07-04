import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const registerPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);

assert.match(
  registerPage,
  /components\/RegisterTransactionEditor/,
  "Register page should import the extracted transaction editor",
);

assert.doesNotMatch(
  registerPage,
  /function\s+RegisterDateField/,
  "RegisterDateField should not be implemented directly in AccountRegisterPage",
);

assert.doesNotMatch(
  registerPage,
  /const\s+RegisterDateField/,
  "RegisterDateField should not be implemented directly in AccountRegisterPage",
);

assert.doesNotMatch(
  registerPage,
  /function\s+parseDateInput/,
  "Date parsing should be delegated",
);

assert.doesNotMatch(
  registerPage,
  /function\s+formatDateInput/,
  "Date formatting should be delegated",
);

console.log("v2.52.3 register date field extraction checks passed");
