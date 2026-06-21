import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

export interface PayeeView {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
  isArchived?: boolean;
}

export interface RenamePayeeInput {
  id: string;
  name: string;
}

export interface MergePayeesInput {
  sourcePayeeId: string;
  targetPayeeId: string;
}

export interface PayeeServiceDependencies {
  storage: KeyValueStoragePort;
}

const STORAGE_KEY = "budget-app.payees.v1";

class BrowserPersistentPayeeService {
  constructor(private readonly dependencies: PayeeServiceDependencies) {}

  async listPayees(): Promise<PayeeView[]> {
    return sortPayees(readPayees(this.dependencies.storage).filter((payee) => !payee.isArchived));
  }

  async recordPayee(name: string): Promise<PayeeView[]> {
    const trimmed = normalisePayeeName(name);

    if (!trimmed || isTransferPayee(trimmed)) {
      return sortPayees(readPayees(this.dependencies.storage).filter((payee) => !payee.isArchived));
    }

    const payees = readPayees(this.dependencies.storage);
    const existing = payees.find((payee) => samePayee(payee.name, trimmed));
    const now = new Date().toISOString();

    const nextPayees = existing
      ? payees.map((payee) =>
          payee.id === existing.id
            ? {
                ...payee,
                name: payee.name || trimmed,
                lastUsedAt: now,
                useCount: payee.useCount + 1,
                isArchived: false,
              }
            : payee,
        )
      : [
          ...payees,
          {
            id: createPayeeId(trimmed, payees),
            name: trimmed,
            createdAt: now,
            lastUsedAt: now,
            useCount: 1,
            isArchived: false,
          },
        ];

    writePayees(this.dependencies.storage, nextPayees);
    return sortPayees(nextPayees.filter((payee) => !payee.isArchived));
  }

  async recordPayees(names: string[]): Promise<PayeeView[]> {
    let latest = readPayees(this.dependencies.storage);

    for (const name of names) {
      await this.recordPayee(name);
      latest = readPayees(this.dependencies.storage);
    }

    return sortPayees(latest.filter((payee) => !payee.isArchived));
  }

  async renamePayee(input: RenamePayeeInput): Promise<PayeeView[]> {
    const nextName = normalisePayeeName(input.name);

    if (!nextName) {
      return sortPayees(readPayees(this.dependencies.storage).filter((payee) => !payee.isArchived));
    }

    const payees = readPayees(this.dependencies.storage);
    const target = payees.find((payee) => payee.id === input.id);

    if (!target) {
      return sortPayees(payees.filter((payee) => !payee.isArchived));
    }

    const duplicate = payees.find(
      (payee) => payee.id !== input.id && samePayee(payee.name, nextName),
    );

    if (duplicate) {
      const merged = payees
        .filter((payee) => payee.id !== input.id)
        .map((payee) =>
          payee.id === duplicate.id
            ? {
                ...payee,
                name: duplicate.name,
                lastUsedAt: maxIsoDate(payee.lastUsedAt, target.lastUsedAt),
                useCount: payee.useCount + target.useCount,
              }
            : payee,
        );

      writePayees(this.dependencies.storage, merged);
      return sortPayees(merged.filter((payee) => !payee.isArchived));
    }

    const renamed = payees.map((payee) =>
      payee.id === input.id ? { ...payee, name: nextName } : payee,
    );

    writePayees(this.dependencies.storage, renamed);
    return sortPayees(renamed.filter((payee) => !payee.isArchived));
  }

  async mergePayees(input: MergePayeesInput): Promise<PayeeView[]> {
    if (input.sourcePayeeId === input.targetPayeeId) {
      return sortPayees(readPayees(this.dependencies.storage).filter((payee) => !payee.isArchived));
    }

    const payees = readPayees(this.dependencies.storage);
    const source = payees.find((payee) => payee.id === input.sourcePayeeId);
    const target = payees.find((payee) => payee.id === input.targetPayeeId);

    if (!source || !target) {
      return sortPayees(payees.filter((payee) => !payee.isArchived));
    }

    const nextPayees = payees.map((payee) => {
      if (payee.id === source.id) {
        return { ...payee, isArchived: true };
      }

      if (payee.id === target.id) {
        return {
          ...payee,
          isArchived: false,
          lastUsedAt: maxIsoDate(payee.lastUsedAt, source.lastUsedAt),
          useCount: payee.useCount + source.useCount,
        };
      }

      return payee;
    });

    writePayees(this.dependencies.storage, nextPayees);
    return sortPayees(nextPayees.filter((payee) => !payee.isArchived));
  }

  async archivePayee(payeeId: string): Promise<PayeeView[]> {
    const nextPayees = readPayees(this.dependencies.storage).map((payee) =>
      payee.id === payeeId ? { ...payee, isArchived: true } : payee,
    );

    writePayees(this.dependencies.storage, nextPayees);
    return sortPayees(nextPayees.filter((payee) => !payee.isArchived));
  }

  async restorePayee(payeeId: string): Promise<PayeeView[]> {
    const nextPayees = readPayees(this.dependencies.storage).map((payee) =>
      payee.id === payeeId ? { ...payee, isArchived: false } : payee,
    );

    writePayees(this.dependencies.storage, nextPayees);
    return sortPayees(nextPayees.filter((payee) => !payee.isArchived));
  }

  async listArchivedPayees(): Promise<PayeeView[]> {
    return sortPayees(readPayees(this.dependencies.storage).filter((payee) => payee.isArchived));
  }

  async deletePayee(payeeId: string): Promise<PayeeView[]> {
    return this.archivePayee(payeeId);
  }

  findPayeeByName(name: string): PayeeView | undefined {
    return findPayeeByName(this.dependencies.storage, name);
  }

  findPayeeIdByName(name: string): string | undefined {
    return this.findPayeeByName(name)?.id;
  }
}

export function createPayeeService(
  dependencies: PayeeServiceDependencies,
): BrowserPersistentPayeeService {
  return new BrowserPersistentPayeeService(dependencies);
}

export function findPayeeByName(storage: KeyValueStoragePort, name: string): PayeeView | undefined {
  const normalised = normalisePayeeName(name).toLocaleLowerCase();

  if (!normalised || isTransferPayee(name)) {
    return undefined;
  }

  return readPayees(storage).find(
    (payee) =>
      !payee.isArchived && normalisePayeeName(payee.name).toLocaleLowerCase() === normalised,
  );
}

export function findPayeeIdByName(storage: KeyValueStoragePort, name: string): string | undefined {
  return findPayeeByName(storage, name)?.id;
}

export function readPayees(storage: KeyValueStoragePort): PayeeView[] {
  const value = storage.getItem(STORAGE_KEY);

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as PayeeView[];
    return Array.isArray(parsed) ? normalisePayees(parsed) : [];
  } catch {
    return [];
  }
}

function writePayees(storage: KeyValueStoragePort, payees: PayeeView[]): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(sortPayees(normalisePayees(payees))));
}

function normalisePayees(payees: PayeeView[]): PayeeView[] {
  return payees
    .filter((payee) => typeof payee.name === "string" && payee.name.trim().length > 0)
    .map((payee) => ({
      id: payee.id || createPayeeId(payee.name, []),
      name: normalisePayeeName(payee.name),
      createdAt: payee.createdAt || new Date().toISOString(),
      lastUsedAt: payee.lastUsedAt || payee.createdAt || new Date().toISOString(),
      useCount: Number.isFinite(payee.useCount) ? payee.useCount : 1,
      isArchived: payee.isArchived === true,
    }));
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

function samePayee(left: string, right: string): boolean {
  return normalisePayeeName(left).toLocaleLowerCase() === normalisePayeeName(right).toLocaleLowerCase();
}

function isTransferPayee(name: string): boolean {
  return normalisePayeeName(name).toLocaleLowerCase().startsWith("transfer:");
}

function createPayeeId(name: string, existingPayees: PayeeView[]): string {
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

function maxIsoDate(left: string, right: string): string {
  return left > right ? left : right;
}
