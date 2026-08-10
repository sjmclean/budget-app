import assert from "node:assert/strict";

import {
  getAttachmentAccessState,
  getSafeAttachmentFileName,
  isSafeDataUrl,
} from "../apps/web/src/features/accounts/attachmentAccess.js";
import type { RegisterAttachmentView } from "../apps/web/src/features/accounts/accountRegisterTypes.js";

const storedAttachment: RegisterAttachmentView = {
  id: "attachment-1",
  fileName: "receipt.pdf",
  fileSize: 31,
  mimeType: "application/pdf",
  attachedAt: "2026-06-23T00:00:00.000Z",
  contentDataUrl: "data:application/pdf;base64,JVBERi0xLjQK",
  storageType: "inline-data-url",
};

assert.equal(isSafeDataUrl(storedAttachment.contentDataUrl ?? ""), true);
assert.deepEqual(getAttachmentAccessState(storedAttachment), { canAccess: true });

const metadataOnlyAttachment: RegisterAttachmentView = {
  ...storedAttachment,
  id: "attachment-2",
  contentDataUrl: undefined,
  storageType: undefined,
};
const metadataState = getAttachmentAccessState(metadataOnlyAttachment);
assert.equal(metadataState.canAccess, false, "metadata-only attachments should not offer open/download actions");
assert.match(metadataState.reason ?? "", /not available.*device/i);

const unsafeAttachment: RegisterAttachmentView = {
  ...storedAttachment,
  id: "attachment-3",
  contentDataUrl: "javascript:alert(1)",
};
const unsafeState = getAttachmentAccessState(unsafeAttachment);
assert.equal(unsafeState.canAccess, false, "unsafe attachment URLs should not be accessible");
assert.match(unsafeState.reason ?? "", /supported stored format/i);

assert.equal(getSafeAttachmentFileName("receipt.pdf"), "receipt.pdf");
assert.equal(getSafeAttachmentFileName("../receipt.pdf"), "..-receipt.pdf");
assert.equal(getSafeAttachmentFileName("folder\\receipt.pdf"), "folder-receipt.pdf");
assert.equal(getSafeAttachmentFileName("\u0000"), "attachment");

console.log("v1.56 attachment access checks passed");
