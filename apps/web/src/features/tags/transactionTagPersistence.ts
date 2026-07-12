import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import type {
  TransactionTagColour,
  TransactionTagDefinition,
} from "./transactionTagTypes";

export const TRANSACTION_TAGS_STORAGE_KEY = "budget-app.transaction-tags.v1";

const TRANSACTION_TAG_COLOURS = new Set<TransactionTagColour>([
  "red",
  "gray",
  "orange",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "purple",
  "pink",
  "brown",
  "slate",
  "black",
]);

const FALLBACK_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function readTransactionTags(
  storage: KeyValueStoragePort,
): TransactionTagDefinition[] {
  const value = storage.getItem(TRANSACTION_TAGS_STORAGE_KEY);

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    const seenIds = new Set<string>();
    const tags: TransactionTagDefinition[] = [];

    for (const candidate of parsed) {
      const tag = normaliseTransactionTag(candidate);

      if (!tag || seenIds.has(tag.id)) {
        continue;
      }

      seenIds.add(tag.id);
      tags.push(tag);
    }

    return tags;
  } catch {
    return [];
  }
}

export function writeTransactionTags(
  storage: KeyValueStoragePort,
  tags: readonly TransactionTagDefinition[],
): void {
  storage.setItem(
    TRANSACTION_TAGS_STORAGE_KEY,
    JSON.stringify(tags.map(cloneTransactionTag)),
  );
}

function normaliseTransactionTag(
  candidate: unknown,
): TransactionTagDefinition | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const id = readTrimmedString(record.id);
  const name = readTrimmedString(record.name);
  const colour = record.colour;

  if (
    !id ||
    !name ||
    typeof colour !== "string" ||
    !TRANSACTION_TAG_COLOURS.has(colour as TransactionTagColour)
  ) {
    return null;
  }

  const description = readTrimmedString(record.description);
  const createdAt = readTrimmedString(record.createdAt) ?? FALLBACK_TIMESTAMP;
  const updatedAt = readTrimmedString(record.updatedAt) ?? createdAt;

  return {
    id,
    name,
    ...(description ? { description } : {}),
    colour: colour as TransactionTagColour,
    autoTagImportedTransactions:
      record.autoTagImportedTransactions === true,
    archived: record.archived === true,
    createdAt,
    updatedAt,
  };
}

function cloneTransactionTag(
  tag: TransactionTagDefinition,
): TransactionTagDefinition {
  return {
    ...tag,
    ...(tag.description ? { description: tag.description } : {}),
  };
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}
