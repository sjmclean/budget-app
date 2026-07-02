import { cloneDefaultCategoryTemplate, type DefaultCategoryTemplateGroup } from "../defaultCategoryTemplate";
import type { DateFormatPreference, FirstDayOfWeekPreference, NumberFormatPreference } from "../../settings/settingsPreferences";

export interface NewBudgetCategorySetup {
  id: string;
  name: string;
  selected: boolean;
  custom?: boolean;
}

export interface NewBudgetCategoryGroupSetup {
  id: string;
  name: string;
  selected: boolean;
  categories: NewBudgetCategorySetup[];
}

export interface NewBudgetSetup {
  name: string;
  currency: string;
  dateFormat: DateFormatPreference;
  numberFormat: NumberFormatPreference;
  firstDayOfWeek: FirstDayOfWeekPreference;
  categoryGroups: NewBudgetCategoryGroupSetup[];
}

function cloneCategorySetupGroups(groups: NewBudgetCategoryGroupSetup[]): NewBudgetCategoryGroupSetup[] {
  return groups.map((group) => ({
    ...group,
    categories: group.categories.map((category) => ({ ...category })),
  }));
}

export function createCategorySetupGroups(
  groups: DefaultCategoryTemplateGroup[] = cloneDefaultCategoryTemplate(),
): NewBudgetCategoryGroupSetup[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    selected: true,
    categories: group.categories.map((category) => ({
      id: category.id,
      name: category.name,
      selected: true,
    })),
  }));
}

export const defaultCategorySetupGroups = createCategorySetupGroups();

export const defaultNewBudgetSetup: NewBudgetSetup = {
  name: "",
  currency: "AUD",
  dateFormat: "DD/MM/YYYY",
  numberFormat: "1,234.56",
  firstDayOfWeek: "monday",
  categoryGroups: cloneCategorySetupGroups(defaultCategorySetupGroups),
};

export function cloneNewBudgetCategoryGroups(
  groups: NewBudgetCategoryGroupSetup[] = defaultCategorySetupGroups,
): NewBudgetCategoryGroupSetup[] {
  return cloneCategorySetupGroups(groups);
}

export function getSelectedCategoryGroups(
  groups: NewBudgetCategoryGroupSetup[],
): DefaultCategoryTemplateGroup[] {
  return groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      categories: group.categories
        .filter((category) => group.selected && category.selected && category.name.trim())
        .map((category) => ({
          id: category.id,
          name: category.name.trim(),
        })),
    }))
    .filter((group) => group.categories.length > 0);
}

export function countSelectedCategories(groups: NewBudgetCategoryGroupSetup[]): number {
  return getSelectedCategoryGroups(groups).reduce(
    (total, group) => total + group.categories.length,
    0,
  );
}
