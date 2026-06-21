import type { AccountPersistencePort } from "../accounts/accountPersistencePort.js";
import type {
  CreateAccountInput,
  DeleteAccountResult,
  SidebarAccount,
  SidebarAccountType,
  UpdateAccountInput,
} from "../accounts/accountService.js";

export const DEFAULT_SQLITE_BUDGET_ID = "default-budget";

export interface SqliteAccountRecord {
  id: string;
  budgetId: string;
  name: string;
  type: string;
  participation: string;
  openingBalance: number;
  currentBalance: number;
}

export interface SqliteAccountRepositoryLike {
  create(account: SqliteAccountRecord): Promise<void>;
  update(account: SqliteAccountRecord): Promise<void>;
  getById(id: string): Promise<SqliteAccountRecord | null>;
  findByBudget(budgetId: string): Promise<SqliteAccountRecord[]>;
}

export interface SqliteAccountPersistenceAdapterOptions {
  repository: SqliteAccountRepositoryLike;
  budgetId?: string;
  now?: () => Date;
}

/**
 * SQLite-shaped implementation of the UI account persistence port.
 *
 * This adapter deliberately depends on a small repository-like contract instead
 * of importing better-sqlite3, Drizzle, or concrete repository classes. That
 * keeps the browser gateway unchanged while giving the future Tauri/desktop
 * runtime a safe place to wire SQLite repositories into the existing UI port.
 */
export class SqliteAccountPersistenceAdapter implements AccountPersistencePort {
  private readonly budgetId: string;
  private readonly now: () => Date;
  private cachedAccounts: SidebarAccount[] = [];

  constructor(private readonly options: SqliteAccountPersistenceAdapterOptions) {
    this.budgetId = options.budgetId ?? DEFAULT_SQLITE_BUDGET_ID;
    this.now = options.now ?? (() => new Date());
  }

  async listAccounts(): Promise<SidebarAccount[]> {
    const records = await this.options.repository.findByBudget(this.budgetId);
    this.cachedAccounts = records.map(mapSqliteAccountToSidebarAccount);
    return this.cachedAccounts;
  }

  async createAccount(input: CreateAccountInput): Promise<SidebarAccount[]> {
    const existing = await this.options.repository.findByBudget(this.budgetId);
    const nextAccount = mapCreateAccountInputToSqliteAccount({
      input,
      budgetId: this.budgetId,
      existing,
    });

    await this.options.repository.create(nextAccount);
    return this.listAccounts();
  }

  async updateAccount(input: UpdateAccountInput): Promise<SidebarAccount[]> {
    const existing = await this.options.repository.getById(input.id);

    if (!existing) {
      return this.listAccounts();
    }

    await this.options.repository.update({
      ...existing,
      name: input.name,
      type: mapSidebarAccountTypeToSqliteAccountType(input.type),
      participation: mapSidebarAccountTypeToSqliteParticipation(input.type),
    });

    return this.listAccounts();
  }

  async closeAccount(_accountId: string): Promise<SidebarAccount[]> {
    // The current SQLite account schema has no closedAt/isClosed column yet.
    // Keep this as a no-op foundation until the schema supports account closure.
    return this.listAccounts();
  }

  async reopenAccount(_accountId: string): Promise<SidebarAccount[]> {
    // The current SQLite account schema has no closedAt/isClosed column yet.
    // Keep this as a no-op foundation until the schema supports account closure.
    return this.listAccounts();
  }

  async deleteAccount(_accountId: string): Promise<DeleteAccountResult> {
    const accounts = await this.listAccounts();

    return {
      deleted: false,
      reason: "SQLite account deletion is not enabled until transaction safety checks and repository delete support exist.",
      accounts,
    };
  }

  getAccountById(accountId: string): SidebarAccount | null {
    return this.cachedAccounts.find((account) => account.id === accountId) ?? null;
  }
}

export function createSqliteAccountPersistenceAdapter(
  options: SqliteAccountPersistenceAdapterOptions,
): SqliteAccountPersistenceAdapter {
  return new SqliteAccountPersistenceAdapter(options);
}

export function mapSqliteAccountToSidebarAccount(account: SqliteAccountRecord): SidebarAccount {
  return {
    id: account.id,
    name: account.name,
    type: mapSqliteAccountToSidebarAccountType(account),
    startingBalance: account.openingBalance,
    createdAt: new Date(0).toISOString(),
    closedAt: null,
  };
}

export function mapCreateAccountInputToSqliteAccount(args: {
  input: CreateAccountInput;
  budgetId: string;
  existing: SqliteAccountRecord[];
}): SqliteAccountRecord {
  return {
    id: createAccountId(args.input.name, args.existing.map(mapSqliteAccountToSidebarAccount)),
    budgetId: args.budgetId,
    name: args.input.name,
    type: mapSidebarAccountTypeToSqliteAccountType(args.input.type),
    participation: mapSidebarAccountTypeToSqliteParticipation(args.input.type),
    openingBalance: args.input.startingBalance,
    currentBalance: args.input.startingBalance,
  };
}

function mapSqliteAccountToSidebarAccountType(account: SqliteAccountRecord): SidebarAccountType {
  if (account.type === "CreditCard") {
    return "credit-card";
  }

  if (account.participation === "OffBudget") {
    return "tracking";
  }

  return "on-budget";
}

function mapSidebarAccountTypeToSqliteAccountType(type: SidebarAccountType): string {
  if (type === "credit-card") {
    return "CreditCard";
  }

  return "Checking";
}

function mapSidebarAccountTypeToSqliteParticipation(type: SidebarAccountType): string {
  return type === "tracking" ? "OffBudget" : "OnBudget";
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
