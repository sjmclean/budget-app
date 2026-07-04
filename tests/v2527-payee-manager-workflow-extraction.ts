import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const registerPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);

const payeeManagerWorkflow = readFileSync(
  join(process.cwd(), "apps/web/src/features/accounts/usePayeeManagerWorkflow.ts"),
  "utf8",
);

assert.match(
  registerPage,
  /usePayeeManagerWorkflow/,
  "Register page should use the extracted payee manager workflow hook",
);

assert.doesNotMatch(
  registerPage,
  /function\s+handleRenamePayee/,
  "Payee rename workflow should not be implemented directly in AccountRegisterPage",
);

assert.doesNotMatch(
  registerPage,
  /function\s+handleMergeSelectedPayee/,
  "Payee merge workflow should not be implemented directly in AccountRegisterPage",
);

assert.doesNotMatch(
  registerPage,
  /function\s+handleArchiveSelectedPayee/,
  "Payee archive workflow should not be implemented directly in AccountRegisterPage",
);

assert.doesNotMatch(
  registerPage,
  /function\s+handleRestoreSelectedPayee/,
  "Payee restore workflow should not be implemented directly in AccountRegisterPage",
);

assert.match(
  payeeManagerWorkflow,
  /export function usePayeeManagerWorkflow/,
  "Payee manager workflow hook should be exported",
);

assert.match(payeeManagerWorkflow, /handleRenamePayee/);
assert.match(payeeManagerWorkflow, /handleMergeSelectedPayee/);
assert.match(payeeManagerWorkflow, /handleArchiveSelectedPayee/);
assert.match(payeeManagerWorkflow, /handleRestoreSelectedPayee/);

console.log("v2.52.7 payee manager workflow extraction checks passed");
