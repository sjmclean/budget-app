import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const panelSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/components/accounts/ScheduledTransactionsPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const dialogSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/components/accounts/ScheduledTransactionDiscoveryDialog.tsx",
    import.meta.url,
  ),
  "utf8",
);
const loaderSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/accounts/loadScheduledTransactionDiscoveryEvidence.ts",
    import.meta.url,
  ),
  "utf8",
);

test("scheduled workspace exposes bounded discovery action", () => {
  assert.match(panelSource, />\s*Find Scheduled Transactions\s*</);
  assert.match(panelSource, /openScheduledDiscovery/);
  assert.match(loaderSource, /scheduledTransactionDiscoveryStartDate/);
  assert.match(loaderSource, /dateRange:\s*\{[\s\S]*?startDate,[\s\S]*?endDate: input\.asOfDate/);
  assert.match(loaderSource, /limit: DISCOVERY_PAGE_SIZE/);
});

test("discovery review reuses the existing scheduled transaction editor", () => {
  assert.match(panelSource, /reviewScheduledSuggestion[\s\S]*?setDraft\(draftFromScheduledSuggestion\(suggestion\)\)/);
  assert.match(panelSource, /draftFromScheduledSuggestion/);
  assert.match(panelSource, /createSchedule\(scheduledInputFromSuggestion/);
});

test("discovery dialog distinguishes one-click creation from review-only candidates", () => {
  assert.match(dialogSource, /!suggestion\.requiresReview[\s\S]*?Create Schedule/);
  assert.match(dialogSource, />\s*Review\s*</);
  assert.match(dialogSource, />\s*Ignore\s*</);
  assert.match(dialogSource, /amount\.kind === "variable"[\s\S]*?review this suggestion/i);
});

test("discovery dialog exposes evidence and the 18 month scope", () => {
  assert.match(dialogSource, /last 18 months/i);
  assert.match(dialogSource, /View transactions/);
  assert.match(dialogSource, /evidence\.dates/);
});
