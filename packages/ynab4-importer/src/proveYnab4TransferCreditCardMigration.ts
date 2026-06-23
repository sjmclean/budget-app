export type Ynab4TransferCreditCardPackageEntry = {
  path: string;
  text: string;
};

export type Ynab4TransferMigrationProof = {
  ynab4TransactionId: string | null;
  accountId: string | null;
  targetAccountId: string | null;
  transferTransactionId: string | null;
  payeeId: string | null;
  payeeName: string | null;
  destination: "transfer";
  mapping: {
    sourceAccount: "proved" | "missing";
    targetAccount: "proved" | "missing";
    pairedTransaction: "proved" | "missing" | "not-required";
    ordinaryPayee: "excluded" | "missing";
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
  mapping: {
    accountType: "proved";
    handlingMode: "proved";
    automaticPaymentCategory: "not-forced";
  };
  notes: string[];
};

export type Ynab4TransferCreditCardMigrationProof = {
  isYnab4Package: boolean;
  budgetName: string | null;
  budgetDataPath: string | null;
  transferPayeeCount: number;
  ordinaryPayeeCount: number;
  transferTransactionCount: number;
  pairedTransferCount: number;
  unpairedTransferCount: number;
  creditCardAccountCount: number;
  transferProofs: Ynab4TransferMigrationProof[];
  creditCardProofs: Ynab4CreditCardMigrationProof[];
  blockers: string[];
  warnings: string[];
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
      budgetName,
      budgetDataPath,
      transferPayeeCount: 0,
      ordinaryPayeeCount: 0,
      transferTransactionCount: 0,
      pairedTransferCount: 0,
      unpairedTransferCount: 0,
      creditCardAccountCount: 0,
      transferProofs: [],
      creditCardProofs: [],
      blockers: ["Could not read active YNAB4 budget data."],
      warnings,
    };
  }

  const accounts = toRecords(data.accounts);
  const payees = toRecords(data.payees);
  const transactions = toRecords(data.transactions);

  const accountsById = new Map<string, Record<string, unknown>>();
  for (const account of accounts) {
    const accountId = firstString(account.entityId, account.id, account.accountId);
    if (accountId) {
      accountsById.set(accountId, account);
    }
  }

  const payeesById = new Map<string, Record<string, unknown>>();
  for (const payee of payees) {
    const payeeId = firstString(payee.entityId, payee.id, payee.payeeId);
    if (payeeId) {
      payeesById.set(payeeId, payee);
    }
  }

  const transactionsById = new Map<string, Record<string, unknown>>();
  for (const transaction of transactions) {
    const transactionId = firstString(transaction.entityId, transaction.id, transaction.transactionId);
    if (transactionId) {
      transactionsById.set(transactionId, transaction);
    }
  }

  const transferPayees = payees.filter((payee) => firstString(payee.targetAccountId, payee.transferAccountId));
  const transferPayeeIds = new Set(
    transferPayees
      .map((payee) => firstString(payee.entityId, payee.id, payee.payeeId))
      .filter((value): value is string => Boolean(value)),
  );

  const transferTransactions = transactions.filter((transaction) =>
    isTransferTransaction(transaction, payeesById),
  );

  const transferProofs = transferTransactions
    .slice(0, TRANSFER_SAMPLE_LIMIT)
    .map((transaction) => createTransferProof(transaction, accountsById, payeesById, transactionsById));

  const creditCardAccounts = accounts.filter((account) => isCreditCardAccount(account));
  const creditCardProofs = creditCardAccounts
    .slice(0, CREDIT_CARD_SAMPLE_LIMIT)
    .map(createCreditCardProof);

  const pairedTransferCount = transferTransactions.filter((transaction) => {
    const transferTransactionId = firstString(transaction.transferTransactionId);
    return transferTransactionId ? transactionsById.has(transferTransactionId) : false;
  }).length;
  const unpairedTransferCount = transferTransactions.length - pairedTransferCount;

  const blockers: string[] = [];
  if (transferTransactions.length > 0 && unpairedTransferCount > 0) {
    blockers.push(
      "Some YNAB4 transfer transactions do not have a resolvable transferTransactionId pair and need fallback pairing rules before write import.",
    );
  }
  if (transferProofs.some((proof) => proof.mapping.targetAccount === "missing")) {
    blockers.push(
      "Some YNAB4 transfer transactions or transfer payees point at target accounts that are missing from the package.",
    );
  }
  if (creditCardAccounts.length > 0) {
    blockers.push(
      "Credit card accounts are detected and should be imported in the budget-level YNAB4/manual/traditional handling mode until automatic payment-category behaviour is explicitly selected by the user.",
    );
  }

  return {
    isYnab4Package: true,
    budgetName,
    budgetDataPath,
    transferPayeeCount: transferPayees.length,
    ordinaryPayeeCount: payees.length - transferPayees.length,
    transferTransactionCount: transferTransactions.length,
    pairedTransferCount,
    unpairedTransferCount,
    creditCardAccountCount: creditCardAccounts.length,
    transferProofs,
    creditCardProofs,
    blockers,
    warnings,
  };
}

function createTransferProof(
  transaction: Record<string, unknown>,
  accountsById: Map<string, Record<string, unknown>>,
  payeesById: Map<string, Record<string, unknown>>,
  transactionsById: Map<string, Record<string, unknown>>,
): Ynab4TransferMigrationProof {
  const accountId = firstString(transaction.accountId);
  const payeeId = firstString(transaction.payeeId);
  const payee = payeeId ? payeesById.get(payeeId) : undefined;
  const targetAccountId = firstString(
    transaction.targetAccountId,
    transaction.transferAccountId,
    payee?.targetAccountId,
    payee?.transferAccountId,
  );
  const transferTransactionId = firstString(transaction.transferTransactionId);
  const payeeName = payee ? firstString(payee.name, payee.payeeName) : null;

  return {
    ynab4TransactionId: firstString(transaction.entityId, transaction.id, transaction.transactionId),
    accountId,
    targetAccountId,
    transferTransactionId,
    payeeId,
    payeeName,
    destination: "transfer",
    mapping: {
      sourceAccount: accountId && accountsById.has(accountId) ? "proved" : "missing",
      targetAccount: targetAccountId && accountsById.has(targetAccountId) ? "proved" : "missing",
      pairedTransaction: transferTransactionId
        ? transactionsById.has(transferTransactionId)
          ? "proved"
          : "missing"
        : "not-required",
      ordinaryPayee: payee && firstString(payee.targetAccountId, payee.transferAccountId) ? "excluded" : "missing",
    },
    notes: [
      "YNAB4 transfer payees carry targetAccountId and must not be imported as ordinary spending payees.",
      "YNAB4 transfer transactions should become linked transfer transactions, not category spending.",
      "transferTransactionId should be preserved when present so paired transfer rows can be validated and de-duplicated.",
    ],
  };
}

function createCreditCardProof(account: Record<string, unknown>): Ynab4CreditCardMigrationProof {
  return {
    ynab4AccountId: firstString(account.entityId, account.id, account.accountId),
    name: firstString(account.accountName, account.name),
    ynab4AccountType: firstString(account.accountType, account.type),
    appAccountType: "credit-card",
    migrationHandlingMode: "manual-ynab4-traditional",
    destination: "accounts",
    mapping: {
      accountType: "proved",
      handlingMode: "proved",
      automaticPaymentCategory: "not-forced",
    },
    notes: [
      "YNAB4 credit card accounts map to the app credit-card account type.",
      "YNAB4 migration must preserve traditional/manual credit-card handling semantics by default.",
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
  return Boolean(payee && firstString(payee.targetAccountId, payee.transferAccountId));
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
