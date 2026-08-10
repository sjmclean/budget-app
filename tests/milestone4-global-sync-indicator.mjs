import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync("apps/web/src/layouts/SyncStatusIndicator.tsx", "utf8");
const shell = readFileSync("apps/web/src/layouts/AppShell.tsx", "utf8");
const styles = readFileSync("apps/web/src/styles/globals.css", "utf8");

assert.match(component, /useReplicationStatus\(\)/);
assert.match(component, /getReplicationBackgroundService\(\)\?\.syncNow\(\)/);
assert.match(component, /case "synchronising":/);
assert.match(component, /LoaderCircle, spinning: true/);
assert.match(component, /case "up-to-date":/);
assert.match(component, /tone: "success", icon: CheckCircle2/);
assert.match(component, /aria-live="polite"/);
assert.match(shell, /<SyncStatusIndicator \/>/);
assert.match(styles, /\.global-sync-indicator-spinner\s*\{[\s\S]*animation:/);
assert.match(styles, /@keyframes global-sync-spin/);
assert.match(styles, /@media \(max-width: 42rem\)/);
assert.match(styles, /\.global-sync-indicator-success/);

console.log("Milestone 4 global sync indicator passed.");
