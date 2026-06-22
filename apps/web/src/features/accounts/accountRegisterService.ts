import type {
  AccountRegisterService,
  AccountRegisterView,
  NewRegisterTransactionInput,
  RegisterAttachmentView,
  RegisterTransactionView,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";
import type { SidebarAccount, SidebarAccountType } from "./accountService";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

const STORAGE_KEY = "budget-app.account-registers.v1";

type StoredRegisters = Record<string, AccountRegisterView>;

export interface AccountRegisterServiceDependencies {
  storage: KeyValueStoragePort;
  recordPayee(payeeName: string): Promise<void>;
  findPayeeIdByName(payeeName: string): string | undefined;
  readAccounts(): SidebarAccount[];
  getAccountById(accountId: string): SidebarAccount | undefined;
}

/**
 * Browser-facing register service boundary.
 *
 * This implementation intentionally does not use the old demo/mock register data.
 * It persists user-created register data to browser localStorage so the web app can
 * exercise real load/save behaviour while the desktop SQLite bridge is being wired.
 *
 * Desktop target:
 * React -> this service port -> Tauri invoke -> application services -> repositories -> SQLite.
 */
export class BrowserPersistentAccountRegisterService implements AccountRegisterService {
  constructor(private readonly dependencies: AccountRegisterServiceDependencies) {}
  async getAccountRegisterView(input: { accountId: string }): Promise<AccountRegisterView> {
    const registers = readRegisters(this.dependencies.storage);
    const register = registers[input.accountId] ?? createEmptyRegister(this.dependencies, input.accountId);

    if (!registers[input.accountId]) {
      registers[input.accountId] = register;
      writeRegisters(this.dependencies.storage, registers);
    }

    return cloneRegister(recalculateRegister(this.dependencies, register));
  }

  async addTransaction(input: {
    accountId: string;
    transaction: NewRegisterTransactionInput;
  }): Promise<AccountRegisterView> {
    await this.dependencies.recordPayee(input.transaction.payee);
    const payeeId = resolvePayeeId(this.dependencies, input.transaction.payee, input.transaction.payeeId);

    const transferTarget = findTransferTarget(this.dependencies, input.accountId, input.transaction.payee);

    if (transferTarget) {
      return addTransferTransaction(this.dependencies, input.accountId, transferTarget, input.transaction);
    }

    return updateRegister(this.dependencies, input.accountId, (register) => {
      register.transactions.unshift(createTransactionView(this.dependencies, { ...input.transaction, payeeId }));
    });
  }

  async updateTransaction(input: {
    accountId: string;
    transaction: UpdateRegisterTransactionInput;
  }): Promise<AccountRegisterView> {
    await this.dependencies.recordPayee(input.transaction.payee);
    const payeeId = resolvePayeeId(this.dependencies, input.transaction.payee, input.transaction.payeeId);

    const registers = readRegisters(this.dependencies.storage);
    const sourceRegister = cloneRegister(registers[input.accountId] ?? createEmptyRegister(this.dependencies, input.accountId));
    const existing = sourceRegister.transactions.find(
      (transaction) => transaction.id === input.transaction.id,
    );

    if (existing?.transferAccountId && existing.transferTransactionId) {
      const targetRegister = cloneRegister(
        registers[existing.transferAccountId] ?? createEmptyRegister(this.dependencies, existing.transferAccountId),
      );

      const updatedSource = {
        ...existing,
        date: input.transaction.date,
        payee: existing.payee,
        category: "Transfer",
        memo: input.transaction.memo,
        inflow: input.transaction.inflow,
        outflow: input.transaction.outflow,
      };
      const updatedTarget = createOpposingTransferTransaction(
        updatedSource,
        input.accountId,
        sourceRegister.accountName,
      );

      sourceRegister.transactions = sourceRegister.transactions.map((transaction) =>
        transaction.id === updatedSource.id ? updatedSource : transaction,
      );
      targetRegister.transactions = targetRegister.transactions.map((transaction) =>
        transaction.id === existing.transferTransactionId
          ? {
              ...updatedTarget,
              id: existing.transferTransactionId,
              transferTransactionId: updatedSource.id,
            }
          : transaction,
      );

      registers[input.accountId] = recalculateRegister(this.dependencies, sourceRegister);
      registers[existing.transferAccountId] = recalculateRegister(this.dependencies, targetRegister);
      writeRegisters(this.dependencies.storage, registers);
      return cloneRegister(registers[input.accountId]);
    }

    return updateRegister(this.dependencies, input.accountId, (register) => {
      register.transactions = register.transactions.map((transaction) => {
        if (transaction.id !== input.transaction.id) {
          return transaction;
        }

        return {
          ...transaction,
          date: input.transaction.date,
          flag: input.transaction.flag ?? transaction.flag,
          payee: input.transaction.payee,
          payeeId,
          category: input.transaction.category,
          categoryId: input.transaction.categoryId,
          memo: input.transaction.memo,
          splitLines: cloneSplitLines(input.transaction.splitLines),
          inflow: input.transaction.inflow,
          outflow: input.transaction.outflow,
        };
      });
    });
  }

  async toggleCleared(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView> {
    const registers = readRegisters(this.dependencies.storage);
    const register = cloneRegister(registers[input.accountId] ?? createEmptyRegister(this.dependencies, input.accountId));
    const transaction = register.transactions.find(
      (current) => current.id === input.transactionId,
    );

    if (!transaction || transaction.reconciled) {
      return cloneRegister(recalculateRegister(this.dependencies, register));
    }

    const nextCleared = !transaction.cleared;
    register.transactions = register.transactions.map((current) =>
      current.id === input.transactionId ? { ...current, cleared: nextCleared } : current,
    );
    registers[input.accountId] = recalculateRegister(this.dependencies, register);

    if (transaction.transferAccountId && transaction.transferTransactionId) {
      const targetRegister = cloneRegister(
        registers[transaction.transferAccountId] ?? createEmptyRegister(this.dependencies, transaction.transferAccountId),
      );
      targetRegister.transactions = targetRegister.transactions.map((current) =>
        current.id === transaction.transferTransactionId && !current.reconciled
          ? { ...current, cleared: nextCleared }
          : current,
      );
      registers[transaction.transferAccountId] = recalculateRegister(this.dependencies, targetRegister);
    }

    writeRegisters(this.dependencies.storage, registers);
    return cloneRegister(registers[input.accountId]);
  }

  async deleteTransaction(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView> {
    const registers = readRegisters(this.dependencies.storage);
    const register = cloneRegister(registers[input.accountId] ?? createEmptyRegister(this.dependencies, input.accountId));
    const transaction = register.transactions.find(
      (current) => current.id === input.transactionId,
    );

    register.transactions = register.transactions.filter(
      (current) => current.id !== input.transactionId,
    );
    registers[input.accountId] = recalculateRegister(this.dependencies, register);

    if (transaction?.transferAccountId && transaction.transferTransactionId) {
      const targetRegister = cloneRegister(
        registers[transaction.transferAccountId] ?? createEmptyRegister(this.dependencies, transaction.transferAccountId),
      );
      targetRegister.transactions = targetRegister.transactions.filter(
        (current) => current.id !== transaction.transferTransactionId,
      );
      registers[transaction.transferAccountId] = recalculateRegister(this.dependencies, targetRegister);
    }

    writeRegisters(this.dependencies.storage, registers);
    return cloneRegister(registers[input.accountId]);
  }

  async addAttachment(input: {
    accountId: string;
    transactionId: string;
    attachment: {
      fileName: string;
      fileSize: number;
      mimeType: string;
      contentDataUrl?: string;
    };
  }): Promise<AccountRegisterView> {
    return updateRegister(this.dependencies, input.accountId, (register) => {
      register.transactions = register.transactions.map((transaction) => {
        if (transaction.id !== input.transactionId) {
          return transaction;
        }

        const attachments = [
          ...(transaction.attachments ?? []),
          {
            id: createId(),
            fileName: input.attachment.fileName,
            fileSize: input.attachment.fileSize,
            mimeType: input.attachment.mimeType || "application/octet-stream",
            attachedAt: new Date().toISOString(),
            ...(input.attachment.contentDataUrl
              ? {
                  contentDataUrl: input.attachment.contentDataUrl,
                  storageType: "inline-data-url" as const,
                }
              : {}),
          },
        ];

        return {
          ...transaction,
          attachments,
          attachmentCount: attachments.length,
        };
      });
    });
  }

  async removeAttachment(input: {
    accountId: string;
    transactionId: string;
    attachmentId: string;
  }): Promise<AccountRegisterView> {
    return updateRegister(this.dependencies, input.accountId, (register) => {
      register.transactions = register.transactions.map((transaction) => {
        if (transaction.id !== input.transactionId) {
          return transaction;
        }

        const attachments = (transaction.attachments ?? []).filter(
          (attachment) => attachment.id !== input.attachmentId,
        );

        return {
          ...transaction,
          attachments,
          attachmentCount: attachments.length,
        };
      });
    });
  }

  async renamePayeeReferences(input: {
    accountId: string;
    payeeId: string;
    previousName: string;
    nextName: string;
  }): Promise<AccountRegisterView> {
    const registers = readRegisters(this.dependencies.storage);

    for (const [accountId, register] of Object.entries(registers)) {
      const cloned = cloneRegister(register);

      cloned.transactions = cloned.transactions.map((transaction) => {
        if (isPayeeReferenceMatch(transaction, input.payeeId, input.previousName)) {
          return {
            ...transaction,
            payee: input.nextName,
            payeeId: input.payeeId,
          };
        }

        return transaction;
      });

      registers[accountId] = recalculateRegister(this.dependencies, cloned);
    }

    if (!registers[input.accountId]) {
      registers[input.accountId] = createEmptyRegister(this.dependencies, input.accountId);
    }

    writeRegisters(this.dependencies.storage, registers);
    return cloneRegister(recalculateRegister(this.dependencies, registers[input.accountId]));
  }

  async reassignPayeeReferences(input: {
    accountId: string;
    sourcePayeeId: string;
    sourceName: string;
    targetPayeeId: string;
    targetName: string;
  }): Promise<AccountRegisterView> {
    const registers = readRegisters(this.dependencies.storage);

    for (const [accountId, register] of Object.entries(registers)) {
      const cloned = cloneRegister(register);

      cloned.transactions = cloned.transactions.map((transaction) => {
        if (isPayeeReferenceMatch(transaction, input.sourcePayeeId, input.sourceName)) {
          return {
            ...transaction,
            payee: input.targetName,
            payeeId: input.targetPayeeId,
          };
        }

        return transaction;
      });

      registers[accountId] = recalculateRegister(this.dependencies, cloned);
    }

    if (!registers[input.accountId]) {
      registers[input.accountId] = createEmptyRegister(this.dependencies, input.accountId);
    }

    writeRegisters(this.dependencies.storage, registers);
    return cloneRegister(recalculateRegister(this.dependencies, registers[input.accountId]));
  }
}

export function createAccountRegisterService(
  dependencies: AccountRegisterServiceDependencies,
): AccountRegisterService {
  return new BrowserPersistentAccountRegisterService(dependencies);
}

function addTransferTransaction(
  dependencies: AccountRegisterServiceDependencies,
  sourceAccountId: string,
  targetAccount: SidebarAccount,
  input: NewRegisterTransactionInput,
): AccountRegisterView {
  const registers = readRegisters(dependencies.storage);
  const sourceRegister = cloneRegister(registers[sourceAccountId] ?? createEmptyRegister(dependencies, sourceAccountId));
  const targetRegister = cloneRegister(registers[targetAccount.id] ?? createEmptyRegister(dependencies, targetAccount.id));
  const transferId = createId();
  const sourceTransactionId = createId();
  const targetTransactionId = createId();

  const sourceTransaction: RegisterTransactionView = {
    ...createTransactionView(dependencies, input),
    id: sourceTransactionId,
    payee: `Transfer: ${targetAccount.name}`,
    category: "Transfer",
    categoryId: undefined,
    payeeId: undefined,
    transferId,
    transferAccountId: targetAccount.id,
    transferTransactionId: targetTransactionId,
  };

  const targetTransaction = {
    ...createOpposingTransferTransaction(
      sourceTransaction,
      sourceAccountId,
      sourceRegister.accountName,
    ),
    id: targetTransactionId,
    transferTransactionId: sourceTransactionId,
  };

  sourceRegister.transactions.unshift(sourceTransaction);
  targetRegister.transactions.unshift(targetTransaction);

  registers[sourceAccountId] = recalculateRegister(dependencies, sourceRegister);
  registers[targetAccount.id] = recalculateRegister(dependencies, targetRegister);
  writeRegisters(dependencies.storage, registers);

  return cloneRegister(registers[sourceAccountId]);
}


function isPayeeReferenceMatch(
  transaction: RegisterTransactionView,
  payeeId: string,
  previousName: string,
): boolean {
  if (transaction.transferId || transaction.payee.startsWith("Transfer:")) {
    return false;
  }

  if (transaction.payeeId) {
    return transaction.payeeId === payeeId;
  }

  return normalisePayeeReference(transaction.payee) === normalisePayeeReference(previousName);
}

function normalisePayeeReference(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function createTransactionView(
  dependencies: AccountRegisterServiceDependencies,
  input: NewRegisterTransactionInput,
): RegisterTransactionView {
  return {
    id: createId(),
    date: input.date,
    flag: input.flag ?? null,
    attachmentCount: 0,
    attachments: [],
    payee: input.payee,
    payeeId: input.payeeId ?? resolvePayeeId(dependencies, input.payee),
    category: input.category,
    categoryId: input.categoryId,
    memo: input.memo,
    splitLines: cloneSplitLines(input.splitLines),
    inflow: input.inflow,
    outflow: input.outflow,
    runningBalance: 0,
    cleared: false,
    reconciled: false,
  };
}

function createOpposingTransferTransaction(
  sourceTransaction: RegisterTransactionView,
  sourceAccountId: string,
  sourceAccountName: string,
): RegisterTransactionView {
  return {
    ...sourceTransaction,
    id: createId(),
    payee: `Transfer: ${sourceAccountName}`,
    payeeId: undefined,
    category: "Transfer",
    categoryId: undefined,
    inflow: sourceTransaction.outflow,
    outflow: sourceTransaction.inflow,
    runningBalance: 0,
    cleared: sourceTransaction.cleared,
    transferId: sourceTransaction.transferId,
    transferAccountId: sourceAccountId,
    transferTransactionId: sourceTransaction.id,
    splitLines: undefined,
  };
}

function cloneSplitLines(splitLines: RegisterTransactionView["splitLines"]): RegisterTransactionView["splitLines"] {
  return splitLines?.map((line) => ({ ...line }));
}

function resolvePayeeId(
  dependencies: AccountRegisterServiceDependencies,
  payeeName: string,
  currentPayeeId?: string,
): string | undefined {
  return currentPayeeId ?? dependencies.findPayeeIdByName(payeeName);
}

function findTransferTarget(
  dependencies: AccountRegisterServiceDependencies,
  sourceAccountId: string,
  payee: string,
): SidebarAccount | null {
  const normalisedPayee = normaliseTransferName(payee);

  if (!normalisedPayee) {
    return null;
  }

  return (
    dependencies.readAccounts().find(
      (account) =>
        account.id !== sourceAccountId &&
        normaliseTransferName(account.name) === normalisedPayee,
    ) ?? null
  );
}

function normaliseTransferName(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/^transfer\s*(to|from)?\s*:?\s*/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "") || null;
}

function updateRegister(
  dependencies: AccountRegisterServiceDependencies,
  accountId: string,
  updater: (register: AccountRegisterView) => void,
): AccountRegisterView {
  const registers = readRegisters(dependencies.storage);
  const register = cloneRegister(registers[accountId] ?? createEmptyRegister(dependencies, accountId));

  updater(register);

  const recalculated = recalculateRegister(dependencies, register);
  registers[accountId] = recalculated;
  writeRegisters(dependencies.storage, registers);

  return cloneRegister(recalculated);
}

function createEmptyRegister(
  dependencies: AccountRegisterServiceDependencies,
  accountId: string,
): AccountRegisterView {
  const account = dependencies.getAccountById(accountId);
  const openingBalance = account?.startingBalance ?? 0;

  return {
    accountId,
    accountName: account?.name ?? "Account",
    accountType: mapAccountType(account?.type ?? "on-budget"),
    currencyCode: "AUD",
    clearedBalance: 0,
    unclearedBalance: 0,
    workingBalance: 0,
    transactions:
      openingBalance === 0
        ? []
        : [
            {
              id: `${accountId}-opening-balance`,
              date: new Date().toISOString().slice(0, 10),
              flag: null,
              attachmentCount: 0,
              attachments: [],
              payee: "Starting Balance",
              payeeId: undefined,
              category: "Ready to Assign",
              categoryId: "__ready_to_assign__",
              memo: "Opening balance",
              inflow: openingBalance > 0 ? openingBalance : 0,
              outflow: openingBalance < 0 ? Math.abs(openingBalance) : 0,
              runningBalance: 0,
              cleared: true,
              reconciled: false,
            },
          ],
  };
}

function mapAccountType(type: SidebarAccountType): AccountRegisterView["accountType"] {
  if (type === "credit-card") return "Credit card";
  if (type === "tracking") return "Tracking";
  return "On budget";
}

function recalculateRegister(
  dependencies: AccountRegisterServiceDependencies,
  register: AccountRegisterView,
): AccountRegisterView {
  const chronological = [...register.transactions].sort(compareChronologically);
  const runningBalanceById = new Map<string, number>();
  let runningBalance = 0;

  for (const transaction of chronological) {
    runningBalance += transaction.inflow - transaction.outflow;
    runningBalanceById.set(transaction.id, runningBalance);
  }

  const transactions = register.transactions
    .map((transaction) => ({
      ...transaction,
      attachments: normaliseAttachments(transaction.attachments),
      attachmentCount: normaliseAttachments(transaction.attachments).length || transaction.attachmentCount || 0,
      payeeId: transaction.payeeId ?? resolvePayeeId(dependencies, transaction.payee),
      runningBalance: runningBalanceById.get(transaction.id) ?? 0,
    }))
    .sort(compareForRegisterDisplay);

  const clearedBalance = transactions
    .filter((transaction) => transaction.cleared || transaction.reconciled)
    .reduce((sum, transaction) => sum + transaction.inflow - transaction.outflow, 0);

  const workingBalance = transactions.reduce(
    (sum, transaction) => sum + transaction.inflow - transaction.outflow,
    0,
  );

  return {
    ...register,
    clearedBalance,
    unclearedBalance: workingBalance - clearedBalance,
    workingBalance,
    transactions,
  };
}

function readRegisters(storage: KeyValueStoragePort): StoredRegisters {
  const value = storage.getItem(STORAGE_KEY);

  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as StoredRegisters;
  } catch {
    return {};
  }
}

function writeRegisters(storage: KeyValueStoragePort, registers: StoredRegisters): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(registers));
}

function cloneRegister(register: AccountRegisterView): AccountRegisterView {
  return {
    ...register,
    transactions: register.transactions.map((transaction) => ({
      ...transaction,
      attachments: normaliseAttachments(transaction.attachments),
      attachmentCount: normaliseAttachments(transaction.attachments).length || transaction.attachmentCount || 0,
      splitLines: cloneSplitLines(transaction.splitLines),
    })),
  };
}

function normaliseAttachments(
  attachments: RegisterAttachmentView[] | undefined,
): RegisterAttachmentView[] {
  return (attachments ?? []).map((attachment) => ({ ...attachment }));
}

function compareChronologically(a: RegisterTransactionView, b: RegisterTransactionView): number {
  const dateCompare = a.date.localeCompare(b.date);
  if (dateCompare !== 0) return dateCompare;
  return a.id.localeCompare(b.id);
}

function compareForRegisterDisplay(a: RegisterTransactionView, b: RegisterTransactionView): number {
  const dateCompare = b.date.localeCompare(a.date);
  if (dateCompare !== 0) return dateCompare;
  return b.id.localeCompare(a.id);
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
