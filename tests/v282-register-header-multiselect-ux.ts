import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  selectRegisterTransactions,
} from "../apps/web/src/features/accounts/registerSelection";

const selection = selectRegisterTransactions(["tx-1", "tx-2", "tx-2"]);
assert.deepEqual(
  selection.selectedIds,
  ["tx-1", "tx-2"],
  "bulk register selection should de-duplicate visible transaction ids",
);
assert.equal(selection.anchorId, "tx-1");
assert.equal(selection.focusedId, "tx-2");

const selectionHook = readFileSync(
  "apps/web/src/features/accounts/useRegisterSelection.ts",
  "utf8",
);
const registerPage = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
const registerCss = readFileSync("apps/web/src/styles/register.css", "utf8");
const packageJson = readFileSync("package.json", "utf8");

assert.match(
  selectionHook,
  /selectAll:\s*\(transactionIds: string\[\]\) => void/,
  "selection controller should expose a bulk select contract",
);
assert.match(
  selectionHook,
  /setState\(selectRegisterTransactions\(transactionIds\)\)/,
  "selection controller should select visible transaction ids as a batch",
);
assert.match(
  registerPage,
  /visibleSelectedRegisterTransactionCount/,
  "register page should track how many visible rows are selected",
);
assert.match(
  registerPage,
  /areAllVisibleRegisterTransactionsSelected/,
  "register page should know when the visible register page is fully selected",
);
assert.match(
  registerPage,
  /isVisibleRegisterSelectionPartial/,
  "register page should expose the partial header selection state",
);
assert.match(
  registerPage,
  /handleToggleVisibleRegisterSelection/,
  "register page should wire the header checkbox to visible-row selection",
);
assert.match(
  registerPage,
  /registerSelection\.selectAll\(visibleTransactionIds\)/,
  "header checkbox should select all visible transactions",
);
assert.match(
  registerPage,
  /node\.indeterminate = isVisibleRegisterSelectionPartial/,
  "header checkbox should display a mixed state for partial visible selection",
);
assert.match(
  registerPage,
  /Deselect visible transactions/,
  "header checkbox should communicate its deselect state to assistive technology",
);
assert.match(
  registerPage,
  /Select visible transactions/,
  "header checkbox should communicate its select state to assistive technology",
);
assert.match(
  registerPage,
  /register-head-select-checkbox/,
  "header checkbox should use the refined register header selection styling",
);
assert.match(
  registerCss,
  /\.register-head-select-checkbox/,
  "register CSS should style the header selection checkbox",
);
assert.match(packageJson, /test:v282/, "package scripts should expose v282 validation");

console.log("v2.82 register header multi-selection UX checks passed");
