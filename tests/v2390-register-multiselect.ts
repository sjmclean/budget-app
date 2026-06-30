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

const useAccountRegister = readFileSync(
  join(process.cwd(), "apps/web/src/features/accounts/useAccountRegister.ts"),
  "utf8",
);

assert.match(registerPage, /const hasRegisterActionSelection = selectedRegisterActionTransactionCount > 0;/);
assert.match(registerPage, /handleSetSelectedTransactionsCleared/);
assert.match(registerPage, /handleToggleSelectedTransactionsCleared/);
assert.match(registerPage, /areAllSelectedRegisterTransactionsCleared/);
assert.match(registerPage, /SelectionBar/);
assert.match(registerPage, /registerSelectionActions/);
assert.match(registerPage, /icon: CheckCircle2/);
assert.match(registerPage, /icon: Pencil/);
assert.match(registerPage, /icon: Trash2/);
assert.doesNotMatch(registerPage, />\s*Unclear\s*<\/button>/);
assert.match(registerPage, /handleDeleteSelectedTransactions/);
assert.match(registerPage, /<SelectionBar/);
assert.match(registerPage, /setRegisterSelection\(emptyRegisterSelectionState\)/);
assert.match(registerPage, /selectedRegisterTransactionCount > 0/);
assert.match(registerPage, /setRegisterSelection\(selectSingleRegisterTransaction\(transactionId\)\)/);
assert.doesNotMatch(registerPage, /selectedTransactionId/);
assert.doesNotMatch(registerPage, /selectTransaction/);
assert.doesNotMatch(registerPage, /register-selection-bar/);
assert.match(registerPage, /ariaLabel="Selected transaction actions"/);
assert.match(registerPage, /selectedRegisterActionTransactionCount === 1/);
assert.match(transactionRow, /type="checkbox"/);
assert.match(transactionRow, /onToggleTransactionSelection\(transactionId\)/);
assert.match(transactionRow, /onSelectTransaction\(transaction\.id, event\)/);
const selectionBar = readFileSync(
  join(process.cwd(), "apps/web/src/components/ui/SelectionBar/SelectionBar.tsx"),
  "utf8",
);
const selectionBarCss = readFileSync(
  join(process.cwd(), "apps/web/src/components/ui/SelectionBar/SelectionBar.css"),
  "utf8",
);
const selectionAction = readFileSync(
  join(process.cwd(), "apps/web/src/components/ui/SelectionBar/SelectionAction.ts"),
  "utf8",
);

assert.match(selectionBar, /export function SelectionBar/);
assert.match(selectionBar, /formatSelectionCount/);
assert.match(selectionBar, /selectionCount <= 0/);
assert.match(selectionBar, /role="toolbar"/);
assert.match(selectionBar, /aria-pressed=\{action\.pressed\}/);
assert.match(selectionBar, /<X size=\{15\}/);
assert.match(selectionBarCss, /\.selection-bar/);
assert.match(selectionBarCss, /selection-bar-enter/);
assert.match(selectionBarCss, /selection-bar-button-danger/);
assert.match(selectionAction, /interface SelectionAction/);
assert.match(selectionAction, /LucideIcon/);
assert.doesNotMatch(registerCss, /\.register-bulk-action-bar/);
assert.doesNotMatch(useAccountRegister, /selectedTransactionId/);
assert.doesNotMatch(useAccountRegister, /selectedTransaction:/);
assert.doesNotMatch(useAccountRegister, /selectTransaction:/);

console.log("v2.39.0 register multi-select checks passed");
