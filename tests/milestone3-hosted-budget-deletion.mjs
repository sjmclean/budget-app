import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";
import { createBudgetImportStore } from "../apps/server/src/budgetImportStore.mjs";
import { createBudgetLifecycleStore } from "../apps/server/src/budgetLifecycleStore.mjs";
import { createBudgetScheduledTransactionStore } from
  "../apps/server/src/budgetScheduledTransactionStore.mjs";
import { createReplicationStore } from "../apps/server/src/replicationStore.mjs";

const database = new Database(":memory:");
const blobDirectory = mkdtempSync(join(tmpdir(), "budget-delete-blobs-"));
const engine = createBudgetEngineStore(database);
const importer = createBudgetImportStore(database, engine);
const schedules = createBudgetScheduledTransactionStore(database);
const replication = createReplicationStore(database, { blobDirectory });
database.exec(`
  CREATE TABLE hosted_budget_memberships (
    budget_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (budget_id, user_id)
  )
`);
const lifecycle = createBudgetLifecycleStore(
  database,
  engine,
  importer,
  schedules,
  replication,
);

const session = importer.begin({
  budgetId: "budget-delete",
  budgetName: "Delete me",
  currency: "AUD",
});
importer.persistReferenceData(session.generationId, {
  accounts: [{
    id: "account-1",
    name: "Account",
    type: "on-budget",
    participation: "budget",
    openingBalance: 0,
  }],
  payees: [],
  categories: [],
});
importer.validate(session.generationId);
importer.commit(session.generationId);
database.prepare(`
  INSERT INTO hosted_budget_memberships (budget_id, user_id, role, created_at)
  VALUES (?, ?, 'owner', ?)
`).run("budget-delete", "user-1", new Date().toISOString());
replication.getGeneration("budget-delete");

const result = lifecycle.deleteBudget("budget-delete");
assert.equal(result.deleted, true);
const deletedStatus = engine.getBudgetStatus("budget-delete");
assert.equal(deletedStatus.generationId, null);
assert.equal(deletedStatus.capabilities.accountRegisters, false);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM hosted_budget_memberships WHERE budget_id = ?")
    .get("budget-delete").count,
  0,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM replication_generations WHERE budget_id = ?")
    .get("budget-delete").count,
  0,
);

database.prepare(`
  INSERT INTO hosted_budget_memberships (budget_id, user_id, role, created_at)
  VALUES (?, ?, 'owner', ?)
`).run("ghost-budget", "user-1", new Date().toISOString());
assert.equal(lifecycle.deleteBudget("ghost-budget").deleted, true);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM hosted_budget_memberships WHERE budget_id = ?")
    .get("ghost-budget").count,
  0,
);

const selectorSource = readFileSync(
  new URL("../apps/web/src/pages/BudgetSelectorPage.tsx", import.meta.url),
  "utf8",
);
assert.match(selectorSource, /await hosted\.deleteBudget\(budgetId\)/);
assert.match(selectorSource, /packagePath\.startsWith\("hosted:\/\/"\)/);

database.close();
rmSync(blobDirectory, { recursive: true, force: true });
console.log("Milestone 3 hosted budget deletion passed: server catalogue and launcher remain deleted.");
