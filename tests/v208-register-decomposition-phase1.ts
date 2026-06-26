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
const attachmentManager = readFileSync(
  "apps/web/src/features/accounts/components/AttachmentManager.tsx",
  "utf8",
);
const transactionImportDialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

assert(
  registerPage.includes(
    'import { AttachmentManager } from "../features/accounts/components/AttachmentManager";',
  ),
  "AccountRegisterPage should import the extracted AttachmentManager component.",
);
assert(
  registerPage.includes(
    'import { TransactionImportDialog } from "../features/accounts/components/TransactionImportDialog";',
  ),
  "AccountRegisterPage should import the extracted TransactionImportDialog component.",
);
assert(
  !registerPage.includes("function AttachmentManager"),
  "AccountRegisterPage should not inline AttachmentManager after v2.08.",
);
assert(
  !registerPage.includes("function TransactionImportDialog"),
  "AccountRegisterPage should not inline TransactionImportDialog after v2.08.",
);
assert(
  attachmentManager.includes("export function AttachmentManager"),
  "AttachmentManager should be exported from its own component module.",
);
assert(
  transactionImportDialog.includes("export function TransactionImportDialog"),
  "TransactionImportDialog should be exported from its own component module.",
);
assert(
  attachmentManager.includes("getAttachmentAccessState") &&
    attachmentManager.includes("getSafeAttachmentFileName"),
  "AttachmentManager should keep attachment access behaviour colocated with the extracted component.",
);
assert(
  transactionImportDialog.includes("analyseTransactionCsvImport") &&
    transactionImportDialog.includes("previewTransactionCsvImport") &&
    transactionImportDialog.includes("buildRegisterTransactionsFromImport"),
  "TransactionImportDialog should keep CSV import workflow behaviour colocated with the extracted component.",
);

console.log("v2.08 register decomposition phase 1 regression checks passed");
