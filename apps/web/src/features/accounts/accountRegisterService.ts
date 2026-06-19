import type {
  AccountRegisterService,
  AccountRegisterView,
  NewRegisterTransactionInput,
  RegisterTransactionView,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";
import { accountService, type SidebarAccountType } from "./accountService";

const STORAGE_KEY = "budget-app.account-registers.v1";

type StoredRegisters = Record<string, AccountRegisterView>;

/**
 * Browser-facing register service boundary.
 *
 * This implementation intentionally does not use the old demo/mock register data.
 * It persists user-created register data to browser localStorage so the web app can
 * exercise real load/save behaviour while the desktop SQLite bridge is being wired.
 *
 * Desktop target:
 * React -> this service port -> Tauri invoke -> application services -> repositories -> SQLite.
 */
class BrowserPersistentAccountRegisterService implements AccountRegisterService {
  async getAccountRegisterView(input: { accountId: string }): Promise<AccountRegisterView> {
    const registers = readRegisters();
    const register = registers[input.accountId] ?? createEmptyRegister(input.accountId);

    if (!registers[input.accountId]) {
      registers[input.accountId] = register;
      writeRegisters(registers);
    }

    return cloneRegister(recalculateRegister(register));
  }

  async addTransaction(input: {
    accountId: string;
    transaction: NewRegisterTransactionInput;
  }): Promise<AccountRegisterView> {
    return updateRegister(input.accountId, (register) => {
      register.transactions.unshift({
        id: createId(),
        date: input.transaction.date,
        flag: null,
        attachmentCount: 0,
        payee: input.transaction.payee,
        category: input.transaction.category,
        memo: input.transaction.memo,
        inflow: input.transaction.inflow,
        outflow: input.transaction.outflow,
        runningBalance: 0,
        cleared: false,
        reconciled: false,
      });
    });
  }

  async updateTransaction(input: {
    accountId: string;
    transaction: UpdateRegisterTransactionInput;
  }): Promise<AccountRegisterView> {
    return updateRegister(input.accountId, (register) => {
      register.transactions = register.transactions.map((transaction) => {
        if (transaction.id !== input.transaction.id) {
          return transaction;
        }

        return {
          ...transaction,
          date: input.transaction.date,
          payee: input.transaction.payee,
          category: input.transaction.category,
          memo: input.transaction.memo,
          inflow: input.transaction.inflow,
          outflow: input.transaction.outflow,
        };
      });
    });
  }

  async toggleCleared(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView> {
    return updateRegister(input.accountId, (register) => {
      register.transactions = register.transactions.map((transaction) => {
        if (transaction.id !== input.transactionId || transaction.reconciled) {
          return transaction;
        }

        return {
          ...transaction,
          cleared: !transaction.cleared,
        };
      });
    });
  }

  async deleteTransaction(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView> {
    return updateRegister(input.accountId, (register) => {
      register.transactions = register.transactions.filter(
        (transaction) => transaction.id !== input.transactionId,
      );
    });
  }

  async addAttachmentPlaceholder(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView> {
    return updateRegister(input.accountId, (register) => {
      register.transactions = register.transactions.map((transaction) => {
        if (transaction.id !== input.transactionId) {
          return transaction;
        }

        return {
          ...transaction,
          attachmentCount: Math.max(1, transaction.attachmentCount ?? 0),
        };
      });
    });
  }
}

export const accountRegisterService: AccountRegisterService =
  new BrowserPersistentAccountRegisterService();

function updateRegister(
  accountId: string,
  updater: (register: AccountRegisterView) => void,
): AccountRegisterView {
  const registers = readRegisters();
  const register = cloneRegister(registers[accountId] ?? createEmptyRegister(accountId));

  updater(register);

  const recalculated = recalculateRegister(register);
  registers[accountId] = recalculated;
  writeRegisters(registers);

  return cloneRegister(recalculated);
}

function createEmptyRegister(accountId: string): AccountRegisterView {
  const account = accountService.getAccountById(accountId);
  const openingBalance = account?.startingBalance ?? 0;

  return {
    accountId,
    accountName: account?.name ?? "Account",
    accountType: mapAccountType(account?.type ?? "on-budget"),
    currencyCode: "AUD",
    clearedBalance: 0,
    unclearedBalance: 0,
    workingBalance: 0,
    transactions:
      openingBalance === 0
        ? []
        : [
            {
              id: `${accountId}-opening-balance`,
              date: new Date().toISOString().slice(0, 10),
              flag: null,
              attachmentCount: 0,
              payee: "Starting Balance",
              category: "Ready to Assign",
              memo: "Opening balance",
              inflow: openingBalance > 0 ? openingBalance : 0,
              outflow: openingBalance < 0 ? Math.abs(openingBalance) : 0,
              runningBalance: 0,
              cleared: true,
              reconciled: false,
            },
          ],
  };
}

function mapAccountType(type: SidebarAccountType): AccountRegisterView["accountType"] {
  if (type === "credit-card") return "Credit card";
  if (type === "tracking") return "Tracking";
  return "On budget";
}

function recalculateRegister(register: AccountRegisterView): AccountRegisterView {
  const chronological = [...register.transactions].sort(compareChronologically);
  const runningBalanceById = new Map<string, number>();
  let runningBalance = 0;

  for (const transaction of chronological) {
    runningBalance += transaction.inflow - transaction.outflow;
    runningBalanceById.set(transaction.id, runningBalance);
  }

  const transactions = register.transactions
    .map((transaction) => ({
      ...transaction,
      attachmentCount: transaction.attachmentCount ?? 0,
      runningBalance: runningBalanceById.get(transaction.id) ?? 0,
    }))
    .sort(compareForRegisterDisplay);

  const clearedBalance = transactions
    .filter((transaction) => transaction.cleared || transaction.reconciled)
    .reduce((sum, transaction) => sum + transaction.inflow - transaction.outflow, 0);

  const workingBalance = transactions.reduce(
    (sum, transaction) => sum + transaction.inflow - transaction.outflow,
    0,
  );

  return {
    ...register,
    clearedBalance,
    unclearedBalance: workingBalance - clearedBalance,
    workingBalance,
    transactions,
  };
}

function readRegisters(): StoredRegisters {
  if (typeof window === "undefined") {
    return {};
  }

  const value = window.localStorage.getItem(STORAGE_KEY);

  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as StoredRegisters;
  } catch {
    return {};
  }
}

function writeRegisters(registers: StoredRegisters): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(registers));
}

function cloneRegister(register: AccountRegisterView): AccountRegisterView {
  return {
    ...register,
    transactions: register.transactions.map((transaction) => ({ ...transaction })),
  };
}

function compareChronologically(a: RegisterTransactionView, b: RegisterTransactionView): number {
  const dateCompare = a.date.localeCompare(b.date);
  if (dateCompare !== 0) return dateCompare;
  return a.id.localeCompare(b.id);
}

function compareForRegisterDisplay(a: RegisterTransactionView, b: RegisterTransactionView): number {
  const dateCompare = b.date.localeCompare(a.date);
  if (dateCompare !== 0) return dateCompare;
  return b.id.localeCompare(a.id);
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
