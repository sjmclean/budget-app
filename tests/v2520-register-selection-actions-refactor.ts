import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const registerPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);
const selectionActionsHook = readFileSync(
  join(process.cwd(), "apps/web/src/features/accounts/useRegisterSelectionActions.ts"),
  "utf8",
);
const registerSelectionHook = readFileSync(
  join(process.cwd(), "apps/web/src/features/accounts/useRegisterSelection.ts"),
  "utf8",
);

assert.match(
  registerPage,
  /useRegisterSelectionActions\(\{/,
  "Register page should delegate bulk action construction to the selection actions hook",
);
assert.doesNotMatch(
  registerPage,
  /useMemo<SelectionAction\[\]>/,
  "Register page should not build SelectionBar actions inline",
);
assert.doesNotMatch(
  registerPage,
  /handleDeleteSelectedTransactions/,
  "Register page should not own selected-transaction delete orchestration",
);
assert.doesNotMatch(
  registerPage,
  /handleSetSelectedTransactionsCleared/,
  "Register page should not own selected-transaction cleared orchestration",
);
assert.match(
  registerPage,
  /actions=\{registerSelectionActions\.actions\}/,
  "SelectionBar should receive actions from the extracted controller",
);
assert.match(
  registerPage,
  /selectionCount=\{registerSelectionActions\.selectedCount\}/,
  "SelectionBar should receive selected count from the extracted controller",
);

assert.match(
  selectionActionsHook,
  /export function useRegisterSelectionActions/,
  "Register selection action controller should be exported",
);
assert.match(
  selectionActionsHook,
  /confirmDialog/,
  "Delete confirmation should live with the selected-action workflow",
);
assert.match(
  selectionActionsHook,
  /SelectionAction\[\]/,
  "Selected-action workflow should still produce SelectionBar actions",
);
assert.match(selectionActionsHook, /icon: Pencil/);
assert.match(selectionActionsHook, /icon: CheckCircle2/);
assert.match(selectionActionsHook, /icon: Trash2/);
assert.match(selectionActionsHook, /toggleSelectedCleared/);
assert.match(selectionActionsHook, /deleteSelectedTransactions/);
assert.match(
  registerSelectionHook,
  /export function useRegisterSelection/,
  "Core selection state controller should remain separate from action orchestration",
);
assert.doesNotMatch(
  registerSelectionHook,
  /confirmDialog/,
  "Core selection state controller should not own destructive action UI",
);

console.log("v2.52.0 register selection actions refactor checks passed");
