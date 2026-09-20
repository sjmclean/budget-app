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
    /prefetchAccountRegister\(input\) \{\s*void prefetchAccountRegisterBootstrap\(input\);\s*\}/s,
  );
  assert.match(
    clientSource,
    /accountRegisterBootstrapInFlight\.get\(key\)\?\.promise === promise/,
  );
});

test("register navigation snapshots are single-use, bounded, and revision guarded", () => {
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
    /if \(startedRevision === currentRevision\) \{\s*retainWarmAccountRegisterBootstrap\(key, result, currentRevision\);\s*\}/s,
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


test("synchronous warm-cache reads bypass database ownership routing", () => {
  assert.match(
    clientSource,
    /key === "consumePrefetchedAccountRegister"[\s\S]*?const method = value\.bind\(target\);/,
  );
  const directBindingIndex = clientSource.indexOf('key === "consumePrefetchedAccountRegister"');
  const genericRoutingIndex = clientSource.indexOf("const budgetId = resolveOwnedBudgetId(key, args);");
  assert.ok(directBindingIndex >= 0);
  assert.ok(genericRoutingIndex > directBindingIndex);
});


test("owned sidebar prefetch shares the bootstrap path that retains navigation snapshots", () => {
  assert.match(
    clientSource,
    /key === "prefetchAccountRegister"[\s\S]*?prefetchAccountRegisterBootstrap\(input as [^)]*AccountTransactionQuery\)/,
  );
  assert.match(
    clientSource,
    /async function prefetchAccountRegisterBootstrap[\s\S]*?await getOrStartAccountRegisterBootstrap\(input\)\.promise;/,
  );
  assert.match(
    clientSource,
    /function getOrStartAccountRegisterBootstrap[\s\S]*?retainWarmAccountRegisterBootstrap\(key, result, currentRevision\);/,
  );
});

test("authoritative register reload reseeds the next navigation first paint", () => {
  assert.match(
    clientSource,
    /getAccountRegisterBootstrap\(input\) \{\s*return loadAccountRegisterBootstrap\(input\);\s*\}/s,
  );
  assert.match(
    clientSource,
    /function loadAccountRegisterBootstrap[\s\S]*?return getOrStartAccountRegisterBootstrap\(input\)\.promise;/,
  );
  assert.match(
    clientSource,
    /const result = \{ summary, page, scheduledTransactions \};[\s\S]*?retainWarmAccountRegisterBootstrap\(key, result, currentRevision\);[\s\S]*?return result;/,
  );
});


test("register warm first paint survives strict mode layout-effect replay", () => {
  const hookSource = readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/useAccountRegister.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    hookSource,
    /const claimedWarmBootstrapRef = useRef</,
  );
  assert.match(
    hookSource,
    /const claimedWarm = claimedWarmBootstrapRef\.current;[\s\S]*?claimedWarm\?\.key === warmKey\s*\? claimedWarm\.value/s,
  );
  assert.match(
    hookSource,
    /if \(warm && claimedWarm\?\.key !== warmKey\) \{\s*claimedWarmBootstrapRef\.current = \{ key: warmKey, value: warm \};\s*\}/s,
  );
});


test("account register bootstrap carries scheduled transactions for stable first paint", () => {
  const hookSource = readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/useAccountRegister.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const pageSource = readFileSync(
    new URL(
      "../../../apps/web/src/pages/AccountRegisterPage.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const previewSource = readFileSync(
    new URL(
      "../../../apps/web/src/components/accounts/ScheduledTransactionsPreview.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    clientSource,
    /const \[summary, page, scheduledTransactions\] = await Promise\.all\(/,
  );
  assert.match(
    clientSource,
    /"scheduled-transactions"/,
  );
  assert.match(
    hookSource,
    /setScheduledTransactions\(warmScheduledTransactions\);/,
  );
  assert.match(
    hookSource,
    /setScheduledTransactions\(nextScheduledTransactions\);/,
  );
  assert.match(
    pageSource,
    /<ScheduledTransactionsPreview[\s\S]*?key=\{accountId\}[\s\S]*?initialSchedules=\{scheduledTransactions\}/,
  );
  assert.match(
    previewSource,
    /useState<ScheduledTransactionView\[\]>\(\(\) =>\s*\[\.\.\.\(initialSchedules \?\? \[\]\)\]/s,
  );
});
