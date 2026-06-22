export interface KeyValueStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  listKeys?(): string[];
}

export const browserLocalStorageKeyValueStorage: KeyValueStoragePort = {
  getItem(key: string): string | null {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem(key);
  },

  setItem(key: string, value: string): void {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(key, value);
  },

  removeItem(key: string): void {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(key);
  },

  listKeys(): string[] {
    if (typeof window === "undefined") {
      return [];
    }

    return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => Boolean(key))
      .sort();
  },
};
