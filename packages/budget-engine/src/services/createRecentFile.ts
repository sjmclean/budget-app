import { randomUUID } from "crypto";
import { RecentFile } from "../../../types/src/RecentFile.js";

export function createRecentFile(
  userId: string,
  filePath: string,
  displayName: string
): RecentFile {
  return {
    id: randomUUID(),
    userId,
    filePath,
    displayName,
    lastOpenedAt: new Date()
  };
}
