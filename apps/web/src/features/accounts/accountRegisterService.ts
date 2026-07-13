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
  recordPayees?(payeeNames: string[]): Promise<void>;
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
export class BrowserPersistentAccountRegisterService
  implements AccountRegisterService
{
  constructor(
    private readonly dependencies: AccountRegisterServiceDependencies,
  ) {}
  async getAccountRegisterView(input: {
    accountId: string;
  }): Promise<AccountRegisterView> {
    const registers = readRegisters(this.dependencies.storage);
    const register =
      registers[input.accountId] ??
      createEmptyRegister(this.dependencies, input.accountId);

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
    const payeeId = resolvePayeeId(
      this.dependencies,
      input.transaction.payee,
      input.transaction.payeeId,
    );

    const transferTarget = findTransferTarget(
      this.dependencies,
      input.accountId,
      input.transaction.payee,
    );

    if (transferTarget) {
      return addTransferTransaction(
        this.dependencies,
        input.accountId,
        transferTarget,
        input.transaction,
      );
    }

    return updateRegister(this.dependencies, input.accountId, (register) => {
      register.transactions.unshift(
        createTransactionView(this.dependencies, {
          ...input.transaction,
          payeeId,
        }),
      );
    });
  }

  async addTransactions(input: {
    accountId: string;
    transactions: NewRegisterTransactionInput[];
  }): Promise<AccountRegisterView> {
    if (input.transactions.length === 0) {
      return this.getAccountRegisterView({ accountId: input.accountId });
    }

    const timings = createRegisterBatchCommitTimings();
    const resolveTransferTarget = measureRegisterBatchCommitStage(
      timings,
      "Prepare transfer lookup",
      () => createTransferTargetResolver(this.dependencies, input.accountId),
    );

    const payeeNames = measureRegisterBatchCommitStage(
      timings,
      "Collect payees",
      () =>
        Array.from(
          new Set(
            input.transactions
              .map((transaction) => transaction.payee.trim())
              .filter(
                (payeeName) => payeeName && !resolveTransferTarget(payeeName),
              ),
          ),
        ),
    );

    await measureAsyncRegisterBatchCommitStage(
      timings,
      "Record payees",
      async () => {
        if (this.dependencies.recordPayees) {
          await this.dependencies.recordPayees(payeeNames);
          return;
        }

        for (const payeeName of payeeNames) {
          await this.dependencies.recordPayee(payeeName);
        }
      },
    );

    const registers = measureRegisterBatchCommitStage(
      timings,
      "Read registers",
      () => readRegisters(this.dependencies.storage),
    );
    const changedAccountIds = new Set<string>();
    const pendingPrepends = new Map<string, RegisterTransactionView[]>();
    const payeeIdByName = new Map<string, string | undefined>();

    const getMutableRegister = (accountId: string) => {
      const register = cloneRegister(
        registers[accountId] ??
          createEmptyRegister(this.dependencies, accountId),
      );
      registers[accountId] = register;
      changedAccountIds.add(accountId);
      return register;
    };

    const queuePrepend = (
      accountId: string,
      transaction: RegisterTransactionView,
    ) => {
      const queued = pendingPrepends.get(accountId) ?? [];
      queued.push(transaction);
      pendingPrepends.set(accountId, queued);
    };

    const sourceRegister = getMutableRegister(input.accountId);

    measureRegisterBatchCommitStage(timings, "Build transaction views", () => {
      for (const transaction of input.transactions) {
        const transferTarget = resolveTransferTarget(transaction.payee);

        if (transferTarget) {
          getMutableRegister(transferTarget.id);
          const transferId = createId();
          const sourceTransactionId = createId();
          const targetTransactionId = createId();
          const sourceTransaction: RegisterTransactionView = {
            ...createTransactionView(this.dependencies, transaction),
            id: sourceTransactionId,
            payee: `Transfer: ${transferTarget.name}`,
            category: "Transfer",
            categoryId: undefined,
            payeeId: undefined,
            transferId,
            transferAccountId: transferTarget.id,
            transferTransactionId: targetTransactionId,
          };
          const targetTransaction = {
            ...createOpposingTransferTransaction(
              sourceTransaction,
              input.accountId,
              sourceRegister.accountName,
            ),
            id: targetTransactionId,
            transferTransactionId: sourceTransactionId,
          };

          queuePrepend(input.accountId, sourceTransaction);
          queuePrepend(transferTarget.id, targetTransaction);
          continue;
        }

        const payeeId = resolvePayeeIdWithCache(
          this.dependencies,
          transaction.payee,
          payeeIdByName,
        );
        queuePrepend(
          input.accountId,
          createTransactionView(this.dependencies, { ...transaction, payeeId }),
        );
      }
    });

    measureRegisterBatchCommitStage(
      timings,
      "Prepend transaction batches",
      () => {
        for (const [accountId, transactionsToPrepend] of pendingPrepends) {
          const register = getMutableRegister(accountId);
          register.transactions = [
            ...transactionsToPrepend.reverse(),
            ...register.transactions,
          ];
        }
      },
    );

    measureRegisterBatchCommitStage(
      timings,
      "Recalculate changed registers",
      () => {
        for (const accountId of changedAccountIds) {
          registers[accountId] = recalculateRegister(
            this.dependencies,
            registers[accountId],
          );
        }
      },
    );

    measureRegisterBatchCommitStage(timings, "Persist registers", () => {
      writeRegisters(this.dependencies.storage, registers);
    });

    const result = measureRegisterBatchCommitStage(
      timings,
      "Clone result register",
      () => cloneRegister(registers[input.accountId]),
    );

    logRegisterBatchCommitTimings(input.transactions.length, timings);
    return result;
  }

  async updateTransaction(input: {
    accountId: string;
    transaction: UpdateRegisterTransactionInput;
  }): Promise<AccountRegisterView> {
    await this.dependencies.recordPayee(input.transaction.payee);
    const payeeId = resolvePayeeId(
      this.dependencies,
      input.transaction.payee,
      input.transaction.payeeId,
    );

    const registers = readRegisters(this.dependencies.storage);
    const sourceRegister = cloneRegister(
      registers[input.accountId] ??
        createEmptyRegister(this.dependencies, input.accountId),
    );
    const existing = sourceRegister.transactions.find(
      (transaction) => transaction.id === input.transaction.id,
    );

    if (existing?.transferAccountId && existing.transferTransactionId) {
      const targetRegister = cloneRegister(
        registers[existing.transferAccountId] ??
          createEmptyRegister(this.dependencies, existing.transferAccountId),
      );

      const updatedSource = {
        ...existing,
        date: input.transaction.date,
        tagIds:
          input.transaction.tagIds === undefined
            ? normaliseTagIds(existing.tagIds)
            : normaliseTagIds(input.transaction.tagIds),
        payee: existing.payee,
        category: "Transfer",
        memo: input.transaction.memo,
        checkNumber: normaliseCheckNumber(input.transaction.checkNumber),
        inflow: input.transaction.inflow,
        outflow: input.transaction.outflow,
      };
      const updatedTarget = createOpposingTransferTransaction(
        updatedSource,
        input.accountId,
        sourceRegister.accountName,
      );

      sourceRegister.transactions = sourceRegister.transactions.map(
        (transaction) =>
          transaction.id === updatedSource.id ? updatedSource : transaction,
      );
      targetRegister.transactions = targetRegister.transactions.map(
        (transaction) =>
          transaction.id === existing.transferTransactionId
            ? {
                ...updatedTarget,
                id: existing.transferTransactionId,
                transferTransactionId: updatedSource.id,
              }
            : transaction,
      );

      registers[input.accountId] = recalculateRegister(
        this.dependencies,
        sourceRegister,
      );
      registers[existing.transferAccountId] = recalculateRegister(
        this.dependencies,
        targetRegister,
      );
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
          tagIds:
            input.transaction.tagIds === undefined
              ? normaliseTagIds(transaction.tagIds)
              : normaliseTagIds(input.transaction.tagIds),
          payee: input.transaction.payee,
          payeeId,
          category: input.transaction.category,
          categoryId: input.transaction.categoryId,
          memo: input.transaction.memo,
          checkNumber: normaliseCheckNumber(input.transaction.checkNumber),
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
    const register = cloneRegister(
      registers[input.accountId] ??
        createEmptyRegister(this.dependencies, input.accountId),
    );
    const transaction = register.transactions.find(
      (current) => current.id === input.transactionId,
    );

    if (!transaction || transaction.reconciled) {
      return cloneRegister(recalculateRegister(this.dependencies, register));
    }

    const nextCleared = !transaction.cleared;
    register.transactions = register.transactions.map((current) =>
      current.id === input.transactionId
        ? { ...current, cleared: nextCleared }
        : current,
    );
    registers[input.accountId] = recalculateRegister(
      this.dependencies,
      register,
    );

    if (transaction.transferAccountId && transaction.transferTransactionId) {
      const targetRegister = cloneRegister(
        registers[transaction.transferAccountId] ??
          createEmptyRegister(this.dependencies, transaction.transferAccountId),
      );
      targetRegister.transactions = targetRegister.transactions.map(
        (current) =>
          current.id === transaction.transferTransactionId &&
          !current.reconciled
            ? { ...current, cleared: nextCleared }
            : current,
      );
      registers[transaction.transferAccountId] = recalculateRegister(
        this.dependencies,
        targetRegister,
      );
    }

    writeRegisters(this.dependencies.storage, registers);
    return cloneRegister(registers[input.accountId]);
  }

  async deleteTransaction(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView> {
    const registers = readRegisters(this.dependencies.storage);
    const register = cloneRegister(
      registers[input.accountId] ??
        createEmptyRegister(this.dependencies, input.accountId),
    );
    const transaction = register.transactions.find(
      (current) => current.id === input.transactionId,
    );

    register.transactions = register.transactions.filter(
      (current) => current.id !== input.transactionId,
    );
    registers[input.accountId] = recalculateRegister(
      this.dependencies,
      register,
    );

    if (transaction?.transferAccountId && transaction.transferTransactionId) {
      const targetRegister = cloneRegister(
        registers[transaction.transferAccountId] ??
          createEmptyRegister(this.dependencies, transaction.transferAccountId),
      );
      targetRegister.transactions = targetRegister.transactions.filter(
        (current) => current.id !== transaction.transferTransactionId,
      );
      registers[transaction.transferAccountId] = recalculateRegister(
        this.dependencies,
        targetRegister,
      );
    }

    writeRegisters(this.dependencies.storage, registers);
    return cloneRegister(registers[input.accountId]);
  }


  async moveTransactions(input: {
    sourceAccountId: string;
    targetAccountId: string;
    transactionIds: string[];
  }): Promise<AccountRegisterView> {
    if (
      input.sourceAccountId === input.targetAccountId ||
      input.transactionIds.length === 0
    ) {
      return this.getAccountRegisterView({ accountId: input.sourceAccountId });
    }

    const registers = readRegisters(this.dependencies.storage);
    const sourceRegister = cloneRegister(
      registers[input.sourceAccountId] ??
        createEmptyRegister(this.dependencies, input.sourceAccountId),
    );
    const targetRegister = cloneRegister(
      registers[input.targetAccountId] ??
        createEmptyRegister(this.dependencies, input.targetAccountId),
    );
    const transactionIdSet = new Set(input.transactionIds);
    const transactionsToMove = sourceRegister.transactions.filter((transaction) =>
      transactionIdSet.has(transaction.id),
    );

    if (transactionsToMove.length === 0) {
      return cloneRegister(recalculateRegister(this.dependencies, sourceRegister));
    }

    const blockedTransaction = transactionsToMove.find(
      (transaction) =>
        transaction.reconciled ||
        transaction.transferId ||
        transaction.transferAccountId ||
        transaction.transferTransactionId,
    );

    if (blockedTransaction?.reconciled) {
      throw new Error(
        "Reconciled transactions cannot be moved between accounts.",
      );
    }

    if (blockedTransaction) {
      throw new Error(
        "Transfer transactions cannot be moved between accounts. Edit or delete the transfer instead.",
      );
    }

    sourceRegister.transactions = sourceRegister.transactions.filter(
      (transaction) => !transactionIdSet.has(transaction.id),
    );
    targetRegister.transactions = [
      ...transactionsToMove.map((transaction) => ({
        ...transaction,
        transferId: undefined,
        transferAccountId: undefined,
        transferTransactionId: undefined,
      })),
      ...targetRegister.transactions,
    ];

    registers[input.sourceAccountId] = recalculateRegister(
      this.dependencies,
      sourceRegister,
    );
    registers[input.targetAccountId] = recalculateRegister(
      this.dependencies,
      targetRegister,
    );
    writeRegisters(this.dependencies.storage, registers);

    return cloneRegister(registers[input.sourceAccountId]);
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
        if (
          isPayeeReferenceMatch(transaction, input.payeeId, input.previousName)
        ) {
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
      registers[input.accountId] = createEmptyRegister(
        this.dependencies,
        input.accountId,
      );
    }

    writeRegisters(this.dependencies.storage, registers);
    return cloneRegister(
      recalculateRegister(this.dependencies, registers[input.accountId]),
    );
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
        if (
          isPayeeReferenceMatch(
            transaction,
            input.sourcePayeeId,
            input.sourceName,
          )
        ) {
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
      registers[input.accountId] = createEmptyRegister(
        this.dependencies,
        input.accountId,
      );
    }

    writeRegisters(this.dependencies.storage, registers);
    return cloneRegister(
      recalculateRegister(this.dependencies, registers[input.accountId]),
    );
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
  const sourceRegister = cloneRegister(
    registers[sourceAccountId] ??
      createEmptyRegister(dependencies, sourceAccountId),
  );
  const targetRegister = cloneRegister(
    registers[targetAccount.id] ??
      createEmptyRegister(dependencies, targetAccount.id),
  );
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

  registers[sourceAccountId] = recalculateRegister(
    dependencies,
    sourceRegister,
  );
  registers[targetAccount.id] = recalculateRegister(
    dependencies,
    targetRegister,
  );
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

  return (
    normalisePayeeReference(transaction.payee) ===
    normalisePayeeReference(previousName)
  );
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
    tagIds: normaliseTagIds(input.tagIds),
    attachmentCount: 0,
    attachments: [],
    payee: input.payee,
    payeeId: input.payeeId ?? resolvePayeeId(dependencies, input.payee),
    category: input.category,
    categoryId: input.categoryId,
    memo: input.memo,
    checkNumber: normaliseCheckNumber(input.checkNumber),
    splitLines: cloneSplitLines(input.splitLines),
    generatedFromSchedule: input.generatedFromSchedule,
    scheduledTransactionId: input.scheduledTransactionId,
    scheduledOccurrenceDate: input.scheduledOccurrenceDate,
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

function cloneSplitLines(
  splitLines: RegisterTransactionView["splitLines"],
): RegisterTransactionView["splitLines"] {
  return splitLines?.map((line) => ({ ...line }));
}

function resolvePayeeId(
  dependencies: AccountRegisterServiceDependencies,
  payeeName: string,
  currentPayeeId?: string,
): string | undefined {
  return currentPayeeId ?? dependencies.findPayeeIdByName(payeeName);
}

function resolvePayeeIdWithCache(
  dependencies: AccountRegisterServiceDependencies,
  payeeName: string,
  payeeIdByName: Map<string, string | undefined>,
): string | undefined {
  if (payeeIdByName.has(payeeName)) {
    return payeeIdByName.get(payeeName);
  }

  const payeeId = dependencies.findPayeeIdByName(payeeName);
  payeeIdByName.set(payeeName, payeeId);
  return payeeId;
}

interface RegisterBatchCommitTimingEntry {
  label: string;
  durationMs: number;
}

function nowRegisterBatchCommitMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function createRegisterBatchCommitTimings(): RegisterBatchCommitTimingEntry[] {
  return [];
}

function measureRegisterBatchCommitStage<T>(
  timings: RegisterBatchCommitTimingEntry[],
  label: string,
  action: () => T,
): T {
  const startedAt = nowRegisterBatchCommitMs();

  try {
    return action();
  } finally {
    timings.push({ label, durationMs: nowRegisterBatchCommitMs() - startedAt });
  }
}

async function measureAsyncRegisterBatchCommitStage<T>(
  timings: RegisterBatchCommitTimingEntry[],
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = nowRegisterBatchCommitMs();

  try {
    return await action();
  } finally {
    timings.push({ label, durationMs: nowRegisterBatchCommitMs() - startedAt });
  }
}

function logRegisterBatchCommitTimings(
  transactionCount: number,
  timings: RegisterBatchCommitTimingEntry[],
) {
  const totalMs = timings.reduce(
    (total, timing) => total + timing.durationMs,
    0,
  );

  if (transactionCount < 100 && totalMs < 250) {
    return;
  }

  const lines = timings
    .map(
      (timing) =>
        `  ${timing.label}: ${formatRegisterBatchCommitDuration(timing.durationMs)}`,
    )
    .join("\n");

  console.info(
    `[Budget App] Register batch commit (${transactionCount} transactions): ${formatRegisterBatchCommitDuration(totalMs)}\n${lines}`,
  );
}

function formatRegisterBatchCommitDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1000).toFixed(2)} s`;
}

function createTransferTargetResolver(
  dependencies: AccountRegisterServiceDependencies,
  sourceAccountId: string,
): (payee: string) => SidebarAccount | null {
  const targetsByNormalisedName = new Map<string, SidebarAccount>();

  for (const account of dependencies.readAccounts()) {
    if (account.id === sourceAccountId) {
      continue;
    }

    const normalisedName = normaliseTransferName(account.name);

    if (normalisedName) {
      targetsByNormalisedName.set(normalisedName, account);
    }
  }

  return (payee: string) => {
    const normalisedPayee = normaliseTransferName(payee);
    return normalisedPayee
      ? (targetsByNormalisedName.get(normalisedPayee) ?? null)
      : null;
  };
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
    dependencies
      .readAccounts()
      .find(
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

  return (
    trimmed
      .replace(/^transfer\s*(to|from)?\s*:?\s*/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "") || null
  );
}

function updateRegister(
  dependencies: AccountRegisterServiceDependencies,
  accountId: string,
  updater: (register: AccountRegisterView) => void,
): AccountRegisterView {
  const registers = readRegisters(dependencies.storage);
  const register = cloneRegister(
    registers[accountId] ?? createEmptyRegister(dependencies, accountId),
  );

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
              tagIds: [],
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

function mapAccountType(
  type: SidebarAccountType,
): AccountRegisterView["accountType"] {
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

  let clearedBalance = 0;
  let workingBalance = 0;
  const payeeIdByName = new Map<string, string | undefined>();

  const transactions = register.transactions
    .map((transaction) => {
      const attachments = normaliseAttachments(transaction.attachments);
      const transactionAmount = transaction.inflow - transaction.outflow;
      workingBalance += transactionAmount;

      if (transaction.cleared || transaction.reconciled) {
        clearedBalance += transactionAmount;
      }

      return {
        ...transaction,
        tagIds: normaliseTagIds(transaction.tagIds),
        attachments,
        attachmentCount: attachments.length || transaction.attachmentCount || 0,
        payeeId:
          transaction.payeeId ??
          resolvePayeeIdWithCache(
            dependencies,
            transaction.payee,
            payeeIdByName,
          ),
        runningBalance: runningBalanceById.get(transaction.id) ?? 0,
      };
    })
    .sort(compareForRegisterDisplay);

  return {
    ...register,
    clearedBalance,
    unclearedBalance: workingBalance - clearedBalance,
    workingBalance,
    transactions,
  };
}

export function countTransactionTagReferences(
  storage: KeyValueStoragePort,
  tagId: string,
): number {
  const normalisedTagId = tagId.trim();

  if (!normalisedTagId) {
    return 0;
  }

  return Object.values(readRegisters(storage)).reduce(
    (count, register) =>
      count +
      register.transactions.filter((transaction) =>
        transaction.tagIds?.includes(normalisedTagId),
      ).length,
    0,
  );
}

export function removeTransactionTagReferences(
  storage: KeyValueStoragePort,
  tagId: string,
): number {
  const normalisedTagId = tagId.trim();

  if (!normalisedTagId) {
    return 0;
  }

  const registers = readRegisters(storage);
  let removedReferenceCount = 0;

  for (const register of Object.values(registers)) {
    for (const transaction of register.transactions) {
      const currentTagIds = transaction.tagIds ?? [];
      const nextTagIds = currentTagIds.filter((candidate) => {
        const shouldRemove = candidate === normalisedTagId;

        if (shouldRemove) {
          removedReferenceCount += 1;
        }

        return !shouldRemove;
      });

      if (nextTagIds.length !== currentTagIds.length) {
        transaction.tagIds = nextTagIds;
      }
    }
  }

  if (removedReferenceCount > 0) {
    writeRegisters(storage, registers);
  }

  return removedReferenceCount;
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

function writeRegisters(
  storage: KeyValueStoragePort,
  registers: StoredRegisters,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(registers));
}

function cloneRegister(register: AccountRegisterView): AccountRegisterView {
  return {
    ...register,
    transactions: register.transactions.map((transaction) => {
      const currentTransaction = { ...transaction } as RegisterTransactionView & {
        flag?: unknown;
      };
      delete currentTransaction.flag;
      const attachments = normaliseAttachments(currentTransaction.attachments);

      return {
        ...currentTransaction,
        tagIds: normaliseTagIds(currentTransaction.tagIds),
        attachments,
        attachmentCount:
          attachments.length || currentTransaction.attachmentCount || 0,
        splitLines: cloneSplitLines(currentTransaction.splitLines),
      };
    }),
  };
}

function normaliseAttachments(
  attachments: RegisterAttachmentView[] | undefined,
): RegisterAttachmentView[] {
  return (attachments ?? []).map((attachment) => ({ ...attachment }));
}

function compareChronologically(
  a: RegisterTransactionView,
  b: RegisterTransactionView,
): number {
  const dateCompare = a.date.localeCompare(b.date);
  if (dateCompare !== 0) return dateCompare;
  return a.id.localeCompare(b.id);
}

function compareForRegisterDisplay(
  a: RegisterTransactionView,
  b: RegisterTransactionView,
): number {
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

function normaliseTagIds(tagIds: readonly string[] | undefined): string[] {
  return Array.from(
    new Set(
      (tagIds ?? [])
        .map((tagId) => tagId.trim())
        .filter(Boolean),
    ),
  );
}

function normaliseCheckNumber(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
