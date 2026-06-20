export interface PayeeView {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
}

export interface RenamePayeeInput {
  id: string;
  name: string;
}

const STORAGE_KEY = "budget-app.payees.v1";

class BrowserPersistentPayeeService {
  async listPayees(): Promise<PayeeView[]> {
    return sortPayees(readPayees());
  }

  async recordPayee(name: string): Promise<PayeeView[]> {
    const trimmed = normalisePayeeName(name);

    if (!trimmed || isTransferPayee(trimmed)) {
      return sortPayees(readPayees());
    }

    const payees = readPayees();
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
          },
        ];

    writePayees(nextPayees);
    return sortPayees(nextPayees);
  }

  async recordPayees(names: string[]): Promise<PayeeView[]> {
    let latest = readPayees();

    for (const name of names) {
      await this.recordPayee(name);
      latest = readPayees();
    }

    return sortPayees(latest);
  }

  async renamePayee(input: RenamePayeeInput): Promise<PayeeView[]> {
    const nextName = normalisePayeeName(input.name);

    if (!nextName) {
      return sortPayees(readPayees());
    }

    const payees = readPayees();
    const target = payees.find((payee) => payee.id === input.id);

    if (!target) {
      return sortPayees(payees);
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

      writePayees(merged);
      return sortPayees(merged);
    }

    const renamed = payees.map((payee) =>
      payee.id === input.id ? { ...payee, name: nextName } : payee,
    );

    writePayees(renamed);
    return sortPayees(renamed);
  }

  async deletePayee(payeeId: string): Promise<PayeeView[]> {
    const nextPayees = readPayees().filter((payee) => payee.id !== payeeId);
    writePayees(nextPayees);
    return sortPayees(nextPayees);
  }
}

export const payeeService = new BrowserPersistentPayeeService();

export function findPayeeByName(name: string): PayeeView | undefined {
  const normalised = normalisePayeeName(name).toLocaleLowerCase();

  if (!normalised || isTransferPayee(name)) {
    return undefined;
  }

  return readPayees().find(
    (payee) => normalisePayeeName(payee.name).toLocaleLowerCase() === normalised,
  );
}

export function findPayeeIdByName(name: string): string | undefined {
  return findPayeeByName(name)?.id;
}


export function readPayees(): PayeeView[] {
  if (typeof window === "undefined") {
    return [];
  }

  const value = window.localStorage.getItem(STORAGE_KEY);

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

function writePayees(payees: PayeeView[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sortPayees(normalisePayees(payees))));
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
