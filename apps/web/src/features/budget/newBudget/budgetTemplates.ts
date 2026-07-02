import { cloneDefaultCategoryTemplate, type DefaultCategoryTemplateGroup } from "../defaultCategoryTemplate";
import type { DateFormatPreference, FirstDayOfWeekPreference, NumberFormatPreference } from "../../settings/settingsPreferences";

export type BudgetTemplateId = "blank" | "starter" | "simple" | "household";

export interface BudgetTemplate {
  id: BudgetTemplateId;
  name: string;
  description: string;
  summary: string;
  categoryGroups: DefaultCategoryTemplateGroup[];
}

export interface NewBudgetSetup {
  name: string;
  currency: string;
  dateFormat: DateFormatPreference;
  numberFormat: NumberFormatPreference;
  firstDayOfWeek: FirstDayOfWeekPreference;
  templateId: BudgetTemplateId;
}

function cloneTemplateGroups(groups: DefaultCategoryTemplateGroup[]): DefaultCategoryTemplateGroup[] {
  return groups.map((group) => ({
    ...group,
    categories: group.categories.map((category) => ({ ...category })),
  }));
}

const simpleCategoryGroups: DefaultCategoryTemplateGroup[] = [
  {
    id: "income",
    name: "Income",
    categories: [{ id: "income-next-month", name: "Income for Next Month" }],
  },
  {
    id: "bills",
    name: "Bills",
    categories: [
      { id: "housing", name: "Housing" },
      { id: "utilities", name: "Utilities" },
      { id: "insurance", name: "Insurance" },
    ],
  },
  {
    id: "spending",
    name: "Spending",
    categories: [
      { id: "groceries", name: "Groceries" },
      { id: "transport", name: "Transport" },
      { id: "personal", name: "Personal" },
    ],
  },
  {
    id: "savings",
    name: "Savings",
    categories: [{ id: "emergency-fund", name: "Emergency Fund" }],
  },
];

const householdCategoryGroups: DefaultCategoryTemplateGroup[] = [
  {
    id: "income",
    name: "Income",
    categories: [
      { id: "income-next-month", name: "Income for Next Month" },
      { id: "extra-income", name: "Extra Income" },
    ],
  },
  {
    id: "home-and-bills",
    name: "Home & Bills",
    categories: [
      { id: "rent-mortgage", name: "Rent / Mortgage" },
      { id: "electricity", name: "Electricity" },
      { id: "gas", name: "Gas" },
      { id: "water", name: "Water" },
      { id: "internet", name: "Internet" },
      { id: "phone", name: "Phone" },
      { id: "insurance", name: "Insurance" },
    ],
  },
  {
    id: "everyday",
    name: "Everyday",
    categories: [
      { id: "groceries", name: "Groceries" },
      { id: "fuel", name: "Fuel" },
      { id: "transport", name: "Transport" },
      { id: "dining-out", name: "Dining Out" },
      { id: "household", name: "Household" },
      { id: "medical", name: "Medical" },
    ],
  },
  {
    id: "true-expenses",
    name: "True Expenses",
    categories: [
      { id: "car-maintenance", name: "Car Maintenance" },
      { id: "home-maintenance", name: "Home Maintenance" },
      { id: "subscriptions", name: "Subscriptions" },
      { id: "gifts", name: "Gifts" },
      { id: "clothing", name: "Clothing" },
    ],
  },
  {
    id: "savings-and-debt",
    name: "Savings & Debt",
    categories: [
      { id: "emergency-fund", name: "Emergency Fund" },
      { id: "holidays", name: "Holidays" },
      { id: "long-term-savings", name: "Long Term Savings" },
      { id: "credit-card", name: "Credit Card" },
      { id: "loan-repayment", name: "Loan Repayment" },
    ],
  },
];

export const budgetTemplates: BudgetTemplate[] = [
  {
    id: "starter",
    name: "Starter Budget",
    description: "A balanced starting point with bills, everyday spending, true expenses, quality of life, and savings.",
    summary: "5 groups · 20 categories",
    categoryGroups: cloneDefaultCategoryTemplate(),
  },
  {
    id: "simple",
    name: "Simple Budget",
    description: "A smaller category set for users who want to begin quickly and add detail later.",
    summary: "4 groups · 8 categories",
    categoryGroups: simpleCategoryGroups,
  },
  {
    id: "household",
    name: "Detailed Household",
    description: "A fuller household setup with separate utilities, everyday spending, true expenses, savings, and debt.",
    summary: "5 groups · 25 categories",
    categoryGroups: householdCategoryGroups,
  },
  {
    id: "blank",
    name: "Blank Budget",
    description: "Create the budget shell now and build your own categories from scratch.",
    summary: "No starter categories",
    categoryGroups: [],
  },
];

export const defaultNewBudgetSetup: NewBudgetSetup = {
  name: "",
  currency: "AUD",
  dateFormat: "DD/MM/YYYY",
  numberFormat: "1,234.56",
  firstDayOfWeek: "monday",
  templateId: "starter",
};

export function getBudgetTemplate(templateId: BudgetTemplateId): BudgetTemplate {
  return budgetTemplates.find((template) => template.id === templateId) ?? budgetTemplates[0];
}

export function cloneBudgetTemplateGroups(templateId: BudgetTemplateId): DefaultCategoryTemplateGroup[] {
  return cloneTemplateGroups(getBudgetTemplate(templateId).categoryGroups);
}
