import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Database from "better-sqlite3";
import type { CategoryGoal } from "../../../packages/types/src/CategoryGoal.js";
import {
  CATEGORY_GOAL_MERGE_CONFLICT_MESSAGE,
  planCategoryGoalMerge,
} from "../../../apps/web/src/features/budget/categoryGoalMergePolicy.js";
import { LOCAL_REGISTER_SCHEMA_SQL } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

const sourceGoal: CategoryGoal = {
  id: "goal-source", budgetId: "budget-1", categoryId: "source",
  type: "target-balance-by-date", targetAmount: 1200, targetMonth: "2027-07",
  createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z",
};
const targetGoal: CategoryGoal = {
  ...sourceGoal, id: "goal-target", categoryId: "target", type: "monthly-funding",
  targetAmount: 50, targetMonth: null,
};

function plan(source: CategoryGoal | null, target: CategoryGoal | null) {
  return planCategoryGoalMerge({
    budgetId: "budget-1", sourceCategoryId: "source", targetCategoryId: "target",
    sourceGoal: source, targetGoal: target,
  });
}

test("Goal merge matrix preserves the surviving policy and rejects two Goals", () => {
  assert.equal(plan(null, null), null);
  assert.deepEqual(plan(sourceGoal, null), { ...sourceGoal, categoryId: "target" });
  assert.equal(plan(null, targetGoal), null);
  assert.throws(() => plan(sourceGoal, targetGoal), new RegExp(CATEGORY_GOAL_MERGE_CONFLICT_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("source-only transfer changes ownership while preserving identity, configuration, and timestamps", () => {
  const transferred = plan(sourceGoal, null)!;
  assert.deepEqual(
    { ...transferred, categoryId: sourceGoal.categoryId },
    sourceGoal,
  );
  assert.equal(transferred.id, sourceGoal.id);
  assert.equal(transferred.createdAt, sourceGoal.createdAt);
  assert.equal(transferred.updatedAt, sourceGoal.updatedAt);
});

test("physical Goal transfer and category deletion roll back together on failure", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(LOCAL_REGISTER_SCHEMA_SQL);
  db.prepare("INSERT INTO local_categories VALUES(?,?,?,?,?,?)")
    .run("source", "budget-1", "group", "Group", "Source", 0);
  db.prepare("INSERT INTO local_categories VALUES(?,?,?,?,?,?)")
    .run("target", "budget-1", "group", "Group", "Target", 0);
  db.prepare(`INSERT INTO local_category_goals VALUES(?,?,?,?,?,?,?,?)`).run(
    sourceGoal.id, sourceGoal.budgetId, sourceGoal.categoryId, sourceGoal.type,
    120000, sourceGoal.targetMonth, sourceGoal.createdAt, sourceGoal.updatedAt,
  );

  const merge = db.transaction((fail: boolean) => {
    const transferred = plan(sourceGoal, null)!;
    db.prepare("UPDATE local_category_goals SET category_id=? WHERE budget_id=? AND category_id=?")
      .run(transferred.categoryId, transferred.budgetId, sourceGoal.categoryId);
    if (fail) throw new Error("forced transfer failure");
    db.prepare("DELETE FROM local_categories WHERE budget_id=? AND id=?")
      .run("budget-1", "source");
  });

  assert.throws(() => merge(true), /forced transfer failure/);
  assert.equal((db.prepare("SELECT COUNT(*) count FROM local_categories WHERE id='source'").get() as { count: number }).count, 1);
  assert.equal((db.prepare("SELECT category_id categoryId FROM local_category_goals").get() as { categoryId: string }).categoryId, "source");

  merge(false);
  const row = db.prepare(`SELECT id,category_id categoryId,created_at createdAt,updated_at updatedAt
    FROM local_category_goals`).get() as { id: string; categoryId: string; createdAt: string; updatedAt: string };
  assert.deepEqual(row, {
    id: sourceGoal.id, categoryId: "target",
    createdAt: sourceGoal.createdAt, updatedAt: sourceGoal.updatedAt,
  });
  db.close();
});

test("physical both-Goal rejection precedes destructive category and financial mutation", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(LOCAL_REGISTER_SCHEMA_SQL);
  for (const [id, name] of [["source", "Source"], ["target", "Target"]]) {
    db.prepare("INSERT INTO local_categories VALUES(?,?,?,?,?,?)")
      .run(id, "budget-1", "group", "Group", name, 0);
  }
  for (const goal of [sourceGoal, targetGoal]) {
    db.prepare("INSERT INTO local_category_goals VALUES(?,?,?,?,?,?,?,?)").run(
      goal.id, goal.budgetId, goal.categoryId, goal.type,
      Math.round(goal.targetAmount * 100), goal.targetMonth, goal.createdAt, goal.updatedAt,
    );
  }
  db.exec("CREATE TABLE test_financial(category_id TEXT PRIMARY KEY, assigned INTEGER NOT NULL)");
  db.prepare("INSERT INTO test_financial VALUES(?,?)").run("source", 350);

  assert.throws(() => db.transaction(() => {
    plan(sourceGoal, targetGoal);
    db.prepare("DELETE FROM local_categories WHERE id='source'").run();
  })(), /both have Goals/);

  assert.equal((db.prepare("SELECT COUNT(*) count FROM local_categories").get() as { count: number }).count, 2);
  assert.equal((db.prepare("SELECT COUNT(*) count FROM local_category_goals").get() as { count: number }).count, 2);
  assert.equal((db.prepare("SELECT assigned FROM test_financial WHERE category_id='source'").get() as { assigned: number }).assigned, 350);
  db.close();
});

test("physical target-only merge retains the target Goal exactly", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(LOCAL_REGISTER_SCHEMA_SQL);
  for (const [id, name] of [["source", "Source"], ["target", "Target"]]) {
    db.prepare("INSERT INTO local_categories VALUES(?,?,?,?,?,?)")
      .run(id, "budget-1", "group", "Group", name, 0);
  }
  db.prepare("INSERT INTO local_category_goals VALUES(?,?,?,?,?,?,?,?)").run(
    targetGoal.id, targetGoal.budgetId, targetGoal.categoryId, targetGoal.type,
    5000, targetGoal.targetMonth, targetGoal.createdAt, targetGoal.updatedAt,
  );
  const before = db.prepare("SELECT * FROM local_category_goals").get();
  db.transaction(() => {
    assert.equal(plan(null, targetGoal), null);
    db.prepare("DELETE FROM local_categories WHERE id='source'").run();
  })();
  assert.deepEqual(db.prepare("SELECT * FROM local_category_goals").get(), before);
  db.close();
});

test("production worker keeps Goal transfer, category merge, and outbox payload in one transaction", () => {
  const worker = readFileSync(new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ), "utf8");
  const start = worker.indexOf("function mergeCategories(");
  const end = worker.indexOf("\nasync function openBudget", start);
  const merge = worker.slice(start, end);
  assert.match(merge, /BEGIN IMMEDIATE/);
  assert.match(merge, /planCategoryGoalMerge/);
  assert.match(merge, /deleteNormalisedDomainEntity\("categoryGoals"/);
  assert.match(merge, /writeNormalisedDomainEntity\(\s*"categoryGoals"/);
  assert.match(merge, /transferredGoal/);
  assert.match(merge, /insertOutbox/);
  assert.match(merge, /DELETE FROM local_categories/);
  assert.match(merge, /COMMIT/);
  assert.match(merge, /ROLLBACK/);
  assert.ok(merge.indexOf("planCategoryGoalMerge") < merge.indexOf("redirectMergedCategoryReferences"));
});

test("remote replay consumes the exact transferred Goal and enforces managed-category exclusions", () => {
  const worker = readFileSync(new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ), "utf8");
  const remote = worker.match(
    /mutation\.domain === "categories" && mutation\.operation === "delete"[\s\S]*?markAllBudgetProjectionsDirty\(\);/,
  )?.[0] ?? "";
  assert.match(remote, /transferredGoal\?: CategoryGoal/);
  assert.match(remote, /deleteNormalisedDomainEntity\("categoryGoals"/);
  assert.match(remote, /writeNormalisedDomainEntity\(\s*"categoryGoals"/);
  assert.match(remote, /categoryGoalsEqual/);
  assert.match(remote, /isCreditCardPaymentCategory/);
  assert.match(remote, /isCreditCardPaymentGroup/);
});
