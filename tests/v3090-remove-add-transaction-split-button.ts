import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const editor = readFileSync(
  "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  "utf8",
);
const categoryInput = readFileSync(
  "apps/web/src/features/accounts/components/RegisterCategoryInput.tsx",
  "utf8",
);
const styles = readFileSync("apps/web/src/styles/register.css", "utf8");

const newTransactionStart = editor.indexOf("export function TransactionEntryRow");
const editTransactionStart = editor.indexOf("export function TransactionEditRow");
assert(newTransactionStart >= 0 && editTransactionStart > newTransactionStart,
  "New transaction and edit transaction components must remain present");

const newTransactionSource = editor.slice(newTransactionStart, editTransactionStart);

assert(
  !newTransactionSource.includes(">\n            Split\n"),
  "New transaction entry must not render a standalone Split button",
);
assert(
  !newTransactionSource.includes("function toggleSplitEditor()"),
  "New transaction entry must not keep the removed Split-button toggle handler",
);
assert(
  newTransactionSource.includes("<RegisterCategoryInput") &&
    categoryInput.includes("includeSplitOption = true"),
  "Split transactions must remain available through the Category field",
);
assert(
  newTransactionSource.includes("<SplitEditor"),
  "New transaction entry must retain split editing after choosing Split from Category",
);
assert(
  editor.slice(editTransactionStart).includes("<SplitEditor"),
  "Editing existing split transactions must remain supported",
);
assert(
  newTransactionSource.includes("register-entry-actions-panel-commit-only") &&
    styles.includes(".register-entry-actions-panel-commit-only"),
  "Remaining add-transaction actions must be right-aligned after removing Split",
);

console.log("v3.09 remove add-transaction Split button checks passed.");
