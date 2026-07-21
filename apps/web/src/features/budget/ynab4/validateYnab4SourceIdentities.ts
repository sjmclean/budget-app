type RecordMap = Record<string, unknown>;

/**
 * Reject duplicate source identities before any import maps are populated.
 * YNAB entity identifiers are used as stable references by accounts,
 * categories, payees, transactions, splits, and transfers. Silently allowing
 * a later row to overwrite an earlier identity can redirect financial data.
 */
export function validateYnab4SourceIdentities(
  data: Record<string, unknown>,
): void {
  const seen = new Map<string, string>();

  const register = (record: RecordMap, location: string, fields: string[]) => {
    const sourceId = firstString(...fields.map((field) => record[field]));
    if (!sourceId) return;

    const previousLocation = seen.get(sourceId);
    if (previousLocation) {
      throw new Error(
        `Duplicate YNAB4 source ID "${sourceId}" at ${location}; it was already used at ${previousLocation}.`,
      );
    }
    seen.set(sourceId, location);
  };

  for (const [index, account] of toRecords(data.accounts).entries()) {
    register(account, `account[${index}]`, ["entityId", "id", "accountId"]);
  }

  for (const [groupIndex, group] of toRecords(data.masterCategories).entries()) {
    register(group, `masterCategories[${groupIndex}]`, [
      "entityId",
      "id",
      "masterCategoryId",
    ]);
    for (const [categoryIndex, category] of toRecords(
      group.subCategories,
    ).entries()) {
      register(
        category,
        `masterCategories[${groupIndex}].subCategories[${categoryIndex}]`,
        ["entityId", "id", "categoryId", "subCategoryId"],
      );
    }
  }

  for (const [index, payee] of toRecords(data.payees).entries()) {
    register(payee, `payees[${index}]`, ["entityId", "id", "payeeId"]);
  }

  registerTransactionCollection(
    toRecords(data.transactions),
    "transactions",
    register,
  );
  registerTransactionCollection(
    toRecords(data.scheduledTransactions),
    "scheduledTransactions",
    register,
  );
}

function registerTransactionCollection(
  transactions: RecordMap[],
  collectionName: string,
  register: (record: RecordMap, location: string, fields: string[]) => void,
): void {
  for (const [transactionIndex, transaction] of transactions.entries()) {
    register(transaction, `${collectionName}[${transactionIndex}]`, [
      "entityId",
      "id",
      "transactionId",
      "scheduledTransactionId",
    ]);
    for (const [splitIndex, split] of toRecords(
      transaction.subTransactions,
    ).entries()) {
      register(
        split,
        `${collectionName}[${transactionIndex}].subTransactions[${splitIndex}]`,
        ["entityId", "id", "transactionId"],
      );
    }
  }
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
