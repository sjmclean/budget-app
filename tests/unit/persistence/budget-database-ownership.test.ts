import assert from "node:assert/strict";
import test from "node:test";
import { createBudgetDatabaseOwnership } from "../../../apps/web/src/features/persistence/localFirst/budgetDatabaseOwnership";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

for (const workflow of ["blank", "YNAB4", "Actual"]) {
  test(`switch then immediate ${workflow} owns the database only after admitted work closes`, async () => {
    const opened = deferred();
    const finish = deferred();
    const events: string[] = [];
    let owner: string | null = null;
    const lifecycle = createBudgetDatabaseOwnership(async () => {
      if (owner) events.push(`close:${owner}`);
      owner = null;
    });
    await lifecycle.enter("A");
    const read = lifecycle.run("A", async () => {
      owner = "A";
      events.push("open:A");
      opened.resolve();
      await finish.promise;
      events.push("read:A");
    });
    await opened.promise;
    const leave = lifecycle.leave();
    assert.equal(lifecycle.leave(), leave);
    const create = lifecycle.exclusive(async () => {
      assert.equal(owner, null, "no internal second owner / SQLITE_DATABASE_BUSY");
      owner = workflow;
      events.push(`create:${workflow}`);
      owner = null;
      return "created";
    });
    await assert.rejects(lifecycle.run("A", async () => { throw new Error("stale read ran"); }), { code: "BUDGET_DATABASE_RELEASED" });
    assert.deepEqual(events, ["open:A"]);
    finish.resolve();
    await read;
    await leave;
    assert.equal(await create, "created");
    await lifecycle.leave();
    assert.deepEqual(events, ["open:A", "read:A", "close:A", `create:${workflow}`]);
  });
}

test("repeated A/selector/B transitions require explicit activation and reject stale budget work", async () => {
  let owner: string | null = null;
  const events: string[] = [];
  const lifecycle = createBudgetDatabaseOwnership(async () => {
    if (owner) events.push(`close:${owner}`);
    owner = null;
  });
  for (const id of ["A", "B", "A", "B"]) {
    await lifecycle.enter(id);
    await lifecycle.run(id, async () => { assert.equal(owner, null); owner = id; events.push(`open:${id}`); });
    await assert.rejects(lifecycle.run(id === "A" ? "B" : "A", async () => {}), { code: "BUDGET_DATABASE_BUDGET_MISMATCH" });
    await lifecycle.leave();
    await lifecycle.leave();
    assert.equal(owner, null);
  }
  assert.deepEqual(events, ["open:A", "close:A", "open:B", "close:B", "open:A", "close:A", "open:B", "close:B"]);
});

for (const code of ["IMPORT_FAILED", "AbortError", "SQLITE_DATABASE_BUSY"]) {
  test(`${code} rolls back/closes and permits the immediate next operation`, async () => {
    const events: string[] = [];
    const lifecycle = createBudgetDatabaseOwnership(async () => {});
    await assert.rejects(lifecycle.exclusive(async () => {
      try { throw Object.assign(new Error(code), { code }); }
      finally { events.push("rollback", "close"); }
    }), { code });
    await lifecycle.exclusive(async () => { events.push("next"); });
    assert.deepEqual(events, ["rollback", "close", "next"]);
  });
}

test("an unconfirmed close surfaces failure and prevents the exclusive callback", async () => {
  let fail = true;
  let executed = false;
  const lifecycle = createBudgetDatabaseOwnership(async () => { if (fail) throw new Error("close failed"); });
  await assert.rejects(lifecycle.exclusive(async () => { executed = true; }), /close failed/);
  assert.equal(executed, false);
  assert.equal(lifecycle.isReleased(), true);
  fail = false;
  await lifecycle.exclusive(async () => { executed = true; });
  assert.equal(executed, true);
});

test("failed temporary-client cleanup quarantines subsequent operations", async () => {
  const lifecycle = createBudgetDatabaseOwnership(async () => {});
  const failure = Object.assign(new Error("pool still owned"), { code: "LOCAL_DATABASE_RELEASE_FAILED" });
  await assert.rejects(lifecycle.exclusive(async () => { throw failure; }), failure);
  await assert.rejects(lifecycle.exclusive(async () => { assert.fail("must not open"); }), failure);
  await assert.rejects(lifecycle.enter("B"), failure);
});

test("a newer leave invalidates a queued activation without reopening admission", async () => {
  const lifecycle = createBudgetDatabaseOwnership(async () => {});
  const entering = lifecycle.enter("A");
  const leaving = lifecycle.leave();
  await assert.rejects(entering, { code: "BUDGET_DATABASE_RELEASED" });
  await leaving;
  assert.equal(lifecycle.isReleased(), true);
});

test("exclusive work reserves its slot before a subsequent activation", async () => {
  const started = deferred();
  const finish = deferred();
  const lifecycle = createBudgetDatabaseOwnership(async () => {});
  const importing = lifecycle.exclusive(async () => { started.resolve(); await finish.promise; });
  const entering = lifecycle.enter("B");
  await started.promise;
  assert.equal(lifecycle.isReleased(), true);
  finish.resolve();
  await importing;
  await entering;
  await lifecycle.run("B", async () => {});
});

test("leave requested immediately after an exclusive operation waits for that operation too", async () => {
  const started = deferred();
  const finish = deferred();
  const lifecycle = createBudgetDatabaseOwnership(async () => {});
  const importing = lifecycle.exclusive(async () => { started.resolve(); await finish.promise; });
  let left = false;
  const leaving = lifecycle.leave().then(() => { left = true; });
  await started.promise;
  assert.equal(left, false);
  finish.resolve();
  await importing;
  await leaving;
  assert.equal(left, true);
  assert.equal(lifecycle.isReleased(), true);
});

test("selected-budget mismatch is distinct from a released database", async () => {
  const lifecycle = createBudgetDatabaseOwnership(async () => {});
  await lifecycle.enter("A");

  await assert.rejects(
    lifecycle.run("B", async () => {}),
    { code: "BUDGET_DATABASE_BUDGET_MISMATCH" },
  );
  assert.equal(lifecycle.isReleased(), false);

  await lifecycle.leave();
  await assert.rejects(
    lifecycle.run("A", async () => {}),
    { code: "BUDGET_DATABASE_RELEASED" },
  );
});
