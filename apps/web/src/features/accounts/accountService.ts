export type SidebarAccountType = "on-budget" | "credit-card" | "tracking";

export interface SidebarAccount {
  id: string;
  name: string;
  type: SidebarAccountType;
  startingBalance: number;
  createdAt: string;
  closedAt?: string | null;
}

export interface CreateAccountInput {
  name: string;
  type: SidebarAccountType;
  startingBalance: number;
}

export interface UpdateAccountInput {
  id: string;
  name: string;
  type: SidebarAccountType;
}

export interface DeleteAccountResult {
  deleted: boolean;
  reason?: string;
  accounts: SidebarAccount[];
}

const STORAGE_KEY = "budget-app.accounts.v1";
const REGISTER_STORAGE_PREFIX = "budget-app.register.";

class BrowserPersistentAccountService {
  async listAccounts(): Promise<SidebarAccount[]> {
    return normalizeAccounts(readAccounts());
  }

  async createAccount(input: CreateAccountInput): Promise<SidebarAccount[]> {
    const accounts = normalizeAccounts(readAccounts());
    const account: SidebarAccount = {
      id: createAccountId(input.name, accounts),
      name: input.name,
      type: input.type,
      startingBalance: input.startingBalance,
      createdAt: new Date().toISOString(),
      closedAt: null,
    };

    const nextAccounts = [...accounts, account];
    writeAccounts(nextAccounts);
    return nextAccounts;
  }

  async updateAccount(input: UpdateAccountInput): Promise<SidebarAccount[]> {
    const accounts = normalizeAccounts(readAccounts());
    const nextAccounts = accounts.map((account) =>
      account.id === input.id
        ? {
            ...account,
            name: input.name,
            type: input.type,
          }
        : account,
    );

    writeAccounts(nextAccounts);
    return nextAccounts;
  }

  async closeAccount(accountId: string): Promise<SidebarAccount[]> {
    const accounts = normalizeAccounts(readAccounts());
    const closedAt = new Date().toISOString();

    const nextAccounts = accounts.map((account) =>
      account.id === accountId
        ? {
            ...account,
            closedAt,
          }
        : account,
    );

    writeAccounts(nextAccounts);
    return nextAccounts;
  }

  async reopenAccount(accountId: string): Promise<SidebarAccount[]> {
    const accounts = normalizeAccounts(readAccounts());

    const nextAccounts = accounts.map((account) =>
      account.id === accountId
        ? {
            ...account,
            closedAt: null,
          }
        : account,
    );

    writeAccounts(nextAccounts);
    return nextAccounts;
  }

  async deleteAccount(accountId: string): Promise<DeleteAccountResult> {
    const accounts = normalizeAccounts(readAccounts());

    if (accountHasTransactions(accountId)) {
      return {
        deleted: false,
        reason: "Accounts with transactions cannot be deleted. Close the account instead.",
        accounts,
      };
    }

    const nextAccounts = accounts.filter((account) => account.id !== accountId);
    writeAccounts(nextAccounts);
    removeAccountRegister(accountId);

    return {
      deleted: true,
      accounts: nextAccounts,
    };
  }

  getAccountById(accountId: string): SidebarAccount | null {
    return normalizeAccounts(readAccounts()).find((account) => account.id === accountId) ?? null;
  }
}

export const accountService = new BrowserPersistentAccountService();

export function readAccounts(): SidebarAccount[] {
  if (typeof window === "undefined") {
    return [];
  }

  const value = window.localStorage.getItem(STORAGE_KEY);

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as SidebarAccount[];
    return Array.isArray(parsed) ? normalizeAccounts(parsed) : [];
  } catch {
    return [];
  }
}

function normalizeAccounts(accounts: SidebarAccount[]): SidebarAccount[] {
  return accounts.map((account) => ({
    ...account,
    closedAt: account.closedAt ?? null,
  }));
}

function writeAccounts(accounts: SidebarAccount[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAccounts(accounts)));
}

function accountHasTransactions(accountId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const value = window.localStorage.getItem(`${REGISTER_STORAGE_PREFIX}${accountId}`);

  if (!value) {
    return false;
  }

  try {
    const parsed = JSON.parse(value) as { transactions?: unknown[] };
    return Array.isArray(parsed.transactions) && parsed.transactions.length > 0;
  } catch {
    return false;
  }
}

function removeAccountRegister(accountId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(`${REGISTER_STORAGE_PREFIX}${accountId}`);
}

function createAccountId(name: string, existingAccounts: SidebarAccount[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "account";

  const existingIds = new Set(existingAccounts.map((account) => account.id));

  if (!existingIds.has(base)) {
    return base;
  }

  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) {
    counter += 1;
  }

  return `${base}-${counter}`;
}