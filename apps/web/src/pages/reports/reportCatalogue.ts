export interface ReportCardDefinition {
  title: string;
  description: string;
  status: "available" | "coming-soon";
}

export const reportCards: ReportCardDefinition[] = [
  {
    title: "Spending by Category",
    description: "See where money left your budget during the selected month.",
    status: "available",
  },
  {
    title: "Budget vs Actual",
    description: "Compare assigned amounts with real category activity.",
    status: "available",
  },
  {
    title: "Income & Expenses",
    description: "Review income, expenses, and surplus for a period.",
    status: "coming-soon",
  },
  {
    title: "Net Worth",
    description: "Track on-budget and tracking account balances over time.",
    status: "coming-soon",
  },
];
