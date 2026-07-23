type Ynab4Record = Record<string, unknown>;

/**
 * YNAB4 exports in the wild use multiple deletion flags depending on the
 * entity type and application version. Treat all known boolean flags as the
 * same tombstone state so every import stage makes the same inclusion choice.
 */
export function isYnab4Tombstone(record: Ynab4Record): boolean {
  return (
    record.isTombstone === true ||
    record.isDeleted === true ||
    record.deleted === true
  );
}
