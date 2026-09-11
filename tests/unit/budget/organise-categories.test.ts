import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import {
  getOrganisableCategoryGroups,
  moveOrganisableCategoryToGroup,
  OrganiseCategoriesDialog,
} from "../../../apps/web/src/features/budget/OrganiseCategoriesDialog.js";
import type { BudgetCategoryGroupView } from "../../../apps/web/src/features/budget/budgetViewTypes.js";

const requireFromWeb = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { createElement } = requireFromWeb("react") as { createElement: (...args: any[]) => unknown };
const { renderToStaticMarkup } = requireFromWeb("react-dom/server") as {
  renderToStaticMarkup: (element: unknown) => string;
};

function category(id: string, isArchived = false) {
  return { id, name: id, previousAvailable: 11, assigned: 22, activity: 33, available: 44, isOverspent: false, isArchived, note: "kept" };
}

const groups: BudgetCategoryGroupView[] = [
  { id: "credit-card-payments", name: "Cards", previousAvailable: 0, assigned: 0, activity: 0, available: 0, note: "", categories: [category("credit-card-payment-card-1")] },
  { id: "g1", name: "First", previousAvailable: 0, assigned: 0, activity: 0, available: 0, note: "", categories: [category("a"), category("archived", true), category("b")] },
  { id: "g2", name: "Second", previousAvailable: 0, assigned: 0, activity: 0, available: 0, note: "", categories: [category("c")] },
  { id: "empty", name: "Empty", previousAvailable: 0, assigned: 0, activity: 0, available: 0, note: "", categories: [] },
  { id: "archived-only", name: "Archived only", previousAvailable: 0, assigned: 0, activity: 0, available: 0, note: "", categories: [category("old", true)] },
];

test("organiser includes normal active structure in persisted order and excludes managed and archived categories", () => {
  const result = getOrganisableCategoryGroups(groups);
  assert.deepEqual(result.map((group) => [group.id, group.categories.map(({ id }) => id)]), [
    ["g1", ["a", "b"]],
    ["g2", ["c"]],
    ["empty", []],
    ["archived-only", []],
  ]);
  assert.strictEqual(result[0]?.categories[0], groups[1]?.categories[0], "category identity and durable state are preserved");
});

test("organiser renders semantic movement fallbacks without nested buttons", () => {
  const html = renderToStaticMarkup(createElement(OrganiseCategoriesDialog, {
    groups,
    onClose() {}, onMoveCategory() {}, onPositionCategory() {}, onMoveGroup() {}, onPositionGroup() {},
  }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /Organise Categories/);
  assert.match(html, /aria-label="Move a to group"/);
  assert.match(html, /aria-label="Move First group down"/);
  assert.match(html, /<option value="empty">Empty<\/option>/);
  assert.match(html, /Archived only/);
  assert.match(html, /Drop a category here/);
  assert.doesNotMatch(html, /credit-card-payment|>archived</);
  assert.doesNotMatch(html, /<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
});

test("non-drag fallback targets an empty normal group through the position command", () => {
  const calls: unknown[][] = [];
  moveOrganisableCategoryToGroup(
    getOrganisableCategoryGroups(groups),
    "a",
    "empty",
    (...args) => calls.push(args),
  );
  assert.deepEqual(calls, [["a", undefined, "after", "empty"]]);
});

test("budget header opens organiser and main grid has no drag wording or handles", () => {
  const page = readFileSync(new URL("../../../apps/web/src/pages/BudgetPage.tsx", import.meta.url), "utf8");
  const grid = readFileSync(new URL("../../../apps/web/src/features/budget/BudgetWorkspaceGroup.tsx", import.meta.url), "utf8");
  assert.match(page, /setIsOrganiserOpen\(true\)/);
  assert.match(page, />\s*Organise Categories\s*</);
  assert.doesNotMatch(grid, /Drag category name|Drag category group name|drag-handle-active/);
});
