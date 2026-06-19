import type {
  AccountRegisterService,
  AccountRegisterView,
  NewRegisterTransactionInput,
  RegisterTransactionView,
  UpdateRegisterTransactionInput,
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

const registersByAccountId = new Map<string, AccountRegisterView>();

function cloneRegister(register: AccountRegisterView): AccountRegisterView {
  return {
    ...register,
    transactions: register.transactions.map((transaction) => ({ ...transaction })),
  };
}

function recalculateRegister(data: AccountRegisterView): AccountRegisterView {
  let runningBalance = 0;

  const chronological = [...data.transactions].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const runningById = new Map<string, number>();

  for (const transaction of chronological) {
    runningBalance += transaction.inflow - transaction.outflow;
    runningById.set(transaction.id, runningBalance);
  }

  const transactions = data.transactions.map((transaction) => ({
    ...transaction,
    attachmentCount: transaction.attachmentCount ?? 0,
    runningBalance: runningById.get(transaction.id) ?? transaction.runningBalance,
  }));

  const clearedBalance = transactions
    .filter((transaction) => transaction.cleared || transaction.reconciled)
    .reduce((sum, transaction) => sum + transaction.inflow - transaction.outflow, 0);

  const workingBalance = transactions.reduce(
    (sum, transaction) => sum + transaction.inflow - transaction.outflow,
    0,
  );

  return {
    ...data,
    clearedBalance,
    unclearedBalance: workingBalance - clearedBalance,
    workingBalance,
    transactions,
  };
}

function getOrCreateRegister(accountId: string): AccountRegisterView {
  const existing = registersByAccountId.get(accountId);

  if (existing) {
    return existing;
  }

  const register = recalculateRegister(buildDemoRegister(accountId));
  registersByAccountId.set(accountId, register);
  return register;
}

async function simulateLatency() {
  await new Promise((resolve) => window.setTimeout(resolve, 120));
}

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
          flag: null,
          attachmentCount: 0,
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
          flag: null,
          attachmentCount: 0,
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
          flag: null,
          attachmentCount: 0,
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
          flag: null,
          attachmentCount: 0,
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
          flag: null,
          attachmentCount: 0,
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
          flag: null,
          attachmentCount: 0,
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
        flag: null,
        attachmentCount: 0,
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
        flag: null,
        attachmentCount: 0,
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
        flag: null,
        attachmentCount: 0,
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
        flag: null,
        attachmentCount: 0,
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

function addTransactionToRegister(
  current: AccountRegisterView,
  input: NewRegisterTransactionInput,
): AccountRegisterView {
  const transaction: RegisterTransactionView = {
    id: `tx-${Date.now()}`,
    date: input.date,
    flag: null,
    attachmentCount: 0,
    payee: input.payee,
    category: input.category,
    memo: input.memo,
    inflow: input.inflow,
    outflow: input.outflow,
    runningBalance: current.workingBalance + input.inflow - input.outflow,
    cleared: false,
    reconciled: false,
  };

  return recalculateRegister({
    ...current,
    transactions: [transaction, ...current.transactions],
  });
}

function updateTransactionInRegister(
  current: AccountRegisterView,
  input: UpdateRegisterTransactionInput,
): AccountRegisterView {
  return recalculateRegister({
    ...current,
    transactions: current.transactions.map((transaction) => {
      if (transaction.id !== input.id) {
        return transaction;
      }

      return {
        ...transaction,
        date: input.date,
        payee: input.payee,
        category: input.category,
        memo: input.memo,
        inflow: input.inflow,
        outflow: input.outflow,
      };
    }),
  });
}

export const mockAccountRegisterService: AccountRegisterService = {
  async getAccountRegisterView({ accountId }) {
    await simulateLatency();
    return cloneRegister(getOrCreateRegister(accountId));
  },

  async addTransaction({ accountId, transaction }) {
    await simulateLatency();
    const next = addTransactionToRegister(getOrCreateRegister(accountId), transaction);
    registersByAccountId.set(accountId, next);
    return cloneRegister(next);
  },

  async updateTransaction({ accountId, transaction }) {
    await simulateLatency();
    const next = updateTransactionInRegister(getOrCreateRegister(accountId), transaction);
    registersByAccountId.set(accountId, next);
    return cloneRegister(next);
  },

  async toggleCleared({ accountId, transactionId }) {
    await simulateLatency();
    const current = getOrCreateRegister(accountId);
    const next = recalculateRegister({
      ...current,
      transactions: current.transactions.map((transaction) => {
        if (transaction.id !== transactionId || transaction.reconciled) {
          return transaction;
        }

        return {
          ...transaction,
          cleared: !transaction.cleared,
        };
      }),
    });

    registersByAccountId.set(accountId, next);
    return cloneRegister(next);
  },

  async addAttachmentPlaceholder({ accountId, transactionId }) {
    await simulateLatency();
    const current = getOrCreateRegister(accountId);
    const next = {
      ...current,
      transactions: current.transactions.map((transaction) => {
        if (transaction.id !== transactionId) {
          return transaction;
        }

        return {
          ...transaction,
          attachmentCount: transaction.attachmentCount + 1,
        };
      }),
    };

    registersByAccountId.set(accountId, next);
    return cloneRegister(next);
  },
};
