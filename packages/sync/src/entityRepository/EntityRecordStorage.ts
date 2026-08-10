export interface EntityRecordStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  listKeys(): string[];
  flush?(): Promise<void>;
}

export function createInMemoryEntityRecordStorage(
  initialEntries: Readonly<Record<string, string>> = {},
): EntityRecordStorage {
  const entries = new Map(Object.entries(initialEntries));

  return {
    getItem(key) {
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      entries.set(key, value);
    },
    removeItem(key) {
      entries.delete(key);
    },
    listKeys() {
      return [...entries.keys()].sort();
    },
    async flush() {
      return undefined;
    },
  };
}
