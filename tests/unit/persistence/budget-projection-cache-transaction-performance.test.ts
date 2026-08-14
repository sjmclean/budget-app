import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("budget projection cache rebuild batches month writes in one transaction", () => {
  const match = source.match(
    /function readBudgetMonth\([\s\S]*?\n\}/,
  );

  assert.ok(match, "readBudgetMonth should exist");

  const body = match[0];

  const rebuild = body.match(
    /else \{[\s\S]*?const diagnostic = getBudgetProjectionDiagnostic[\s\S]*?\n  \}/,
  );

  assert.ok(rebuild, "projection cache rebuild branch should exist");

  assert.match(
    rebuild[0],
    /execute\("BEGIN IMMEDIATE"\)/,
    "projection cache rebuild should start one SQLite write transaction",
  );

  assert.match(
    rebuild[0],
    /execute\("COMMIT"\)/,
    "projection cache rebuild should commit all regenerated months together",
  );

  assert.match(
    rebuild[0],
    /catch \(error\)[\s\S]*?execute\("ROLLBACK"\)[\s\S]*?throw error/,
    "projection cache rebuild should rollback and rethrow on a failed cache write",
  );
});

test("projection cache month upserts occur inside the cache rebuild transaction", () => {
  const match = source.match(
    /function readBudgetMonth\([\s\S]*?\n\}/,
  );

  assert.ok(match, "readBudgetMonth should exist");

  const body = match[0];

  const begin = body.indexOf('execute("BEGIN IMMEDIATE")');
  const loop = body.indexOf(
    "for (const projectedMonth of diagnostic.projections)",
  );
  const commit = body.indexOf('execute("COMMIT")');

  assert.ok(begin >= 0, "cache rebuild transaction should begin");
  assert.ok(loop > begin, "projection month writes should follow BEGIN IMMEDIATE");
  assert.ok(commit > loop, "projection month writes should finish before COMMIT");
});
