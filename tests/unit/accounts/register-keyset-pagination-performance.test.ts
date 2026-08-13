import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  getRegisterLoadMoreContinuation,
} from "../../../apps/web/src/features/accounts/registerPagination.js";

test("uses keyset continuation for descending date register paging", () => {
  assert.deepEqual(
    getRegisterLoadMoreContinuation({
      sort: { column: "date", direction: "descending" },
      cursor: { date: "2026-08-13", id: "tx-123" },
      loadedCount: 4_500,
    }),
    {
      before: { date: "2026-08-13", id: "tx-123" },
    },
  );
});

test("keeps offset paging for ascending date order", () => {
  assert.deepEqual(
    getRegisterLoadMoreContinuation({
      sort: { column: "date", direction: "ascending" },
      cursor: { date: "2026-08-13", id: "tx-123" },
      loadedCount: 4_500,
    }),
    {
      offset: 4_500,
    },
  );
});

test("keeps offset paging for non-date sorts", () => {
  assert.deepEqual(
    getRegisterLoadMoreContinuation({
      sort: { column: "payee", direction: "ascending" },
      cursor: { date: "2026-08-13", id: "tx-123" },
      loadedCount: 4_500,
    }),
    {
      offset: 4_500,
    },
  );
});

test("falls back to offset when no cursor is available", () => {
  assert.deepEqual(
    getRegisterLoadMoreContinuation({
      sort: { column: "date", direction: "descending" },
      cursor: null,
      loadedCount: 4_500,
    }),
    {
      offset: 4_500,
    },
  );
});

test("account register load-more uses the keyset continuation helper", () => {
  const source = fs.readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/useAccountRegister.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /const continuation = getRegisterLoadMoreContinuation\(\{/,
  );

  assert.match(
    source,
    /\.\.\.continuation,/,
  );

  assert.doesNotMatch(
    source,
    /limit:\s*150,\s*offset:\s*loadedTransactionCountRef\.current,/,
  );
});
