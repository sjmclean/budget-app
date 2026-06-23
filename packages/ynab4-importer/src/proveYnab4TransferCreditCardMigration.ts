export type Ynab4TransferCreditCardPackageEntry = {
  path: string;
  text: string;
};

export type Ynab4TransferCreditCardProofStatus =
  | "proved"
  | "derived"
  | "not-required"
  | "not-forced"
  | "excluded"
  | "missing"
  | "blocked";

export type Ynab4TransferMigrationProof = {
  ynab4TransactionId: string | null;
  accountId: string | null;
  accountName: string | null;
  targetAccountId: string | null;
  targetAccountName: string | null;
  transferTransactionId: string | null;
  pairedTransactionId: string | null;
  payeeId: string | null;
  payeeName: string | null;
  amount: number | null;
  pairedAmount: number | null;
  destination: "transfer";
  mapping: {
    sourceAccount: Ynab4TransferCreditCardProofStatus;
    targetAccount: Ynab4TransferCreditCardProofStatus;
    pairedTransaction: Ynab4TransferCreditCardProofStatus;
    inverseAmount: Ynab4TransferCreditCardProofStatus;
    ordinaryPayee: Ynab4TransferCreditCardProofStatus;
  };
  notes: string[];
};

export type Ynab4CreditCardMigrationProof = {
  ynab4AccountId: string | null;
  name: string | null;
  ynab4AccountType: string | null;
  appAccountType: "credit-card";
  migrationHandlingMode: "manual-ynab4-traditional";
  destination: "accounts";
  paymentTransferCount: number;
  purchaseTransactionCount: number;
  mapping: {
    accountType: Ynab4TransferCreditCardProofStatus;
    handlingMode: Ynab4TransferCreditCardProofStatus;
    automaticPaymentCategory: Ynab4TransferCreditCardProofStatus;
    paymentsRemainTransfers: Ynab4TransferCreditCardProofStatus;
  };
  notes: string[];
};

export type Ynab4TransferCreditCardMigrationProof = {
  isYnab4Package: boolean;
  canProceedToWriteImport: boolean;
  budgetName: string | null;
  budgetDataPath: string | null;
  accountCount: number;
  transactionCount: number;
  scheduledTransactionCount: number;
  transferPayeeCount: number;
  ordinaryPayeeCount: number;
  transferTransactionCount: number;
  pairedTransferCount: number;
  unpairedTransferCount: number;
  inverseAmountMismatchCount: number;
  scheduledTransferCount: number;
  creditCardAccountCount: number;
  creditCardPaymentTransferCount: number;
  creditCardPurchaseTransactionCount: number;
  transferProofs: Ynab4TransferMigrationProof[];
  creditCardProofs: Ynab4CreditCardMigrationProof[];
  blockers: string[];
  warnings: string[];
  decisions: string[];
};

type Ynab4PackageMetadata = {
  relativeDataFolderName?: unknown;
};

const TRANSFER_SAMPLE_LIMIT = 25;
const CREDIT_CARD_SAMPLE_LIMIT = 25;

export function proveYnab4TransferCreditCardMigration(
  entries: Ynab4TransferCreditCardPackageEntry[],
): Ynab4TransferCreditCardMigrationProof {
  const { data, budgetName, budgetDataPath, warnings } = readActiveBudgetData(entries);

  if (!data) {
    return {
      isYnab4Package: false,
      canProceedToWriteImport: false,
      budgetName,
      budgetDataPath,
      accountCount: 0,
      transactionCount: 0,
      scheduledTransactionCount: 0,
      transferPayeeCount: 0,
      ordinaryPayeeCount: 0,
      transferTransactionCount: 0,
      pairedTransferCount: 0,
      unpairedTransferCount: 0,
      inverseAmountMismatchCount: 0,
      scheduledTransferCount: 0,
      creditCardAccountCount: 0,
      creditCardPaymentTransferCount: 0,
      creditCardPurchaseTransactionCount: 0,
      transferProofs: [],
      creditCardProofs: [],
      blockers: ["Could not read active YNAB4 budget data."],
      warnings,
      decisions: [],
    };
  }

  const accounts = toRecords(data.accounts);
  const payees = toRecords(data.payees);
  const transactions = toRecords(data.transactions);
  const scheduledTransactions = toRecords(data.scheduledTransactions);

  const accountsById = createRecordMap(accounts, ["entityId", "id", "accountId"]);
  const payeesById = createRecordMap(payees, ["entityId", "id", "payeeId"]);
  const transactionsById = createRecordMap(transactions, ["entityId", "id", "transactionId"]);

  const transferPayees = payees.filter(isTransferPayee);
  const transferPayeeIds = new Set(
    transferPayees
      .map((payee) => firstString(payee.entityId, payee.id, payee.payeeId))
      .filter((value): value is string => Boolean(value)),
  );

  const transferTransactions = transactions.filter((transaction) =>
    isTransferTransaction(transaction, payeesById),
  );
  const scheduledTransfers = scheduledTransactions.filter((transaction) =>
    isTransferTransaction(transaction, payeesById),
  );

  const transferProofs = transferTransactions
    .slice(0, TRANSFER_SAMPLE_LIMIT)
    .map((transaction) => createTransferProof(transaction, accountsById, payeesById, transactionsById));

  const pairedTransferCount = transferProofs.length === transferTransactions.length
    ? transferProofs.filter((proof) => proof.mapping.pairedTransaction === "proved").length
    : transferTransactions.filter((transaction) => {
        const transferTransactionId = firstString(transaction.transferTransactionId);
        return transferTransactionId ? transactionsById.has(transferTransactionId) : false;
      }).length;
  const unpairedTransferCount = transferTransactions.length - pairedTransferCount;
  const inverseAmountMismatchCount = transferTransactions.filter((transaction) => {
    const transferTransactionId = firstString(transaction.transferTransactionId);
    const pair = transferTransactionId ? transactionsById.get(transferTransactionId) : undefined;
    if (!pair) return false;
    const amount = toMinorUnits(transaction.amount);
    const pairedAmount = toMinorUnits(pair.amount);
    return amount !== null && pairedAmount !== null && amount + pairedAmount !== 0;
  }).length;

  const creditCardAccounts = accounts.filter(isCreditCardAccount);
  const creditCardAccountIds = new Set(
    creditCardAccounts
      .map((account) => firstString(account.entityId, account.id, account.accountId))
      .filter((value): value is string => Boolean(value)),
  );
  const creditCardPaymentTransferCount = transferTransactions.filter((transaction) =>
    touchesCreditCardAccount(transaction, payeesById, creditCardAccountIds),
  ).length;
  const creditCardPurchaseTransactionCount = transactions.filter((transaction) =>
    isCreditCardPurchaseTransaction(transaction, payeesById, creditCardAccountIds),
  ).length;

  const creditCardProofs = creditCardAccounts
    .slice(0, CREDIT_CARD_SAMPLE_LIMIT)
    .map((account) =>
      createCreditCardProof(account, transactions, payeesById, creditCardAccountIds),
    );

  const ordinaryPayeeCount = payees.filter((payee) => {
    const payeeId = firstString(payee.entityId, payee.id, payee.payeeId);
    return !(payeeId && transferPayeeIds.has(payeeId)) && !isTransferPayee(payee);
  }).length;

  const blockers: string[] = [];
  if (transferTransactions.length > 0 && unpairedTransferCount > 0) {
    blockers.push(
      "Some YNAB4 transfer transactions do not have a resolvable transferTransactionId pair and need fallback pairing rules before write import.",
    );
  }
  if (transferProofs.some((proof) => proof.mapping.sourceAccount === "missing" || proof.mapping.targetAccount === "missing")) {
    blockers.push(
      "Some YNAB4 transfer transactions or transfer payees point at source/target accounts that are missing from the package.",
    );
  }
  if (inverseAmountMismatchCount > 0) {
    blockers.push(
      "Some YNAB4 transfer pairs do not have inverse amounts and need reconciliation before write import.",
    );
  }

  const proofWarnings = [...warnings];
  if (transferTransactions.length > TRANSFER_SAMPLE_LIMIT) {
    proofWarnings.push(
      `Transfer proof sample limited to ${TRANSFER_SAMPLE_LIMIT} of ${transferTransactions.length} transfer transactions.`,
    );
  }
  if (creditCardAccounts.length > CREDIT_CARD_SAMPLE_LIMIT) {
    proofWarnings.push(
      `Credit-card proof sample limited to ${CREDIT_CARD_SAMPLE_LIMIT} of ${creditCardAccounts.length} credit-card accounts.`,
    );
  }

  return {
    isYnab4Package: true,
    canProceedToWriteImport: blockers.length === 0,
    budgetName,
    budgetDataPath,
    accountCount: accounts.length,
    transactionCount: transactions.length,
    scheduledTransactionCount: scheduledTransactions.length,
    transferPayeeCount: transferPayees.length,
    ordinaryPayeeCount,
    transferTransactionCount: transferTransactions.length,
    pairedTransferCount,
    unpairedTransferCount,
    inverseAmountMismatchCount,
    scheduledTransferCount: scheduledTransfers.length,
    creditCardAccountCount: creditCardAccounts.length,
    creditCardPaymentTransferCount,
    creditCardPurchaseTransactionCount,
    transferProofs,
    creditCardProofs,
    blockers,
    warnings: proofWarnings,
    decisions: [
      "YNAB4 transfer payees are compatibility records and must not be imported as ordinary spending payees.",
      "YNAB4 transferTransactionId pair links should be preserved or deterministically reconstructed before write import.",
      "YNAB4 credit cards migrate using the budget-level manual/traditional mode by default.",
      "Modern automatic credit-card payment-category behaviour remains a budget-level option and must not be forced during YNAB4 migration.",
    ],
  };
}

function createTransferProof(
  transaction: Record<string, unknown>,
  accountsById: Map<string, Record<string, unknown>>,
  payeesById: Map<string, Record<string, unknown>>,
  transactionsById: Map<string, Record<string, unknown>>,
): Ynab4TransferMigrationProof {
  const accountId = firstString(transaction.accountId);
  const sourceAccount = accountId ? accountsById.get(accountId) : undefined;
  const payeeId = firstString(transaction.payeeId);
  const payee = payeeId ? payeesById.get(payeeId) : undefined;
  const targetAccountId = firstString(
    transaction.targetAccountId,
    transaction.transferAccountId,
    payee?.targetAccountId,
    payee?.transferAccountId,
  );
  const targetAccount = targetAccountId ? accountsById.get(targetAccountId) : undefined;
  const transferTransactionId = firstString(transaction.transferTransactionId);
  const pairedTransaction = transferTransactionId ? transactionsById.get(transferTransactionId) : undefined;
  const amount = toMinorUnits(transaction.amount);
  const pairedAmount = pairedTransaction ? toMinorUnits(pairedTransaction.amount) : null;
  const hasInverseAmount = amount !== null && pairedAmount !== null && amount + pairedAmount === 0;

  return {
    ynab4TransactionId: firstString(transaction.entityId, transaction.id, transaction.transactionId),
    accountId,
    accountName: sourceAccount ? firstString(sourceAccount.accountName, sourceAccount.name) : null,
    targetAccountId,
    targetAccountName: targetAccount ? firstString(targetAccount.accountName, targetAccount.name) : null,
    transferTransactionId,
    pairedTransactionId: pairedTransaction ? firstString(pairedTransaction.entityId, pairedTransaction.id, pairedTransaction.transactionId) : null,
    payeeId,
    payeeName: payee ? firstString(payee.name, payee.payeeName) : null,
    amount,
    pairedAmount,
    destination: "transfer",
    mapping: {
      sourceAccount: accountId && accountsById.has(accountId) ? "proved" : "missing",
      targetAccount: targetAccountId && accountsById.has(targetAccountId) ? "proved" : "missing",
      pairedTransaction: transferTransactionId
        ? transactionsById.has(transferTransactionId)
          ? "proved"
          : "missing"
        : "not-required",
      inverseAmount: transferTransactionId ? (hasInverseAmount ? "proved" : "blocked") : "not-required",
      ordinaryPayee: payee && isTransferPayee(payee) ? "excluded" : "missing",
    },
    notes: [
      "YNAB4 transfer payees carry targetAccountId and must not be imported as ordinary spending payees.",
      "YNAB4 transfer transactions should become linked transfer transactions, not category spending.",
      "transferTransactionId should be preserved when present so paired transfer rows can be validated and de-duplicated.",
    ],
  };
}

function createCreditCardProof(
  account: Record<string, unknown>,
  transactions: Record<string, unknown>[],
  payeesById: Map<string, Record<string, unknown>>,
  creditCardAccountIds: Set<string>,
): Ynab4CreditCardMigrationProof {
  const accountId = firstString(account.entityId, account.id, account.accountId);
  const paymentTransferCount = accountId
    ? transactions.filter((transaction) => touchesSpecificAccountTransfer(transaction, payeesById, accountId)).length
    : 0;
  const purchaseTransactionCount = accountId
    ? transactions.filter((transaction) => isCreditCardPurchaseTransaction(transaction, payeesById, new Set([accountId]))).length
    : 0;

  return {
    ynab4AccountId: accountId,
    name: firstString(account.accountName, account.name),
    ynab4AccountType: firstString(account.accountType, account.type),
    appAccountType: "credit-card",
    migrationHandlingMode: "manual-ynab4-traditional",
    destination: "accounts",
    paymentTransferCount,
    purchaseTransactionCount,
    mapping: {
      accountType: "proved",
      handlingMode: "proved",
      automaticPaymentCategory: "not-forced",
      paymentsRemainTransfers: paymentTransferCount > 0 || creditCardAccountIds.size > 0 ? "proved" : "not-required",
    },
    notes: [
      "YNAB4 credit card accounts map to the app credit-card account type.",
      "YNAB4 migration must preserve traditional/manual credit-card handling semantics by default.",
      "Credit card payments remain transfers and must not be reclassified as spending.",
      "Modern automatic credit-card payment-category behaviour must be a budget-level option and must not be forced during migration.",
    ],
  };
}

function isTransferTransaction(
  transaction: Record<string, unknown>,
  payeesById: Map<string, Record<string, unknown>>,
): boolean {
  if (firstString(transaction.targetAccountId, transaction.transferAccountId, transaction.transferTransactionId)) {
    return true;
  }

  const payeeId = firstString(transaction.payeeId);
  const payee = payeeId ? payeesById.get(payeeId) : undefined;
  return Boolean(payee && isTransferPayee(payee));
}

function isTransferPayee(payee: Record<string, unknown>): boolean {
  if (firstString(payee.targetAccountId, payee.transferAccountId)) {
    return true;
  }
  const name = firstString(payee.name, payee.payeeName);
  return Boolean(name && /^Transfer\s*:/i.test(name));
}

function touchesCreditCardAccount(
  transaction: Record<string, unknown>,
  payeesById: Map<string, Record<string, unknown>>,
  creditCardAccountIds: Set<string>,
): boolean {
  return Array.from(creditCardAccountIds).some((accountId) =>
    touchesSpecificAccountTransfer(transaction, payeesById, accountId),
  );
}

function touchesSpecificAccountTransfer(
  transaction: Record<string, unknown>,
  payeesById: Map<string, Record<string, unknown>>,
  accountId: string,
): boolean {
  if (!isTransferTransaction(transaction, payeesById)) {
    return false;
  }
  const transactionAccountId = firstString(transaction.accountId);
  if (transactionAccountId === accountId) {
    return true;
  }
  const payeeId = firstString(transaction.payeeId);
  const payee = payeeId ? payeesById.get(payeeId) : undefined;
  const targetAccountId = firstString(
    transaction.targetAccountId,
    transaction.transferAccountId,
    payee?.targetAccountId,
    payee?.transferAccountId,
  );
  return targetAccountId === accountId;
}

function isCreditCardPurchaseTransaction(
  transaction: Record<string, unknown>,
  payeesById: Map<string, Record<string, unknown>>,
  creditCardAccountIds: Set<string>,
): boolean {
  const accountId = firstString(transaction.accountId);
  const amount = toMinorUnits(transaction.amount);
  return Boolean(
    accountId &&
      creditCardAccountIds.has(accountId) &&
      !isTransferTransaction(transaction, payeesById) &&
      amount !== null &&
      amount < 0,
  );
}

function isCreditCardAccount(account: Record<string, unknown>): boolean {
  const accountType = firstString(account.accountType, account.type);
  if (!accountType) {
    return false;
  }
  return ["creditcard", "credit", "card", "ccard"].includes(
    accountType.replace(/[\s_-]/g, "").toLowerCase(),
  );
}

function createRecordMap(
  records: Record<string, unknown>[],
  idKeys: string[],
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    const id = firstString(...idKeys.map((key) => record[key]));
    if (id) {
      map.set(id, record);
    }
  }
  return map;
}

function readActiveBudgetData(entries: Ynab4TransferCreditCardPackageEntry[]): {
  data: Record<string, unknown> | null;
  budgetName: string | null;
  budgetDataPath: string | null;
  warnings: string[];
} {
  const normalisedEntries = entries.map((entry) => ({
    path: normalisePath(entry.path),
    text: entry.text,
  }));
  const metadataEntry = normalisedEntries.find(
    (entry) => entry.path.endsWith("/Budget.ymeta") || entry.path === "Budget.ymeta",
  );

  if (!metadataEntry) {
    return { data: null, budgetName: null, budgetDataPath: null, warnings: ["Budget.ymeta was not found."] };
  }

  const packageRoot = inferPackageRoot(metadataEntry.path);
  const budgetName = inferBudgetName(packageRoot);
  let metadata: Ynab4PackageMetadata;
  try {
    metadata = JSON.parse(metadataEntry.text) as Ynab4PackageMetadata;
  } catch {
    return { data: null, budgetName, budgetDataPath: null, warnings: ["Budget.ymeta is not valid JSON."] };
  }

  const relativeDataFolderName = typeof metadata.relativeDataFolderName === "string" ? metadata.relativeDataFolderName : null;
  if (!relativeDataFolderName) {
    return { data: null, budgetName, budgetDataPath: null, warnings: ["Budget.ymeta does not contain a relativeDataFolderName value."] };
  }

  const activeDataFolderPath = packageRoot ? `${packageRoot}/${relativeDataFolderName}` : relativeDataFolderName;
  const budgetDataEntry = findActiveBudgetDataEntry(normalisedEntries, activeDataFolderPath);
  if (!budgetDataEntry) {
    return {
      data: null,
      budgetName,
      budgetDataPath: null,
      warnings: [`No Budget.yfull or Budget.json file was found under ${activeDataFolderPath}.`],
    };
  }

  try {
    const parsed = JSON.parse(budgetDataEntry.text);
    return {
      data: isRecord(parsed) ? parsed : null,
      budgetName,
      budgetDataPath: budgetDataEntry.path,
      warnings: isRecord(parsed) ? [] : ["The active YNAB4 budget data root is not an object."],
    };
  } catch {
    return { data: null, budgetName, budgetDataPath: budgetDataEntry.path, warnings: ["The active YNAB4 budget data file is not valid JSON."] };
  }
}

function findActiveBudgetDataEntry(
  entries: Ynab4TransferCreditCardPackageEntry[],
  activeDataFolderPath: string,
): Ynab4TransferCreditCardPackageEntry | undefined {
  const activePrefix = `${activeDataFolderPath}/`;
  const activeEntries = entries.filter((entry) => entry.path.startsWith(activePrefix));
  return (
    activeEntries.find((entry) => entry.path.endsWith("/Budget.yfull")) ??
    activeEntries.find((entry) => entry.path.endsWith("/Budget.json"))
  );
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function toMinorUnits(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : Math.round(value * 100);
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/[$,]/g, "");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Number.isInteger(parsed) ? parsed : Math.round(parsed * 100);
}

function toRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalisePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function inferPackageRoot(path: string): string | null {
  const parts = normalisePath(path).split("/");
  if (parts.length <= 1) {
    return null;
  }
  return parts[0] || null;
}

function inferBudgetName(packageRoot: string | null): string | null {
  if (!packageRoot) {
    return null;
  }
  const withoutExtension = packageRoot.replace(/\.ynab4$/i, "");
  return withoutExtension.split("~")[0]?.trim() || withoutExtension;
}
