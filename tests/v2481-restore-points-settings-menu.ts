import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settingsPage = readFileSync("apps/web/src/pages/SettingsPage.tsx", "utf8");
const sidebar = readFileSync("apps/web/src/layouts/Sidebar.tsx", "utf8");
const router = readFileSync("apps/web/src/app/router.tsx", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(settingsPage, /export function RestorePointsPage\(\)/, "Restore Points should have a dedicated settings-backed page entry");
assert.match(settingsPage, /initialSection="data"/, "Restore Points page should open the Data section");
assert.match(settingsPage, /initialDataView="budget-history"/, "Restore Points page should open the restore point view");
assert.match(settingsPage, /<h2>Restore Points<\/h2>/, "Budget History UI should be renamed to Restore Points");
assert.match(settingsPage, /last 30 restore points/, "Restore point copy should describe retention in user-facing terms");

assert.match(router, /path: "\/restore-points"/, "router should expose Restore Points as its own destination");
assert.match(router, /element: <RestorePointsPage \/>/, "Restore Points route should render the restore point page");
assert.match(sidebar, /openSettingsDestination\("\/restore-points"\)/, "Settings menu should link to Restore Points");
assert.match(sidebar, /<span>Restore Points<\/span>/, "Settings menu should label the destination Restore Points");

assert.equal(
  packageJson.scripts["test:v2481:restore-points-settings-menu"],
  "tsx tests/v2481-restore-points-settings-menu.ts",
  "package.json should include the v2.48.1 restore points settings menu test",
);
assert.equal(
  packageJson.scripts["test:v2481"],
  "pnpm test:v2480 && pnpm test:v2481:restore-points-settings-menu",
  "test:v2481 should include prior v2.48 checks",
);

console.log("v2.48.1 Restore Points settings menu checks passed");
