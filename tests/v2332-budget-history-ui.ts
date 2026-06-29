import { readFileSync } from "node:fs";

const settingsPage = readFileSync("apps/web/src/pages/SettingsPage.tsx", "utf8");
const styles = readFileSync("apps/web/src/styles/globals.css", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

assertIncludes(settingsPage, 'type DataSettingsView = "overview" | "budget-history"', "settings should model Data subviews");
assertIncludes(settingsPage, "Budget History", "settings should expose Budget History copy");
assertIncludes(settingsPage, "Create Restore Point", "settings should expose manual restore point creation");
assertIncludes(settingsPage, "listVersionHistorySnapshots", "settings should list version history snapshots");
assertIncludes(settingsPage, "createVersionHistorySnapshot", "settings should create restore points through version history service");
assertIncludes(settingsPage, "restoreVersionHistorySnapshot", "settings should restore selected history entries through version history service");
assertIncludes(settingsPage, "deleteVersionHistorySnapshot", "settings should allow selected restore points to be removed");
assertIncludes(settingsPage, "Showing {historySnapshots.length} of 30 restore points", "settings should explain rolling retention in the UI");
assertIncludes(settingsPage, "External Backups", "external backup should remain separate from Budget History");
assertIncludes(settingsPage, "restoreVersionHistorySnapshot", "version history restore should remain separate from external backup restore");
assertIncludes(styles, ".settings-history-layout", "budget history layout styles should exist");
assertIncludes(styles, ".settings-history-row", "budget history row styles should exist");
assertIncludes(styles, ".settings-history-detail", "budget history detail styles should exist");
assertEqual(
  packageJson.scripts["test:v2332:budget-history-ui"],
  "tsx tests/v2332-budget-history-ui.ts",
  "v2.33.2 targeted test script should be registered",
);
assertEqual(
  packageJson.scripts["test:v2332"],
  "pnpm test:v2332:budget-history-ui",
  "v2.33.2 aggregate test script should be registered",
);

console.log("v2.33.2 Budget History UI checks passed");

function assertIncludes(haystack: string, needle: string, message: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${message}: missing ${needle}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
