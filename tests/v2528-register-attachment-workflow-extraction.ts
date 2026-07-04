import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const registerPageSource = readFileSync(
  join(root, "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);
const attachmentWorkflowSource = readFileSync(
  join(root, "apps/web/src/features/accounts/useRegisterAttachmentWorkflow.ts"),
  "utf8",
);
const registerCommandsSource = readFileSync(
  join(root, "apps/web/src/features/accounts/useRegisterCommands.ts"),
  "utf8",
);

assert.match(
  registerPageSource,
  /useRegisterAttachmentWorkflow/,
  "Register page should use the extracted attachment workflow hook",
);

assert.doesNotMatch(
  registerPageSource,
  /setAttachmentTransactionId/,
  "Register page should not directly set attachment transaction state",
);

assert.match(
  attachmentWorkflowSource,
  /export function useRegisterAttachmentWorkflow/,
  "Attachment workflow hook should be exported",
);
assert.match(attachmentWorkflowSource, /attachmentTransaction/);
assert.match(attachmentWorkflowSource, /openAttachmentManager/);
assert.match(attachmentWorkflowSource, /closeAttachmentManager/);
assert.match(attachmentWorkflowSource, /handleAddAttachment/);
assert.match(attachmentWorkflowSource, /handleRemoveAttachment/);

assert.match(
  registerCommandsSource,
  /openAttachmentManager/,
  "Register commands should delegate attachment opening to the attachment workflow",
);
assert.doesNotMatch(
  registerCommandsSource,
  /setAttachmentTransactionId/,
  "Register commands should not know attachment workflow state setter names",
);

console.log("v2.52.8 register attachment workflow extraction checks passed");
