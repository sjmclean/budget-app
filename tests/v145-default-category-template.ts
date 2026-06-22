import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService";
import { defaultCategoryTemplate } from "../apps/web/src/features/budget/defaultCategoryTemplate";
import type { BudgetActivityPersistencePort } from "../apps/web/src/features/budget/budgetActivityPersistencePort";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createMemoryStorage(): KeyValueStoragePort & { keys(): string[] } {
  const values = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    keys(): string[] {
      return [...values.keys()];
    },
  };
}

const emptyActivity: BudgetActivityPersistencePort = {
  async listRegisterTransactionsForBudgetActivity() {
    return [];
  },
  async countCategoryReferences() {
    return {
      registerTransactionCount: 0,
      registerSplitLineCount: 0,
      scheduledTransactionCount: 0,
    };
  },
  async renameRegisterCategoryReferences() {},
  async rewriteCategoryReferences() {},
};

const storage = createMemoryStorage();
const service = createBudgetViewService({
  budgetActivity: emptyActivity,
  storage,
});

assert(defaultCategoryTemplate.length >= 5, "template should provide the agreed starter category groups");
assert(
  defaultCategoryTemplate.some((group) => group.name === "Everyday Expenses"),
  "template should include Everyday Expenses",
);
assert(
  defaultCategoryTemplate.some((group) => group.categories.some((category) => category.name === "Groceries")),
  "template should include Groceries",
);
assert(
  defaultCategoryTemplate.some((group) => group.categories.some((category) => category.name === "Emergency Fund")),
  "template should include Emergency Fund",
);

const view = await service.getBudgetMonthView({
  budgetId: "fresh-budget",
  month: "2026-06",
});

assert(
  view.categoryGroups.map((group) => group.name).join("|") ===
    defaultCategoryTemplate.map((group) => group.name).join("|"),
  "new budget views should receive the default category groups in template order",
);

for (const templateGroup of defaultCategoryTemplate) {
  const group = view.categoryGroups.find((item) => item.id === templateGroup.id);
  assert(group, `expected template group ${templateGroup.name}`);
  assert(
    group.categories.map((category) => category.name).join("|") ===
      templateGroup.categories.map((category) => category.name).join("|"),
    `expected template categories for ${templateGroup.name}`,
  );

  for (const category of group.categories) {
    assert(category.assigned === 0, "starter categories should begin unassigned");
    assert(category.activity === 0, "starter categories should begin with no activity");
    assert(category.available === 0, "starter categories should begin with no available balance");
    assert(category.isArchived === false, "starter categories should be active ordinary categories");
  }
}

const groceries = view.categoryGroups
  .flatMap((group) => group.categories)
  .find((category) => category.id === "groceries");
assert(groceries, "expected Groceries category to exist");

const renamed = await service.renameCategory({
  budgetId: "fresh-budget",
  month: "2026-06",
  categoryId: groceries.id,
  name: "Supermarket Food",
});
assert(
  renamed.categoryGroups.some((group) =>
    group.categories.some((category) => category.id === "groceries" && category.name === "Supermarket Food"),
  ),
  "starter template categories should be normal user-owned categories that can be renamed",
);

const archived = await service.setCategoryArchived({
  budgetId: "fresh-budget",
  month: "2026-06",
  categoryId: groceries.id,
  isArchived: true,
});
assert(
  archived.categoryGroups.some((group) =>
    group.categories.some((category) => category.id === "groceries" && category.isArchived),
  ),
  "starter template categories should be normal user-owned categories that can be archived",
);

const secondBudget = await service.getBudgetMonthView({
  budgetId: "another-budget",
  month: "2026-06",
});
assert(
  secondBudget.categoryGroups.some((group) =>
    group.categories.some((category) => category.id === "groceries" && category.name === "Groceries"),
  ),
  "customising one budget should not mutate the reusable default category template",
);

assert(
  storage.keys().some((key) => key.includes("fresh-budget")) &&
    storage.keys().some((key) => key.includes("another-budget")),
  "each budget should receive its own persisted copy of the template",
);

console.log("v1.45 default category template validation passed");
