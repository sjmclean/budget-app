import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { useRegisterCommands } from "../../../apps/web/src/features/accounts/useRegisterCommands";
import {
  useRegisterSelection,
  type RegisterSelectionController,
} from "../../../apps/web/src/features/accounts/useRegisterSelection";

const webRequire = createRequire(
  new URL("../../../apps/web/package.json", import.meta.url),
);
const { createElement } = webRequire("react");
const { act, create } = webRequire("react-test-renderer");

interface ProbeState {
  selection: RegisterSelectionController;
  commands: ReturnType<typeof useRegisterCommands>;
}

test("row focus and editor workflows remain independent from bulk selection", async () => {
  const previousAct = Object.getOwnPropertyDescriptor(
    globalThis,
    "IS_REACT_ACT_ENVIRONMENT",
  );
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });

  let latest: ProbeState | undefined;
  let editingId: string | null = null;
  let showEntryRow = true;
  let attachmentId: string | null = null;
  let root: ReturnType<typeof create> | null = null;

  function Probe() {
    const selection = useRegisterSelection(["transaction-a", "transaction-b"]);
    const commands = useRegisterCommands({
      registerSelection: selection,
      setEditingTransactionId: (transactionId) => {
        editingId = transactionId;
      },
      setShowEntryRow: (isVisible) => {
        showEntryRow = isVisible;
      },
      openAttachmentManager: (transactionId) => {
        attachmentId = transactionId;
      },
      toggleCleared: async () => {},
      updateTransaction: async () => {},
    });
    latest = { selection, commands };
    return null;
  }

  try {
    await act(async () => {
      root = create(createElement(Probe));
    });

    await act(async () => {
      latest!.commands.selectTransaction("transaction-a");
    });
    assert.equal(latest!.selection.focusedId, "transaction-a");
    assert.deepEqual(latest!.selection.selectedIds, []);
    assert.equal(latest!.selection.hasSelection, false);

    await act(async () => {
      latest!.commands.toggleTransactionSelection("transaction-a");
    });
    assert.deepEqual(latest!.selection.selectedIds, ["transaction-a"]);
    assert.equal(latest!.selection.hasSelection, true);

    await act(async () => {
      latest!.commands.selectTransaction("transaction-b", {
        shiftKey: true,
        ctrlKey: true,
      } as never);
    });
    assert.equal(latest!.selection.focusedId, "transaction-b");
    assert.deepEqual(latest!.selection.selectedIds, ["transaction-a"]);

    await act(async () => {
      latest!.commands.editTransaction("transaction-b");
    });
    assert.equal(latest!.selection.focusedId, "transaction-b");
    assert.deepEqual(latest!.selection.selectedIds, ["transaction-a"]);
    assert.equal(editingId, "transaction-b");
    assert.equal(showEntryRow, false);

    await act(async () => {
      latest!.commands.manageTransactionAttachments("transaction-b");
    });
    assert.equal(latest!.selection.focusedId, "transaction-b");
    assert.deepEqual(latest!.selection.selectedIds, ["transaction-a"]);
    assert.equal(attachmentId, "transaction-b");

    await act(async () => {
      latest!.commands.toggleTransactionSelection("transaction-a");
    });
    assert.deepEqual(latest!.selection.selectedIds, []);
    assert.equal(latest!.selection.hasSelection, false);
  } finally {
    if (root) {
      await act(async () => root.unmount());
    }
    if (previousAct) {
      Object.defineProperty(
        globalThis,
        "IS_REACT_ACT_ENVIRONMENT",
        previousAct,
      );
    } else {
      delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
    }
  }
});

test("row rendering distinguishes focus from explicit selection", () => {
  const row = readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/components/TransactionRow.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const page = readFileSync(
    new URL("../../../apps/web/src/pages/AccountRegisterPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(row, /isSelected \? "register-row-selected"/);
  assert.match(row, /isFocused \? "register-row-focused"/);
  assert.match(
    page,
    /isFocused=\{registerSelection\.focusedId === transaction\.id\}/,
  );
  assert.match(page, /hasRegisterActionSelection && !editingTransactionId/);
});
