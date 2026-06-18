import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { AttachmentIntegrityResult, AttachmentIntegrityStatus } from "../../../types/src/AttachmentIntegrityStatus.js";
import { TransactionAttachment } from "../../../types/src/TransactionAttachment.js";

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function checkAttachmentIntegrity(
  budgetFolder: string,
  attachment: TransactionAttachment
): AttachmentIntegrityResult {
  const expectedPath = join(budgetFolder, attachment.relativePath);

  if (!existsSync(expectedPath)) {
    return {
      attachmentId: attachment.id,
      status: AttachmentIntegrityStatus.Missing,
      expectedPath,
      message: "Attachment file is missing"
    };
  }

  const actualHash = hashFile(expectedPath);

  if (actualHash !== attachment.contentHash) {
    return {
      attachmentId: attachment.id,
      status: AttachmentIntegrityStatus.HashMismatch,
      expectedPath,
      message: "Attachment file hash does not match metadata"
    };
  }

  return {
    attachmentId: attachment.id,
    status: AttachmentIntegrityStatus.Ok,
    expectedPath,
    message: "Attachment verified"
  };
}
