import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import {
  listProjectedTransactionTags,
  syncTransactionTagEntities,
} from "./entities/transactionTagEntity";
import type { TransactionTagDefinition } from "./transactionTagTypes";

export function readTransactionTags(
  storage: KeyValueStoragePort,
): TransactionTagDefinition[] {
  return listProjectedTransactionTags(storage);
}

export function writeTransactionTags(
  storage: KeyValueStoragePort,
  tags: readonly TransactionTagDefinition[],
): void {
  syncTransactionTagEntities(storage, tags);
}
