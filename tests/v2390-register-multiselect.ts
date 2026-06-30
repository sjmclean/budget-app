import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emptyRegisterSelectionState,
  pruneRegisterSelection,
  selectRegisterTransactionRange,
  selectSingleRegisterTransaction,
  toggleRegisterTransactionSelection,
} from "../apps/web/src/features/accounts/registerSelection";

const selectedSingle = selectSingleRegisterTransaction("tx-2");
assert.deepEqual(selectedSingle.selectedIds, ["tx-2"]);
assert.equal(selectedSingle.anchorId, "tx-2");

const toggledOn = toggleRegisterTransactionSelection(selectedSingle, "tx-4");
assert.deepEqual(toggledOn.selectedIds, ["tx-2", "tx-4"]);
assert.equal(toggledOn.anchorId, "tx-4");

const toggledOff = toggleRegisterTransactionSelection(toggledOn, "tx-2");
assert.deepEqual(toggledOff.selectedIds, ["tx-4"]);

const ranged = selectRegisterTransactionRange(
  selectedSingle,
  ["tx-1", "tx-2", "tx-3", "tx-4", "tx-5"],
  "tx-5",
);
assert.deepEqual(ranged.selectedIds, ["tx-2", "tx-3", "tx-4", "tx-5"]);
assert.equal(ranged.anchorId, "tx-2");

const pruned = pruneRegisterSelection(
  { selectedIds: ["tx-2", "tx-3", "tx-9"], anchorId: "tx-9" },
  ["tx-1", "tx-2", "tx-3"],
);
assert.deepEqual(pruned.selectedIds, ["tx-2", "tx-3"]);
assert.equal(pruned.anchorId, "tx-3");

assert.deepEqual(
  pruneRegisterSelection(emptyRegisterSelectionState, ["tx-1"]),
  emptyRegisterSelectionState,
);

const registerPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);
const transactionRow = readFileSync(
  join(process.cwd(), "apps/web/src/features/accounts/components/TransactionRow.tsx"),
  "utf8",
);
const registerCss = readFileSync(
  join(process.cwd(), "apps/web/src/styles/register.css"),
  "utf8",
);

assert.match(registerPage, /const hasRegisterActionSelection = selectedRegisterActionTransactionCount > 0;/);
assert.match(registerPage, /handleSetSelectedTransactionsCleared/);
assert.match(registerPage, /handleDeleteSelectedTransactions/);
assert.match(registerPage, /register-bulk-action-bar/);
assert.match(registerPage, /setRegisterSelection\(emptyRegisterSelectionState\)/);
assert.doesNotMatch(registerPage, /register-selection-bar/);
assert.match(registerPage, /aria-label="Selected transaction actions"/);
assert.match(registerPage, /selectedRegisterActionTransactionCount === 1/);
assert.match(transactionRow, /type="checkbox"/);
assert.match(transactionRow, /onToggleTransactionSelection\(transactionId\)/);
assert.match(transactionRow, /onSelectTransaction\(transaction\.id, event\)/);
assert.match(registerCss, /\.register-bulk-action-bar/);
assert.match(registerCss, /register-bulk-action-danger/);

console.log("v2.39.0 register multi-select checks passed");
