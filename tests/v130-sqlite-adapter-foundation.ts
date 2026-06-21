import {
  SqliteAccountPersistenceAdapter,
  type SqliteAccountRecord,
  type SqliteAccountRepositoryLike,
} from "../apps/web/src/features/persistence/sqliteAccountPersistenceAdapter.js";
import {
  SqlitePayeePersistenceAdapter,
  type SqlitePayeeRecord,
  type SqlitePayeeRepositoryLike,
} from "../apps/web/src/features/persistence/sqlitePayeePersistenceAdapter.js";

class InMemoryAccountRepository implements SqliteAccountRepositoryLike {
  readonly records = new Map<string, SqliteAccountRecord>();

  async create(account: SqliteAccountRecord): Promise<void> {
    this.records.set(account.id, account);
  }

  async update(account: SqliteAccountRecord): Promise<void> {
    this.records.set(account.id, account);
  }

  async getById(id: string): Promise<SqliteAccountRecord | null> {
    return this.records.get(id) ?? null;
  }

  async findByBudget(budgetId: string): Promise<SqliteAccountRecord[]> {
    return [...this.records.values()].filter((account) => account.budgetId === budgetId);
  }
}

class InMemoryPayeeRepository implements SqlitePayeeRepositoryLike {
  readonly records = new Map<string, SqlitePayeeRecord>();

  async create(payee: SqlitePayeeRecord): Promise<void> {
    this.records.set(payee.id, payee);
  }

  async update(payee: SqlitePayeeRecord): Promise<void> {
    this.records.set(payee.id, payee);
  }

  async archive(payeeId: string): Promise<void> {
    const payee = this.records.get(payeeId);

    if (!payee) {
      return;
    }

    this.records.set(payeeId, {
      ...payee,
      isArchived: true,
      updatedAt: new Date("2026-06-21T00:00:00.000Z"),
    });
  }

  async delete(payeeId: string): Promise<void> {
    this.records.delete(payeeId);
  }

  async findByBudget(budgetId: string): Promise<SqlitePayeeRecord[]> {
    return [...this.records.values()].filter((payee) => payee.budgetId === budgetId);
  }

  async findActiveByBudget(budgetId: string): Promise<SqlitePayeeRecord[]> {
    return [...this.records.values()].filter((payee) => payee.budgetId === budgetId && !payee.isArchived);
  }

  async findById(payeeId: string): Promise<SqlitePayeeRecord | null> {
    return this.records.get(payeeId) ?? null;
  }

  async findByNormalizedName(budgetId: string, normalizedName: string): Promise<SqlitePayeeRecord | null> {
    return (
      [...this.records.values()].find(
        (payee) => payee.budgetId === budgetId && payee.normalizedName === normalizedName,
      ) ?? null
    );
  }
}

const accountRepository = new InMemoryAccountRepository();
const accountAdapter = new SqliteAccountPersistenceAdapter({
  repository: accountRepository,
  budgetId: "budget-1",
});

let accounts = await accountAdapter.createAccount({
  name: "Everyday Account",
  type: "on-budget",
  startingBalance: 12500,
});

if (accounts.length !== 1) throw new Error("Expected account to be created");
if (accounts[0].id !== "everyday-account") throw new Error(`Unexpected account id: ${accounts[0].id}`);
if (accounts[0].startingBalance !== 12500) throw new Error("Expected opening balance to map to startingBalance");
if (accountRepository.records.get("everyday-account")?.participation !== "OnBudget") {
  throw new Error("Expected on-budget account to map to OnBudget participation");
}

accounts = await accountAdapter.updateAccount({
  id: "everyday-account",
  name: "Visa Card",
  type: "credit-card",
});

if (accounts[0].type !== "credit-card") throw new Error("Expected credit card account to map back to UI type");
if (accountRepository.records.get("everyday-account")?.type !== "CreditCard") {
  throw new Error("Expected credit-card UI type to map to SQLite CreditCard type");
}
if (accountAdapter.getAccountById("everyday-account")?.name !== "Visa Card") {
  throw new Error("Expected synchronous getAccountById to use adapter cache");
}

const deleteResult = await accountAdapter.deleteAccount("everyday-account");
if (deleteResult.deleted) throw new Error("SQLite account delete should remain disabled in v1.30 foundation");

const payeeRepository = new InMemoryPayeeRepository();
const payeeAdapter = new SqlitePayeePersistenceAdapter({
  repository: payeeRepository,
  budgetId: "budget-1",
  now: () => new Date("2026-06-21T00:00:00.000Z"),
});

let payees = await payeeAdapter.recordPayee("  Local  Grocer  ");
if (payees.length !== 1) throw new Error("Expected payee to be created");
if (payees[0].name !== "Local Grocer") throw new Error(`Unexpected payee name: ${payees[0].name}`);
if (payeeRepository.records.get("local-grocer")?.normalizedName !== "local grocer") {
  throw new Error("Expected normalized payee name to be stored");
}

payees = await payeeAdapter.recordPayee("local grocer");
if (payees.length !== 1) throw new Error("Expected duplicate payee record to update existing row");

await payeeAdapter.recordPayee("Hardware Store");
payees = await payeeAdapter.renamePayee({ id: "hardware-store", name: "Local Grocer" });
if (payees.length !== 1) throw new Error("Expected duplicate rename to collapse duplicate payee foundation row");

payees = await payeeAdapter.deletePayee("local-grocer");
if (payees.length !== 0) throw new Error("Expected payee delete to remove payee row");

console.log("v1.30 SQLite adapter foundation checks OK");
