import { unlinkSync } from "fs";
import Database from "better-sqlite3";
import { initDatabase } from "../packages/database/src/initDatabase.js";
import { DatabaseIntegrityApplicationService } from "../packages/application/src/DatabaseIntegrityApplicationService.js";

const dbPath = "/tmp/budget-v129-integrity.sqlite";
try { unlinkSync(dbPath); } catch {}

const sqlite = new Database(dbPath);
initDatabase(sqlite);

const service = new DatabaseIntegrityApplicationService(sqlite);
const clean = service.inspect();

if (!clean.foreignKeysEnabled) throw new Error("Expected SQLite foreign key enforcement to be enabled");
if (clean.quickCheck !== "ok") throw new Error(`Expected quick_check ok, got ${clean.quickCheck}`);
if (clean.missingIndexes.length > 0) throw new Error(`Missing v1.2.9 indexes: ${clean.missingIndexes.join(", ")}`);
if (clean.orphanIssues.length > 0) throw new Error(`Expected clean database to have no orphan issues`);

// Insert a deliberately broken row with enforcement temporarily disabled. This simulates
// the type of damage that can come from a failed import, a hand-edited SQLite file, or a
// future sync conflict. The integrity service should report it instead of hiding it.
sqlite.pragma("foreign_keys = OFF");
sqlite.prepare(`
  INSERT INTO transactions (
    id, budget_id, account_id, payee_id, category_id, transfer_account_id, type, date, memo,
    amount, cleared_status, is_deleted, created_at, updated_at
  ) VALUES (
    'tx-orphan', 'missing-budget', 'missing-account', NULL, NULL, NULL, 'outflow', '2026-06-17', NULL,
    -1000, 'uncleared', 0, 0, 0
  )
`).run();
sqlite.pragma("foreign_keys = ON");

const damaged = service.inspect();
if (damaged.orphanIssues.length === 0) throw new Error("Expected orphan issues to be detected");
if (!damaged.orphanIssues.some((issue) => issue.code === "orphan_transaction_budget")) {
  throw new Error("Expected missing transaction budget to be reported");
}
if (!damaged.orphanIssues.some((issue) => issue.code === "orphan_transaction_account")) {
  throw new Error("Expected missing transaction account to be reported");
}

sqlite.close();
console.log("v1.2.9 database integrity checks OK");
