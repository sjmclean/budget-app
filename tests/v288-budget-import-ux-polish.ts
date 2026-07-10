import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/pages/budgetSelector/BudgetImportDialog.tsx",
  "utf8",
);
const progress = readFileSync(
  "apps/web/src/pages/budgetSelector/BudgetImportProgress.tsx",
  "utf8",
);
const styles = readFileSync(
  "apps/web/src/styles/budgetImportUx.css",
  "utf8",
);
const main = readFileSync("apps/web/src/main.tsx", "utf8");

assert.match(
  dialog,
  /ynab4FolderInputRef\.current\?\.click\(\)/,
  "YNAB4 browse must retain the directory-input fallback",
);
assert.match(
  dialog,
  /showDirectoryPicker/,
  "YNAB4 browse should use the native directory picker where available",
);
assert.match(
  dialog,
  /Fall back to the widely[\s\S]*webkitdirectory input/,
  "native directory picker failures should fall back instead of failing the import",
);
assert.match(
  dialog,
  /IMPORT_PHASE_DWELL_MS/,
  "import phases should remain visible long enough to be understood",
);
assert.match(
  dialog,
  /preview\.accounts\.length/,
  "Actual Budget progress should use detected account counts",
);
assert.match(
  dialog,
  /discovery\.counts\.transactions/,
  "YNAB4 progress should use discovered transaction counts",
);
assert.match(
  dialog,
  /counts=\{budgetImportProgressCounts\}/,
  "detected counts must be passed to the progress component",
);

assert.match(progress, /Scanning budget files/);
assert.match(progress, /Importing accounts/);
assert.match(progress, /Importing categories/);
assert.match(progress, /Importing payees/);
assert.match(progress, /Importing transactions/);
assert.match(progress, /count\.toLocaleString\(\)/);
assert.match(progress, /role="progressbar"/);

assert.match(
  styles,
  /\.budget-import-complete-report[\s\S]*color: var\(--text\)/,
  "completion report must use theme text colours",
);
assert.match(styles, /background: var\(--surface\)/);
assert.match(styles, /\.ynab4-summary-metric/);
assert.match(styles, /\.budget-import-progress-step-current/);
assert.match(main, /budgetImportUx\.css/);

console.log("v2.88 budget import UX polish checks passed");
