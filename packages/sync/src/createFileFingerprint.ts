import { createHash } from "crypto";
import { randomUUID } from "crypto";
import { FileFingerprint } from "../../types/src/FileFingerprint.js";

export interface CreateFileFingerprintInput {
  budgetId: string;
  filePath: string;
  fileSize: number;
  modifiedAt: number;
}

export function createFileFingerprint(
  input: CreateFileFingerprintInput,
): FileFingerprint {
  const raw = `${input.filePath}:${input.fileSize}:${input.modifiedAt}`;

  return {
    id: randomUUID(),
    budgetId: input.budgetId,
    filePath: input.filePath,
    fileSize: input.fileSize,
    modifiedAt: input.modifiedAt,
    fingerprint: createHash("sha256").update(raw).digest("hex"),
    createdAt: new Date(),
  };
}
