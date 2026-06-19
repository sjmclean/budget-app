import type {
  AccountRegisterService,
  AccountRegisterView,
} from "./accountRegisterTypes";

const accountNames: Record<string, Pick<AccountRegisterView, "accountName" | "accountType">> = {
  everyday: {
    accountName: "Everyday Account",
    accountType: "On budget",
  },
  savings: {
    accountName: "Savings",
    accountType: "On budget",
  },
  visa: {
    accountName: "Visa",
    accountType: "Credit card",
  },
  super: {
    accountName: "Superannuation",
    accountType: "Tracking",
  },
};

function buildDemoRegister(accountId: string): AccountRegisterView {
  const account = accountNames[accountId] ?? accountNames.everyday;

  if (accountId === "savings") {
    return {
      accountId,
      ...account,
      currencyCode: "AUD",
      clearedBalance: 8500,
      unclearedBalance: 0,
      workingBalance: 8500,
      transactions: [
        {
          id: "sav-1",
          date: "2026-06-15",
          payee: "Transfer from Everyday",
          category: "Transfer",
          memo: "Monthly savings",
          inflow: 500,
          outflow: 0,
          runningBalance: 8500,
          cleared: true,
          reconciled: false,
        },
        {
          id: "sav-2",
          date: "2026-06-01",
          payee: "Opening Balance",
          category: "Starting Balance",
          inflow: 8000,
          outflow: 0,
          runningBalance: 8000,
          cleared: true,
          reconciled: true,
        },
      ],
    };
  }

  if (accountId === "visa") {
    return {
      accountId,
      ...account,
      currencyCode: "AUD",
      clearedBalance: -642.1,
      unclearedBalance: -74.2,
      workingBalance: -716.3,
      transactions: [
        {
          id: "visa-1",
          date: "2026-06-18",
          payee: "BP",
          category: "Fuel",
          memo: "",
          inflow: 0,
          outflow: 74.2,
          runningBalance: -716.3,
          cleared: false,
          reconciled: false,
        },
        {
          id: "visa-2",
          date: "2026-06-16",
          payee: "Netflix",
          category: "Streaming",
          memo: "Monthly subscription",
          inflow: 0,
          outflow: 22.99,
          runningBalance: -642.1,
          cleared: true,
          reconciled: false,
        },
        {
          id: "visa-3",
          date: "2026-06-12",
          payee: "Credit Card Payment",
          category: "Transfer",
          memo: "Payment from Everyday",
          inflow: 400,
          outflow: 0,
          runningBalance: -619.11,
          cleared: true,
          reconciled: true,
        },
      ],
    };
  }

  if (accountId === "super") {
    return {
      accountId,
      ...account,
      currencyCode: "AUD",
      clearedBalance: 84200,
      unclearedBalance: 0,
      workingBalance: 84200,
      transactions: [
        {
          id: "super-1",
          date: "2026-06-01",
          payee: "Market Value Update",
          category: "Tracking Adjustment",
          memo: "Placeholder tracking account value",
          inflow: 1200,
          outflow: 0,
          runningBalance: 84200,
          cleared: true,
          reconciled: false,
        },
      ],
    };
  }

  return {
    accountId,
    ...account,
    currencyCode: "AUD",
    clearedBalance: 2840.25,
    unclearedBalance: -86.4,
    workingBalance: 2753.85,
    transactions: [
      {
        id: "tx-1",
        date: "2026-06-18",
        payee: "Woolworths",
        category: "Groceries",
        memo: "Weekly shop",
        inflow: 0,
        outflow: 86.4,
        runningBalance: 2753.85,
        cleared: false,
        reconciled: false,
      },
      {
        id: "tx-2",
        date: "2026-06-17",
        payee: "Salary",
        category: "Ready To Assign",
        memo: "Fortnightly income",
        inflow: 2950,
        outflow: 0,
        runningBalance: 2840.25,
        cleared: true,
        reconciled: false,
      },
      {
        id: "tx-3",
        date: "2026-06-15",
        payee: "Transfer to Savings",
        category: "Transfer",
        memo: "Monthly savings",
        inflow: 0,
        outflow: 500,
        runningBalance: -109.75,
        cleared: true,
        reconciled: true,
      },
      {
        id: "tx-4",
        date: "2026-06-14",
        payee: "Electricity Provider",
        category: "Electricity",
        memo: "",
        inflow: 0,
        outflow: 214.35,
        runningBalance: 390.25,
        cleared: true,
        reconciled: true,
      },
    ],
  };
}

export const mockAccountRegisterService: AccountRegisterService = {
  async getAccountRegisterView({ accountId }) {
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    return buildDemoRegister(accountId);
  },
};
