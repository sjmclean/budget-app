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
  /useDateFormatPreference/,
  "import review cards should use the user's configured date format",
);

assert.match(
  dialogSource,
  /formatDateForDisplay/,
  "import review cards should format dates through the shared date formatter",
);

assert.match(
  dialogSource,
  /function formatImportReviewDate\(date: string \| undefined\)/,
  "import review should centralise date display formatting",
);

assert.match(
  dialogSource,
  /transaction-import-match-stack/,
  "matched import rows should use the inline stacked comparison layout",
);

assert.match(
  dialogSource,
  /transaction-import-match-label[\s\S]*In Register/,
  "matched import rows should label the existing transaction as In Register",
);

assert.match(
  dialogSource,
  /candidate.status === "exact-match"[\s\S]*Import as New[\s\S]*Skip[\s\S]*candidate.status === "possible-match"/,
  "already matched rows should offer alternatives without asking the user to Match again",
);

assert.match(
  dialogSource,
  /candidate.status === "possible-match"[\s\S]*acceptMatchedCandidate\(candidate\.id\)[\s\S]*Match/,
  "suggested matches should still ask the user to confirm Match",
);

assert.doesNotMatch(
  dialogSource,
  /transaction-import-match-panel/,
  "side-by-side match panel markup should be removed",
);

assert.match(
  registerCss,
  /\.transaction-import-match-stack/,
  "inline match stack should have dedicated styling",
);

assert.match(
  registerCss,
  /\.transaction-import-match-row/,
  "inline match rows should have dedicated styling",
);

assert.match(
  packageJson,
  /"test:v2412:import-review-polish": "tsx tests\/v2412-import-review-polish\.ts"/,
  "package.json should expose the v2.41.2 import review polish test",
);

console.log("v2.41.2 import review polish checks passed");
