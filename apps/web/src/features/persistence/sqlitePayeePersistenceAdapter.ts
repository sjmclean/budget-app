import type { PayeePersistencePort } from "../accounts/payeePersistencePort.js";
import type { MergePayeesInput, PayeeView, RenamePayeeInput } from "../accounts/payeeService.js";
import { DEFAULT_SQLITE_BUDGET_ID } from "./sqliteAccountPersistenceAdapter.js";

export interface SqlitePayeeRecord {
  id: string;
  budgetId: string;
  name: string;
  normalizedName?: string;
  isArchived?: boolean;
  isTransfer?: boolean;
  transferAccountId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SqlitePayeeRepositoryLike {
  create(payee: SqlitePayeeRecord): Promise<void>;
  update(payee: SqlitePayeeRecord): Promise<void>;
  archive(payeeId: string): Promise<void>;
  delete(payeeId: string): Promise<void>;
  findByBudget(budgetId: string): Promise<SqlitePayeeRecord[]>;
  findActiveByBudget(budgetId: string): Promise<SqlitePayeeRecord[]>;
  findById(payeeId: string): Promise<SqlitePayeeRecord | null>;
  findByNormalizedName(budgetId: string, normalizedName: string): Promise<SqlitePayeeRecord | null>;
}

export interface SqliteTransactionPayeeUpdaterLike {
  replacePayee(fromPayeeId: string, toPayeeId: string): Promise<void>;
}

export interface SqlitePayeePersistenceAdapterOptions {
  repository: SqlitePayeeRepositoryLike;
  transactionPayeeUpdater?: SqliteTransactionPayeeUpdaterLike;
  budgetId?: string;
  now?: () => Date;
}

/**
 * SQLite-shaped implementation of the UI payee persistence port.
 *
 * The SQLite payee schema does not yet store UI usage counters, so this adapter
 * maps SQLite payees into PayeeView with conservative usage metadata. The
 * browser localStorage gateway remains the default until validation work proves
 * the SQLite behaviour end to end.
 */
export class SqlitePayeePersistenceAdapter implements PayeePersistencePort {
  private readonly budgetId: string;
  private readonly now: () => Date;

  constructor(private readonly options: SqlitePayeePersistenceAdapterOptions) {
    this.budgetId = options.budgetId ?? DEFAULT_SQLITE_BUDGET_ID;
    this.now = options.now ?? (() => new Date());
  }

  async listPayees(): Promise<PayeeView[]> {
    const payees = await this.options.repository.findActiveByBudget(this.budgetId);
    return sortPayees(payees.map(mapSqlitePayeeToPayeeView));
  }

  async listArchivedPayees(): Promise<PayeeView[]> {
    const payees = await this.options.repository.findByBudget(this.budgetId);
    return sortPayees(payees.filter((payee) => payee.isArchived).map(mapSqlitePayeeToPayeeView));
  }

  async recordPayee(name: string): Promise<PayeeView[]> {
    const trimmed = normalisePayeeName(name);

    if (!trimmed || isTransferPayee(trimmed)) {
      return this.listPayees();
    }

    const normalizedName = normalizeForLookup(trimmed);
    const existing = await this.options.repository.findByNormalizedName(this.budgetId, normalizedName);
    const now = this.now();

    if (existing) {
      await this.options.repository.update({
        ...existing,
        name: existing.name || trimmed,
        normalizedName,
        isArchived: false,
        updatedAt: now,
      });
    } else {
      const payees = await this.options.repository.findByBudget(this.budgetId);
      await this.options.repository.create({
        id: createPayeeId(trimmed, payees),
        budgetId: this.budgetId,
        name: trimmed,
        normalizedName,
        isArchived: false,
        isTransfer: false,
        transferAccountId: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    return this.listPayees();
  }

  async recordPayees(names: string[]): Promise<PayeeView[]> {
    for (const name of names) {
      await this.recordPayee(name);
    }

    return this.listPayees();
  }

  async renamePayee(input: RenamePayeeInput): Promise<PayeeView[]> {
    const nextName = normalisePayeeName(input.name);

    if (!nextName) {
      return this.listPayees();
    }

    const target = await this.options.repository.findById(input.id);

    if (!target) {
      return this.listPayees();
    }

    const normalizedName = normalizeForLookup(nextName);
    const duplicate = await this.options.repository.findByNormalizedName(this.budgetId, normalizedName);

    if (duplicate && duplicate.id !== input.id) {
      await this.options.repository.archive(target.id);
      return this.listPayees();
    }

    await this.options.repository.update({
      ...target,
      name: nextName,
      normalizedName,
      updatedAt: this.now(),
    });

    return this.listPayees();
  }

  async mergePayees(input: MergePayeesInput): Promise<PayeeView[]> {
    if (input.sourcePayeeId === input.targetPayeeId) {
      return this.listPayees();
    }

    const [source, target] = await Promise.all([
      this.options.repository.findById(input.sourcePayeeId),
      this.options.repository.findById(input.targetPayeeId),
    ]);

    if (!source || !target) {
      return this.listPayees();
    }

    if (source.budgetId !== target.budgetId) {
      throw new Error("Cannot merge payees from different budgets.");
    }

    await this.options.transactionPayeeUpdater?.replacePayee(source.id, target.id);
    await this.options.repository.archive(source.id);
    await this.options.repository.update({
      ...target,
      isArchived: false,
      updatedAt: this.now(),
    });

    return this.listPayees();
  }

  async archivePayee(payeeId: string): Promise<PayeeView[]> {
    await this.options.repository.archive(payeeId);
    return this.listPayees();
  }

  async restorePayee(payeeId: string): Promise<PayeeView[]> {
    const target = await this.options.repository.findById(payeeId);

    if (!target) {
      return this.listPayees();
    }

    await this.options.repository.update({
      ...target,
      isArchived: false,
      updatedAt: this.now(),
    });

    return this.listPayees();
  }

  async deletePayee(payeeId: string): Promise<PayeeView[]> {
    return this.archivePayee(payeeId);
  }
}

export function createSqlitePayeePersistenceAdapter(
  options: SqlitePayeePersistenceAdapterOptions,
): SqlitePayeePersistenceAdapter {
  return new SqlitePayeePersistenceAdapter(options);
}

export function mapSqlitePayeeToPayeeView(payee: SqlitePayeeRecord): PayeeView {
  const createdAt = (payee.createdAt ?? new Date(0)).toISOString();
  const updatedAt = (payee.updatedAt ?? payee.createdAt ?? new Date(0)).toISOString();

  return {
    id: payee.id,
    name: payee.name,
    createdAt,
    lastUsedAt: updatedAt,
    useCount: 1,
    isArchived: payee.isArchived === true,
  };
}

function sortPayees(payees: PayeeView[]): PayeeView[] {
  return [...payees].sort((a, b) => {
    if (b.useCount !== a.useCount) {
      return b.useCount - a.useCount;
    }

    return a.name.localeCompare(b.name);
  });
}

function normalisePayeeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function normalizeForLookup(name: string): string {
  return normalisePayeeName(name).toLocaleLowerCase();
}

function isTransferPayee(name: string): boolean {
  return normalisePayeeName(name).toLocaleLowerCase().startsWith("transfer:");
}

function createPayeeId(name: string, existingPayees: SqlitePayeeRecord[]): string {
  const base =
    normalisePayeeName(name)
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
