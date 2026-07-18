import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importer = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const settings = readFileSync("apps/web/src/pages/SettingsPage.tsx", "utf8");

assert.match(
  importer,
  /import \{ useDeveloperPerformanceMode \} from "\.\.\/\.\.\/settings\/useDeveloperPerformanceMode";/,
  "The importer should consume the application-level developer performance preference.",
);
assert.match(
  importer,
  /const developerPerformanceMode = useDeveloperPerformanceMode\(\);/,
  "The importer should read developer performance mode.",
);
assert.match(
  importer,
  /developerPerformanceMode && performanceReport \? \(/,
  "Import performance diagnostics must only render in developer performance mode.",
);
assert.match(
  importer,
  /aria-label="Import performance diagnostics"/,
  "The developer-only diagnostics panel should have an accessible label.",
);
assert.match(
  settings,
  /Show application performance diagnostics and large-data counters while profiling\./,
  "The setting description should describe application-wide diagnostics rather than register-only diagnostics.",
);

console.log("v3.17.0 developer import performance checks passed");
