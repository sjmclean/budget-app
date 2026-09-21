import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  RECENT_IMPORT_HIGHLIGHT_DURATION_MS,
  consumeRecentImportHighlight,
  createRecentImportActivity,
  shouldActivateRecentImportHighlight,
} from "../../../apps/web/src/features/accounts/recentImportActivity.js";

test("recent import highlight is available once within the 15 minute review window", () => {
  const startedAt = 1_000_000;
  const activity = createRecentImportActivity({
    budgetId: "budget-a",
    accountId: "checking",
    importedTransactionIds: ["t1", "t1", "t2"],
    matchedTransactionIds: ["t3"],
    highlightPending: true,
    now: startedAt,
  });

  assert.deepEqual(activity.importedTransactionIds, ["t1", "t2"]);
  assert.equal(
    shouldActivateRecentImportHighlight(
      activity,
      startedAt + RECENT_IMPORT_HIGHLIGHT_DURATION_MS - 1,
    ),
    true,
  );
  assert.equal(
    shouldActivateRecentImportHighlight(
      activity,
      startedAt + RECENT_IMPORT_HIGHLIGHT_DURATION_MS,
    ),
    false,
  );
});

test("consuming a highlight leaves session badge activity intact", () => {
  const activity = createRecentImportActivity({
    budgetId: "budget-a",
    accountId: "checking",
    importedTransactionIds: ["imported"],
    matchedTransactionIds: ["matched"],
    highlightPending: true,
    now: 1_000,
  });

  const consumed = consumeRecentImportHighlight(activity);

  assert.equal(consumed.highlightPending, false);
  assert.deepEqual(consumed.importedTransactionIds, ["imported"]);
  assert.deepEqual(consumed.matchedTransactionIds, ["matched"]);
  assert.equal(shouldActivateRecentImportHighlight(consumed, 1_001), false);
});

test("legacy session activity without highlight metadata remains badge-only", () => {
  const legacy = {
    version: 1 as const,
    budgetId: "budget-a",
    accountId: "checking",
    importedTransactionIds: ["t1"],
    matchedTransactionIds: [],
  };

  assert.equal(shouldActivateRecentImportHighlight(legacy, 2_000), false);
});

test("register row tint is independent from Imported and Matched badge status", () => {
  const source = readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/components/TransactionRow.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /isRecentImportHighlighted && recentImportStatus[\s\S]*?register-row-recent-/,
  );
  assert.match(source, /<RecentImportBadge status=\{recentImportStatus\} \/>/);
});
