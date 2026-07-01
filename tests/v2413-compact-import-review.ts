import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialogSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const registerCss = readFileSync("apps/web/src/styles/register.css", "utf8");
const packageJson = readFileSync("package.json", "utf8");

assert.match(
  dialogSource,
  /transaction-import-review-reason/,
  "new import rows should avoid repeating long explanatory copy in every card",
);

assert.match(
  dialogSource,
  /candidate\.status !== "new" \|\| !candidate\.selected/,
  "selected new rows should not show the repeated no-match reason text",
);

assert.match(
  registerCss,
  /v2\.41\.3 compact import review layout/,
  "compact import review CSS should be present",
);

assert.match(
  registerCss,
  /transaction-import-match-row[\s\S]*grid-template-columns:\s*minmax\(5\.5rem,[\s\S]*minmax\(7rem,[\s\S]*minmax\(16rem,[\s\S]*minmax\(10rem,[\s\S]*minmax\(6\.5rem, auto\)/,
  "imported transaction comparison rows should use five compact columns: label, date, payee, detail, amount",
);

assert.match(
  registerCss,
  /transaction-import-match-label,[\s\S]*transaction-import-match-date,[\s\S]*transaction-import-match-detail,[\s\S]*transaction-import-match-payee[\s\S]*white-space:\s*nowrap/,
  "desktop import review rows should keep transaction fields on one line",
);

assert.match(
  registerCss,
  /transaction-import-wizard \.transaction-import-header[\s\S]*position:\s*sticky/,
  "import dialog header should stay sticky while reviewing long imports",
);

assert.match(
  registerCss,
  /transaction-import-footer[\s\S]*position:\s*sticky/,
  "import action footer should stay sticky while reviewing long imports",
);

assert.match(
  packageJson,
  /"test:v2413:compact-import-review": "tsx tests\/v2413-compact-import-review\.ts"/,
  "package.json should expose the v2.41.3 compact import review test",
);

console.log("v2.41.3 compact import review checks passed");
