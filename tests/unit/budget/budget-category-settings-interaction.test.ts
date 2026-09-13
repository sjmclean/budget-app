import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL(
  "../../../apps/web/src/pages/BudgetPage.tsx", import.meta.url,
), "utf8");
const row = readFileSync(new URL(
  "../../../apps/web/src/features/budget/BudgetWorkspaceGroup.tsx", import.meta.url,
), "utf8");
const menu = readFileSync(new URL(
  "../../../apps/web/src/features/budget/BudgetCategoryContextMenu.tsx", import.meta.url,
), "utf8");
const cover = readFileSync(new URL(
  "../../../apps/web/src/features/budget/BudgetCoverOverspendingMenu.tsx", import.meta.url,
), "utf8");

test("Category Settings owns category details, policy, and archive actions", () => {
  const settings = page.slice(
    page.indexOf("export function CategorySettingsDialog"),
    page.indexOf("function BudgetActivityDrilldownModal"),
  );

  assert.match(settings, /<h2 id="category-management-title">Category Settings<\/h2>/);
  assert.match(settings, /Category name/);
  assert.match(settings, /Category note/);
  assert.match(settings, /Archive category/);
  assert.match(settings, /Restore category/);
  assert.match(settings, /value="reduce-next-month"/);
  assert.match(settings, /value="carry-category"/);
  assert.match(settings, /checked=.*category\.overspendingHandling/s);
  assert.match(settings, /onSetOverspendingHandling\(category\.id, "reduce-next-month"\)/);
  assert.match(settings, /onSetOverspendingHandling\(category\.id, "carry-category"\)/);
  assert.match(settings, /isCreditCardPaymentCategory\(category\.id\)/);
});

test("Cover Overspending contains immediate money movement only", () => {
  assert.match(cover, /Move available money from one or more categories/);
  assert.match(cover, /selectedSources/);
  assert.match(cover, /option\.available/);
  assert.match(cover, /Selected amounts cannot exceed the overspending/);
  assert.match(cover, /onCoverOverspending\(\{/);
  assert.doesNotMatch(cover, /still overspent when the month ends/);
  assert.doesNotMatch(cover, /OverspendingHandling|onSetOverspendingHandling|type="radio"/);
});

test("Budget interaction wiring keeps settings separate and preserves four columns", () => {
  assert.doesNotMatch(row, /onOpenCategoryEditor/);
  assert.match(row, /title={`View details for \$\{category\.name\}`}/);
  assert.match(page, /onSetOverspendingHandling={setCategoryOverspendingHandling}/);
  assert.match(page, /Category Settings…/);
  assert.match(menu, /Category Settings…/);
  assert.doesNotMatch(menu, /Rename Category|Manage Category/);

  const columns = page.slice(
    page.indexOf("const BUDGET_COLUMN_DEFINITIONS"),
    page.indexOf("function CategoryInspector"),
  );
  assert.deepEqual([...columns.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]), [
    "category", "assigned", "activity", "available",
  ]);
});
