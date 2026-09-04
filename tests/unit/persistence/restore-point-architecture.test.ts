import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createBudgetDatabaseOwnership } from "../../../apps/web/src/features/persistence/localFirst/budgetDatabaseOwnership";
import { resolveOwnedBudgetId } from "../../../apps/web/src/features/persistence/localFirst/budgetDatabaseOwnershipRouting";

const read = (path: string) => readFileSync(new URL(`../../../apps/web/src/${path}`, import.meta.url), "utf8");

test("Restore Points keeps metadata scrollable and its action in a reserved footer", () => {
  const settings = read("pages/SettingsPage.tsx");
  const css = read("styles/globals.css");
  const rule = (selector: string) => {
    const start = css.indexOf(`\n${selector} {`, selector === ".settings-history-detail" ? css.indexOf(".settings-history-row.selected .settings-history-dot") : 0);
    assert.ok(start >= 0, selector);
    return css.slice(start, css.indexOf("}", start));
  };
  assert.match(settings, /className="settings-history-detail-content" tabIndex=\{0\} role="region" aria-label="Restore point metadata and warning"/);
  assert.match(settings, /className="settings-history-warning">[\s\S]*?<\/p>\s*<\/div>\s*<div className="settings-history-actions settings-history-actions--restore-only">/);
  assert.match(settings, /onClick=\{restoreSelectedSnapshot\} disabled=\{restorePointBusy\}/);
  assert.match(rule(".settings-history-list,\n.settings-history-detail"), /max-height: min\(32rem, 55dvh\)/);
  assert.match(rule(".settings-history-list"), /overflow-y: auto/);
  assert.match(rule(".settings-history-detail"), /grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(rule(".settings-history-detail-content"), /min-height: 0/);
  assert.match(rule(".settings-history-detail-content"), /overflow-y: auto/);
  assert.match(rule(".settings-history-detail > .settings-history-actions--restore-only"), /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 900px\)\s*\{[\s\S]*?\.settings-history-layout\s*\{\s*grid-template-columns: 1fr/);
});

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
  assert.doesNotMatch(settings, /Complete SQLite snapshot/);
  assert.match(settings, /Database size:/);
  assert.match(settings, /New chunk storage at capture:/);
  assert.match(settings, /snapshot.newBytesStored/);
  assert.match(settings, /Excludes manifest and temporary-file overhead/);
  assert.match(settings, /safety points are retained independently from timed checkpoints/);
  assert.doesNotMatch(settings, /safety points are protected/);
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
