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

function drainLocalOutboxBody(): string {
  const start = source.indexOf(
    "async function drainLocalOutbox(",
  );

  assert.notEqual(
    start,
    -1,
    "drainLocalOutbox should exist",
  );

  const end = source.indexOf(
    "\n  async function readyDatabase(",
    start,
  );

  assert.notEqual(
    end,
    -1,
    "readyDatabase should follow drainLocalOutbox",
  );

  return source.slice(start, end);
}

test("outbox batching does not allocate a Blob for every payload byte count", () => {
  const body = drainLocalOutboxBody();

  assert.doesNotMatch(
    body,
    /new Blob\(\[row\.payloadJson\]\)\.size/,
    "outbox batching should avoid Blob allocation for UTF-8 byte counting",
  );
});

test("outbox batching uses TextEncoder for exact UTF-8 byte counts", () => {
  const body = drainLocalOutboxBody();

  assert.match(
    body,
    /TextEncoder/,
    "outbox batching should use TextEncoder",
  );

  assert.match(
    body,
    /\.encode\(row\.payloadJson\)\.byteLength/,
    "outbox batching should measure the encoded UTF-8 payload length",
  );
});

test("outbox batching preserves the 32 MiB encoded payload cap", () => {
  const body = drainLocalOutboxBody();

  assert.match(
    body,
    /32 \* 1024 \* 1024/,
    "outbox batching must retain the existing 32 MiB limit",
  );
});
