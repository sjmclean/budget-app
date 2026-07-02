import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settingsPage = readFileSync("apps/web/src/pages/SettingsPage.tsx", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(settingsPage, /<h2>Restore Points<\/h2>/, "Restore Points screen should remain user-facing");
assert.match(settingsPage, /Choose a point in time and restore/, "Restore Points copy should focus on recovery, not management");
assert.match(settingsPage, /settings-history-actions--restore-only/, "Restore point detail actions should use restore-only layout");
assert.match(settingsPage, /onClick=\{restoreSelectedSnapshot\}/, "Restore Points should retain the restore action");
assert.doesNotMatch(settingsPage, /deleteSelectedSnapshot/, "Restore Points UI should not expose delete restore point actions");
assert.doesNotMatch(settingsPage, /deleteVersionHistorySnapshot/, "Settings should not import or call restore point deletion");
assert.doesNotMatch(settingsPage, /Create Restore Point/, "Restore Points screen should not ask users to manually manage restore point creation");
assert.doesNotMatch(settingsPage, /createManualRestorePoint/, "Restore Points screen should not expose manual restore point creation");

assert.equal(
  packageJson.scripts["test:v2482:restore-points-restore-only"],
  "tsx tests/v2482-restore-points-restore-only.ts",
  "package.json should include the v2.48.2 restore-only restore points test",
);
assert.equal(
  packageJson.scripts["test:v2482"],
  "pnpm test:v2481 && pnpm test:v2482:restore-points-restore-only",
  "test:v2482 should include prior v2.48 checks",
);

console.log("v2.48.2 Restore Points restore-only UX checks passed");
