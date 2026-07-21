import type {
  AccountRegisterView,
  RegisterTransactionView,
} from "../../accounts/accountRegisterTypes";
import type {
  SidebarAccount,
  SidebarAccountType,
} from "../../accounts/accountService";
import type { TransactionTagColour } from "../../tags/transactionTagTypes";
import { decodeYnabAmount } from "../../../../../../packages/ynab4-importer/src/money/decodeYnabAmount";

const READY_TO_ASSIGN_CATEGORY_ID = "__ready_to_assign__";
const READY_TO_ASSIGN_CATEGORY_NAME = "Ready to Assign";
const YNAB4_SPLIT_CATEGORY_ID = "Category/__Split__";
const YNAB4_IMMEDIATE_INCOME_CATEGORY_ID = "Category/__ImmediateIncome__";
const YNAB4_DEFERRED_INCOME_CATEGORY_ID = "Category/__DeferredIncome__";
const IMPORTED_FLAG_COLOURS: readonly TransactionTagColour[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
];

type RecordMap = Record<string, unknown>;

export interface Ynab4TransactionIdentityMaps {
  accountIdBySourceId: ReadonlyMap<string, string>;
  accountNameById: ReadonlyMap<string, string>;
  accountTypeById: ReadonlyMap<string, SidebarAccountType>;
  categoryIdBySourceId: ReadonlyMap<string, string>;
  categoryNameById: ReadonlyMap<string, string>;
  payeeIdBySourceId: ReadonlyMap<string, string>;
  payeeNameById: ReadonlyMap<string, string>;
  nonImportableCategorySourceIds?: ReadonlySet<string>;
}

export interface MapYnab4TransactionsInput {
  transactions: RecordMap[];
  accounts: SidebarAccount[];
  maps: Ynab4TransactionIdentityMaps;
  currencyCode: string;
  importedFlagTagIdByColour: ReadonlyMap<TransactionTagColour, string>;
}

/**
 * Convert YNAB4 transaction rows into complete account registers without
 * reading or writing browser storage. Tombstones are ignored and active rows
 * must resolve to imported identities. Missing dates, amounts, and genuinely
 * unknown category IDs are rejected. Known non-importable category identities
 * (for example tombstones and master-category relationship IDs) remain unresolved.
 */
export function mapYnab4Transactions(
  input: MapYnab4TransactionsInput,
): Record<string, AccountRegisterView> {
  const registers: Record<string, AccountRegisterView> = {};
  for (const account of input.accounts) {
    registers[account.id] = createEmptyRegister(account, input.currencyCode);
  }

  for (const [index, transaction] of input.transactions.entries()) {
    if (isYnab4Tombstone(transaction)) continue;
    const accountId = requireMappedYnab4Account(
      input.maps.accountIdBySourceId,
      transaction,
      `transaction ${sourceEntityLabel(transaction, index)}`,
    );
    if (!registers[accountId]) {
      throw new Error(
        `Mapped YNAB4 account "${accountId}" has no register for transaction ${sourceEntityLabel(transaction, index)}.`,
      );
    }
    registers[accountId].transactions.push(
      mapYnab4Transaction(
        transaction,
        index,
        input.maps,
        input.importedFlagTagIdByColour,
        input.maps.accountTypeById.get(accountId) ?? "on-budget",
      ),
    );
  }

  for (const register of Object.values(registers)) {
    recalculateRegister(register);
  }

  return registers;
}

export function mapYnab4Transaction(
  transaction: RecordMap,
  index: number,
  maps: Ynab4TransactionIdentityMaps,
  importedFlagTagIdByColour: ReadonlyMap<TransactionTagColour, string>,
  owningAccountType: SidebarAccountType,
): RegisterTransactionView {
  const amount = requireYnab4Amount(
    decodeYnabAmount({
      amount: transaction.amount,
      amountMilliUnits: transaction.amountMilliUnits,
      inflow: transaction.inflow,
      outflow: transaction.outflow,
    }),
    `transaction ${sourceEntityLabel(transaction, index)}`,
  );
  const transferAccountId = mappedId(
    maps.accountIdBySourceId,
    transaction.targetAccountId,
    transaction.transferAccountId,
  );
  const payeeId = mappedId(maps.payeeIdBySourceId, transaction.payeeId);
  const isTrackingAccount = owningAccountType === "tracking";
  const sourceCategoryKind = ynab4CategoryKind(
    transaction.categoryId,
    transaction.subCategoryId,
  );
  const mappedCategoryId =
    sourceCategoryKind === "ordinary"
      ? resolveYnab4CategoryId(
          maps,
          transaction,
          `transaction ${sourceEntityLabel(transaction, index)}`,
        )
      : null;
  const categoryId = isTrackingAccount
    ? null
    : sourceCategoryKind === "income"
      ? READY_TO_ASSIGN_CATEGORY_ID
      : sourceCategoryKind === "split"
        ? null
        : mappedCategoryId;
  const splitLines = mapYnab4SplitLines(
    toRecords(transaction.subTransactions),
    maps,
    isTrackingAccount,
  );
  const hasSplitLines = Boolean(splitLines && splitLines.length > 0);
  const transferAccountType = transferAccountId
    ? maps.accountTypeById.get(transferAccountId)
    : undefined;
  const isCategorisedOffBudgetTransfer = Boolean(
    transferAccountId && categoryId && transferAccountType === "tracking",
  );
  const importedFlagColour = normaliseImportedFlagColour(
    firstString(transaction.flag, transaction.flagColor),
  );
  const importedFlagTagId = importedFlagColour
    ? importedFlagTagIdByColour.get(importedFlagColour)
    : undefined;
  const payeeName = transferAccountId
    ? `Transfer: ${maps.accountNameById.get(transferAccountId) ?? "Account"}`
    : firstString(transaction.payeeName, transaction.payee) ??
      (payeeId ? maps.payeeNameById.get(payeeId) : null) ??
      "Imported Payee";

  return {
    id:
      firstString(
        transaction.entityId,
        transaction.id,
        transaction.transactionId,
      ) ?? `imported-transaction-${index}`,
    date: requireYnab4Date(
      firstString(
        transaction.date,
        transaction.dateString,
        transaction.acceptedDate,
      ),
      `transaction ${sourceEntityLabel(transaction, index)}`,
    ),
    ...(importedFlagTagId ? { tagIds: [importedFlagTagId] } : {}),
    attachmentCount: 0,
    attachments: [],
    payee: payeeName,
    payeeId: transferAccountId ? undefined : payeeId ?? undefined,
    category: isTrackingAccount
      ? transferAccountId
        ? "Transfer"
        : "Uncategorised"
      : hasSplitLines
        ? "Split"
        : categoryId && (!transferAccountId || isCategorisedOffBudgetTransfer)
          ? maps.categoryNameById.get(categoryId) ??
            READY_TO_ASSIGN_CATEGORY_NAME
          : transferAccountId
            ? "Transfer"
            : READY_TO_ASSIGN_CATEGORY_NAME,
    categoryId: isTrackingAccount
      ? undefined
      : hasSplitLines
        ? undefined
        : categoryId ??
          (transferAccountId ? undefined : READY_TO_ASSIGN_CATEGORY_ID),
    memo:
      firstString(transaction.memo, transaction.note, transaction.notes) ??
      undefined,
    checkNumber:
      firstString(
        transaction.checkNumber,
        transaction.check,
        transaction.number,
      ) ?? undefined,
    inflow: amount > 0 ? amount : 0,
    outflow: amount < 0 ? Math.abs(amount) : 0,
    runningBalance: 0,
    cleared: isCleared(transaction),
    reconciled: isReconciled(transaction),
    transferId: createImportedTransferId(
      firstString(
        transaction.entityId,
        transaction.id,
        transaction.transactionId,
      ),
      firstString(transaction.transferTransactionId),
    ),
    transferAccountId: transferAccountId ?? undefined,
    transferTransactionId:
      firstString(transaction.transferTransactionId) ?? undefined,
    splitLines,
  };
}

export function mapYnab4SplitLines(
  lines: RecordMap[],
  maps: Ynab4TransactionIdentityMaps,
  suppressBudgetCategories = false,
): RegisterTransactionView["splitLines"] {
  const activeLines = lines.filter((line) => !isYnab4Tombstone(line));
  if (activeLines.length === 0) return undefined;
  return activeLines.map((line, index) => {
    const amount = requireYnab4Amount(
      decodeYnabAmount({
        amount: line.amount,
        amountMilliUnits: line.amountMilliUnits,
        inflow: line.inflow,
        outflow: line.outflow,
      }),
      `split ${sourceEntityLabel(line, index)}`,
    );
    const sourceCategoryKind = ynab4CategoryKind(
      line.categoryId,
      line.subCategoryId,
    );
    const transferAccountId = mappedId(
      maps.accountIdBySourceId,
      line.targetAccountId,
      line.transferAccountId,
    );
    const transferTransactionId = firstString(line.transferTransactionId);
    const lineId = firstString(line.entityId, line.id) ?? `split-${index}`;
    const categoryId = suppressBudgetCategories || transferAccountId
      ? null
      : sourceCategoryKind === "income" || sourceCategoryKind === "split"
        ? READY_TO_ASSIGN_CATEGORY_ID
        : resolveYnab4CategoryId(
            maps,
            line,
            `split ${sourceEntityLabel(line, index)}`,
          ) ?? READY_TO_ASSIGN_CATEGORY_ID;
    return {
      id: lineId,
      category: suppressBudgetCategories
        ? transferAccountId
          ? "Transfer"
          : "Uncategorised"
        : transferAccountId
          ? "Transfer"
          : maps.categoryNameById.get(categoryId!) ??
            READY_TO_ASSIGN_CATEGORY_NAME,
      categoryId:
        suppressBudgetCategories || transferAccountId ? undefined : categoryId!,
      memo: firstString(line.memo, line.note, line.notes) ?? undefined,
      inflow: amount > 0 ? amount : 0,
      outflow: amount < 0 ? Math.abs(amount) : 0,
      transferId: createImportedTransferId(lineId, transferTransactionId),
      transferAccountId: transferAccountId ?? undefined,
      transferTransactionId: transferTransactionId ?? undefined,
    };
  });
}

function createEmptyRegister(
  account: SidebarAccount,
  currencyCode: string,
): AccountRegisterView {
  return {
    accountId: account.id,
    accountName: account.name,
    accountType:
      account.type === "credit-card"
        ? "Credit card"
        : account.type === "tracking"
          ? "Tracking"
          : "On budget",
    currencyCode,
    clearedBalance: 0,
    unclearedBalance: 0,
    workingBalance: 0,
    transactions: [],
  };
}

function recalculateRegister(register: AccountRegisterView): void {
  const chronological = [...register.transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  let runningBalance = 0;
  const runningBalanceById = new Map<string, number>();
  for (const transaction of chronological) {
    runningBalance += transaction.inflow - transaction.outflow;
    runningBalanceById.set(transaction.id, runningBalance);
  }
  register.transactions = register.transactions
    .map((transaction) => ({
      ...transaction,
      runningBalance: runningBalanceById.get(transaction.id) ?? 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  register.clearedBalance = register.transactions
    .filter((transaction) => transaction.cleared || transaction.reconciled)
    .reduce(
      (sum, transaction) =>
        sum + transaction.inflow - transaction.outflow,
      0,
    );
  register.workingBalance = register.transactions.reduce(
    (sum, transaction) => sum + transaction.inflow - transaction.outflow,
    0,
  );
  register.unclearedBalance =
    register.workingBalance - register.clearedBalance;
}

export function createImportedTransferId(
  transactionId: string | null,
  pairedTransactionId: string | null,
): string | undefined {
  if (!transactionId || !pairedTransactionId) return undefined;
  return `ynab4-transfer-${[transactionId, pairedTransactionId]
    .sort()
    .join("--")}`;
}

function normaliseImportedFlagColour(
  value: string | null,
): TransactionTagColour | null {
  const normalised = value?.trim().toLowerCase();
  return IMPORTED_FLAG_COLOURS.includes(normalised as TransactionTagColour)
    ? (normalised as TransactionTagColour)
    : null;
}

function isCleared(row: RecordMap): boolean {
  const value = firstString(
    row.cleared,
    row.clearedStatus,
    row.accepted,
  )?.toLowerCase();
  return (
    value === "cleared" ||
    value === "reconciled" ||
    value === "accepted" ||
    row.cleared === true ||
    row.accepted === true
  );
}

function isReconciled(row: RecordMap): boolean {
  return (
    firstString(row.cleared, row.clearedStatus)?.toLowerCase() === "reconciled"
  );
}

type Ynab4CategoryKind = "split" | "income" | "ordinary";

function ynab4CategoryKind(...values: unknown[]): Ynab4CategoryKind {
  const sourceCategoryId = firstString(...values);
  if (sourceCategoryId === YNAB4_SPLIT_CATEGORY_ID) return "split";
  if (
    sourceCategoryId === YNAB4_IMMEDIATE_INCOME_CATEGORY_ID ||
    sourceCategoryId === YNAB4_DEFERRED_INCOME_CATEGORY_ID
  ) {
    return "income";
  }
  return "ordinary";
}

function requireMappedYnab4Account(
  map: ReadonlyMap<string, string>,
  record: RecordMap,
  source: string,
): string {
  const sourceAccountId = firstString(
    record.accountId,
    record.accountEntityId,
  );
  if (!sourceAccountId) {
    throw new Error(`Missing YNAB4 account reference for ${source}.`);
  }
  const accountId = map.get(sourceAccountId);
  if (!accountId) {
    throw new Error(
      `Unresolved YNAB4 account "${sourceAccountId}" for ${source}.`,
    );
  }
  return accountId;
}

export function resolveYnab4CategoryId(
  maps: Ynab4TransactionIdentityMaps,
  record: RecordMap,
  source: string,
): string | null {
  const sourceCategoryId = firstString(record.categoryId, record.subCategoryId);
  if (!sourceCategoryId) return null;
  if (
    sourceCategoryId === YNAB4_SPLIT_CATEGORY_ID ||
    sourceCategoryId === YNAB4_IMMEDIATE_INCOME_CATEGORY_ID ||
    sourceCategoryId === YNAB4_DEFERRED_INCOME_CATEGORY_ID
  ) {
    return null;
  }
  const mapped = maps.categoryIdBySourceId.get(sourceCategoryId);
  if (mapped) return mapped;
  if (maps.nonImportableCategorySourceIds?.has(sourceCategoryId)) return null;
  throw new Error(`Unresolved YNAB4 category "${sourceCategoryId}" for ${source}.`);
}

function mappedId(
  map: ReadonlyMap<string, string>,
  ...values: unknown[]
): string | null {
  for (const value of values) {
    const key = firstString(value);
    if (key && map.has(key)) return map.get(key)!;
  }
  return null;
}

function isYnab4Tombstone(record: RecordMap): boolean {
  return record.isTombstone === true || record.deleted === true;
}

function requireYnab4Date(value: string | null, source: string): string {
  if (value === null) throw new Error(`Invalid or missing YNAB4 date for ${source}.`);
  const date = normaliseDate(value);
  if (!date) throw new Error(`Invalid or missing YNAB4 date for ${source}.`);
  return date;
}

function normaliseDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function requireYnab4Amount(value: number | null, source: string): number {
  if (value === null) throw new Error(`Invalid or missing YNAB4 amount for ${source}.`);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid or missing YNAB4 amount for ${source}.`);
  }
  return value;
}

function sourceEntityLabel(record: RecordMap, index: number): string {
  return (
    firstString(record.entityId, record.id, record.transactionId) ??
    `at index ${index}`
  );
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function toRecords(value: unknown): RecordMap[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is RecordMap =>
          entry !== null && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
}
