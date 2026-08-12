export type KeyValueStorageMutation =
  | Readonly<{ type: "set"; key: string; value: string }>
  | Readonly<{ type: "remove"; key: string }>;

export interface KeyValueStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  listKeys?(): string[];
  flush?(): Promise<void>;
  applyMutations?(mutations: readonly KeyValueStorageMutation[]): Promise<void>;
}

export interface SerializedWriteCoordinator {
  queue(operation: () => Promise<void>): void;
  flush(): Promise<void>;
}

export function createSerializedWriteCoordinator(): SerializedWriteCoordinator {
  let writeTail = Promise.resolve();
  let firstWriteError: unknown = null;

  return {
    queue(operation) {
      const write = writeTail.then(operation);
      writeTail = write.catch((error: unknown) => {
        firstWriteError ??= error;
      });
    },

    async flush() {
      await writeTail;

      if (firstWriteError !== null) {
        const error = firstWriteError;
        firstWriteError = null;
        throw error;
      }
    },
  };
}
