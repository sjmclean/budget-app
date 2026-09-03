import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createBudgetDatabaseOwnership } from "../../../apps/web/src/features/persistence/localFirst/budgetDatabaseOwnership";
import { resolveOwnedBudgetId } from "../../../apps/web/src/features/persistence/localFirst/budgetDatabaseOwnershipRouting";

const read = (path: string) => readFileSync(new URL(`../../../apps/web/src/${path}`, import.meta.url), "utf8");

test("Settings and registry use only the new restore service, with no superseded files", () => {
  const obsolete = ["version", "History"].join("");
  for (const suffix of ["", "Lifecycle"]) assert.equal(existsSync(new URL(`../../../apps/web/src/features/budget/${obsolete}${suffix}.ts`, import.meta.url)), false);
  const settings = read("pages/SettingsPage.tsx");
  const registry = read("stores/budgetRegistryStore.ts");
  assert.equal(settings.includes(obsolete), false);
  assert.equal(registry.includes(obsolete), false);
  assert.doesNotMatch(settings, /of 30 restore points|unsaved changes/i);
  assert.match(settings, /restoreRestorePoint/);
  assert.match(settings, /approximately every 10 minutes while you make changes/);
});

test("capture, listing and restore are explicitly owned methods", () => {
  for (const method of ["createRestorePoint", "listRestorePoints", "restoreRestorePoint"]) {
    assert.equal(resolveOwnedBudgetId(method, ["A"]), "A");
  }
});

test("pending restore quarantines already queued work and blocks lifecycle release", async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const ownership = createBudgetDatabaseOwnership(async () => { assert.fail("unsafe release"); });
  const first = ownership.run("A", async () => {
    await gate;
    throw Object.assign(new Error("pending publication"), { code: "RESTORE_PENDING" });
  });
  const queued = ownership.run("A", async () => { assert.fail("unsafe queued mutation"); });
  const checks = Promise.all([
    assert.rejects(first, { code: "RESTORE_PENDING" }),
    assert.rejects(queued, { code: "RESTORE_PENDING" }),
  ]);
  finish();
  await checks;
  assert.equal(ownership.isReleased(), true);
  await assert.rejects(ownership.leave(), { code: "RESTORE_PENDING" });
});

test("replacement/reset capture safety points and import points follow promotion", () => {
  const query = read("features/persistence/localFirst/localFirstAccountRegisterClient.ts");
  const restore = query.slice(query.indexOf("async restoreRestorePoint("), query.indexOf("async exportBudget("));
  assert.ok(restore.indexOf('"before-restore"') < restore.indexOf(".restore(budgetId, pointId)"));
  for (const [method, reason, operation] of [
    ["async resetBudget(", '"before-reset"', "relay.resetEpoch("],
  ]) {
    const body = query.slice(query.indexOf(method));
    assert.ok(body.indexOf(reason) >= 0 && body.indexOf(reason) < body.indexOf(operation));
  }
  for (const file of ["actualBudgetLauncherImport.ts", "ynab4LauncherImport.ts"]) {
    const source = read(`features/budget/${file}`);
    const capture = source.indexOf('reason: "initial-import"');
    assert.ok(capture > source.indexOf("await publishLocalBaseline("));
    assert.ok(capture < source.indexOf(".close();", capture));
  }
});
