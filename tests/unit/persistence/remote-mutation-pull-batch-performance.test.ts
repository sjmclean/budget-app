import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
    import.meta.url,
  ),
  "utf8",
);

function convergenceBody(): string {
  const start = source.indexOf(
    "export async function convergeLocalFirstMutations(",
  );

  assert.notEqual(
    start,
    -1,
    "convergeLocalFirstMutations should exist",
  );

  const end = source.indexOf(
    "\n/**\n * Complete browser-local budget engine.",
    start,
  );

  assert.notEqual(
    end,
    -1,
    "the local runtime should follow the convergence helper",
  );

  return source.slice(start, end);
}

test("remote mutation pulls use a scalable page size", () => {
  const body = convergenceBody();

  assert.doesNotMatch(
    body,
    /limit:\s*5\b/,
    "remote sync should not require one request for every five mutations",
  );

  assert.match(
    body,
    /limit:\s*batchSize\b/,
    "remote sync should use the shared bounded batch size",
  );
});

test("remote mutations are still applied using the returned page cursor", () => {
  const body = convergenceBody();

  assert.match(
    body,
    /const throughCursor = pulled\.mutations\.at\(-1\)!\.cursor/,
    "the applied page should remain bounded by its final relay cursor",
  );

  assert.match(
    body,
    /applyRemoteMutations\([\s\S]*throughCursor/,
    "the worker should atomically apply the page through that cursor",
  );
});
