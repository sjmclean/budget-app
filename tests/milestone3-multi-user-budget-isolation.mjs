import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createAuthStore } from "../apps/server/src/authStore.mjs";

const database = new Database(":memory:");
database.exec(`
  CREATE TABLE hosted_users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, email_normalized TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, disabled_at TEXT
  );
  CREATE TABLE hosted_sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE TABLE hosted_budget_memberships (
    budget_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
    created_at TEXT NOT NULL, PRIMARY KEY (budget_id, user_id)
  );
  CREATE TABLE budget_engine_generations (
    budget_id TEXT NOT NULL, generation_id TEXT NOT NULL, state TEXT NOT NULL
  );
  CREATE TABLE budget_import_sessions (
    generation_id TEXT PRIMARY KEY, budget_id TEXT NOT NULL,
    budget_name TEXT NOT NULL, currency TEXT NOT NULL, state TEXT NOT NULL
  );
  CREATE TABLE replication_generations (
    budget_id TEXT NOT NULL, generation_id TEXT NOT NULL,
    created_at TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE local_first_sync_epochs (
    budget_id TEXT PRIMARY KEY, sync_epoch TEXT NOT NULL,
    schema_version INTEGER NOT NULL, baseline_id TEXT,
    latest_cursor INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, reset_at TEXT
  );
  CREATE TABLE local_first_baselines (
    baseline_id TEXT PRIMARY KEY, budget_id TEXT NOT NULL,
    sync_epoch TEXT NOT NULL, manifest_json TEXT NOT NULL,
    state TEXT NOT NULL, created_at TEXT NOT NULL, committed_at TEXT
  );
  CREATE TABLE local_first_budget_metadata (
    budget_id TEXT PRIMARY KEY, budget_name TEXT NOT NULL,
    currency TEXT NOT NULL, updated_at TEXT NOT NULL
  );
`);

const auth = createAuthStore(database);
const admin = auth.setup({ email: "admin@example.test", password: "correct horse battery staple" });
const second = auth.createUser(admin, {
  email: "second@example.test",
  password: "another secure password",
});

const adminSession = auth.login("ADMIN@example.test", "correct horse battery staple");
const secondSession = auth.login("second@example.test", "another secure password");
assert.equal(auth.authenticate(adminSession.token).id, admin.id);
assert.equal(auth.authenticate(secondSession.token).id, second.id);

auth.claimBudget(admin, "budget-a");
auth.claimBudget(second, "budget-b");
database.prepare(`
  INSERT INTO budget_engine_generations (budget_id, generation_id, state)
  VALUES ('budget-a', 'generation-a', 'active')
`).run();
database.prepare(`
  INSERT INTO budget_import_sessions (
    generation_id, budget_id, budget_name, currency, state
  )
  VALUES ('generation-a', 'budget-a', 'Household', 'AUD', 'committed')
`).run();
database.prepare(`
  INSERT INTO budget_import_sessions (
    generation_id, budget_id, budget_name, currency, state
  )
  VALUES ('generation-b', 'budget-b', 'Still importing', 'AUD', 'staging')
`).run();
assert.equal(auth.requireBudgetRole(admin, "budget-a"), "owner");
assert.equal(auth.requireBudgetRole(second, "budget-b"), "owner");
assert.throws(
  () => auth.requireBudgetRole(second, "budget-a"),
  (error) => error.code === "BUDGET_ACCESS_DENIED",
);
assert.deepEqual(auth.listBudgets(admin), [{
  budgetId: "budget-a",
  role: "owner",
  name: "Household",
  currency: "AUD",
  createdAt: auth.listBudgets(admin)[0].createdAt,
}]);
assert.deepEqual(auth.listBudgets(second), []);
database.prepare(`
  INSERT INTO replication_generations (
    budget_id, generation_id, created_at, is_active
  ) VALUES ('budget-b', 'replication-b', ?, 1)
`).run(new Date().toISOString());
assert.deepEqual(auth.listBudgets(second), [{
  budgetId: "budget-b",
  role: "owner",
  name: "budget-b",
  currency: "AUD",
  createdAt: auth.listBudgets(second)[0].createdAt,
}]);
auth.claimBudget(admin, "local-budget");
database.prepare(`
  INSERT INTO local_first_sync_epochs (
    budget_id, sync_epoch, schema_version, baseline_id,
    latest_cursor, created_at, reset_at
  ) VALUES ('local-budget', 'local-epoch', 1, 'local-baseline', 0, ?, NULL)
`).run(new Date().toISOString());
database.prepare(`
  INSERT INTO local_first_baselines (
    baseline_id, budget_id, sync_epoch, manifest_json,
    state, created_at, committed_at
  ) VALUES ('local-baseline', 'local-budget', 'local-epoch', ?, 'committed', ?, ?)
`).run(
  JSON.stringify({ budgetName: "Local household", currency: "NZD" }),
  new Date().toISOString(),
  new Date().toISOString(),
);
assert.equal(
  auth.listBudgets(admin).find((budget) => budget.budgetId === "local-budget")?.name,
  "Local household",
);
assert.equal(
  auth.listBudgets(admin).find((budget) => budget.budgetId === "local-budget")?.currency,
  "NZD",
);
database.prepare(`
  INSERT INTO local_first_budget_metadata (
    budget_id, budget_name, currency, updated_at
  ) VALUES ('local-budget', 'Renamed household', 'AUD', ?)
`).run(new Date().toISOString());
assert.equal(
  auth.listBudgets(admin).find((budget) => budget.budgetId === "local-budget")?.name,
  "Renamed household",
);
database.prepare(`
  INSERT INTO hosted_budget_memberships (budget_id, user_id, role, created_at)
  VALUES ('deleted-budget', ?, 'owner', ?)
`).run(admin.id, new Date().toISOString());
assert.deepEqual(auth.cleanupOrphanedBudgetMemberships(), {
  removedMembershipCount: 1,
});
assert.equal(
  database.prepare(
    "SELECT COUNT(*) AS count FROM hosted_budget_memberships WHERE budget_id = 'deleted-budget'",
  ).get().count,
  0,
);
assert.equal(auth.requireBudgetRole(second, "budget-b"), "owner");
assert.equal(auth.listUsers(admin).length, 2);
assert.throws(
  () => auth.claimBudget(second, "budget-a"),
  (error) => error.code === "BUDGET_ACCESS_DENIED",
);

auth.logout(adminSession.token);
assert.equal(auth.authenticate(adminSession.token), null);

database.close();
console.log("Milestone 3 multi-user budget isolation passed.");
