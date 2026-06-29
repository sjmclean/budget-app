import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const budgetSelectorSource = readFileSync("apps/web/src/pages/BudgetSelectorPage.tsx", "utf8");
const globalsSource = readFileSync("apps/web/src/styles/globals.css", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(
  budgetSelectorSource,
  /type LaunchMode = "list" \| "choose" \| "empty" \| "ynab"/,
  "Budget selector should keep the launch experience as a small explicit state machine.",
);

assert.match(
  budgetSelectorSource,
  /Budget Manager/,
  "The launch page should use Budget Manager language for the selector state.",
);

assert.match(
  budgetSelectorSource,
  /Create your first budget/,
  "The no-budget path should show a proper first-run empty state.",
);

assert.match(
  budgetSelectorSource,
  /formatBudgetCreatedLabel\(budget\.createdAt\)/,
  "Budget cards should expose created-month metadata without changing registry behaviour.",
);

assert.match(
  budgetSelectorSource,
  /formatBudgetLocation\(budget\.packagePath\)/,
  "Budget cards should expose a compact local budget location label.",
);

assert.match(
  budgetSelectorSource,
  /How would you like to get started\?/,
  "The launch picker should use friendlier first-run copy.",
);

assert.match(
  budgetSelectorSource,
  /Cloud budget continuation/,
  "The future cloud path should be visible as a launch-experience placeholder.",
);

assert.match(
  globalsSource,
  /budget-empty-state/,
  "The launch polish release should style the dedicated empty state.",
);

assert.match(
  globalsSource,
  /budget-row-meta/,
  "Budget cards should have a metadata row style.",
);

assert.match(
  globalsSource,
  /budget-row-open-label/,
  "Budget cards should show an explicit Open affordance on larger screens.",
);

assert.equal(
  packageJson.scripts["test:v2321:budget-launch-polish"],
  "tsx tests/v2321-budget-launch-polish.ts",
  "package.json should expose the v2.32.1 launch polish test.",
);

assert.equal(
  packageJson.scripts["test:v2321"],
  "pnpm test:v2321:budget-launch-polish",
  "package.json should expose the v2.32.1 aggregate test.",
);

console.log("v2.32.1 budget launch polish checks passed");
