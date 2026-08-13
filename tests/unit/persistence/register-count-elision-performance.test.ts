import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workerSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

const clientSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
    import.meta.url,
  ),
  "utf8",
);

test("transaction query can omit total count without changing hasMore paging", () => {
  assert.match(
    workerSource,
    /includeTotalCount/,
    "local transaction queries should support count elision",
  );

  assert.match(
    workerSource,
    /hasMore:\s*rows\.length\s*>\s*limit/,
    "hasMore must remain based on the limit+1 page probe",
  );
});

test("unfiltered register bootstrap reuses summary transaction count", () => {
  assert.match(
    clientSource,
    /includeTotalCount:\s*false/,
    "unfiltered bootstrap should not repeat the account transaction count",
  );
});

test("filtered register bootstrap still requests an exact filtered count", () => {
  assert.match(
    clientSource,
    /includeTotalCount:\s*[^,\n]*needsFilteredCount|includeTotalCount:\s*needsFilteredCount/,
    "filtered bootstrap must retain its filtered total count",
  );
});

test("load-more transaction queries omit total count", () => {
  assert.match(
    clientSource,
    /async queryTransactions\(input\)[\s\S]{0,500}includeTotalCount:\s*false/,
    "load-more pages should not repeat COUNT(*)",
  );
});
