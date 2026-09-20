import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
    import.meta.url,
  ),
  "utf8",
);

function readToLocalQueryBody(): string {
  const match = clientSource.match(
    /function toLocalQuery\(input: AccountTransactionQuery\)\s*\{([\s\S]*?)\n\}/,
  );

  assert.ok(match, "expected local-first account register query adapter");
  return match[1];
}

test("local-first account register query adapter preserves query scope", () => {
  const body = readToLocalQueryBody();

  for (const field of [
    "budgetId",
    "accountId",
    "limit",
    "offset",
    "before",
    "dateRange",
    "search",
    "categoryFilter",
    "sort",
  ]) {
    assert.match(
      body,
      new RegExp(`\\b${field}: input\\.${field}\\b`),
      `expected toLocalQuery to preserve ${field}`,
    );
  }
});


test("register prefetch and navigation share one in-flight authoritative bootstrap", () => {
  assert.match(
    clientSource,
    /accountRegisterBootstrapInFlight = new Map/,
  );
  assert.match(
    clientSource,
    /const existing = accountRegisterBootstrapInFlight\.get\(key\);\s*if \(existing\) return existing;/s,
  );
  assert.match(
    clientSource,
    /getAccountRegisterBootstrap\(input\) \{\s*return loadAccountRegisterBootstrap\(input\);\s*\}/s,
  );
  assert.match(
    clientSource,
    /prefetchAccountRegister\(input\) \{\s*void client\.getAccountRegisterBootstrap\(input\)\.catch\(\(\) => undefined\);\s*\}/s,
  );
  assert.match(
    clientSource,
    /\.finally\(\(\) => \{\s*if \(accountRegisterBootstrapInFlight\.get\(key\) === request\) \{\s*accountRegisterBootstrapInFlight\.delete\(key\);/s,
  );
});
