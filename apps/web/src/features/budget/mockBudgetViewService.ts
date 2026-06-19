import type { BudgetMonthView, BudgetViewService } from "./budgetViewTypes";

const demoBudgetMonthView: BudgetMonthView = {
  budgetId: "household",
  budgetName: "Household Budget",
  monthLabel: "June 2026",
  currencyCode: "AUD",
  readyToAssign: 0,
  totalAssigned: 3525,
  totalActivity: -2602.74,
  totalAvailable: 4442.26,
  categoryGroups: [
    {
      id: "immediate-obligations",
      name: "Immediate Obligations",
      assigned: 2760,
      activity: -2220.85,
      available: 539.15,
      categories: [
        {
          id: "mortgage",
          name: "Mortgage",
          assigned: 1800,
          activity: -1800,
          available: 0,
          isOverspent: false,
        },
        {
          id: "groceries",
          name: "Groceries",
          assigned: 650,
          activity: -420.85,
          available: 229.15,
          isOverspent: false,
        },
        {
          id: "electricity",
          name: "Electricity",
          assigned: 220,
          activity: 0,
          available: 220,
          isOverspent: false,
        },
        {
          id: "internet",
          name: "Internet",
          assigned: 90,
          activity: 0,
          available: 90,
          isOverspent: false,
        },
      ],
    },
    {
      id: "true-expenses",
      name: "True Expenses",
      assigned: 380,
      activity: -42.5,
      available: 2087.5,
      categories: [
        {
          id: "car-rego",
          name: "Car Rego",
          assigned: 120,
          activity: 0,
          available: 720,
          isOverspent: false,
        },
        {
          id: "insurance",
          name: "Insurance",
          assigned: 180,
          activity: 0,
          available: 1080,
          isOverspent: false,
        },
        {
          id: "medical",
          name: "Medical",
          assigned: 80,
          activity: -42.5,
          available: 287.5,
          isOverspent: false,
        },
      ],
    },
    {
      id: "quality-of-life",
      name: "Quality of Life",
      assigned: 345,
      activity: -157.39,
      available: 187.61,
      categories: [
        {
          id: "dining-out",
          name: "Dining Out",
          assigned: 180,
          activity: -96.4,
          available: 83.6,
          isOverspent: false,
        },
        {
          id: "entertainment",
          name: "Entertainment",
          assigned: 120,
          activity: -38,
          available: 82,
          isOverspent: false,
        },
        {
          id: "streaming",
          name: "Streaming",
          assigned: 45,
          activity: -22.99,
          available: 22.01,
          isOverspent: false,
        },
      ],
    },
    {
      id: "overspent-example",
      name: "Needs Attention",
      assigned: 40,
      activity: -182,
      available: -142,
      categories: [
        {
          id: "fuel",
          name: "Fuel",
          assigned: 40,
          activity: -182,
          available: -142,
          isOverspent: true,
        },
      ],
    },
  ],
};

export const mockBudgetViewService: BudgetViewService = {
  async getBudgetMonthView() {
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    return demoBudgetMonthView;
  },

  async updateAssigned({ categoryId, assigned }) {
    await new Promise((resolve) => window.setTimeout(resolve, 150));

    const categoryGroups = demoBudgetMonthView.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        const available = assigned + category.activity;

        return {
          ...category,
          assigned,
          available,
          isOverspent: available < 0,
        };
      }),
    }));

    return {
      ...demoBudgetMonthView,
      categoryGroups,
    };
  },
};
