import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetPackageManager } from "../packages/budget-file/src/index.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const root = mkdtempSync(join(tmpdir(), "budget-attachments-"));
const packagePath = join(root, "Household.budget");
const manager = new BudgetPackageManager();
manager.create({ packagePath, name: "Household", currency: "AUD" });

const source = join(root, "receipt.txt");
writeFileSync(source, "Receipt content");

const attachment = manager.attachments.addAttachment(packagePath, source);
const storedPath = manager.attachments.getAttachmentPath(packagePath, attachment.storedFileName);

assert(attachment.originalFileName === "receipt.txt", "Expected original filename to be preserved in metadata");
assert(attachment.storedFileName.endsWith(".txt"), "Expected stored filename to preserve extension");
assert(existsSync(storedPath), "Expected copied attachment to exist");
assert(attachment.sha256.length === 64, "Expected sha256 hash");

const stats = manager.attachments.getStorageStats(packagePath);
assert(stats.attachmentBytes > 0, "Expected attachment storage bytes to be counted");
assert(stats.databaseBytes > 0, "Expected database storage bytes to be counted");

console.log("PASS: v1.2.1 attachment storage and stats");
