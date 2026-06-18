import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { createTransactionAttachment } from "../packages/budget-engine/src/services/createTransactionAttachment.js";
import { checkAttachmentIntegrity } from "../packages/budget-engine/src/services/checkAttachmentIntegrity.js";

const folder = mkdtempSync(join(tmpdir(), "budget-integrity-"));

try {
  const attachment = createTransactionAttachment({
    budgetId: "budget",
    transactionId: "transaction",
    originalFileName: "receipt.txt",
    mimeType: "text/plain",
    fileSize: Buffer.byteLength("hello"),
    relativePath: "Budget.attachments",
    content: "hello",
  });

  const absolutePath = join(folder, attachment.relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, "hello");

  console.log(checkAttachmentIntegrity(folder, attachment));

  writeFileSync(absolutePath, "tampered");

  console.log(checkAttachmentIntegrity(folder, attachment));
} finally {
  rmSync(folder, { recursive: true, force: true });
}
