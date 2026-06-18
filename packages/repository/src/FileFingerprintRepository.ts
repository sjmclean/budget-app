import { FileFingerprint } from "../../types/src/FileFingerprint.js";

export interface FileFingerprintRepository {
  create(fingerprint: FileFingerprint): Promise<void>;
  findLatestByBudget(budgetId: string): Promise<FileFingerprint | null>;
}
