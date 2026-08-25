import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Database from "better-sqlite3";
import type { CategoryGoal } from "../../../packages/types/src/CategoryGoal.js";
import {
  assertCategoryGoalCategoryForPersistence,
  assertValidCategoryGoalForPersistence,
  categoryGoalFromRow,
  categoryGoalsEqual,
  commitCategoryGoalMutation,
  prepareCategoryGoalWriteForPersistence,
  type LocalCategoryGoalRow,
} from "../../../apps/web/src/features/persistence/localFirst/categoryGoalPersistence.js";
import { LOCAL_REGISTER_SCHEMA_SQL } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";
import { getPersistenceChangeVersion } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import { ApplicationHistoryService, type ApplicationHistoryContext } from "../../../apps/web/src/features/history/applicationHistory.js";
import { createCategoryGoalCommand, updateCategoryGoalCommand } from "../../../apps/web/src/features/history/commands/management/categoryGoalCommands.js";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.js";
import { projectCategoryGoalsOntoBudgetView } from "../../../apps/web/src/features/budget/categoryGoalBudgetProjection.js";
import type { BudgetMonthView } from "../../../apps/web/src/features/budget/budgetViewTypes.js";

function goal(overrides: Partial<CategoryGoal> = {}): CategoryGoal {
  return {
    id: "goal-1", budgetId: "budget-1", categoryId: "category-1",
    type: "monthly-funding", targetAmount: 12.345, targetMonth: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function openDatabase() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(LOCAL_REGISTER_SCHEMA_SQL);
  db.exec("CREATE TABLE test_goal_revision(value INTEGER NOT NULL); INSERT INTO test_goal_revision VALUES(0); CREATE TABLE test_goal_outbox(id INTEGER PRIMARY KEY);");
  db.prepare(
    "INSERT INTO local_categories(id,budget_id,group_id,group_name,name,archived) VALUES(?,?,?,?,?,?)",
  ).run("category-1", "budget-1", "living", "Living", "Groceries", 0);
  db.prepare(
    "INSERT INTO local_categories(id,budget_id,group_id,group_name,name,archived) VALUES(?,?,?,?,?,?)",
  ).run("category-2", "budget-2", "living", "Living", "Fuel", 0);
  db.prepare(
    "INSERT INTO local_categories(id,budget_id,group_id,group_name,name,archived) VALUES(?,?,?,?,?,?)",
  ).run("category-3", "budget-1", "living", "Living", "Rent", 0);
  db.prepare(
    "INSERT INTO local_categories(id,budget_id,group_id,group_name,name,archived) VALUES(?,?,?,?,?,?)",
  ).run("credit-card-payment-card-1", "budget-1", "credit-card-payments", "Credit Card Payments", "Visa", 0);
  return db;
}

const insertSql = `INSERT INTO local_category_goals(
  id,budget_id,category_id,type,target_amount,target_month,created_at,updated_at
) VALUES(@id,@budgetId,@categoryId,@type,@targetAmount,@targetMonth,@createdAt,@updatedAt)`;

function insertGoal(db: Database.Database, value: CategoryGoal) {
  const category = db.prepare(
    "SELECT budget_id AS budgetId, group_id AS groupId FROM local_categories WHERE id = ?",
  ).get(value.categoryId) as { budgetId: string; groupId: string } | undefined;
  assertCategoryGoalCategoryForPersistence(value, category ?? null);
  const row = assertValidCategoryGoalForPersistence(value);
  db.prepare(insertSql).run(row);
  return row;
}

function applyRemoteGoal(
  db: Database.Database,
  operation: "upsert" | "delete",
  value: CategoryGoal,
): CategoryGoal | null {
  return db.transaction(() => {
    if (operation === "delete") {
      db.prepare("DELETE FROM local_category_goals WHERE budget_id=? AND category_id=?")
        .run(value.budgetId, value.categoryId);
      return null;
    }
    const category = db.prepare(
      "SELECT budget_id AS budgetId, group_id AS groupId FROM local_categories WHERE id = ?",
    ).get(value.categoryId) as { budgetId: string; groupId: string } | undefined;
    const row = prepareCategoryGoalWriteForPersistence(
      value,
      category ?? null,
      readGoal(db, value.budgetId, value.categoryId),
    );
    db.prepare(`${insertSql} ON CONFLICT(budget_id,category_id) DO UPDATE SET
      type=excluded.type,target_amount=excluded.target_amount,target_month=excluded.target_month,
      created_at=excluded.created_at,updated_at=excluded.updated_at`).run(row);
    return readGoal(db, value.budgetId, value.categoryId);
  })();
}

function replaceExactGoal(
  db: Database.Database,
  expected: CategoryGoal | null,
  replacement: CategoryGoal | null,
): CategoryGoal | null {
  return db.transaction(() => {
    const current = readGoal(db, "budget-1", "category-1");
    if (!categoryGoalsEqual(current, expected)) throw new Error("history conflict");
    if (categoryGoalsEqual(expected, replacement)) return current;
    if (replacement) applyRemoteGoal(db, "upsert", replacement);
    else db.prepare("DELETE FROM local_category_goals WHERE budget_id=? AND category_id=?")
      .run("budget-1", "category-1");
    const readback = readGoal(db, "budget-1", "category-1");
    if (!categoryGoalsEqual(readback, replacement)) throw new Error("readback failed");
    db.prepare("INSERT INTO test_goal_outbox DEFAULT VALUES").run();
    db.prepare("UPDATE test_goal_revision SET value=value+1").run();
    return readback;
  })();
}

function readGoal(db: Database.Database, budgetId: string, categoryId: string): CategoryGoal | null {
  const row = db.prepare(`SELECT id,budget_id AS budgetId,category_id AS categoryId,type,
    target_amount AS targetAmount,target_month AS targetMonth,
    created_at AS createdAt,updated_at AS updatedAt
    FROM local_category_goals WHERE budget_id=? AND category_id=?`).get(
    budgetId, categoryId,
  ) as LocalCategoryGoalRow | undefined;
  return row ? categoryGoalFromRow(row) : null;
}

test("physical SQLite creates Category Goals and round-trips exact minor units", () => {
  const db = openDatabase();
  try {
    const monthly = goal();
    const persisted = insertGoal(db, monthly);
    assert.equal(persisted.targetAmount, 1235);
    assert.deepEqual(readGoal(db, "budget-1", "category-1"), {
      ...monthly, targetAmount: 12.35,
    });

    db.prepare("DELETE FROM local_category_goals").run();
    insertGoal(db, goal({ type: "target-balance", targetMonth: null }));
    db.prepare("DELETE FROM local_category_goals").run();
    insertGoal(db, goal({ type: "target-balance-by-date", targetMonth: "2027-01" }));
  } finally { db.close(); }
});

test("physical SQLite constraints reject invalid rows and duplicate category Goals", () => {
  const db = openDatabase();
  try {
    const valid = assertValidCategoryGoalForPersistence(goal());
    db.prepare(insertSql).run(valid);
    assert.throws(() => db.prepare(insertSql).run({ ...valid, id: "duplicate" }), /UNIQUE/);
    assert.throws(() => db.prepare(insertSql).run({ ...valid, id: "bad-type", categoryId: "category-2", budgetId: "budget-2", type: "unsupported" }), /CHECK/);
    db.prepare("DELETE FROM local_category_goals").run();
    assert.throws(() => db.prepare(insertSql).run({ ...valid, targetAmount: 0 }), /CHECK/);
    assert.throws(() => db.prepare(insertSql).run({ ...valid, type: "target-balance-by-date", targetMonth: null }), /CHECK/);
    assert.throws(() => db.prepare(insertSql).run({ ...valid, type: "target-balance", targetMonth: "2026-08" }), /CHECK/);
  } finally { db.close(); }
});

test("SQLite uses its unique constraint index without a redundant explicit Goal index", () => {
  const db = openDatabase();
  try {
    const indexes = db.pragma("index_list('local_category_goals')") as { origin: string }[];
    assert.equal(indexes.filter(({ origin }) => origin === "u").length, 1);
    assert.equal(indexes.filter(({ origin }) => origin === "c").length, 0);
  } finally { db.close(); }
});

test("persistence boundary rejects invalid months, ownership, managed categories, and unsafe money", () => {
  const db = openDatabase();
  try {
    for (const targetMonth of [null, "2026", "2026-00", "2026-13"]) {
      assert.throws(() => assertValidCategoryGoalForPersistence(goal({
        type: "target-balance-by-date", targetMonth,
      })), /valid YYYY-MM/);
    }
    assert.throws(() => assertValidCategoryGoalForPersistence(goal({ targetMonth: "2026-08" })), /cannot have/);
    assert.throws(() => assertValidCategoryGoalForPersistence(goal({ targetAmount: 0.004 })), /at least one cent/);
    assert.throws(() => assertValidCategoryGoalForPersistence(goal({ targetAmount: Number.MAX_SAFE_INTEGER })), /safe integer/);
    assert.throws(() => insertGoal(db, goal({ categoryId: "category-2" })), /another budget/);
    assert.throws(() => insertGoal(db, goal({ categoryId: "missing" })), /not found/);
    assert.throws(() => insertGoal(db, goal({ categoryId: "credit-card-payment-card-1" })), /Managed credit-card/);
  } finally { db.close(); }
});

test("physical SQLite update/delete, archive, cascade, isolation, and rollback are exact", () => {
  const db = openDatabase();
  try {
    insertGoal(db, goal());
    db.prepare("UPDATE local_category_goals SET target_amount=?,updated_at=? WHERE budget_id=? AND category_id=?")
      .run(2501, "2026-08-02T00:00:00.000Z", "budget-1", "category-1");
    assert.equal(readGoal(db, "budget-1", "category-1")?.targetAmount, 25.01);
    assert.equal(readGoal(db, "budget-2", "category-1"), null);

    db.prepare("UPDATE local_categories SET archived=1 WHERE id='category-1'").run();
    assert.equal(readGoal(db, "budget-1", "category-1")?.id, "goal-1");

    assert.throws(() => db.transaction(() => {
      db.prepare("DELETE FROM local_category_goals").run();
      db.prepare(insertSql).run({ ...assertValidCategoryGoalForPersistence(goal()), targetAmount: 0 });
    })(), /CHECK/);
    assert.equal(readGoal(db, "budget-1", "category-1")?.id, "goal-1");

    db.prepare("DELETE FROM local_categories WHERE id='category-1'").run();
    assert.equal(readGoal(db, "budget-1", "category-1"), null);
  } finally { db.close(); }
});

test("remote Goal application creates, updates, dates, deletes, and preserves identity", () => {
  const db = openDatabase();
  try {
    const created = applyRemoteGoal(db, "upsert", goal());
    assert.deepEqual(created, goal({ targetAmount: 12.35 }));
    const updated = applyRemoteGoal(db, "upsert", goal({
      type: "target-balance-by-date", targetAmount: 40.129, targetMonth: "2027-06",
      updatedAt: "2026-08-02T00:00:00.000Z",
    }));
    assert.equal(updated?.id, "goal-1");
    assert.equal(updated?.targetAmount, 40.13);
    assert.equal(updated?.targetMonth, "2027-06");
    assert.equal(applyRemoteGoal(db, "delete", goal()), null);
    assert.equal(readGoal(db, "budget-1", "category-1"), null);
  } finally { db.close(); }
});

test("remote Goal application rejects malformed state atomically without local side effects", () => {
  const db = openDatabase();
  try {
    applyRemoteGoal(db, "upsert", goal());
    const before = readGoal(db, "budget-1", "category-1");
    const notificationBefore = getPersistenceChangeVersion();
    const invalid: CategoryGoal[] = [
      goal({ type: "unsupported" as CategoryGoal["type"] }),
      goal({ targetAmount: 0 }), goal({ targetAmount: -1 }),
      goal({ targetAmount: Number.MAX_SAFE_INTEGER }),
      goal({ type: "target-balance-by-date", targetMonth: "2026" }),
      goal({ type: "target-balance-by-date", targetMonth: "2026-13" }),
      goal({ targetMonth: "2026-08" }),
      goal({ categoryId: "missing" }), goal({ categoryId: "category-2" }),
      goal({ id: "goal-2" }),
      goal({ id: "managed", categoryId: "credit-card-payment-card-1" }),
    ];
    for (const value of invalid) assert.throws(() => applyRemoteGoal(db, "upsert", value));
    assert.deepEqual(readGoal(db, "budget-1", "category-1"), before);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM local_category_goals").get() as { count: number }).count, 1);
    assert.equal(getPersistenceChangeVersion(), notificationBefore);
  } finally { db.close(); }
});

test("duplicate Goal IDs across categories and update identity changes fail atomically", () => {
  const db = openDatabase();
  try {
    applyRemoteGoal(db, "upsert", goal());
    assert.throws(() => applyRemoteGoal(db, "upsert", goal({ categoryId: "category-3" })), /UNIQUE/);
    assert.throws(() => applyRemoteGoal(db, "upsert", goal({ id: "goal-2" })), /identity/);
    assert.equal(readGoal(db, "budget-1", "category-1")?.id, "goal-1");
    assert.equal(readGoal(db, "budget-1", "category-3"), null);
  } finally { db.close(); }
});

test("exact history equality covers every field and compares canonical durable amounts", () => {
  const canonical = goal({ targetAmount: 12.35 });
  assert(categoryGoalsEqual(canonical, { ...canonical }));
  for (const changed of [
    { id: "goal-2" }, { budgetId: "budget-2" }, { categoryId: "category-3" },
    { type: "target-balance" as const }, { targetAmount: 12.36 },
    { targetMonth: "2026-08" }, { createdAt: "changed" }, { updatedAt: "changed" },
  ]) assert.equal(categoryGoalsEqual(canonical, { ...canonical, ...changed }), false);
  assert.equal(categoryGoalsEqual(canonical, goal({ targetAmount: 12.345 })), false);
  assert(categoryGoalsEqual(null, null));
  assert.equal(categoryGoalsEqual(null, canonical), false);
});

test("exact history replacement covers all transitions and conflicts have no side effects", () => {
  const db = openDatabase();
  try {
    const first = goal({ targetAmount: 12.35 });
    const second = goal({ targetAmount: 20, updatedAt: "2026-08-02T00:00:00.000Z" });
    assert.deepEqual(replaceExactGoal(db, null, first), first);
    assert.deepEqual(replaceExactGoal(db, first, second), second);
    assert.equal(replaceExactGoal(db, second, null), null);
    assert.equal(replaceExactGoal(db, null, null), null);
    assert.equal((db.prepare("SELECT value FROM test_goal_revision").get() as { value: number }).value, 3);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM test_goal_outbox").get() as { count: number }).count, 3);
    assert.throws(() => replaceExactGoal(db, first, second), /history conflict/);
    assert.equal(readGoal(db, "budget-1", "category-1"), null);
    assert.equal((db.prepare("SELECT value FROM test_goal_revision").get() as { value: number }).value, 3);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM test_goal_outbox").get() as { count: number }).count, 3);
  } finally { db.close(); }
});

test("application history commands round-trip through physical SQLite Goal state", async () => {
  const db = openDatabase();
  try {
    const categoryGoals = {
      async getCategoryGoal(input: { budgetId: string; categoryId: string }) {
        return readGoal(db, input.budgetId, input.categoryId);
      },
      async replaceCategoryGoalHistoryState(input: {
        budgetId: string; categoryId: string;
        expected: CategoryGoal | null; replacement: CategoryGoal | null;
      }) {
        assert.equal(input.budgetId, "budget-1");
        assert.equal(input.categoryId, "category-1");
        return replaceExactGoal(db, input.expected, input.replacement);
      },
    };
    const persistence = { categoryGoals } as unknown as BudgetPersistenceProvider;
    const history = new ApplicationHistoryService<ApplicationHistoryContext>({
      getContext: (budgetId) => ({ budgetId, persistence }),
    });
    const created = goal({ targetAmount: 12.35 });
    const updated = goal({ type: "target-balance", targetAmount: 50, updatedAt: "later" });
    assert.equal((await history.execute("budget-1", createCategoryGoalCommand(created))).performed, true);
    assert.deepEqual(readGoal(db, "budget-1", "category-1"), created);
    assert.equal((await history.execute("budget-1", updateCategoryGoalCommand(updated))).performed, true);
    assert.deepEqual(readGoal(db, "budget-1", "category-1"), updated);
    await history.undo("budget-1");
    assert.deepEqual(readGoal(db, "budget-1", "category-1"), created);
    await history.undo("budget-1");
    assert.equal(readGoal(db, "budget-1", "category-1"), null);
    await history.redo("budget-1");
    await history.redo("budget-1");
    assert.deepEqual(readGoal(db, "budget-1", "category-1"), updated);
  } finally { db.close(); }
});

test("physical Goal and Budget month records compose into BudgetCategoryView.goal", () => {
  const db = openDatabase();
  try {
    db.exec(`CREATE TABLE local_budget_months(
      budget_id TEXT NOT NULL, month TEXT NOT NULL, view_json TEXT NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY(budget_id, month)
    )`);
    const financialView: BudgetMonthView = {
      budgetId: "budget-1", budgetName: "Budget", monthLabel: "August 2026", currencyCode: "AUD",
      readyToAssign: 100, totalAssigned: 350, totalActivity: -25, totalAvailable: 325,
      categoryGroups: [{
        id: "living", name: "Living", previousAvailable: 0, assigned: 350,
        activity: -25, available: 325, note: "",
        categories: [{
          id: "category-1", name: "Groceries", previousAvailable: 0, assigned: 350,
          activity: -25, available: 325, isOverspent: false, isArchived: false, note: "",
        }],
      }],
    };
    db.prepare("INSERT INTO local_budget_months VALUES(?,?,?,?)")
      .run("budget-1", "2026-08", JSON.stringify(financialView), "updated");
    insertGoal(db, goal({ targetAmount: 500 }));
    const storedView = JSON.parse((db.prepare(
      "SELECT view_json AS viewJson FROM local_budget_months WHERE budget_id=? AND month=?",
    ).get("budget-1", "2026-08") as { viewJson: string }).viewJson) as BudgetMonthView;
    const storedGoal = readGoal(db, "budget-1", "category-1")!;
    const projected = projectCategoryGoalsOntoBudgetView(storedView, "2026-08", [storedGoal]);
    assert.equal(projected.categoryGroups[0]!.categories[0]!.goal?.remainingAmount, 150);
    assert.equal(projected.categoryGroups[0]!.categories[0]!.assigned, 350);
    assert.equal(projected.readyToAssign, 100);
    const persistedAgain = JSON.parse((db.prepare(
      "SELECT view_json AS viewJson FROM local_budget_months WHERE budget_id=? AND month=?",
    ).get("budget-1", "2026-08") as { viewJson: string }).viewJson) as BudgetMonthView;
    assert.equal(persistedAgain.categoryGroups[0]!.categories[0]!.goal, undefined);
  } finally { db.close(); }
});

test("Goal mutation notification publishes only after a successful durable action", async () => {
  const before = getPersistenceChangeVersion();
  let committed = false;
  await commitCategoryGoalMutation("budget-1", async () => {
    committed = true;
    return "written";
  });
  assert.equal(committed, true);
  assert.equal(getPersistenceChangeVersion(), before + 1);

  await assert.rejects(() => commitCategoryGoalMutation("budget-1", async () => {
    throw new Error("rollback");
  }), /rollback/);
  assert.equal(getPersistenceChangeVersion(), before + 1);
});

test("worker routes Category Goals through transactional local-first operations", () => {
  const source = readFileSync(new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ), "utf8");
  assert.match(source, /domain === "categoryGoals"/);
  assert.match(source, /assertCategoryGoalOwner/);
  assert.match(source, /prepareCategoryGoalWriteForPersistence/);
  assert.match(source, /insertOutbox\(mutation\)/);
  assert.match(source, /function replaceCategoryGoalHistoryState[\s\S]*?BEGIN IMMEDIATE[\s\S]*?COMMIT[\s\S]*?ROLLBACK/);
  assert.doesNotMatch(source, /categoryGoals[\s\S]{0,120}markBudgetProjectionDirty/);
});
