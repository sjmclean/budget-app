import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  accounts,
  budgetMonths,
  categoryGroups,
  categoryMonths,
  categories,
  importMaps,
  importRuns,
  payees,
  splitTransactionLines,
  transactionFlags,
  transactionNotes,
  transactions
} from "../../database/src/schema.js";
import { AccountType } from "../../types/src/AccountType.js";
import { BudgetParticipation } from "../../types/src/BudgetParticipation.js";
import { ClearedStatus } from "../../types/src/ClearedStatus.js";
import { ImportSource } from "../../types/src/ImportRun.js";
import { TransactionFlagColour } from "../../types/src/TransactionFlag.js";
import { TransactionType } from "../../types/src/TransactionType.js";
import { normalizePayeeName } from "../../budget-engine/src/services/payeeNormalization.js";
import { previewYnab4Import, Ynab4ImportInput } from "./importYnab4.js";

export interface Ynab4DatabaseImportOptions {
  budgetId: string;
  userId?: string;
  sourceFileName?: string | null;
  defaultAccountType?: AccountType;
  defaultParticipation?: BudgetParticipation;
  dryRun?: boolean;
}

export interface Ynab4DatabaseImportResult {
  importRunId: string;
  status: "completed" | "dry-run" | "completed-with-issues";
  created: {
    accounts: number;
    categoryGroups: number;
    categories: number;
    payees: number;
    transactions: number;
    splitLines: number;
    transactionFlags: number;
    transactionNotes: number;
    budgetMonths: number;
    categoryMonths: number;
    importMaps: number;
  };
  skipped: {
    transactions: number;
  };
  issues: ReturnType<typeof previewYnab4Import>["summary"]["issues"];
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function mapAccountType(type: string | null | undefined, fallback: AccountType): AccountType {
  const normalized = (type ?? "").replace(/[\s_-]/g, "").toLowerCase();
  if (["checking", "chequing", "current"].includes(normalized)) return AccountType.Checking;
  if (["savings", "saving"].includes(normalized)) return AccountType.Savings;
  if (["cash", "wallet"].includes(normalized)) return AccountType.Cash;
  if (["creditcard", "credit", "card"].includes(normalized)) return AccountType.CreditCard;
  if (["investment", "brokerage"].includes(normalized)) return AccountType.Investment;
  if (["asset"].includes(normalized)) return AccountType.Asset;
  if (["liability", "loan", "mortgage"].includes(normalized)) return AccountType.Liability;
  return fallback;
}

function mapClearedStatus(value: string): ClearedStatus {
  if (value === "reconciled") return ClearedStatus.Reconciled;
  if (value === "cleared") return ClearedStatus.Cleared;
  return ClearedStatus.Uncleared;
}

function mapFlagColour(value: string): TransactionFlagColour {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("orange")) return TransactionFlagColour.Orange;
  if (normalized.includes("yellow")) return TransactionFlagColour.Yellow;
  if (normalized.includes("green")) return TransactionFlagColour.Green;
  if (normalized.includes("blue")) return TransactionFlagColour.Blue;
  if (normalized.includes("purple")) return TransactionFlagColour.Purple;
  return TransactionFlagColour.Red;
}

function monthKey(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  return value || "unknown";
}

export class Ynab4DatabaseImportService {
  constructor(private db: any) {}

  async import(input: Ynab4ImportInput, options: Ynab4DatabaseImportOptions): Promise<Ynab4DatabaseImportResult> {
    if (options.dryRun) {
      return this.importWithoutTransaction(input, options);
    }

    // A real import must be all-or-nothing. Without a SQLite transaction, a bad row halfway
    // through a long YNAB4 migration could leave accounts, categories, and transactions in a
    // partially imported state. Drizzle's transaction wrapper ensures any thrown error rolls
    // back every insert from this import attempt.
    // IMPORTANT: better-sqlite3 transactions are synchronous. Do not make this
    // callback async and do not return a Promise from it. The v1.2.10 bugfixes
    // exist because async transaction callbacks break better-sqlite3 rollback
    // semantics at runtime.
    return this.db.transaction((tx: any) => {
      return new Ynab4DatabaseImportService(tx).importWithoutTransaction(input, options);
    });
  }

  private importWithoutTransaction(input: Ynab4ImportInput, options: Ynab4DatabaseImportOptions): Ynab4DatabaseImportResult {
    const preview = previewYnab4Import(input);
    const importRunId = randomUUID();
    const now = new Date();
    const created = {
      accounts: 0,
      categoryGroups: 0,
      categories: 0,
      payees: 0,
      transactions: 0,
      splitLines: 0,
      transactionFlags: 0,
      transactionNotes: 0,
      budgetMonths: 0,
      categoryMonths: 0,
      importMaps: 0
    };
    const skipped = { transactions: 0 };

    const result: Ynab4DatabaseImportResult = {
      importRunId,
      status: options.dryRun ? "dry-run" : preview.summary.issues.some((issue) => issue.severity === "error") ? "completed-with-issues" : "completed",
      created,
      skipped,
      issues: preview.summary.issues
    };

    if (options.dryRun) return result;

    const mapRows: Array<typeof importMaps.$inferInsert> = [];
    const addMap = (sourceEntityType: string, sourceEntityId: string, targetEntityType: string, targetEntityId: string) => {
      mapRows.push({
        id: randomUUID(),
        importRunId,
        sourceEntityType,
        sourceEntityId,
        targetEntityType,
        targetEntityId,
        createdAt: now
      });
      created.importMaps++;
    };

    const existingAccounts = this.db.select().from(accounts).where(eq(accounts.budgetId, options.budgetId)).all();
    const accountMap = new Map<string, string>(existingAccounts.map((account: any) => [normalizeKey(account.name), account.id]));

    for (const account of preview.accounts) {
      const key = normalizeKey(account.name);
      if (!key || accountMap.has(key)) continue;
      const id = randomUUID();
      this.db.insert(accounts).values({
        id,
        budgetId: options.budgetId,
        name: account.name,
        type: mapAccountType(account.type, options.defaultAccountType ?? AccountType.Checking),
        participation: account.onBudget === false ? BudgetParticipation.OffBudget : options.defaultParticipation ?? BudgetParticipation.OnBudget,
        openingBalance: account.balance ?? 0,
        currentBalance: account.balance ?? 0
      }).run();
      accountMap.set(key, id);
      created.accounts++;
      addMap("account", account.name, "account", id);
    }

    const groupMap = new Map<string, string>();
    const existingGroups = this.db.select().from(categoryGroups).where(eq(categoryGroups.budgetId, options.budgetId)).all();
    for (const group of existingGroups) groupMap.set(normalizeKey(group.name), group.id);

    let groupSort = existingGroups.length;
    for (const group of preview.categoryGroups) {
      const key = normalizeKey(group.name);
      if (!key || groupMap.has(key)) continue;
      const id = randomUUID();
      this.db.insert(categoryGroups).values({ id, budgetId: options.budgetId, name: group.name, sortOrder: groupSort++ }).run();
      groupMap.set(key, id);
      created.categoryGroups++;
      addMap("categoryGroup", group.name, "categoryGroup", id);
    }

    const fallbackGroupKey = "imported categories";
    if (!groupMap.has(fallbackGroupKey)) {
      const id = randomUUID();
      this.db.insert(categoryGroups).values({ id, budgetId: options.budgetId, name: "Imported Categories", sortOrder: groupSort++ }).run();
      groupMap.set(fallbackGroupKey, id);
      created.categoryGroups++;
    }

    const categoryMap = new Map<string, string>();
    for (const groupId of groupMap.values()) {
      const rows = this.db.select().from(categories).where(eq(categories.groupId, groupId)).all();
      for (const category of rows) categoryMap.set(`${groupId}:${normalizeKey(category.name)}`, category.id);
    }

    const categoryFullNameMap = new Map<string, string>();
    let categorySort = categoryMap.size;
    for (const category of preview.categories) {
      const groupKey = category.groupName ? normalizeKey(category.groupName) : fallbackGroupKey;
      const groupId = groupMap.get(groupKey) ?? groupMap.get(fallbackGroupKey)!;
      const key = `${groupId}:${normalizeKey(category.name)}`;
      let id = categoryMap.get(key);
      if (!id) {
        id = randomUUID();
        this.db.insert(categories).values({ id, groupId, name: category.name, sortOrder: categorySort++ }).run();
        categoryMap.set(key, id as string);
        created.categories++;
        addMap("category", category.fullName, "category", id as string);
      }
      categoryFullNameMap.set(normalizeKey(category.fullName), id as string);
    }

    const existingPayees = this.db.select().from(payees).where(eq(payees.budgetId, options.budgetId)).all();
    const payeeMap = new Map<string, string>(existingPayees.map((payee: any) => [payee.normalizedName || normalizePayeeName(payee.name), payee.id]));

    for (const payee of preview.payees) {
      const normalizedName = normalizePayeeName(payee.name);
      if (!normalizedName || payeeMap.has(normalizedName)) continue;
      const id = randomUUID();
      this.db.insert(payees).values({
        id,
        budgetId: options.budgetId,
        name: payee.name,
        normalizedName,
        isArchived: false,
        isTransfer: false,
        transferAccountId: null,
        createdAt: now,
        updatedAt: now
      }).run();
      payeeMap.set(normalizedName, id);
      created.payees++;
      addMap("payee", payee.name, "payee", id);
    }

    const transferPayeeMap = new Map<string, string>();
    for (const account of preview.accounts) {
      const accountId = accountMap.get(normalizeKey(account.name));
      if (!accountId) continue;
      const normalizedName = normalizePayeeName(`Transfer : ${account.name}`);
      const existing = payeeMap.get(normalizedName);
      if (existing) {
        transferPayeeMap.set(normalizeKey(account.name), existing);
        continue;
      }
      const id = randomUUID();
      this.db.insert(payees).values({
        id,
        budgetId: options.budgetId,
        name: `Transfer : ${account.name}`,
        normalizedName,
        isArchived: false,
        isTransfer: true,
        transferAccountId: accountId,
        createdAt: now,
        updatedAt: now
      }).run();
      payeeMap.set(normalizedName, id);
      transferPayeeMap.set(normalizeKey(account.name), id);
      created.payees++;
    }

    for (const row of preview.transactions) {
      const accountId = row.accountName ? accountMap.get(normalizeKey(row.accountName)) : undefined;
      if (!accountId || !row.date) {
        skipped.transactions++;
        continue;
      }

      const categoryId = row.category ? categoryFullNameMap.get(normalizeKey(row.category)) ?? null : null;
      const transferAccountId = row.transferAccountName ? accountMap.get(normalizeKey(row.transferAccountName)) ?? null : null;
      const payeeId = row.isTransfer && row.transferAccountName
        ? transferPayeeMap.get(normalizeKey(row.transferAccountName)) ?? null
        : row.payee
          ? payeeMap.get(normalizePayeeName(row.payee)) ?? null
          : null;
      const type = row.isSplit ? TransactionType.Split : row.isTransfer ? TransactionType.Transfer : row.amount > 0 ? TransactionType.Income : TransactionType.Standard;
      const transactionId = randomUUID();
      this.db.insert(transactions).values({
        id: transactionId,
        budgetId: options.budgetId,
        accountId,
        payeeId,
        categoryId: row.isSplit ? null : categoryId,
        transferAccountId,
        type,
        date: row.date,
        memo: row.memo,
        amount: row.amount,
        clearedStatus: mapClearedStatus(row.cleared),
        isDeleted: false,
        createdAt: now,
        updatedAt: now
      }).run();
      created.transactions++;
      addMap("transaction", String(row.rowNumber), "transaction", transactionId);

      if (row.isSplit && categoryId) {
        this.db.insert(splitTransactionLines).values({
          id: randomUUID(),
          transactionId,
          categoryId,
          memo: row.memo,
          amount: row.amount,
          sortOrder: 0
        }).run();
        created.splitLines++;
      }

      if (row.flag) {
        this.db.insert(transactionFlags).values({ id: randomUUID(), transactionId, colour: mapFlagColour(row.flag), label: row.flag, createdAt: now }).run();
        created.transactionFlags++;
      }

      if (row.memo) {
        this.db.insert(transactionNotes).values({ id: randomUUID(), transactionId, note: row.memo, createdAt: now, updatedAt: now }).run();
        created.transactionNotes++;
      }
    }

    const budgetMonthMap = new Map<string, string>();
    for (const row of preview.budgetMonths) {
      const month = monthKey(row.month);
      if (!month || month === "unknown") continue;
      let budgetMonthId = budgetMonthMap.get(month);
      if (!budgetMonthId) {
        budgetMonthId = randomUUID();
        this.db.insert(budgetMonths).values({
          id: budgetMonthId,
          budgetId: options.budgetId,
          month,
          income: 0,
          assigned: 0,
          activity: 0,
          readyToBudget: 0,
          createdAt: now,
          updatedAt: now
        }).run();
        budgetMonthMap.set(month, budgetMonthId as string);
        created.budgetMonths++;
      }
      const categoryId = row.category ? categoryFullNameMap.get(normalizeKey(row.category)) : undefined;
      if (!categoryId) continue;
      this.db.insert(categoryMonths).values({
        id: randomUUID(),
        budgetMonthId: budgetMonthId as string,
        categoryId,
        previousAvailable: 0,
        assigned: row.budgeted,
        activity: -Math.abs(row.outflows),
        available: row.balance,
        createdAt: now,
        updatedAt: now
      }).run();
      created.categoryMonths++;
    }

    this.db.insert(importRuns).values({
      id: importRunId,
      budgetId: options.budgetId,
      userId: options.userId ?? "local-user",
      source: ImportSource.YNAB4,
      sourceFileName: options.sourceFileName ?? null,
      startedAt: now,
      completedAt: new Date(),
      status: result.status,
      summaryJson: JSON.stringify({ preview: preview.summary, created, skipped })
    }).run();

    for (const row of mapRows) {
      this.db.insert(importMaps).values(row).run();
    }

    return result;
  }
}
