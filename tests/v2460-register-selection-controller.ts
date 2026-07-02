import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearRegisterSelection,
  emptyRegisterSelectionState,
  focusRegisterTransaction,
  pruneRegisterSelection,
  selectRegisterTransactionRange,
  selectSingleRegisterTransaction,
  toggleRegisterTransactionSelection,
} from "../apps/web/src/features/accounts/registerSelection";

const selectedSingle = selectSingleRegisterTransaction("tx-2");
assert.deepEqual(selectedSingle, {
  selectedIds: ["tx-2"],
  anchorId: "tx-2",
  focusedId: "tx-2",
});

const focusedOnly = focusRegisterTransaction(emptyRegisterSelectionState, "tx-3");
assert.deepEqual(focusedOnly, {
  selectedIds: [],
  anchorId: null,
  focusedId: "tx-3",
});

const toggled = toggleRegisterTransactionSelection(selectedSingle, "tx-4");
assert.deepEqual(toggled, {
  selectedIds: ["tx-2", "tx-4"],
  anchorId: "tx-4",
  focusedId: "tx-4",
});

const ranged = selectRegisterTransactionRange(
  selectedSingle,
  ["tx-1", "tx-2", "tx-3", "tx-4"],
  "tx-4",
);
assert.deepEqual(ranged, {
  selectedIds: ["tx-2", "tx-3", "tx-4"],
  anchorId: "tx-2",
  focusedId: "tx-4",
});

const pruned = pruneRegisterSelection(
  { selectedIds: ["tx-2", "tx-9"], anchorId: "tx-9", focusedId: "tx-9" },
  ["tx-1", "tx-2"],
);
assert.deepEqual(pruned, {
  selectedIds: ["tx-2"],
  anchorId: "tx-2",
  focusedId: "tx-2",
});

assert.deepEqual(clearRegisterSelection(), emptyRegisterSelectionState);

const registerPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);
const useRegisterSelection = readFileSync(
  join(process.cwd(), "apps/web/src/features/accounts/useRegisterSelection.ts"),
  "utf8",
);

assert.match(registerPage, /useRegisterSelection\(visibleTransactionIds\)/);
assert.doesNotMatch(registerPage, /setRegisterSelection/);
assert.doesNotMatch(registerPage, /selectRegisterTransactionRange/);
assert.doesNotMatch(registerPage, /toggleRegisterTransactionSelection/);
assert.match(registerPage, /registerSelection\.selectFromPointer/);
assert.match(registerPage, /registerSelection\.selectSingle\(transactionId\)/);
assert.match(registerPage, /registerSelection\.isSelected\(transaction\.id\)/);
assert.match(useRegisterSelection, /export function useRegisterSelection/);
assert.match(useRegisterSelection, /selectFromPointer/);
assert.match(useRegisterSelection, /selectedCount/);
assert.match(useRegisterSelection, /focusedId/);

console.log("v2.46.0 register selection controller checks passed");
