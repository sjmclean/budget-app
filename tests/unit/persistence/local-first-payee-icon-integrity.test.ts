import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Database from "better-sqlite3";
import { LOCAL_REGISTER_SCHEMA_SQL } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

test("local_payees persists icon_ref and SQLite merge uses shared precedence", () => {
  const database = new Database(":memory:");
  database.exec(LOCAL_REGISTER_SCHEMA_SQL);
  database.prepare("INSERT INTO local_payees(id,budget_id,name,archived,icon_ref) VALUES(?,?,?,?,?)")
    .run("p", "b", "Payee", 0, "builtin:v1:shopping");
  const row = database.prepare("SELECT icon_ref AS iconRef FROM local_payees WHERE id = ?").get("p") as { iconRef: string };
  assert.equal(row.iconRef, "builtin:v1:shopping");
  database.close();

  const worker = readFileSync(new URL("../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url), "utf8");
  const mergeStart = worker.indexOf("function mergePayees(");
  const mergeEnd = worker.indexOf("\nfunction ", mergeStart + 1);
  const mergeBody = worker.slice(mergeStart, mergeEnd);
  assert.match(mergeBody, /mergePayeeIconReferences\(targetKnowledge\.iconRef, sourceIconRefs\)/);
  assert.match(mergeBody, /mergedIconRef/);
  assert.match(worker, /target\.mergedIconRef/);
  assert.match(mergeBody, /UPDATE local_payees SET icon_ref = \?/);
});
