import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

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

export interface AccountServiceDependencies {
  storage: KeyValueStoragePort;
}

const STORAGE_KEY = "budget-app.accounts.v1";
const REGISTER_STORAGE_PREFIX = "budget-app.register.";

class BrowserPersistentAccountService {
  constructor(private readonly dependencies: AccountServiceDependencies) {}

  async listAccounts(): Promise<SidebarAccount[]> {
    return normalizeAccounts(readAccounts(this.dependencies.storage));
  }

  async createAccount(input: CreateAccountInput): Promise<SidebarAccount[]> {
    const accounts = normalizeAccounts(readAccounts(this.dependencies.storage));
    const account: SidebarAccount = {
      id: createAccountId(input.name, accounts),
      name: input.name,
      type: input.type,
      startingBalance: input.startingBalance,
      createdAt: new Date().toISOString(),
      closedAt: null,
    };

    const nextAccounts = [...accounts, account];
    writeAccounts(this.dependencies.storage, nextAccounts);
    return nextAccounts;
  }

  async updateAccount(input: UpdateAccountInput): Promise<SidebarAccount[]> {
    const accounts = normalizeAccounts(readAccounts(this.dependencies.storage));
    const nextAccounts = accounts.map((account) =>
      account.id === input.id
        ? {
            ...account,
            name: input.name,
            type: input.type,
          }
        : account,
    );

    writeAccounts(this.dependencies.storage, nextAccounts);
    return nextAccounts;
  }

  async closeAccount(accountId: string): Promise<SidebarAccount[]> {
    const accounts = normalizeAccounts(readAccounts(this.dependencies.storage));
    const closedAt = new Date().toISOString();

    const nextAccounts = accounts.map((account) =>
      account.id === accountId
        ? {
            ...account,
            closedAt,
          }
        : account,
    );

    writeAccounts(this.dependencies.storage, nextAccounts);
    return nextAccounts;
  }

  async reopenAccount(accountId: string): Promise<SidebarAccount[]> {
    const accounts = normalizeAccounts(readAccounts(this.dependencies.storage));

    const nextAccounts = accounts.map((account) =>
      account.id === accountId
        ? {
            ...account,
            closedAt: null,
          }
        : account,
    );

    writeAccounts(this.dependencies.storage, nextAccounts);
    return nextAccounts;
  }

  async deleteAccount(accountId: string): Promise<DeleteAccountResult> {
    const accounts = normalizeAccounts(readAccounts(this.dependencies.storage));

    if (accountHasTransactions(this.dependencies.storage, accountId)) {
      return {
        deleted: false,
        reason: "Accounts with transactions cannot be deleted. Close the account instead.",
        accounts,
      };
    }

    const nextAccounts = accounts.filter((account) => account.id !== accountId);
    writeAccounts(this.dependencies.storage, nextAccounts);
    removeAccountRegister(this.dependencies.storage, accountId);

    return {
      deleted: true,
      accounts: nextAccounts,
    };
  }

  getAccountById(accountId: string): SidebarAccount | null {
    return normalizeAccounts(readAccounts(this.dependencies.storage)).find((account) => account.id === accountId) ?? null;
  }
}

export function createAccountService(
  dependencies: AccountServiceDependencies,
): BrowserPersistentAccountService {
  return new BrowserPersistentAccountService(dependencies);
}

export function readAccounts(storage: KeyValueStoragePort): SidebarAccount[] {
  const value = storage.getItem(STORAGE_KEY);

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

function writeAccounts(storage: KeyValueStoragePort, accounts: SidebarAccount[]): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(normalizeAccounts(accounts)));
}

function accountHasTransactions(storage: KeyValueStoragePort, accountId: string): boolean {
  const value = storage.getItem(`${REGISTER_STORAGE_PREFIX}${accountId}`);

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

function removeAccountRegister(storage: KeyValueStoragePort, accountId: string): void {
  storage.removeItem(`${REGISTER_STORAGE_PREFIX}${accountId}`);
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
