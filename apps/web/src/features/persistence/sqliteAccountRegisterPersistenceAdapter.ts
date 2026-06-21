import type {
  AccountRegisterPersistencePort,
  AccountRegisterView,
  NewRegisterTransactionInput,
  UpdateRegisterTransactionInput,
} from "../accounts/accountRegisterPersistencePort.js";
import type { Account } from "../../../../../packages/types/src/Account.js";
import { ClearedStatus } from "../../../../../packages/types/src/ClearedStatus.js";
import type { Payee } from "../../../../../packages/types/src/Payee.js";
import type { Transaction } from "../../../../../packages/types/src/Transaction.js";
import { TransactionType } from "../../../../../packages/types/src/TransactionType.js";
import type { AccountRegisterApplicationService } from "../../../../../packages/application/src/AccountRegisterApplicationService.js";

export interface SqliteAccountRegisterAccountRepositoryLike {
  getById(id: string): Promise<Account | null>;
}

export interface SqliteAccountRegisterPayeeRepositoryLike {
  create(payee: Payee): Promise<void>;
  findByBudget(budgetId: string): Promise<Payee[]>;
  findByNormalizedName(budgetId: string, normalizedName: string): Promise<Payee | null>;
}

export interface SqliteAccountRegisterTransactionRepositoryLike {
  create(transaction: Transaction): Promise<void>;
  update(transaction: Transaction): Promise<void>;
  getById(id: string): Promise<Transaction | null>;
  softDelete(id: string): Promise<void>;
}

export interface SqliteAccountRegisterPersistenceAdapterOptions {
  accountRepository: SqliteAccountRegisterAccountRepositoryLike;
  payeeRepository: SqliteAccountRegisterPayeeRepositoryLike;
  transactionRepository: SqliteAccountRegisterTransactionRepositoryLike;
  registerApplicationService: Pick<AccountRegisterApplicationService, "getAccountRegisterView">;
  now?: () => Date;
  createId?: () => string;
}

/**
 * SQLite-backed foundation for the account register UI persistence port.
 *
 * v1.35 intentionally implements standard transaction persistence first. It
 * avoids browser/localStorage dependencies and writes through repository-shaped
 * contracts so a desktop/Tauri runtime can compose real SQLite repositories.
 * Transfers, splits, and attachment mutation are deliberately guarded until the
 * corresponding SQLite domain behaviours are migrated and validated.
 */
export class SqliteAccountRegisterPersistenceAdapter implements AccountRegisterPersistencePort {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(private readonly options: SqliteAccountRegisterPersistenceAdapterOptions) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createFallbackId;
  }

  async getAccountRegisterView(input: { accountId: string }): Promise<AccountRegisterView> {
    return this.options.registerApplicationService.getAccountRegisterView(input);
  }

  async addTransaction(input: {
    accountId: string;
    transaction: NewRegisterTransactionInput;
  }): Promise<AccountRegisterView> {
    assertSupportedStandardTransaction(input.transaction);

    const account = await this.requireAccount(input.accountId);
    const payeeId = await this.resolvePayeeId(account.budgetId, input.transaction.payee, input.transaction.payeeId);
    const now = this.now();

    await this.options.transactionRepository.create({
      id: this.createId(),
      budgetId: account.budgetId,
      accountId: account.id,
      payeeId,
      categoryId: input.transaction.categoryId ?? null,
      transferAccountId: null,
      type: TransactionType.Standard,
      date: input.transaction.date,
      memo: input.transaction.memo ?? null,
      amount: toSignedAmount(input.transaction),
      clearedStatus: ClearedStatus.Uncleared,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    return this.getAccountRegisterView({ accountId: input.accountId });
  }

  async updateTransaction(input: {
    accountId: string;
    transaction: UpdateRegisterTransactionInput;
  }): Promise<AccountRegisterView> {
    assertSupportedStandardTransaction(input.transaction);

    const existing = await this.options.transactionRepository.getById(input.transaction.id);

    if (!existing || existing.accountId !== input.accountId || existing.isDeleted) {
      return this.getAccountRegisterView({ accountId: input.accountId });
    }

    if (existing.type !== TransactionType.Standard || existing.transferAccountId) {
      throw new Error("SQLite register adapter v1.35 only updates standard transactions.");
    }

    const account = await this.requireAccount(input.accountId);
    const payeeId = await this.resolvePayeeId(account.budgetId, input.transaction.payee, input.transaction.payeeId);

    await this.options.transactionRepository.update({
      ...existing,
      payeeId,
      categoryId: input.transaction.categoryId ?? null,
      date: input.transaction.date,
      memo: input.transaction.memo ?? null,
      amount: toSignedAmount(input.transaction),
      updatedAt: this.now(),
    });

    return this.getAccountRegisterView({ accountId: input.accountId });
  }

  async toggleCleared(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView> {
    const existing = await this.options.transactionRepository.getById(input.transactionId);

    if (!existing || existing.accountId !== input.accountId || existing.isDeleted) {
      return this.getAccountRegisterView({ accountId: input.accountId });
    }

    if (existing.clearedStatus === ClearedStatus.Reconciled) {
      return this.getAccountRegisterView({ accountId: input.accountId });
    }

    await this.options.transactionRepository.update({
      ...existing,
      clearedStatus:
        existing.clearedStatus === ClearedStatus.Cleared
          ? ClearedStatus.Uncleared
          : ClearedStatus.Cleared,
      updatedAt: this.now(),
    });

    return this.getAccountRegisterView({ accountId: input.accountId });
  }

  async deleteTransaction(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView> {
    const existing = await this.options.transactionRepository.getById(input.transactionId);

    if (existing && existing.accountId === input.accountId && !existing.isDeleted) {
      await this.options.transactionRepository.softDelete(input.transactionId);
    }

    return this.getAccountRegisterView({ accountId: input.accountId });
  }

  async addAttachment(): Promise<AccountRegisterView> {
    throw new Error("SQLite register adapter v1.35 does not support attachment mutation yet.");
  }

  async removeAttachment(): Promise<AccountRegisterView> {
    throw new Error("SQLite register adapter v1.35 does not support attachment mutation yet.");
  }

  async renamePayeeReferences(input: {
    accountId: string;
    payeeId: string;
    previousName: string;
    nextName: string;
  }): Promise<AccountRegisterView> {
    // SQLite transactions reference payees by id. Once the payee row is renamed,
    // the register read model resolves the new display name through PayeeRepository.
    return this.getAccountRegisterView({ accountId: input.accountId });
  }

  private async requireAccount(accountId: string): Promise<Account> {
    const account = await this.options.accountRepository.getById(accountId);

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    return account;
  }

  private async resolvePayeeId(
    budgetId: string,
    payeeName: string,
    preferredPayeeId?: string,
  ): Promise<string | null> {
    const trimmed = normaliseName(payeeName);

    if (!trimmed || isTransferPayee(trimmed)) {
      return preferredPayeeId ?? null;
    }

    if (preferredPayeeId) {
      return preferredPayeeId;
    }

    const normalizedName = normalizeForLookup(trimmed);
    const existing = await this.options.payeeRepository.findByNormalizedName(budgetId, normalizedName);

    if (existing) {
      return existing.id;
    }

    const payees = await this.options.payeeRepository.findByBudget(budgetId);
    const now = this.now();
    const payee: Payee = {
      id: createPayeeId(trimmed, payees),
      budgetId,
      name: trimmed,
      normalizedName,
      isArchived: false,
      isTransfer: false,
      transferAccountId: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.options.payeeRepository.create(payee);
    return payee.id;
  }
}

export function createSqliteAccountRegisterPersistenceAdapter(
  options: SqliteAccountRegisterPersistenceAdapterOptions,
): SqliteAccountRegisterPersistenceAdapter {
  return new SqliteAccountRegisterPersistenceAdapter(options);
}

function assertSupportedStandardTransaction(input: NewRegisterTransactionInput | UpdateRegisterTransactionInput): void {
  if (input.splitLines && input.splitLines.length > 0) {
    throw new Error("SQLite register adapter v1.35 does not support split transaction mutation yet.");
  }

  if (isTransferPayee(input.payee)) {
    throw new Error("SQLite register adapter v1.35 does not support transfer mutation yet.");
  }
}

function toSignedAmount(input: NewRegisterTransactionInput | UpdateRegisterTransactionInput): number {
  return input.inflow - input.outflow;
}

function normaliseName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function normalizeForLookup(name: string): string {
  return normaliseName(name).toLocaleLowerCase();
}

function isTransferPayee(name: string): boolean {
  return normaliseName(name).toLocaleLowerCase().startsWith("transfer:");
}

function createPayeeId(name: string, existingPayees: Payee[]): string {
  const base =
    normaliseName(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "payee";

  const existingIds = new Set(existingPayees.map((payee) => payee.id));

  if (!existingIds.has(base)) {
    return base;
  }

  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) {
    counter += 1;
  }

  return `${base}-${counter}`;
}

function createFallbackId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  if (randomUuid) {
    return randomUuid;
  }

  return `transaction-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
