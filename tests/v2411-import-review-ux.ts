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
  /function acceptMatchedCandidate\(candidateId: string\)/,
  "matched import candidates should support an explicit Match action",
);

assert.match(
  dialogSource,
  /function importMatchedCandidateAsNew\(candidateId: string\)/,
  "matched import candidates should support Import as New",
);

assert.match(
  dialogSource,
  /function skipCandidate\(candidateId: string\)/,
  "import candidates should support Skip",
);

assert.match(
  dialogSource,
  /function getCandidateStatusLabel\(candidate: TransactionImportCandidate\)/,
  "technical candidate statuses should be mapped to user-facing labels",
);

assert.match(
  dialogSource,
  /return "Matched";/,
  "exact-match rows should be presented as Matched",
);

assert.match(
  dialogSource,
  /return "Suggested Match";/,
  "possible-match rows should be presented as Suggested Match",
);

assert.match(
  dialogSource,
  /transaction-import-review-list/,
  "review should use card/list layout rather than the legacy table-only layout",
);

assert.match(
  dialogSource,
  /transaction-import-match-label">Imported/,
  "review cards should show the imported transaction side of a match",
);

assert.match(
  dialogSource,
  /In Register/,
  "review cards should show the in-register transaction side of a match",
);

assert.match(
  dialogSource,
  /candidate.status === "possible-match"[\s\S]*acceptMatchedCandidate\(candidate\.id\)[\s\S]*>\s*Match\s*</,
  "suggested match review cards should include a Match action",
);

assert.match(
  dialogSource,
  /Import as New/,
  "review cards should include an Import as New action",
);

assert.match(
  dialogSource,
  /skipCandidate\(candidate\.id\)[\s\S]*>\s*Skip\s*</,
  "review cards should include a Skip action",
);

assert.match(
  registerCss,
  /\.transaction-import-review-card/,
  "review cards should have dedicated styling",
);

assert.match(
  registerCss,
  /\.transaction-import-match-stack/,
  "matched rows should have stacked inline comparison styling",
);

assert.match(
  packageJson,
  /"test:v2411:import-review-ux": "tsx tests\/v2411-import-review-ux\.ts"/,
  "package.json should expose the v2.41.1 import review UX test",
);

console.log("v2.41.1 import review UX checks passed");
