import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import { createAccountEntity, createAccountEntityRepository, projectAccount, timestampFor, tombstoneAccountEntity, updateAccountEntity } from "./entities/accountEntity.js";

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
  id?: string;
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

const REGISTER_STORAGE_PREFIX = "budget-app.register.";

class BrowserPersistentAccountService {
  private writeCounter = 0;
  constructor(private readonly dependencies: AccountServiceDependencies) {}

  private repository() { return createAccountEntityRepository(this.dependencies.storage); }
  private timestamp() { return timestampFor(new Date(), this.writeCounter++); }

  async listAccounts(): Promise<SidebarAccount[]> { return readAccounts(this.dependencies.storage); }

  async createAccount(input: CreateAccountInput): Promise<SidebarAccount[]> {
    const accounts = readAccounts(this.dependencies.storage);
    const account: SidebarAccount = { id: input.id ?? createAccountId(input.name, accounts), name: input.name, type: input.type, startingBalance: input.startingBalance, createdAt: new Date().toISOString(), closedAt: null };
    this.repository().save(createAccountEntity(account, this.timestamp()));
    return readAccounts(this.dependencies.storage);
  }

  async updateAccount(input: UpdateAccountInput): Promise<SidebarAccount[]> {
    const repository = this.repository();
    const entity = repository.get(input.id);
    if (entity) repository.save(updateAccountEntity(entity, { name: input.name, type: input.type }, this.timestamp()));
    return readAccounts(this.dependencies.storage);
  }

  async closeAccount(accountId: string): Promise<SidebarAccount[]> {
    const repository = this.repository(); const entity = repository.get(accountId);
    if (entity) repository.save(updateAccountEntity(entity, { closedAt: new Date().toISOString() }, this.timestamp()));
    return readAccounts(this.dependencies.storage);
  }

  async reopenAccount(accountId: string): Promise<SidebarAccount[]> {
    const repository = this.repository(); const entity = repository.get(accountId);
    if (entity) repository.save(updateAccountEntity(entity, { closedAt: null }, this.timestamp()));
    return readAccounts(this.dependencies.storage);
  }

  async deleteAccount(accountId: string): Promise<DeleteAccountResult> {
    const accounts = readAccounts(this.dependencies.storage);
    if (accountHasTransactions(this.dependencies.storage, accountId)) return { deleted: false, reason: "Accounts with transactions cannot be deleted. Close the account instead.", accounts };
    const repository = this.repository(); const entity = repository.get(accountId);
    if (entity) repository.save(tombstoneAccountEntity(entity, this.timestamp()));
    removeAccountRegister(this.dependencies.storage, accountId);
    return { deleted: true, accounts: readAccounts(this.dependencies.storage) };
  }

  getAccountById(accountId: string): SidebarAccount | null {
    const entity = this.repository().get(accountId);
    return entity && entity.metadata.tombstone === null ? projectAccount(entity) : null;
  }
}

export function createAccountService(
  dependencies: AccountServiceDependencies,
): BrowserPersistentAccountService {
  return new BrowserPersistentAccountService(dependencies);
}

export function readAccounts(storage: KeyValueStoragePort): SidebarAccount[] {
  return createAccountEntityRepository(storage).list().map(projectAccount);
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
