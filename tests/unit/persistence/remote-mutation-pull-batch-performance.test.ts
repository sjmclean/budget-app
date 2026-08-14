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

function synchroniseBody(): string {
  const start = source.indexOf(
    "async function synchronise(",
  );

  assert.notEqual(
    start,
    -1,
    "synchronise should exist",
  );

  const end = source.indexOf(
    "\n  async function syncThenDatabase(",
    start,
  );

  assert.notEqual(
    end,
    -1,
    "syncThenDatabase should follow synchronise",
  );

  return source.slice(start, end);
}

test("remote mutation pulls use a scalable page size", () => {
  const body = synchroniseBody();

  assert.doesNotMatch(
    body,
    /limit:\s*5\b/,
    "remote sync should not require one request for every five mutations",
  );

  assert.match(
    body,
    /limit:\s*500\b/,
    "remote sync should pull up to 500 mutations per request",
  );
});

test("remote mutations are still applied using the returned page cursor", () => {
  const body = synchroniseBody();

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
