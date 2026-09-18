import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const payeeWorkflow = readFileSync(
  "apps/web/src/features/accounts/usePayeeManagerWorkflow.ts",
  "utf8",
);

test("canonical aliases are learned only from explicit review ownership or changed matched payees", () => {
  assert.match(dialog, /manualCandidateEdits\[candidate\.id\]\?\.payee/);
  assert.match(dialog, /const origin = matchedTransactionOrigins\[candidate\.id\]/);
  assert.match(dialog, /rawIdentity !== targetIdentity/);
});

test("canonical alias enrichment cannot delay the Import complete transition", () => {
  const commit = dialog.indexOf("const result = await commitImportSession(");
  const complete = dialog.indexOf('setStep("complete")', commit);
  const learn = dialog.indexOf(
    "void onLearnPayeeAliases(canonicalAliasLearnings)",
    commit,
  );

  assert.ok(commit >= 0);
  assert.ok(complete > commit);
  assert.ok(
    learn > complete,
    "optional canonical alias persistence must start only after completion is scheduled",
  );
  assert.doesNotMatch(
    dialog.slice(commit, complete),
    /await onLearnPayeeAliases/,
    "payee alias enrichment must not block a successful import completion",
  );
});

test("commit-time canonical aliases are grouped and submitted as one importer enrichment request", () => {
  assert.match(
    dialog,
    /const canonicalAliasLearnings = payeeAliasLearnings\.flatMap/,
  );
  assert.match(
    dialog,
    /void onLearnPayeeAliases\(canonicalAliasLearnings\)/,
  );
});

test("payee workflow collapses multiple raw aliases to one persistence update per canonical payee", () => {
  assert.match(
    payeeWorkflow,
    /const rawPayeesByPayeeId = new Map<string, string\[\]>/,
  );
  assert.match(
    payeeWorkflow,
    /for \(const \[payeeId, rawPayees\] of rawPayeesByPayeeId\)/,
  );

  const batchStart = payeeWorkflow.indexOf("async function learnPayeeAliases(");
  const singleStart = payeeWorkflow.indexOf("async function learnPayeeAlias(", batchStart);
  const batchBody = payeeWorkflow.slice(batchStart, singleStart);
  const updates = batchBody.match(/payeesPersistence\.updatePayee\(/g) ?? [];
  assert.equal(updates.length, 1);
  assert.match(batchBody, /setPayeeOptions\(currentPayees\)/);
});

test("accepted alias suggestions are still mirrored into canonical payee aliases", () => {
  assert.match(
    dialog,
    /await onLearnPayeeAliases\(\[[\s\S]*?payeeId: canonicalPayee\.id[\s\S]*?rawPayee: suggestion\.sourcePayee/,
  );
});
