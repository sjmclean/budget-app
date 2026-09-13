import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { BudgetCategoryView } from "../../../apps/web/src/features/budget/budgetViewTypes.js";
import {
  canCategoryUseCoverOverspending,
  resolveBudgetCategoryWindowTab,
} from "../../../apps/web/src/features/budget/budgetCategoryWindowState.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../../../apps/web/src/pages/BudgetPage.tsx");
const row = read("../../../apps/web/src/features/budget/BudgetWorkspaceGroup.tsx");
const menu = read("../../../apps/web/src/features/budget/BudgetCategoryContextMenu.tsx");
const windowSource = read("../../../apps/web/src/features/budget/BudgetCategoryWindow.tsx");
const cover = read("../../../apps/web/src/features/budget/BudgetCoverOverspendingMenu.tsx");

function category(overrides: Partial<BudgetCategoryView> = {}): BudgetCategoryView {
  return {
    id: "category-1", name: "Groceries", previousAvailable: 0, assigned: 100,
    activity: 0, available: 50, isOverspent: false, isArchived: false, note: "",
    ...overrides,
  };
}

test("category-window tab defaults and eligibility follow current category state", () => {
  const overspent = category({ available: -50, isOverspent: true });
  assert.equal(canCategoryUseCoverOverspending(overspent), true);
  assert.equal(resolveBudgetCategoryWindowTab(overspent), "cover-overspending");
  assert.equal(resolveBudgetCategoryWindowTab(overspent, "settings"), "settings");

  const funded = category();
  assert.equal(canCategoryUseCoverOverspending(funded), false);
  assert.equal(resolveBudgetCategoryWindowTab(funded), "settings");
  assert.equal(resolveBudgetCategoryWindowTab(funded, "cover-overspending"), "settings");

  assert.equal(canCategoryUseCoverOverspending(category({ available: -5, isArchived: true })), false);
  assert.equal(canCategoryUseCoverOverspending(category({
    id: "credit-card-payment-card-1", available: -5,
  })), false);
});

test("the shared category window owns accessible tabs and one active panel", () => {
  assert.match(windowSource, /role="tablist"/);
  assert.match(windowSource, /role="tab"/);
  assert.match(windowSource, /aria-selected=/);
  assert.match(windowSource, /aria-controls=/);
  assert.match(windowSource, /role="tabpanel"/);
  assert.match(windowSource, /canCover \? \(/);
  assert.match(windowSource, /activeTab === "cover-overspending" && canCover \? \(/);
  assert.match(windowSource, /<BudgetCoverOverspendingContent/);
  assert.match(windowSource, /<CategorySettingsContent/);
  assert.doesNotMatch(windowSource, /Category overspent/);
});

test("inspector is read-only while retaining financial and managed details", () => {
  const inspector = page.slice(
    page.indexOf("function CategoryInspector"),
    page.indexOf("function BudgetActivityDrilldownModal"),
  );
  assert.match(inspector, /Assigned/);
  assert.match(inspector, /Activity/);
  assert.match(inspector, /Available/);
  assert.match(inspector, /Status/);
  assert.match(inspector, /Managed category/);
  assert.doesNotMatch(inspector, /Category Settings…|Archive category|Restore category/);
  assert.doesNotMatch(inspector, /onOpenCategorySettings|onSetCategoryArchived/);
});

test("entry points target one ID-based category window with explicit tabs", () => {
  assert.match(page, /categoryId: string;[\s\S]*tab: BudgetCategoryWindowTab;[\s\S]*position:/);
  assert.doesNotMatch(page, /isCategorySettingsOpen|coverOverspendingMenu/);
  assert.match(page, /openCategoryWindow\(categoryId, "settings"\)/);
  assert.match(page, /openCategoryWindow\(categoryId, "cover-overspending"\)/);
  assert.match(page, /openCategoryWindow\(category\.id, "cover-overspending"\)/);
  assert.match(page, /<BudgetCategoryWindow/);
  assert.match(menu, /onOpenCoverOverspending\(category\.id\)/);
  assert.match(menu, /onOpenCategorySettings\(category\.id\)/);
  assert.doesNotMatch(row, /onOpenCategoryEditor/);
});

test("cover and settings workflows retain their existing callback contracts", () => {
  assert.match(cover, /selectedSources/);
  assert.match(cover, /option\.available/);
  assert.match(cover, /Selected amounts cannot exceed the overspending/);
  assert.match(cover, /onCoverOverspending\(\{[\s\S]*overspentCategoryId:[\s\S]*sources: selectedSources/);
  assert.doesNotMatch(cover, /OverspendingHandling|type="radio"/);
  assert.match(windowSource, /onRenameCategory\(category\.id, trimmedName\)/);
  assert.match(windowSource, /onUpdateCategoryNote\(category\.id, draftCategoryNote\)/);
  assert.match(windowSource, /onSetOverspendingHandling\(category\.id, "reduce-next-month"\)/);
  assert.match(windowSource, /onSetOverspendingHandling\(category\.id, "carry-category"\)/);
  assert.match(windowSource, /onSetCategoryArchived\(category\.id, !category\.isArchived\)/);
});

test("Budget grid remains the same four columns", () => {
  const columns = page.slice(
    page.indexOf("const BUDGET_COLUMN_DEFINITIONS"),
    page.indexOf("function CategoryInspector"),
  );
  assert.deepEqual([...columns.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]), [
    "category", "assigned", "activity", "available",
  ]);
});
