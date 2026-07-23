import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const registerPage = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
const transactionRow = readFileSync(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
  "utf8",
);

assert(
  registerPage.includes(
    'from "../features/accounts/components/TransactionRow"',
  ),
  "AccountRegisterPage should import the extracted TransactionRow component.",
);
assert(
  !registerPage.includes("const TransactionRow = memo(function TransactionRow"),
  "AccountRegisterPage should no longer define TransactionRow inline.",
);
assert(
  !registerPage.includes("function TransactionStatus("),
  "AccountRegisterPage should no longer define TransactionStatus inline.",
);
assert(
  transactionRow.includes(
    "export const TransactionRow = memo(function TransactionRow",
  ),
  "The extracted TransactionRow component should be memoised and exported.",
);
assert(
  transactionRow.includes("function TransactionStatus("),
  "TransactionStatus should live beside the extracted TransactionRow component.",
);
assert(
  transactionRow.includes("function TransactionTagPicker"),
  "TransactionTagPicker should live beside the extracted TransactionRow component.",
);
assert(
  transactionRow.includes("export function AttachmentIndicator"),
  "AttachmentIndicator should remain available to the edit row via the extracted component module.",
);
assert(
  transactionRow.includes("visibleColumns: Set<RegisterColumnId>"),
  "TransactionRow should preserve column visibility behaviour.",
);
assert(
  transactionRow.includes("onToggleClearedTransaction(transaction.id)"),
  "TransactionRow should preserve cleared-status toggling wiring.",
);
assert(
  transactionRow.includes("onManageTransactionAttachments(transaction.id)"),
  "TransactionRow should preserve attachment manager wiring.",
);
assert(
  registerPage.includes("<TransactionRow"),
  "AccountRegisterPage should render the extracted TransactionRow component.",
);

assert(
  registerPage.includes(
    'visibleColumns={data.accountType === "Tracking" ? new Set([...registerTableLayout.visibleColumnSet].filter((columnId) => columnId !== "category")) : registerTableLayout.visibleColumnSet}',
  ),
  "AccountRegisterPage should pass shared table visibility state to TransactionRow while excluding categories for tracking accounts.",
);

console.log("v2.09 register row extraction regression checks passed");
