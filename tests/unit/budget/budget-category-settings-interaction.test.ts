import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BudgetCoverOverspendingContent } from "../../../apps/web/src/features/budget/BudgetCoverOverspendingMenu.js";
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
const webRequire = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { createElement, useState } = webRequire("react");
const { act, create } = webRequire("react-test-renderer");

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

test("the shared category window owns accessible tabs and hides inactive panels", () => {
  assert.match(windowSource, /role="tablist"/);
  assert.match(windowSource, /role="tab"/);
  assert.match(windowSource, /aria-selected=/);
  assert.match(windowSource, /aria-controls=/);
  assert.match(windowSource, /role="tabpanel"/);
  assert.match(windowSource, /canCover \? \(/);
  assert.match(windowSource, /hidden=\{activeTab !== "cover-overspending"\}/);
  assert.match(windowSource, /hidden=\{activeTab !== "settings"\}/);
  assert.match(windowSource, /<BudgetCoverOverspendingContent/);
  assert.match(windowSource, /<CategorySettingsContent/);
  assert.doesNotMatch(windowSource, /Category overspent/);
});

test("cover draft survives switching to settings and back", async () => {
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, "React");
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: webRequire("react"),
  });

  let setTab: ((tab: "cover-overspending" | "settings") => void) | undefined;
  let root: ReturnType<typeof create> | null = null;
  const overspent = category({ available: -40, isOverspent: true });
  const source = { id: "category-2", name: "Dining", groupName: "Everyday", available: 75 };

  function Harness() {
    const [tab, updateTab] = useState<"cover-overspending" | "settings">("cover-overspending");
    setTab = updateTab;
    return createElement(
      "div",
      null,
      createElement(
        "div",
        { hidden: tab !== "cover-overspending" },
        createElement(BudgetCoverOverspendingContent, {
          overspentCategory: overspent,
          coverOptions: [source],
          currencyCode: "AUD",
          onClose: () => {},
          onCoverOverspending: () => {},
        }),
      ),
      createElement("div", { hidden: tab !== "settings" }, "Settings"),
    );
  }

  try {
    await act(async () => {
      root = create(createElement(Harness));
    });
    await act(async () => {
      root!.root.findByProps({ className: "budget-cover-add-category" }).props.onClick();
    });
    await act(async () => {
      root!.root.findByProps({ className: "budget-cover-picker-option" }).props.onClick();
    });

    assert.match(root!.toJSON() ? JSON.stringify(root!.toJSON()) : "", /Dining/);
    assert.match(JSON.stringify(root!.toJSON()), /40\.00/);

    await act(async () => setTab!("settings"));
    await act(async () => setTab!("cover-overspending"));

    assert.match(JSON.stringify(root!.toJSON()), /Dining/);
    assert.match(JSON.stringify(root!.toJSON()), /40\.00/);
  } finally {
    if (root) await act(async () => root.unmount());
    if (previousAct) {
      Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousAct);
    } else {
      delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
    }
    if (previousReact) {
      Object.defineProperty(globalThis, "React", previousReact);
    } else {
      delete (globalThis as Record<string, unknown>).React;
    }
  }
});

test("category details keeps daily budgeting actions backed by existing workflows", () => {
  const details = page.slice(
    page.indexOf("function CategoryDetailsPanel"),
    page.indexOf("function BudgetActivityDrilldownModal"),
  );
  assert.match(details, /Assigned/);
  assert.match(details, /Activity/);
  assert.match(details, /Available/);
  assert.match(details, /CategoryGoalInspectorSection/);
  assert.match(details, /useCategoryActivityDrilldownQuery/);
  assert.match(details, /onOpenActivity\(category\.id\)/);
  assert.match(details, /onOpenManageCategory\(category\.id\)/);
  assert.match(details, /onOpenCoverOverspending\(category\.id\)/);
  assert.match(details, /disabled=\{!canCoverOverspending\}/);
  assert.match(details, /Move Money/);
  assert.match(details, /title="Move Money is not yet available from Category Details\."/);
  assert.doesNotMatch(details, /Next payment|View schedule/);
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
    page.indexOf("function BudgetNextMonthOutlook"),
  );
  assert.deepEqual([...columns.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]), [
    "category", "assigned", "activity", "available",
  ]);
});
