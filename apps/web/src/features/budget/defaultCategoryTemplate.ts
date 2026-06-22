export interface DefaultCategoryTemplateGroup {
  id: string;
  name: string;
  categories: DefaultCategoryTemplateCategory[];
}

export interface DefaultCategoryTemplateCategory {
  id: string;
  name: string;
}

/**
 * Starter category template copied into newly-created budget views.
 *
 * These are not protected system categories. Once copied into a budget they are
 * ordinary user-owned categories that can be renamed, moved, archived, merged,
 * and later deleted when a delete workflow exists.
 */
export const defaultCategoryTemplate: DefaultCategoryTemplateGroup[] = [
  {
    id: "immediate-obligations",
    name: "Immediate Obligations",
    categories: [
      { id: "rent-mortgage", name: "Rent / Mortgage" },
      { id: "utilities", name: "Utilities" },
      { id: "internet", name: "Internet" },
      { id: "phone", name: "Phone" },
      { id: "insurance", name: "Insurance" },
    ],
  },
  {
    id: "everyday-expenses",
    name: "Everyday Expenses",
    categories: [
      { id: "groceries", name: "Groceries" },
      { id: "fuel", name: "Fuel" },
      { id: "transport", name: "Transport" },
      { id: "dining-out", name: "Dining Out" },
      { id: "medical", name: "Medical" },
    ],
  },
  {
    id: "true-expenses",
    name: "True Expenses",
    categories: [
      { id: "home-maintenance", name: "Home Maintenance" },
      { id: "vehicle-maintenance", name: "Vehicle Maintenance" },
      { id: "clothing", name: "Clothing" },
      { id: "gifts", name: "Gifts" },
      { id: "subscriptions", name: "Subscriptions" },
    ],
  },
  {
    id: "quality-of-life",
    name: "Quality of Life",
    categories: [
      { id: "entertainment", name: "Entertainment" },
      { id: "hobbies", name: "Hobbies" },
      { id: "holidays", name: "Holidays" },
    ],
  },
  {
    id: "savings",
    name: "Savings",
    categories: [
      { id: "emergency-fund", name: "Emergency Fund" },
      { id: "long-term-savings", name: "Long Term Savings" },
    ],
  },
];

export function cloneDefaultCategoryTemplate(): DefaultCategoryTemplateGroup[] {
  return defaultCategoryTemplate.map((group) => ({
    ...group,
    categories: group.categories.map((category) => ({ ...category })),
  }));
}
