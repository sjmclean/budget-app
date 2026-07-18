import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  new URL(
    "../apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
    import.meta.url,
  ),
  "utf8",
);

assert.doesNotMatch(
  dialog,
  /getCandidateStatusLabel/,
  "The review UI must not derive recommendation-style status labels.",
);
assert.doesNotMatch(
  dialog,
  /transaction-import-status-/,
  "The review cards must not render recommendation-style status badges.",
);
assert.doesNotMatch(
  dialog,
  /suggested matches/i,
  "The review instructions must not describe matches as recommendations.",
);
assert.match(
  dialog,
  /Compare imported transactions with any possible register\s+matches/,
  "The review instructions should neutrally describe the comparison task.",
);
assert.match(
  dialog,
  />\s*Bank\s*</,
  "The source transaction must remain visible.",
);
assert.match(
  dialog,
  />\s*In Register\s*</,
  "Possible register transaction details must remain visible.",
);
assert.match(
  dialog,
  />\s*New Transaction\s*</,
  "The editable new transaction must remain visible.",
);
assert.match(
  dialog,
  /This transaction contains invalid source data/,
  "Invalid rows should retain factual validation information.",
);

console.log("v3.22.2 neutral import review UI structure tests passed");
