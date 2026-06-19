export type SidebarAccountType = "on-budget" | "credit-card" | "tracking";

export interface SidebarAccount {
  id: string;
  name: string;
  type: SidebarAccountType;
  startingBalance: number;
  createdAt: string;
}

export interface CreateAccountInput {
  name: string;
  type: SidebarAccountType;
  startingBalance: number;
}

const STORAGE_KEY = "budget-app.accounts.v1";

class BrowserPersistentAccountService {
  async listAccounts(): Promise<SidebarAccount[]> {
    return readAccounts();
  }

  async createAccount(input: CreateAccountInput): Promise<SidebarAccount[]> {
    const accounts = readAccounts();
    const account: SidebarAccount = {
      id: createAccountId(input.name, accounts),
      name: input.name,
      type: input.type,
      startingBalance: input.startingBalance,
      createdAt: new Date().toISOString(),
    };

    const nextAccounts = [...accounts, account];
    writeAccounts(nextAccounts);
    return nextAccounts;
  }

  getAccountById(accountId: string): SidebarAccount | null {
    return readAccounts().find((account) => account.id === accountId) ?? null;
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: SidebarAccount[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
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
