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
    /accountRegisterBootstrapInFlight\s*=\s*new Map/,
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
    /prefetchAccountRegister\(input\) \{\s*prefetchAccountRegisterBootstrap\(input\);\s*\}/s,
  );
  assert.match(
    clientSource,
    /accountRegisterBootstrapInFlight\.get\(key\)\?\.promise === promise/,
  );
});

test("completed register prefetch is single-use, bounded, and revision guarded", () => {
  assert.match(
    clientSource,
    /MAX_WARM_ACCOUNT_REGISTER_BOOTSTRAPS = 16/,
  );
  assert.match(
    clientSource,
    /warmAccountRegisterBootstraps\.delete\(key\);\s*return warm\.revision ===\s*getPersistenceRevisionForInterest/s,
  );
  assert.match(
    clientSource,
    /request\.startedRevision !== currentRevision\) return;/,
  );
  assert.match(
    clientSource,
    /while \(warmAccountRegisterBootstraps\.size > MAX_WARM_ACCOUNT_REGISTER_BOOTSTRAPS\)/,
  );
});


test("register navigation can synchronously consume a revision-valid warm bootstrap before paint", () => {
  const hookSource = readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/useAccountRegister.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    clientSource,
    /consumePrefetchedAccountRegister\(input\) \{\s*return consumeWarmAccountRegisterBootstrap\(input\);\s*\}/s,
  );
  assert.match(
    hookSource,
    /useLayoutEffect\(\(\) => \{/,
  );
  assert.match(
    hookSource,
    /consumePrefetchedAccountRegister\(\{/,
  );
  assert.match(
    hookSource,
    /appliedRevisionRef\.current = warm\.revision;/,
  );
  assert.match(
    hookSource,
    /hasLoadedDataRef\.current = true;\s*setIsLoading\(false\);/s,
  );
});
