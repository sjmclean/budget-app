import { existsSync, unlinkSync } from "fs";

export function resetDatabase(path = "Test.budget"): void {
  if (existsSync(path)) unlinkSync(path);
}
