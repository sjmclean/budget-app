import {
  configureBudgetPersistenceProvider,
  resetBudgetPersistenceProvider,
} from "../../../apps/web/src/features/persistence/budgetPersistenceProviderFactory.js";
import { createKeyValueBudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/createKeyValueBudgetPersistenceProvider.js";
import type { KeyValueStoragePort } from "../../../apps/web/src/features/persistence/keyValueStoragePort.js";

export class InMemoryKeyValueStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  get length(): number {
    return this.values.size;
  }

  listKeys(): string[] {
    return [...this.values.keys()];
  }
}

export interface InstalledInMemoryBudgetPersistence {
  readonly storage: InMemoryKeyValueStorage;
  cleanup(): void;
}

/**
 * Installs one in-memory backend as both the explicit application persistence
 * provider and window.localStorage for legacy browser-facing test code.
 */
export function installInMemoryBudgetPersistence(): InstalledInMemoryBudgetPersistence {
  const storage = new InMemoryKeyValueStorage();
  const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });

  configureBudgetPersistenceProvider(
    createKeyValueBudgetPersistenceProvider({
      storage,
      metadata: {
        kind: "local-database",
        label: "In-memory test persistence",
        description: "Isolated key/value persistence for tests.",
        isProductionPersistence: false,
      },
      capabilities: {
        sharedAcrossDevices: false,
        liveUpdates: false,
        offlineWrites: true,
        backups: false,
      },
    }),
  );

  return {
    storage,
    cleanup() {
      resetBudgetPersistenceProvider();
      if (previousWindowDescriptor) {
        Object.defineProperty(globalThis, "window", previousWindowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    },
  };
}
