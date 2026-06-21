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
  findByBudget(budgetId: string): Promise<Account[]>;
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
  findByAccount(accountId: string): Promise<Transaction[]>;
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
 * v1.35 introduced standard transaction persistence. v1.36 extends the
 * foundation to transfer mutation so the two-account register workflow can be
 * validated without browser/localStorage dependencies. Splits and attachment
 * mutation remain deliberately guarded until their SQLite domain behaviours are
 * migrated and validated.
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
    assertSupportedMutation(input.transaction);

    const account = await this.requireAccount(input.accountId);

    if (isTransferPayee(input.transaction.payee)) {
      const targetAccount = await this.requireTransferAccount(account, input.transaction.payee);
      const now = this.now();
      const amount = Math.abs(toSignedAmount(input.transaction));

      if (amount <= 0) {
        throw new Error("SQLite register adapter transfer amount must be non-zero.");
      }

      const sourceAmount = input.transaction.inflow > 0 ? amount : -amount;
      const targetAmount = -sourceAmount;

      await this.options.transactionRepository.create(createTransferTransaction({
        id: this.createId(),
        budgetId: account.budgetId,
        accountId: account.id,
        transferAccountId: targetAccount.id,
        date: input.transaction.date,
        memo: input.transaction.memo ?? null,
        amount: sourceAmount,
        now,
      }));

      await this.options.transactionRepository.create(createTransferTransaction({
        id: this.createId(),
        budgetId: account.budgetId,
        accountId: targetAccount.id,
        transferAccountId: account.id,
        date: input.transaction.date,
        memo: input.transaction.memo ?? null,
        amount: targetAmount,
        now,
      }));

      return this.getAccountRegisterView({ accountId: input.accountId });
    }

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
    assertSupportedMutation(input.transaction);

    const existing = await this.options.transactionRepository.getById(input.transaction.id);

    if (!existing || existing.accountId !== input.accountId || existing.isDeleted) {
      return this.getAccountRegisterView({ accountId: input.accountId });
    }

    const account = await this.requireAccount(input.accountId);

    if (existing.type === TransactionType.Transfer || existing.transferAccountId) {
      const targetAccount = await this.requireTransferAccount(account, input.transaction.payee);
      const opposite = await this.findOpposingTransfer(existing);
      const amount = Math.abs(toSignedAmount(input.transaction));

      if (amount <= 0) {
        throw new Error("SQLite register adapter transfer amount must be non-zero.");
      }

      const sourceAmount = input.transaction.inflow > 0 ? amount : -amount;
      const now = this.now();

      await this.options.transactionRepository.update({
        ...existing,
        transferAccountId: targetAccount.id,
        date: input.transaction.date,
        memo: input.transaction.memo ?? null,
        amount: sourceAmount,
        updatedAt: now,
      });

      if (opposite) {
        await this.options.transactionRepository.update({
          ...opposite,
          transferAccountId: account.id,
          date: input.transaction.date,
          memo: input.transaction.memo ?? null,
          amount: -sourceAmount,
          updatedAt: now,
        });
      }

      return this.getAccountRegisterView({ accountId: input.accountId });
    }

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

    const nextClearedStatus =
      existing.clearedStatus === ClearedStatus.Cleared
        ? ClearedStatus.Uncleared
        : ClearedStatus.Cleared;
    const updatedAt = this.now();

    await this.options.transactionRepository.update({
      ...existing,
      clearedStatus: nextClearedStatus,
      updatedAt,
    });

    const opposite = await this.findOpposingTransfer(existing);

    if (opposite && opposite.clearedStatus !== ClearedStatus.Reconciled) {
      await this.options.transactionRepository.update({
        ...opposite,
        clearedStatus: nextClearedStatus,
        updatedAt,
      });
    }

    return this.getAccountRegisterView({ accountId: input.accountId });
  }

  async deleteTransaction(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView> {
    const existing = await this.options.transactionRepository.getById(input.transactionId);

    if (existing && existing.accountId === input.accountId && !existing.isDeleted) {
      await this.options.transactionRepository.softDelete(input.transactionId);

      const opposite = await this.findOpposingTransfer(existing);

      if (opposite && !opposite.isDeleted) {
        await this.options.transactionRepository.softDelete(opposite.id);
      }
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

  async reassignPayeeReferences(input: {
    accountId: string;
    sourcePayeeId: string;
    sourceName: string;
    targetPayeeId: string;
    targetName: string;
  }): Promise<AccountRegisterView> {
    // SQLite merge reassignment is handled by SqlitePayeePersistenceAdapter when
    // it is composed with a transaction payee updater. The register adapter only
    // refreshes its read model for the current account.
    return this.getAccountRegisterView({ accountId: input.accountId });
  }

  private async requireAccount(accountId: string): Promise<Account> {
    const account = await this.options.accountRepository.getById(accountId);

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    return account;
  }

  private async requireTransferAccount(sourceAccount: Account, payeeName: string): Promise<Account> {
    const transferAccountName = getTransferAccountName(payeeName);
    const accounts = await this.options.accountRepository.findByBudget(sourceAccount.budgetId);
    const targetAccount = accounts.find(
      (account) =>
        account.id !== sourceAccount.id &&
        normalizeForLookup(account.name) === normalizeForLookup(transferAccountName),
    );

    if (!targetAccount) {
      throw new Error(`Transfer account not found: ${transferAccountName}`);
    }

    return targetAccount;
  }

  private async findOpposingTransfer(transaction: Transaction): Promise<Transaction | null> {
    if (!transaction.transferAccountId) {
      return null;
    }

    const candidates = await this.options.transactionRepository.findByAccount(transaction.transferAccountId);

    return candidates.find(
      (candidate) =>
        candidate.id !== transaction.id &&
        !candidate.isDeleted &&
        candidate.type === TransactionType.Transfer &&
        candidate.transferAccountId === transaction.accountId &&
        candidate.date === transaction.date &&
        candidate.amount === -transaction.amount,
    ) ?? null;
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

function assertSupportedMutation(input: NewRegisterTransactionInput | UpdateRegisterTransactionInput): void {
  if (input.splitLines && input.splitLines.length > 0) {
    throw new Error("SQLite register adapter v1.35 does not support split transaction mutation yet.");
  }

}

function createTransferTransaction(input: {
  id: string;
  budgetId: string;
  accountId: string;
  transferAccountId: string;
  date: string;
  memo: string | null;
  amount: number;
  now: Date;
}): Transaction {
  return {
    id: input.id,
    budgetId: input.budgetId,
    accountId: input.accountId,
    payeeId: null,
    categoryId: null,
    transferAccountId: input.transferAccountId,
    type: TransactionType.Transfer,
    date: input.date,
    memo: input.memo,
    amount: input.amount,
    clearedStatus: ClearedStatus.Uncleared,
    isDeleted: false,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function getTransferAccountName(payeeName: string): string {
  return normaliseName(payeeName).replace(/^transfer\s*:\s*/i, "");
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
