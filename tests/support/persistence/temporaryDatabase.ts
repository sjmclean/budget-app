import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDatabase } from "../../../packages/database/src/db";

export function createTemporaryDatabase(prefix: string) {
  const tempDir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const path = join(tempDir, "test.sqlite");
  const db = createDatabase(path);
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    process.removeListener("exit", cleanup);
    db.$client.close();
    rmSync(tempDir, { recursive: true, force: true });
  };

  process.once("exit", cleanup);
  return { db, path, cleanup };
}
