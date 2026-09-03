import assert from "node:assert/strict";
import test from "node:test";
import type { KeyValueStoragePort } from "../../../apps/web/src/features/persistence/keyValueStoragePort.js";
import {
  defaultSettingsPreferences,
  readSettingsPreferences,
  writeSettingsPreferences,
} from "../../../apps/web/src/features/settings/settingsPreferences.js";

function createMemoryStorage(): KeyValueStoragePort & { keys(): string[] } {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    listKeys: () => [...values.keys()],
    keys: () => [...values.keys()],
  };
}

test("register merchant icons default off and persist through settings storage", () => {
  const storage = createMemoryStorage();
  assert.equal(readSettingsPreferences(storage).general.showMerchantIconsInRegister, false);

  writeSettingsPreferences(storage, {
    ...defaultSettingsPreferences,
    general: { ...defaultSettingsPreferences.general, showMerchantIconsInRegister: true },
  });

  assert.equal(readSettingsPreferences(storage).general.showMerchantIconsInRegister, true);
  assert.ok(storage.keys().every((key) => key.includes("settings-preference")));
});
