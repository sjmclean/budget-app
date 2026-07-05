import { strict as assert } from "node:assert";
import {
  pruneRegisterSelection,
  type RegisterSelectionState,
} from "../apps/web/src/features/accounts/registerSelection";

function testPruneKeepsReferenceWhenSelectionIsAlreadyValid() {
  const state: RegisterSelectionState = {
    selectedIds: ["tx-1", "tx-2"],
    anchorId: "tx-1",
    focusedId: "tx-2",
  };

  const pruned = pruneRegisterSelection(state, ["tx-1", "tx-2", "tx-3"]);

  assert.strictEqual(
    pruned,
    state,
    "Pruning an already-valid selection should preserve object identity to avoid render loops",
  );
}

function testPruneReturnsNewStateWhenSelectionChanges() {
  const state: RegisterSelectionState = {
    selectedIds: ["tx-1", "tx-missing"],
    anchorId: "tx-missing",
    focusedId: "tx-missing",
  };

  const pruned = pruneRegisterSelection(state, ["tx-1", "tx-2"]);

  assert.notStrictEqual(
    pruned,
    state,
    "Pruning an invalid selection should still return updated state",
  );
  assert.deepEqual(pruned, {
    selectedIds: ["tx-1"],
    anchorId: "tx-1",
    focusedId: "tx-1",
  });
}

function testPruneKeepsEmptySelectionReferenceWhenNoTransactionsExist() {
  const state: RegisterSelectionState = {
    selectedIds: [],
    anchorId: null,
    focusedId: null,
  };

  const pruned = pruneRegisterSelection(state, []);

  assert.strictEqual(
    pruned,
    state,
    "Pruning an already-empty selection should be idempotent",
  );
}

function run() {
  testPruneKeepsReferenceWhenSelectionIsAlreadyValid();
  testPruneReturnsNewStateWhenSelectionChanges();
  testPruneKeepsEmptySelectionReferenceWhenNoTransactionsExist();

  console.log("v2.61.4 register selection prune idempotence checks passed");
}

run();
