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

function appendBaselineReplacementBody(): string {
  const start = source.indexOf(
    "async function appendBaselineReplacement(",
  );
  assert.notEqual(
    start,
    -1,
    "appendBaselineReplacement should exist",
  );

  const end = source.indexOf(
    "\nasync function commitBaselineReplacement(",
    start,
  );
  assert.notEqual(
    end,
    -1,
    "commitBaselineReplacement should follow appendBaselineReplacement",
  );

  return source.slice(start, end);
}

test("baseline replacement does not duplicate an already transferred chunk before writing", () => {
  const body = appendBaselineReplacementBody();

  assert.doesNotMatch(
    body,
    /Uint8Array\.from\(content\)/,
    "the worker already owns the transferred baseline chunk and should not copy it again",
  );
});

test("baseline replacement writes the transferred ArrayBuffer directly", () => {
  const body = appendBaselineReplacementBody();

  assert.match(
    body,
    /const contentBuffer = content\.buffer/,
    "the worker should retain the transferred backing buffer",
  );

  assert.match(
    body,
    /contentBuffer instanceof ArrayBuffer/,
    "the worker should prove the transferred backing store is an ArrayBuffer",
  );

  assert.match(
    body,
    /data:\s*contentBuffer/,
    "the worker should pass that ArrayBuffer directly to the OPFS writer",
  );

  assert.doesNotMatch(
    body,
    /\bas\s+ArrayBuffer\b/,
    "the zero-copy path should not rely on a type assertion",
  );
});
