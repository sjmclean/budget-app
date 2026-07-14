import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  ARCHIVED_CATEGORIES_GROUP_ID,
  buildArchivedCategoriesGroup,
  buildArchivedCategorySourceGroupMap,
  getActiveCategoryGroups,
} from "../apps/web/src/features/budget/budgetWorkspaceSelectors";
import type { BudgetCategoryGroupView } from "../apps/web/src/features/budget/budgetViewTypes";

const groups: BudgetCategoryGroupView[] = [
  {
    id: "bills", name: "Bills", previousAvailable: 0, assigned: 10, activity: -2, available: 8, note: "",
    categories: [
      { id: "power", name: "Power", previousAvailable: 0, assigned: 10, activity: -2, available: 8, isOverspent: false, isArchived: false, note: "" },
      { id: "old-internet", name: "Old Internet", previousAvailable: 1, assigned: 2, activity: -1, available: 2, isOverspent: false, isArchived: true, note: "" },
    ],
  },
  {
    id: "fun", name: "Fun", previousAvailable: 0, assigned: 0, activity: 0, available: 0, note: "",
    categories: [
      { id: "old-gym", name: "Old Gym", previousAvailable: 0, assigned: 0, activity: 0, available: 0, isOverspent: false, isArchived: true, note: "" },
    ],
  },
];

const active = getActiveCategoryGroups(groups);
assert.equal(active.length, 1);
assert.deepEqual(active[0].categories.map((category) => category.id), ["power"]);

const archived = buildArchivedCategoriesGroup(groups);
assert.ok(archived);
assert.equal(archived.id, ARCHIVED_CATEGORIES_GROUP_ID);
assert.equal(archived.name, "Archived Categories (2)");
assert.deepEqual(archived.categories.map((category) => category.id), ["old-internet", "old-gym"]);
assert.equal(archived.available, 2);

const sourceGroups = buildArchivedCategorySourceGroupMap(groups);
assert.equal(sourceGroups.get("old-internet")?.name, "Bills");
assert.equal(sourceGroups.get("old-gym")?.name, "Fun");

const page = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
assert.ok(!page.includes("Hide archived categories"));
assert.ok(!page.includes("Archived hidden"));
assert.ok(page.includes("buildArchivedCategoriesGroup"));
assert.ok(page.includes("BUDGET_ARCHIVED_CATEGORIES_EXPANDED_STORAGE_KEY_PREFIX"));

const group = readFileSync("apps/web/src/features/budget/BudgetWorkspaceGroup.tsx", "utf8");
assert.ok(group.includes("Originally in"));
assert.ok(group.includes("isArchivedCategoriesGroup"));

console.log("v3.08 archived categories section checks passed.");
